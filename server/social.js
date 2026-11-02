/* Chat, moderation, player-to-player tips and support tickets. */
'use strict';
const cfg = require('./config');
const { db, q, tx, debit, credit, balances, BalanceError } = require('./db');
const settings = require('./settings');
const bus = require('./bus');

for (const sql of ['ALTER TABLE users ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0']) { try { db.exec(sql); } catch { /* exists */ } }
db.exec(`
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT NOT NULL DEFAULT 'msg', text TEXT NOT NULL, ts INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS chat_ts ON chat_messages(id);
CREATE TABLE IF NOT EXISTS tips (id INTEGER PRIMARY KEY, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, mode TEXT NOT NULL, units INTEGER NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, last_from TEXT NOT NULL DEFAULT 'player');
CREATE TABLE IF NOT EXISTS ticket_msgs (id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, user_id INTEGER NOT NULL, staff INTEGER NOT NULL, text TEXT NOT NULL, ts INTEGER NOT NULL);
`);

const RANK = { player: 0, mod: 1, staff: 2, admin: 3 };
const rank = (u) => (u ? RANK[u.role] || 0 : -1);
const can = (u, role) => rank(u) >= RANK[role];
const clean = (t, max) => String(t || '').replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const C2 = (u) => Math.round(u) / 100;

function chatView(m) {
  return { id: m.id, kind: m.kind, text: m.text, ts: m.ts, user: m.username || null, role: m.role || null, uid: m.user_id || null };
}
function postSystem(kind, text, userId = null) {
  const id = q('INSERT INTO chat_messages (user_id, kind, text, ts) VALUES (?,?,?,?)').run(userId, kind, text, Date.now()).lastInsertRowid;
  const m = q('SELECT c.*, u.username, u.role FROM chat_messages c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = ?').get(id);
  return chatView(m);
}

module.exports = function socialRoutes({ need, HttpError, limited, audit }) {
  const userRow = (id) => q('SELECT * FROM users WHERE id = ?').get(id);
  const byName = (n) => q('SELECT * FROM users WHERE username = ?').get(String(n || '').trim().replace(/^@/, ''));

  return {
    /* ----- chat ----- */
    'GET /api/chat': async () => ({
      messages: q('SELECT c.*, u.username, u.role FROM chat_messages c LEFT JOIN users u ON u.id = c.user_id WHERE c.deleted = 0 ORDER BY c.id DESC LIMIT 60').all().reverse().map(chatView),
    }),
    'POST /api/chat': async (req, res, body, ip, u) => {
      need(u, 401, 'Sign in to chat');
      const row = userRow(u.id);
      need(row.muted_until <= Date.now(), 403, `You are muted for ${Math.ceil((row.muted_until - Date.now()) / 60000)} more minute(s)`);
      need(!limited('chat:' + u.id, 1, 1500) && !limited('chat30:' + u.id, 10, 30000), 429, 'You are sending messages too fast');
      const text = clean(body.text, 280); need(text.length, 400, 'Type a message first');
      const id = q("INSERT INTO chat_messages (user_id, kind, text, ts) VALUES (?, 'msg', ?, ?)").run(u.id, text, Date.now()).lastInsertRowid;
      const msg = chatView({ id: Number(id), kind: 'msg', text, ts: Date.now(), username: u.username, role: u.role, user_id: u.id });
      bus.emit('chat', msg);
      return { ok: true, message: msg };
    },
    'POST /api/chat/delete': async (req, res, body, ip, u) => {
      need(can(u, 'mod'), 403, 'Moderators only');
      const m = q('SELECT * FROM chat_messages WHERE id = ?').get(Number(body.id)); need(m, 404, 'Message not found');
      q('UPDATE chat_messages SET deleted = 1 WHERE id = ?').run(m.id);
      audit(u, 'chat-delete', m.user_id, m.text.slice(0, 120));
      bus.emit('chat-del', { id: m.id });
      return { ok: true };
    },
    'POST /api/mod/mute': async (req, res, body, ip, u) => {
      need(can(u, 'mod'), 403, 'Moderators only');
      const t = body.userId ? userRow(Number(body.userId)) : byName(body.username); need(t, 404, 'Player not found');
      need(t.id !== u.id, 400, 'You cannot mute yourself');
      need(rank(t) < rank(u), 403, 'You can only mute players below your role');
      const minutes = Math.max(0, Math.min(60 * 24 * 30, Number(body.minutes) || 0));
      q('UPDATE users SET muted_until = ? WHERE id = ?').run(minutes ? Date.now() + minutes * 60000 : 0, t.id);
      audit(u, minutes ? 'mute' : 'unmute', t.id, minutes ? `${minutes} min` : '');
      if (minutes) bus.emit('chat', postSystem('system', `${t.username} was muted for ${minutes >= 1440 ? Math.round(minutes / 1440) + ' day(s)' : minutes >= 60 ? Math.round(minutes / 60) + ' hour(s)' : minutes + ' minutes'}.`));
      return { ok: true };
    },

    /* ----- tips ----- */
    'POST /api/tip': async (req, res, body, ip, u) => {
      need(u, 401, 'Please log in'); need(!limited('tip:' + u.id, 10, 60000), 429, 'Too many tips, slow down');
      const mode = body.mode === 'real' ? 'real' : 'demo';
      const to = byName(body.to); need(to && !to.disabled, 404, 'Player not found');
      need(to.id !== u.id, 400, 'You cannot tip yourself');
      const units = Math.round(Number(body.amount) * 100);
      need(Number.isInteger(units) && units >= 100, 400, 'Minimum tip is 1 credit');
      const T = settings.tipping();
      if (mode === 'real') {
        need(T.enabled, 403, 'Real-money tipping is turned off right now');
        const wagered = q("SELECT COALESCE(SUM(wager),0) s FROM rounds WHERE user_id = ? AND mode = 'real' AND status = 'done'").get(u.id).s;
        need(wagered >= Math.round(T.minWagered * 100), 403, `You need to wager at least ${T.minWagered} real credits before you can tip`);
        const today = q("SELECT COALESCE(SUM(units),0) s FROM tips WHERE from_id = ? AND mode = 'real' AND ts > ?").get(u.id, Date.now() - 86400000).s;
        need(today + units <= Math.round(T.dailyMax * 100), 403, `Daily real tipping limit is ${T.dailyMax} credits`);
      }
      let tipId;
      try {
        tx(() => {
          tipId = Number(q('INSERT INTO tips (from_id, to_id, mode, units, ts) VALUES (?,?,?,?,?)').run(u.id, to.id, mode, units, Date.now()).lastInsertRowid);
          debit(u.id, mode, units, 'tip-out', 'tip:' + tipId);
          credit(to.id, mode, units, 'tip-in', 'tip:' + tipId);
        });
      } catch (e) { if (e instanceof BalanceError) throw new HttpError(400, 'Not enough balance for that tip'); throw e; }
      const amount = mode === 'real' ? `$${C2(units).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : `${C2(units).toLocaleString()} demo credits`;
      if (body.public !== false) bus.emit('chat', postSystem('tip', `${u.username} tipped ${to.username} ${amount}`, u.id));
      bus.emit('tip', { to: to.id, from: u.username, amount, mode });
      return { ok: true, balances: balances(u.id) };
    },

    /* ----- support tickets ----- */
    'POST /api/support/tickets': async (req, res, body, ip, u) => {
      need(u, 401, 'Please log in'); need(!limited('ticket:' + u.id, 5, 3600000), 429, 'Too many new tickets, try again later');
      const subject = clean(body.subject, 120), text = String(body.text || '').trim().slice(0, 4000);
      need(subject.length >= 3, 400, 'Add a short subject'); need(text.length >= 5, 400, 'Describe the problem');
      need(q("SELECT COUNT(*) n FROM tickets WHERE user_id = ? AND status != 'closed'").get(u.id).n < 5, 400, 'You already have 5 open tickets');
      const id = tx(() => {
        const tid = Number(q("INSERT INTO tickets (user_id, subject, status, created, updated, last_from) VALUES (?,?,'open',?,?,'player')").run(u.id, subject, Date.now(), Date.now()).lastInsertRowid);
        q('INSERT INTO ticket_msgs (ticket_id, user_id, staff, text, ts) VALUES (?,?,0,?,?)').run(tid, u.id, text, Date.now());
        return tid;
      });
      bus.emit('ticket', { id, status: 'open' });
      return { ok: true, id };
    },
    'GET /api/support/tickets': async (req, res, body, ip, u, url) => {
      need(u, 401, 'Please log in');
      const all = url.searchParams.get('all') === '1' && can(u, 'mod');
      const status = url.searchParams.get('status') || '';
      const rows = all
        ? q(`SELECT t.*, u.username FROM tickets t JOIN users u ON u.id = t.user_id ${status ? 'WHERE t.status = ?' : ''} ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END, t.updated DESC LIMIT 200`).all(...(status ? [status] : []))
        : q('SELECT t.*, u.username FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.user_id = ? ORDER BY t.updated DESC').all(u.id);
      return { tickets: rows.map((t) => ({ id: t.id, subject: t.subject, status: t.status, created: t.created, updated: t.updated, user: t.username, lastFrom: t.last_from })) };
    },
    'GET /api/support/ticket': async (req, res, body, ip, u, url) => {
      need(u, 401, 'Please log in');
      const t = q('SELECT t.*, u.username FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?').get(Number(url.searchParams.get('id')));
      need(t && (t.user_id === u.id || can(u, 'mod')), 404, 'Ticket not found');
      const msgs = q('SELECT m.*, u.username, u.role FROM ticket_msgs m JOIN users u ON u.id = m.user_id WHERE m.ticket_id = ? ORDER BY m.id').all(t.id);
      return { ticket: { id: t.id, subject: t.subject, status: t.status, user: t.username, userId: t.user_id, created: t.created },
        messages: msgs.map((m) => ({ id: m.id, staff: !!m.staff, user: m.staff ? (can(u, 'mod') ? m.username : 'Support') : m.username, text: m.text, ts: m.ts })) };
    },
    'POST /api/support/reply': async (req, res, body, ip, u) => {
      need(u, 401, 'Please log in'); need(!limited('reply:' + u.id, 20, 60000), 429, 'Slow down');
      const t = q('SELECT * FROM tickets WHERE id = ?').get(Number(body.id));
      const staff = can(u, 'mod');
      need(t && (t.user_id === u.id || staff), 404, 'Ticket not found');
      const text = String(body.text || '').trim().slice(0, 4000); need(text.length, 400, 'Write a reply first');
      const asStaff = staff && t.user_id !== u.id;
      tx(() => {
        q('INSERT INTO ticket_msgs (ticket_id, user_id, staff, text, ts) VALUES (?,?,?,?,?)').run(t.id, u.id, asStaff ? 1 : 0, text, Date.now());
        q('UPDATE tickets SET status = ?, updated = ?, last_from = ? WHERE id = ?').run(asStaff ? 'answered' : 'open', Date.now(), asStaff ? 'staff' : 'player', t.id);
      });
      bus.emit('ticket', { id: t.id, status: asStaff ? 'answered' : 'open', userId: t.user_id });
      return { ok: true };
    },
    'POST /api/support/status': async (req, res, body, ip, u) => {
      need(u, 401, 'Please log in');
      const t = q('SELECT * FROM tickets WHERE id = ?').get(Number(body.id));
      need(t && (t.user_id === u.id || can(u, 'mod')), 404, 'Ticket not found');
      const status = body.status === 'closed' ? 'closed' : 'open';
      q('UPDATE tickets SET status = ?, updated = ? WHERE id = ?').run(status, Date.now(), t.id);
      if (can(u, 'mod') && t.user_id !== u.id) audit(u, 'ticket-' + status, t.user_id, `#${t.id}`);
      bus.emit('ticket', { id: t.id, status, userId: t.user_id });
      return { ok: true };
    },
  };
};
module.exports.RANK = RANK;
module.exports.rank = rank;
module.exports.can = can;
module.exports.postSystem = postSystem;
