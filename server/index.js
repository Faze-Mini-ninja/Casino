/* krush.casino server: static files + JSON API (accounts, games, wallet, admin). No framework. */
'use strict';
process.removeAllListeners('warning'); // silence node:sqlite "experimental" notice
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { q, tx, credit, balances, BalanceError } = require('./db');
const chains = require('./chains');
const prices = require('./prices');
const { play, abandon, refundStaleShots, GameError } = require('./play');
const pay = require('./payments');
const referrals = require('./referrals');
const settings = require('./settings');
const socialRoutes = require('./social');
const { can } = socialRoutes;
const adminRoutes = require('./admin');
const stream = require('./stream');
const rg = require('./compliance');
const backup = require('./backup');

/* ---------- schema additions: disabled accounts, admin audit log ---------- */
try { q('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0').run(); } catch { /* exists */ }
require('./db').db.exec('CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY, admin_id INTEGER NOT NULL, action TEXT NOT NULL, target_id INTEGER, detail TEXT, ts INTEGER NOT NULL)');
const audit = (admin, action, target, detail) => q('INSERT INTO admin_log (admin_id, action, target_id, detail, ts) VALUES (?,?,?,?,?)').run(admin.id, action, target ?? null, detail || '', Date.now());

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
  return s ? q('SELECT id, username, role, created FROM users WHERE id = ? AND disabled = 0').get(s.user_id) || null : null;
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
const usdOf = (units) => Math.round(units || 0) / 100; // ledger units are cents
const coinInfo = () => chains.enabled().map((a) => ({ id: a, name: chains.ASSETS[a].name, network: chains.ASSETS[a].network, confirm: chains.ASSETS[a].confirm, minDeposit: cfg.MIN_DEPOSIT[a], withdrawFee: cfg.WITHDRAW_FEE[a] }));
const publicConfig = () => ({ licenseText: cfg.LICENSE_TEXT, depositFeePct: cfg.DEPOSIT_FEE_PCT, cluster: cfg.cluster, testnet: cfg.TESTNET, coins: coinInfo(), minWithdrawUsd: cfg.MIN_WITHDRAW_USD, autoApproveUsd: cfg.AUTO_APPROVE_USD, watchDays: cfg.ADDRESS_WATCH_DAYS, chainEnabled: cfg.CHAIN_ENABLED, maxBet: cfg.MAX_BET_CREDITS, demoStart: cfg.DEMO_START_CREDITS, showOdds: cfg.SHOW_ODDS, inviteOnly: !!cfg.REGISTRATION_CODE, referralShare: referrals.SHARE, odds: settings.odds(), announcement: settings.announcement(), tipping: { enabled: settings.tipping().enabled } });
const me = (u) => ({ user: { id: u.id, username: u.username, role: u.role }, balances: balances(u.id), rg: rg.status(u.id), config: publicConfig() });

/* ---------- routes ---------- */
const routes = {
  'POST /api/register': async (req, res, body, ip) => {
    need(!limited('reg:' + ip, 5, 3600000), 429, 'Too many sign-ups from this network, try later');
    if (cfg.REGISTRATION_CODE) need(String(body.inviteCode || '').trim() === cfg.REGISTRATION_CODE, 403, 'Sign-up is invite-only — enter the invite code you were given');
    const username = String(body.username || '').trim(), password = String(body.password || '');
    need(/^[A-Za-z0-9_]{3,20}$/.test(username), 400, 'Username: 3–20 letters, numbers or _');
    need(password.length >= 8 && password.length <= 200, 400, 'Password must be at least 8 characters');
    need(!q('SELECT 1 FROM users WHERE username = ?').get(username), 409, 'That username is taken');
    const refCode = String(body.refCode || '').trim();
    need(!refCode || referrals.findByCode(refCode), 400, 'Referral code not found — check it or leave it empty');
    need(body.ageConfirm === true, 400, 'Please confirm you are 18 or older and accept the terms');
    const salt = crypto.randomBytes(16).toString('hex');
    const id = tx(() => {
      // Without ADMIN_USERNAME configured (local dev), the first account becomes admin.
      const first = !cfg.ADMIN_USERNAME && !q('SELECT 1 FROM users LIMIT 1').get();
      const uid = Number(q('INSERT INTO users (username, pass_hash, salt, role, created) VALUES (?,?,?,?,?)').run(username, hash(password, salt), salt, first ? 'admin' : 'player', Date.now()).lastInsertRowid);
      credit(uid, 'demo', Math.round(cfg.DEMO_START_CREDITS * 100), 'demo-signup');
      q('UPDATE users SET ref_code = ?, age_confirmed = 1 WHERE id = ?').run(referrals.newCode(), uid);
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
    need(!u.disabled, 403, 'This account has been disabled');
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
    const blocked = rg.playBlock(u.id, body && body.mode === 'real' ? 'real' : 'demo');
    // a round already under way may still be finished (no new rounds, no new fish shots)
    const finishing = body && (body.game === 'fish' ? ['hit', 'expire'].includes(body.action) : !!body.action && body.action !== 'start');
    need(!blocked || finishing, 403, blocked);
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
    // top the demo balance back up to the starting amount once it drops below 10% of it
    const start = Math.round(cfg.DEMO_START_CREDITS * 100), b = balances(u.id);
    need(b.demo < start / 10, 400, `Demo top-ups are available below ${(cfg.DEMO_START_CREDITS / 10).toLocaleString('en-US')} credits`);
    credit(u.id, 'demo', start - b.demo, 'demo-refill'); return { balances: balances(u.id) };
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
    const depositBlock = rg.depositBlock(u.id), room = rg.depositRoom(u.id);
    const addresses = cfg.CHAIN_ENABLED && !depositBlock ? pay.depositAddresses(u.id) : {};
    const deposits = q('SELECT d.txid, d.asset, d.base, d.units, d.gross_units, d.fee_units, d.price, d.kind, d.ts, a.address FROM deposits d JOIN addresses a ON a.id = d.address_id WHERE d.user_id = ? ORDER BY d.ts DESC LIMIT 50').all(u.id)
      .map((d) => ({ ...d, coin: chains.toCoin(d.asset, d.base), usd: usdOf(d.units), credits: usdOf(d.units), grossUsd: d.gross_units == null ? usdOf(d.units) : usdOf(d.gross_units), feeUsd: usdOf(d.fee_units || 0), url: pay.explorer(d.asset, d.txid) }));
    const withdrawals = q('SELECT id, dest, units, asset, base, price, status, signature, note, created FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id)
      .map((w) => ({ ...w, coin: chains.toCoin(w.asset, w.base), usd: usdOf(w.units), credits: usdOf(w.units), url: w.signature ? pay.explorer(w.asset, w.signature) : null }));
    return { addresses, depositBlock, depositRoom: room == null ? null : room / 100, deposits, withdrawals, prices: cfg.CHAIN_ENABLED ? await prices.all() : {}, balances: balances(u.id), config: publicConfig() };
  },
  'POST /api/withdraw': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('wd:' + u.id, 5, 60000), 429, 'Too many withdrawal requests');
    try { return await pay.requestWithdrawal(u.id, body.asset || 'SOL', body.address, body.amount); }
    catch (e) { if (e instanceof BalanceError) throw new HttpError(400, 'Insufficient real balance'); throw new HttpError(400, e.message); }
  },
  /* ----- responsible gambling ----- */
  'GET /api/rg': async (req, res, body, ip, u) => { need(u, 401, 'Please log in'); return rg.status(u.id); },
  'POST /api/rg/limits': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('rg:' + u.id, 20, 60000), 429, 'Slow down');
    try { rg.setLimits(u.id, body || {}); } catch (e) { throw new HttpError(400, e.message); }
    return rg.status(u.id);
  },
  'POST /api/rg/cooloff': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in');
    try { rg.coolOff(u.id, body.days); } catch (e) { throw new HttpError(400, e.message); }
    return rg.status(u.id);
  },
  'POST /api/rg/exclude': async (req, res, body, ip, u) => {
    need(u, 401, 'Please log in'); need(!limited('pw:' + u.id, 5, 600000), 429, 'Too many attempts, wait a few minutes');
    const row = q('SELECT pass_hash, salt FROM users WHERE id = ?').get(u.id);
    need(crypto.timingSafeEqual(Buffer.from(hash(String(body.password || ''), row.salt), 'hex'), Buffer.from(row.pass_hash, 'hex')), 403, 'Wrong password');
    try { rg.selfExclude(u.id, body.months); } catch (e) { throw new HttpError(400, e.message); }
    return rg.status(u.id);
  },
  /* ----- admin ----- */
  'GET /api/admin/overview': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    let wallets = []; try { if (cfg.CHAIN_ENABLED) wallets = await pay.treasury(); } catch (e) { wallets = []; }
    const days = q("SELECT a.day, COUNT(DISTINCT a.id) addresses, COALESCE(SUM(CASE WHEN d.kind = 'deposit' THEN d.units END),0) units, COUNT(CASE WHEN d.kind='deposit' THEN 1 END) deposits FROM addresses a LEFT JOIN deposits d ON d.address_id = a.id GROUP BY a.day ORDER BY a.day DESC LIMIT 14").all()
      .map((d) => ({ ...d, usd: usdOf(d.units) }));
    const house = q("SELECT game, SUM(wager) w, SUM(payout) p, COUNT(*) n FROM rounds WHERE mode = 'real' AND status = 'done' GROUP BY game").all().map((r) => ({ game: r.game, rounds: r.n, wageredUsd: usdOf(r.w), paidUsd: usdOf(r.p), houseUsd: usdOf(r.w - r.p) }));
    const liab = q('SELECT COALESCE(SUM(real_units),0) s FROM users').get().s;
    const sweeps = q('SELECT s.*, a.address FROM chain_sweeps s JOIN addresses a ON a.id = s.address_id ORDER BY s.id DESC LIMIT 20').all()
      .map((s) => ({ id: s.id, ts: s.ts, asset: s.asset, address: s.address, dest: s.dest, coin: chains.toCoin(s.asset, s.base), status: s.status, note: s.note, url: s.txid ? pay.explorer(s.asset, s.txid) : null }));
    return { cluster: cfg.cluster, testnet: cfg.TESTNET, wallets, hotFloatUsd: cfg.HOT_FLOAT_USD, playerBalancesUsd: usdOf(liab), days, house, sweeps, cashouts: pay.cashouts(),
      watcher: pay.watcherStatus(), users: q('SELECT COUNT(*) n FROM users').get().n,
      referrals: (() => { const t = referrals.totals(); return { share: referrals.SHARE, referredPlayers: t.referred, pendingUsd: usdOf(t.pending / 1000), paidUsd: usdOf(t.paid / 1000) }; })() };
  },
  /* ----- admin: backups ----- */
  'GET /api/admin/backup': async (req, res, body, ip, u) => { need(u && u.role === 'admin', 403, 'Admins only'); return backup.status(); },
  'POST /api/admin/backup/run': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only'); need(!limited('backup:' + u.id, 6, 3600000), 429, 'Too many manual backups, try later');
    try { await backup.runBackup(require('./db').db); } catch (e) { throw new HttpError(500, 'Backup failed: ' + e.message); }
    audit(u, 'backup', null, ''); return backup.status();
  },
  /* ----- admin: user management ----- */
  'GET /api/admin/users': async (req, res, body, ip, u, url) => {
    need(can(u, 'staff'), 403, 'Staff only');
    const term = '%' + String(url.searchParams.get('q') || '').trim() + '%';
    const rows = q(`SELECT u.id, u.username, u.role, u.demo_units, u.real_units, u.created, u.disabled, u.muted_until, r.username AS referrer,
      (SELECT COALESCE(SUM(d.units),0) FROM deposits d WHERE d.user_id = u.id AND d.kind = 'deposit') AS dep_units
      FROM users u LEFT JOIN users r ON r.id = u.referred_by WHERE u.username LIKE ? ORDER BY u.id DESC LIMIT 100`).all(term);
    const log = q('SELECT l.*, a.username AS admin, t.username AS target FROM admin_log l JOIN users a ON a.id = l.admin_id LEFT JOIN users t ON t.id = l.target_id ORDER BY l.id DESC LIMIT 30').all();
    return { users: rows.map((x) => ({ id: x.id, username: x.username, role: x.role, demo: C2(x.demo_units), real: C2(x.real_units), created: x.created, disabled: !!x.disabled, muted: x.muted_until > Date.now(), referrer: x.referrer, deposited: usdOf(x.dep_units) })), log };
  },
  'POST /api/admin/users/create': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    const username = String(body.username || '').trim(), password = String(body.password || '');
    need(/^[A-Za-z0-9_]{3,20}$/.test(username), 400, 'Username: 3–20 letters, numbers or _');
    need(password.length >= 8 && password.length <= 200, 400, 'Password must be at least 8 characters');
    need(!q('SELECT 1 FROM users WHERE username = ?').get(username), 409, 'That username is taken');
    const demo = Math.round(Number(body.demo ?? cfg.DEMO_START_CREDITS) * 100), real = Math.round(Number(body.real || 0) * 100);
    need(Number.isInteger(demo) && demo >= 0 && Number.isInteger(real) && real >= 0, 400, 'Balances must be 0 or more');
    const salt = crypto.randomBytes(16).toString('hex');
    const id = tx(() => {
      const uid = Number(q("INSERT INTO users (username, pass_hash, salt, role, created, ref_code) VALUES (?,?,?,'player',?,?)").run(username, hash(password, salt), salt, Date.now(), referrals.newCode()).lastInsertRowid);
      credit(uid, 'demo', demo, 'admin-create', 'admin:' + u.username); credit(uid, 'real', real, 'admin-create', 'admin:' + u.username);
      audit(u, 'create-user', uid, `demo ${demo / 100}, real ${real / 100}`);
      return uid;
    });
    return { ok: true, id };
  },
  'POST /api/admin/users/adjust': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    const t = q('SELECT * FROM users WHERE id = ?').get(Number(body.id)); need(t, 404, 'User not found');
    need(body.mode === 'demo' || body.mode === 'real', 400, 'Choose demo or real');
    const units = Math.round(Number(body.amount) * 100);
    need(Number.isInteger(units) && units !== 0 && Math.abs(units) <= 1e12, 400, 'Enter a non-zero amount');
    const note = String(body.note || '').slice(0, 200);
    try {
      tx(() => { (units > 0 ? credit : (a, m, x, r, f) => require('./db').debit(a, m, x, r, f))(t.id, body.mode, Math.abs(units), units > 0 ? 'admin-credit' : 'admin-debit', 'admin:' + u.username + (note ? ': ' + note : ''));
        audit(u, units > 0 ? 'add-balance' : 'remove-balance', t.id, `${body.mode} ${units / 100}${note ? ' — ' + note : ''}`); });
    } catch (e) { if (e instanceof BalanceError) throw new HttpError(400, 'That would make the balance negative'); throw e; }
    return { ok: true, balances: balances(t.id) };
  },
  'POST /api/admin/users/password': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    const t = q('SELECT * FROM users WHERE id = ?').get(Number(body.id)); need(t, 404, 'User not found');
    const pw = String(body.password || ''); need(pw.length >= 8 && pw.length <= 200, 400, 'Password must be at least 8 characters');
    const salt = crypto.randomBytes(16).toString('hex');
    tx(() => { q('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash(pw, salt), salt, t.id); q('DELETE FROM sessions WHERE user_id = ?').run(t.id); audit(u, 'reset-password', t.id, ''); });
    return { ok: true };
  },
  'POST /api/admin/users/disable': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    const t = q('SELECT * FROM users WHERE id = ?').get(Number(body.id)); need(t, 404, 'User not found');
    need(t.id !== u.id, 400, 'You cannot disable your own account');
    const off = body.disabled ? 1 : 0;
    tx(() => { q('UPDATE users SET disabled = ? WHERE id = ?').run(off, t.id); if (off) q('DELETE FROM sessions WHERE user_id = ?').run(t.id); audit(u, off ? 'disable' : 'enable', t.id, ''); });
    return { ok: true };
  },
  'GET /api/admin/withdrawals': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    return { withdrawals: q('SELECT w.*, u.username FROM withdrawals w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 100').all().map((w) => ({ ...w, meta: undefined, coin: chains.toCoin(w.asset, w.base), usd: usdOf(w.units), url: w.signature ? pay.explorer(w.asset, w.signature) : null })) };
  },
  'POST /api/admin/cashout': async (req, res, body, ip, u) => {
    need(u && u.role === 'admin', 403, 'Admins only');
    need(!limited('cashout:' + u.id, 5, 60000), 429, 'Too many cash-outs, wait a minute');
    const me = q('SELECT pass_hash, salt FROM users WHERE id = ?').get(u.id);
    need(crypto.timingSafeEqual(Buffer.from(hash(String(body.password || ''), me.salt), 'hex'), Buffer.from(me.pass_hash, 'hex')), 403, 'Wrong password');
    let r;
    try { r = await pay.requestCashout(u.id, body.asset, body.address, body.amount === 'max' ? 'max' : Number(body.amount)); }
    catch (e) { throw new HttpError(400, e.message); }
    audit(u, 'cashout', null, `${r.coin} ${r.asset} -> ${r.dest}`);
    return r;
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

Object.assign(routes, socialRoutes({ need, HttpError, limited, audit }), adminRoutes({ need, audit }));

/* ---------- static files ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const PUBLIC = ['/index.html', '/css/', '/js/', '/fonts/', '/img/'];
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (!PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) { res.writeHead(404); return res.end('Not found'); }
  const file = path.normalize(path.join(cfg.ROOT, pathname));
  if (!file.startsWith(cfg.ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    // revalidate every time, but answer 304 when unchanged so images and fonts are not re-downloaded
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/fonts/') ? 'public, max-age=2592000' : 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    fs.readFile(file, (err2, data) => {
      if (err2) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, headers); res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  const url = new URL(req.url, 'http://x');
  // Behind a proxy, the client IP is the entry the nearest trusted proxy added (counted from the right); entries further
  // left were sent by the client and can be faked.
  const fwd = cfg.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean) : [];
  const ip = fwd[Math.max(0, fwd.length - cfg.PROXY_HOPS)] || req.socket.remoteAddress;
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/api/stream' && req.method === 'GET') return stream.handle(req, res, userFrom(req), ip);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, decodeURIComponent(url.pathname));
  const h = routes[`${req.method} ${url.pathname}`];
  if (!h) return send(res, 404, { error: 'Not found' });
  try {
    const body = req.method === 'POST' ? await readJson(req) : {};
    send(res, 200, await h(req, res, body, ip, userFrom(req), url));
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    if (e instanceof GameError) return send(res, 400, { error: e.message, ...(e.data || {}) });
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

/** Create accounts listed in SEED_USERS (name:password:demo:real) if they don't exist. Existing accounts are left alone. */
function seedUsers() {
  for (const entry of String(cfg.SEED_USERS || '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const [username, password, demo = String(cfg.DEMO_START_CREDITS), real = '0'] = entry.split(':');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username || '') || !password || password.length < 8) { console.warn(`[seed] skipped invalid entry for "${username}"`); continue; }
    if (q('SELECT 1 FROM users WHERE username = ?').get(username)) continue;
    const salt = crypto.randomBytes(16).toString('hex');
    tx(() => {
      const uid = Number(q("INSERT INTO users (username, pass_hash, salt, role, created, ref_code) VALUES (?,?,?,'player',?,?)").run(username, hash(password, salt), salt, Date.now(), referrals.newCode()).lastInsertRowid);
      credit(uid, 'demo', Math.round(Number(demo) * 100) || 0, 'seed-account');
      credit(uid, 'real', Math.round(Number(real) * 100) || 0, 'seed-account');
    });
    console.log(`[seed] created account ${username} (demo ${demo}, real ${real})`);
  }
}
seedUsers();

if (require.main === module) {
  server.listen(cfg.PORT, cfg.HOST, () => console.log(`krush.casino on http://localhost:${cfg.PORT}  (${cfg.cluster}, chain ${cfg.CHAIN_ENABLED ? 'on' : 'off'})`));
  pay.startWatcher();
  backup.start(require('./db').db);
  setInterval(() => { try { refundStaleShots(); q('DELETE FROM sessions WHERE expires < ?').run(Date.now()); } catch (e) { console.error(e); } }, 30000).unref();
}
module.exports = { server };
