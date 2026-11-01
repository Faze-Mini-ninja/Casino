/* Royal Edge Casino server: static files + JSON API (accounts, games, wallet, admin). No framework. */
'use strict';
process.removeAllListeners('warning'); // silence node:sqlite "experimental" notice
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { q, tx, credit, balances, BalanceError, LAMPORTS_PER_UNIT } = require('./db');
const { play, abandon, refundStaleShots, GameError } = require('./play');
const pay = require('./payments');
const { hotWallet } = require('./wallet');
const referrals = require('./referrals');

/* ---------- auth ---------- */
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64, { N: 16384 }).toString('hex');
const SESSION_DAYS = 30;
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  q('INSERT INTO sessions (token, user_id, created, expires) VALUES (?,?,?,?)').run(token, userId, Date.now(), Date.now() + SESSION_DAYS * 86400000);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${cfg.COOKIE_SECURE ? '; Secure' : ''}`);
}
function userFrom(req) {
  const m = /(?:^|;\s*)sid=([0-9a-f]{64})/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = q('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(m[1], Date.now());
  return s ? q('SELECT id, username, role, created FROM users WHERE id = ?').get(s.user_id) : null;
}

/* ---------- rate limiting ---------- */
const buckets = new Map();
function limited(key, max, perMs) {
  const now = Date.now(); let b = buckets.get(key);
  if (!b || now > b.reset) { b = { n: 0, reset: now + perMs }; buckets.set(key, b); }
  return ++b.n > max;
}
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (n > b.reset) buckets.delete(k); }, 60000).unref();

/* ---------- helpers ---------- */
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const need = (cond, code, msg) => { if (!cond) throw new HttpError(code, msg); };
function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/.test(req.headers['content-type'] || '')) return reject(new HttpError(415, 'JSON required'));
    let data = ''; req.on('data', (c) => { data += c; if (data.length > 64 * 1024) { reject(new HttpError(413, 'Too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, 'Bad JSON')); } });
  });
}
const C2 = (u) => Math.round(u) / 100; // units -> credits
const solOf = (units) => (units * LAMPORTS_PER_UNIT) / 1e9;
const publicConfig = () => ({ cluster: cfg.cluster, creditsPerSol: cfg.CREDITS_PER_SOL, minDepositSol: cfg.MIN_DEPOSIT_SOL, minWithdrawSol: cfg.MIN_WITHDRAW_SOL, withdrawFeeSol: cfg.WITHDRAW_FEE_SOL, autoApproveSol: cfg.AUTO_APPROVE_SOL, watchDays: cfg.ADDRESS_WATCH_DAYS, chainEnabled: cfg.CHAIN_ENABLED, maxBet: cfg.MAX_BET_CREDITS, showOdds: cfg.SHOW_ODDS, referralShare: referrals.SHARE });
const me = (u) => ({ user: { id: u.id, username: u.username, role: u.role }, balances: balances(u.id), config: publicConfig() });

/* ---------- routes ---------- */
const routes = {
  'POST /api/register': async (req, res, body, ip) => {
    need(!limited('reg:' + ip, 5, 3600000), 429, 'Too many sign-ups from this network, try later');
    const username = String(body.username || '').trim(), password = String(body.password || '');
    need(/^[A-Za-z0-9_]{3,20}$/.test(username), 400, 'Username: 3–20 letters, numbers or _');
    need(password.length >= 8 && password.length <= 200, 400, 'Password must be at least 8 characters');
    need(!q('SELECT 1 FROM users WHERE username = ?').get(username), 409, 'That username is taken');
    const refCode = String(body.refCode || '').trim();
    need(!refCode || referrals.findByCode(refCode), 400, 'Referral code not found — check it or leave it empty');
    const salt = crypto.randomBytes(16).toString('hex');
    const id = tx(() => {
      // Without ADMIN_USERNAME configured (local dev), the first account becomes admin.
      const first = !cfg.ADMIN_USERNAME && !q('SELECT 1 FROM users LIMIT 1').get();
      const uid = Number(q('INSERT INTO users (username, pass_hash, salt, role, created) VALUES (?,?,?,?,?)').run(username, hash(password, salt), salt, first ? 'admin' : 'player', Date.now()).lastInsertRowid);
      credit(uid, 'demo', Math.round(cfg.DEMO_START_CREDITS * 100), 'demo-signup');
      q('UPDATE users SET ref_code = ? WHERE id = ?').run(referrals.newCode(), uid);
      if (refCode) referrals.attach(uid, refCode);
      return uid;
    });
    createSession(res, id);
    return me(q('SELECT * FROM users WHERE id = ?').get(id));
  },
  'POST /api/login': async (req, res, body, ip) => {
    need(!limited('login:' + ip, 10, 600000), 429, 'Too many attempts, wait a few minutes');
    const u = q('SELECT * FROM users WHERE username = ?').get(String(body.username || '').trim());
    const ok = u && crypto.timingSafeEqual(Buffer.from(hash(String(body.password || ''), u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
    need(ok, 401, 'Wrong username or password');
    createSession(res, u.id);
    return me(u);
  },
  'POST /api/password': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('pw:' + u.id, 5, 600000), 429, 'Too many attempts, wait a few minutes');
    const row = q('SELECT * FROM users WHERE id = ?').get(u.id);
    const ok = crypto.timingSafeEqual(Buffer.from(hash(String(body.current || ''), row.salt), 'hex'), Buffer.from(row.pass_hash, 'hex'));
    need(ok, 400, 'Current password is wrong');
    const next = String(body.next || ''); need(next.length >= 8 && next.length <= 200, 400, 'New password must be at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    tx(() => { q('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash(next, salt), salt, u.id); q('DELETE FROM sessions WHERE user_id = ?').run(u.id); });
    createSession(res, u.id); // keep this device signed in; all others are signed out
    return { ok: true };
  },
  'GET /api/referrals': async (req, res, body, ip, u) => { need(u, 401, 'Please log in'); return referrals.summary(u.id); },
  'POST /api/referrals/claim': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('claim:' + u.id, 10, 60000), 429, 'Slow down');
    try { const n = referrals.claim(u.id); return { claimed: n / 100, balances: balances(u.id) }; } catch (e) { throw new HttpError(400, e.message); }
  },
  'POST /api/referrals/code': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in');
    try { referrals.attach(u.id, body.code); return referrals.summary(u.id); } catch (e) { throw new HttpError(400, e.message); }
  },
  'POST /api/logout': async (req, res) => {
    const m = /(?:^|;\s*)sid=([0-9a-f]{64})/.exec(req.headers.cookie || ''); if (m) q('DELETE FROM sessions WHERE token = ?').run(m[1]);
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return { ok: true };
  },
  'GET /api/me': async (req, res, body, ip, u) => (u ? me(u) : { user: null, config: publicConfig() }),
  'POST /api/play': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('play:' + u.id, cfg.PLAY_RATE_PER_5S, 5000), 429, 'Slow down');
    return play(u.id, body);
  },
  'GET /api/feed': async () => {
    const mask = (n) => (n.length <= 3 ? n[0] + '**' : n.slice(0, 2) + '*'.repeat(Math.min(5, n.length - 3)) + n.slice(-1));
    const rows = q("SELECT r.game, r.mode, r.wager, r.payout, r.updated AS t, u.username FROM rounds r JOIN users u ON u.id = r.user_id WHERE r.status = 'done' AND r.wager > 0 AND r.game != 'fish' ORDER BY r.id DESC LIMIT 15").all();
    return { bets: rows.map((x) => ({ game: x.game, mode: x.mode, wager: C2(x.wager), payout: C2(x.payout), t: x.t, user: mask(x.username) })) };
  },
  'POST /api/abandon': async (req, res, body, ip, u) => { need(u, 401, 'Please log in'); return abandon(u.id, String(body.game || '')) || { ok: true }; },
  'POST /api/demo/refill': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in');
    const b = balances(u.id); need(b.demo < 100000, 400, 'Demo top-ups are available below 1,000 credits');
    credit(u.id, 'demo', Math.round(cfg.DEMO_START_CREDITS * 100), 'demo-refill'); return { balances: balances(u.id) };
  },
  'GET /api/history': async (req, res, body, ip, u, url) => {
    need(u, 401, 'Please log in');
    const mode = url.searchParams.get('mode') === 'real' ? 'real' : 'demo';
    return { rounds: q("SELECT id, game, wager, payout, detail, updated AS t FROM rounds WHERE user_id = ? AND mode = ? AND status = 'done' ORDER BY id DESC LIMIT 200").all(u.id, mode).map((r) => ({ ...r, wager: C2(r.wager), payout: C2(r.payout) })) };
  },
  'GET /api/stats': async (req, res, body, ip, u, url) => {
    need(u, 401, 'Please log in');
    const mode = url.searchParams.get('mode') === 'real' ? 'real' : 'demo';
    return { games: q("SELECT game, COUNT(*) rounds, SUM(wager) wagered, SUM(payout) won, MAX(payout) biggest FROM rounds WHERE user_id = ? AND mode = ? AND status = 'done' GROUP BY game").all(u.id, mode).map((r) => ({ ...r, wagered: C2(r.wagered), won: C2(r.won), biggest: C2(r.biggest) })) };
  },
  /* ----- wallet ----- */
  'GET /api/wallet': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in');
    const addr = cfg.CHAIN_ENABLED ? pay.depositAddress(u.id) : null;
    const deposits = q("SELECT c.signature, c.lamports, c.units, c.kind, c.ts, a.address, a.day FROM chain_txs c JOIN deposit_addresses a ON a.id = c.address_id WHERE c.user_id = ? AND c.lamports > 0 ORDER BY c.ts DESC LIMIT 50").all(u.id)
      .map((d) => ({ ...d, sol: d.lamports / 1e9, credits: C2(d.units) }));
    const withdrawals = q('SELECT id, dest, units, lamports, status, signature, note, created FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id).map((w) => ({ ...w, sol: w.lamports / 1e9, credits: C2(w.units) }));
    return { address: addr && addr.address, day: addr && addr.day, deposits, withdrawals, balances: balances(u.id), config: publicConfig() };
  },
  'POST /api/withdraw': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('wd:' + u.id, 5, 60000), 429, 'Too many withdrawal requests');
    try { return pay.requestWithdrawal(u.id, body.address, body.amount); }
    catch (e) { if (e instanceof BalanceError) throw new HttpError(400, 'Insufficient real balance'); throw new HttpError(400, e.message); }
  },
  /* ----- admin ----- */
  'GET /api/admin/overview': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    const hot = hotWallet().publicKey.toBase58();
    let hotSol = null; try { if (cfg.CHAIN_ENABLED) hotSol = (await require('./chain').getBalance(hot)) / 1e9; } catch (e) { hotSol = 'RPC error: ' + e.message; }
    const days = q("SELECT a.day, COUNT(DISTINCT a.id) addresses, COALESCE(SUM(CASE WHEN c.kind = 'deposit' THEN c.lamports END),0) lamports, COUNT(CASE WHEN c.kind='deposit' THEN 1 END) deposits FROM deposit_addresses a LEFT JOIN chain_txs c ON c.address_id = a.id GROUP BY a.day ORDER BY a.day DESC LIMIT 14").all()
      .map((d) => ({ ...d, sol: d.lamports / 1e9 }));
    const house = q("SELECT game, SUM(wager) w, SUM(payout) p, COUNT(*) n FROM rounds WHERE mode = 'real' AND status = 'done' GROUP BY game").all().map((r) => ({ game: r.game, rounds: r.n, wageredSol: solOf(r.w), paidSol: solOf(r.p), houseSol: solOf(r.w - r.p) }));
    const liab = q('SELECT COALESCE(SUM(real_units),0) s FROM users').get().s;
    return { cluster: cfg.cluster, hotWallet: hot, hotSol, treasury: cfg.TREASURY_ADDRESS || '(not set — sweeps stay in hot wallet)', hotFloatSol: cfg.HOT_FLOAT_SOL,
      playerBalancesSol: solOf(liab), days, house, sweeps: q('SELECT s.*, a.address FROM sweeps s JOIN deposit_addresses a ON a.id = s.address_id ORDER BY s.id DESC LIMIT 20').all().map((s) => ({ ...s, sol: s.lamports / 1e9 })),
      watcher: pay.watcherStatus(), users: q('SELECT COUNT(*) n FROM users').get().n,
      referrals: (() => { const t = referrals.totals(); return { share: referrals.SHARE, referredPlayers: t.referred, pendingSol: solOf(t.pending / 1000), paidSol: solOf(t.paid / 1000) }; })() };
  },
  'GET /api/admin/withdrawals': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    return { withdrawals: q('SELECT w.*, u.username FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 100').all().map((w) => ({ ...w, sol: w.lamports / 1e9 })) };
  },
  'POST /api/admin/withdrawal': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    const w = q('SELECT * FROM withdrawals WHERE id = ?').get(Number(body.id)); need(w, 404, 'Not found');
    if (body.action === 'approve') { need(w.status === 'pending', 400, 'Only pending withdrawals can be approved'); q("UPDATE withdrawals SET status = 'approved', updated = ? WHERE id = ?").run(Date.now(), w.id); }
    else if (body.action === 'reject') { need(w.status === 'pending' || w.status === 'approved', 400, 'Cannot reject now'); pay.refundWithdrawal(w, 'rejected', String(body.note || 'Rejected by admin').slice(0, 200)); }
    else throw new HttpError(400, 'Unknown action');
    return { ok: true };
  },
};

/* ---------- static files ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUBLIC = ['/index.html', '/css/', '/js/'];
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (!PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) { res.writeHead(404); return res.end('Not found'); }
  const file = path.normalize(path.join(cfg.ROOT, pathname));
  if (!file.startsWith(cfg.ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  const url = new URL(req.url, 'http://x');
  const ip = (cfg.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress;
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  const h = routes[`${req.method} ${url.pathname}`];
  if (!h) return send(res, 404, { error: 'Not found' });
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    send(res, 200, await h(req, res, body, ip, userFrom(req), url));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    if (e instanceof GameError) return send(res, 400, { error: e.message });
    if (e instanceof BalanceError) return send(res, 400, { error: 'Insufficient balance' });
    console.error(e); send(res, 500, { error: 'Server error' });
  }
});

/** Create or update the configured admin account (ADMIN_USERNAME / ADMIN_PASSWORD). */
function ensureAdmin() {
  if (!cfg.ADMIN_USERNAME && !cfg.ADMIN_PASSWORD) return;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(cfg.ADMIN_USERNAME)) throw new Error('ADMIN_USERNAME must be 3–20 letters, numbers or _');
  if (cfg.ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
  const salt = crypto.randomBytes(16).toString('hex'), ph = hash(cfg.ADMIN_PASSWORD, salt);
  const u = q('SELECT * FROM users WHERE username = ?').get(cfg.ADMIN_USERNAME);
  if (u) {
    const same = crypto.timingSafeEqual(Buffer.from(hash(cfg.ADMIN_PASSWORD, u.salt), 'hex'), Buffer.from(u.pass_hash, 'hex'));
    tx(() => { q("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id); if (!same) { q('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(ph, salt, u.id); q('DELETE FROM sessions WHERE user_id = ?').run(u.id); } });
  } else tx(() => { const id = Number(q("INSERT INTO users (username, pass_hash, salt, role, created) VALUES (?,?,?,'admin',?)").run(cfg.ADMIN_USERNAME, ph, salt, Date.now()).lastInsertRowid); credit(id, 'demo', Math.round(cfg.DEMO_START_CREDITS * 100), 'demo-signup'); });
  console.log(`[auth] admin account: ${cfg.ADMIN_USERNAME}`);
}
ensureAdmin();

if (require.main === module) {
  server.listen(cfg.PORT, cfg.HOST, () => console.log(`Royal Edge Casino on http://localhost:${cfg.PORT}  (${cfg.cluster}, chain ${cfg.CHAIN_ENABLED ? 'on' : 'off'})`));
  pay.startWatcher();
  setInterval(() => { try { refundStaleShots(); q('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch (e) { console.error(e); } }, 30000).unref();
}
module.exports = { server };
