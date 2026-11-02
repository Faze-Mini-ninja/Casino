/* Server-Sent Events: one long-lived connection per browser tab pushes chat, bets, announcements and odds changes.
 * Staff connections (mod and up) also receive full player names and live round starts. */
'use strict';
const bus = require('./bus');
const { q } = require('./db');
const { rank } = require('./social');

const clients = new Set();
const perIp = new Map();
const C2 = (u) => Math.round(u) / 100;
const mask = (n) => (n.length <= 3 ? n[0] + '**' : n.slice(0, 2) + '*'.repeat(Math.min(5, n.length - 3)) + n.slice(-1));

function send(c, type, data) { try { c.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* closed */ } }
function broadcast(type, data, filter) { for (const c of clients) if (!filter || filter(c)) send(c, type, data); }
const isStaff = (c) => rank(c.user) >= 1;

function online() {
  const ids = new Set(); let anon = 0;
  for (const c of clients) { if (c.user) ids.add(c.user.id); else anon++; }
  return { users: ids.size, guests: anon, total: ids.size + anon };
}

let onlineTimer = null;
const pushOnline = () => { if (!onlineTimer) onlineTimer = setTimeout(() => { onlineTimer = null; broadcast('online', online()); }, 1000); };

function handle(req, res, user, ip) {
  const n = perIp.get(ip) || 0;
  if (n >= 12) { res.writeHead(429); return res.end(); }
  perIp.set(ip, n + 1);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 4000\n\n');
  const c = { res, user, ip };
  clients.add(c);
  send(c, 'online', online()); pushOnline();
  req.on('close', () => { clients.delete(c); pushOnline(); const m = (perIp.get(ip) || 1) - 1; if (m <= 0) perIp.delete(ip); else perIp.set(ip, m); });
}

const nameOf = (id) => (q('SELECT username FROM users WHERE id = ?').get(id) || {}).username || '?';
bus.on('bet', (e) => {
  const user = nameOf(e.userId);
  const full = { game: e.game, mode: e.mode, wager: C2(e.wager), payout: C2(e.payout), t: e.t, user, userId: e.userId, roundId: e.roundId };
  const pub = { game: e.game, mode: e.mode, wager: full.wager, payout: full.payout, t: e.t, user: mask(user) };
  for (const c of clients) {
    if (isStaff(c)) send(c, 'bet', full);
    else if (e.game !== 'fish') send(c, 'bet', pub);
  }
});
bus.on('round', (e) => broadcast('round', { game: e.game, mode: e.mode, wager: C2(e.wager), user: nameOf(e.userId), userId: e.userId, roundId: e.roundId, t: e.t }, isStaff));
bus.on('chat', (m) => broadcast('chat', m));
bus.on('chat-del', (m) => broadcast('chat-del', m));
bus.on('announce', (a) => broadcast('announce', a));
bus.on('odds', (o) => broadcast('odds', o));
bus.on('ticket', (t) => broadcast('ticket', { id: t.id, status: t.status }, (c) => isStaff(c) || (c.user && c.user.id === t.userId)));
bus.on('tip', (t) => broadcast('tipped', { from: t.from, amount: t.amount, mode: t.mode }, (c) => c.user && c.user.id === t.to));
bus.on('deposit', (d) => broadcast('deposit', { asset: d.asset || 'SOL', coin: d.coin ?? d.sol, usd: d.usd ?? d.credits, credits: d.credits, belowMinimum: !!d.belowMinimum, signature: d.signature }, (c) => c.user && c.user.id === d.to));

setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch { /* closed */ } } broadcast('online', online()); }, 20000).unref();

module.exports = { handle, online, clients };
