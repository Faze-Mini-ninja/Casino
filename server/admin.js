/* Staff panel API: dashboard, player profiles, roles, live games, game odds, announcements, tipping rules.
 * Roles: mod < staff < admin. Money actions (balances, odds, withdrawals, roles) are admin-only. */
'use strict';
const L = require('../js/lib.js');
const { q } = require('./db');
const settings = require('./settings');
const stream = require('./stream');
const { G } = require('./games');
const { can, RANK } = require('./social');

const C2 = (u) => Math.round(u || 0) / 100;
const usdOf = (units) => Math.round(units || 0) / 100; // ledger units are cents
const GAME_IDS = [...Object.keys(G), 'fish'];

module.exports = function adminRoutes({ need, audit }) {
  const staff = (u, role = 'staff') => need(can(u, role), 403, 'You do not have access to this');

  return {
    'GET /api/admin/dash': async (req, res, body, ip, u) => {
      staff(u, 'mod');
      const day = Date.now() - 86400000;
      const agg = (mode) => q("SELECT COUNT(*) n, COALESCE(SUM(wager),0) w, COALESCE(SUM(payout),0) p FROM rounds WHERE status = 'done' AND mode = ? AND updated > ?").get(mode, day);
      const real = agg('real'), demo = agg('demo');
      return {
        online: stream.online(),
        real: { bets: real.n, wageredUsd: usdOf(real.w), paidUsd: usdOf(real.p), ggrUsd: usdOf(real.w - real.p) },
        demo: { bets: demo.n, wagered: C2(demo.w), paid: C2(demo.p) },
        activeRounds: q("SELECT COUNT(*) n FROM rounds WHERE status = 'active'").get().n,
        newUsers: q('SELECT COUNT(*) n FROM users WHERE created > ?').get(day).n,
        users: q('SELECT COUNT(*) n FROM users').get().n,
        openTickets: q("SELECT COUNT(*) n FROM tickets WHERE status = 'open'").get().n,
        pendingWithdrawals: q("SELECT COUNT(*) n FROM withdrawals WHERE status = 'pending'").get().n,
        depositsUsd: usdOf(q("SELECT COALESCE(SUM(units),0) s FROM deposits WHERE kind = 'deposit' AND ts > ?").get(day).s),
        topGames: q("SELECT game, COUNT(*) n, SUM(wager) w FROM rounds WHERE status = 'done' AND updated > ? GROUP BY game ORDER BY n DESC LIMIT 6").all(day).map((g) => ({ game: g.game, bets: g.n, wagered: C2(g.w) })),
      };
    },

    'GET /api/admin/user': async (req, res, body, ip, u, url) => {
      staff(u);
      const t = q('SELECT * FROM users WHERE id = ?').get(Number(url.searchParams.get('id'))); need(t, 404, 'Player not found');
      const stats = (mode) => q("SELECT game, COUNT(*) n, SUM(wager) w, SUM(payout) p FROM rounds WHERE user_id = ? AND mode = ? AND status = 'done' GROUP BY game ORDER BY n DESC").all(t.id, mode)
        .map((r) => ({ game: r.game, rounds: r.n, wagered: C2(r.w), won: C2(r.p) }));
      return {
        user: { id: t.id, username: t.username, role: t.role, created: t.created, disabled: !!t.disabled, mutedUntil: t.muted_until, demo: C2(t.demo_units), real: C2(t.real_units),
          referrer: t.referred_by ? (q('SELECT username FROM users WHERE id = ?').get(t.referred_by) || {}).username : null, refCode: t.ref_code },
        totals: {
          depositedUsd: usdOf(q("SELECT COALESCE(SUM(units),0) s FROM deposits WHERE user_id = ? AND kind = 'deposit'").get(t.id).s),
          withdrawnUsd: usdOf(q("SELECT COALESCE(SUM(units),0) s FROM withdrawals WHERE user_id = ? AND status = 'sent'").get(t.id).s),
          tipsSent: C2(q("SELECT COALESCE(SUM(units),0) s FROM tips WHERE from_id = ? AND mode = 'real'").get(t.id).s),
          tipsReceived: C2(q("SELECT COALESCE(SUM(units),0) s FROM tips WHERE to_id = ? AND mode = 'real'").get(t.id).s),
          referrals: q('SELECT COUNT(*) n FROM users WHERE referred_by = ?').get(t.id).n,
        },
        stats: { real: stats('real'), demo: stats('demo') },
        rounds: q("SELECT id, game, mode, wager, payout, detail, updated FROM rounds WHERE user_id = ? AND status = 'done' ORDER BY id DESC LIMIT 25").all(t.id).map((r) => ({ ...r, wager: C2(r.wager), payout: C2(r.payout) })),
        ledger: can(u, 'admin') ? q('SELECT mode, delta, reason, ref, balance_after, ts FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(t.id).map((l) => ({ ...l, delta: C2(l.delta), balance_after: C2(l.balance_after) })) : [],
      };
    },

    'POST /api/admin/users/role': async (req, res, body, ip, u) => {
      staff(u, 'admin');
      const t = q('SELECT * FROM users WHERE id = ?').get(Number(body.id)); need(t, 404, 'Player not found');
      need(t.id !== u.id, 400, 'You cannot change your own role');
      need(['player', 'mod', 'staff'].includes(body.role), 400, 'Role must be player, mod or staff');
      need(t.role !== 'admin', 400, 'Admins are managed with ADMIN_USERNAME in the server settings');
      q('UPDATE users SET role = ? WHERE id = ?').run(body.role, t.id);
      audit(u, 'set-role', t.id, `${t.role} → ${body.role}`);
      return { ok: true };
    },

    'GET /api/admin/live': async (req, res, body, ip, u) => {
      staff(u, 'mod');
      return {
        online: stream.online(),
        active: q("SELECT r.id, r.game, r.mode, r.wager, r.created, u.username, u.id AS userId FROM rounds r JOIN users u ON u.id = r.user_id WHERE r.status = 'active' ORDER BY r.id DESC LIMIT 100").all()
          .map((r) => ({ ...r, wager: C2(r.wager) })),
        recent: q("SELECT r.id, r.game, r.mode, r.wager, r.payout, r.updated AS t, u.username AS user, u.id AS userId FROM rounds r JOIN users u ON u.id = r.user_id WHERE r.status = 'done' ORDER BY r.id DESC LIMIT 60").all()
          .map((r) => ({ ...r, wager: C2(r.wager), payout: C2(r.payout) })),
      };
    },

    'GET /api/admin/games': async (req, res, body, ip, u) => {
      staff(u, 'admin');
      const day = Date.now() - 86400000;
      const st = (game, since) => q("SELECT COUNT(*) n, COALESCE(SUM(wager),0) w, COALESCE(SUM(payout),0) p FROM rounds WHERE game = ? AND status = 'done' AND mode = 'real' AND updated > ?").get(game, since);
      const o = settings.odds();
      return {
        odds: o, defaults: { edge: L.DEFAULT_EDGE }, limits: settings.LIMITS, tipping: settings.tipping(),
        games: GAME_IDS.map((id) => {
          const d = st(id, day), a = st(id, 0);
          return { id, edgeKey: id in L.DEFAULT_EDGE ? id : null, disabled: o.disabled.includes(id),
            day: { rounds: d.n, wageredUsd: usdOf(d.w), rtp: d.w ? d.p / d.w : null }, all: { rounds: a.n, wageredUsd: usdOf(a.w), rtp: a.w ? a.p / a.w : null } };
        }),
      };
    },
    'POST /api/admin/games': async (req, res, body, ip, u) => {
      staff(u, 'admin');
      try {
        const before = settings.odds();
        const o = body.reset ? settings.resetOdds() : settings.setOdds({ edge: body.edge, plinko: body.plinko, disabledGames: body.disabled });
        const changes = [];
        for (const k of Object.keys(o.edge)) if (o.edge[k] !== before.edge[k]) changes.push(`${k} ${(before.edge[k] * 100).toFixed(2)}% → ${(o.edge[k] * 100).toFixed(2)}%`);
        for (const k of Object.keys(o.plinko)) if (o.plinko[k] !== before.plinko[k]) changes.push(`plinko ${k} RTP ${(before.plinko[k] * 100).toFixed(1)}% → ${(o.plinko[k] * 100).toFixed(1)}%`);
        const on = before.disabled.filter((x) => !o.disabled.includes(x)), off = o.disabled.filter((x) => !before.disabled.includes(x));
        if (on.length) changes.push('opened ' + on.join(', ')); if (off.length) changes.push('closed ' + off.join(', '));
        audit(u, body.reset ? 'odds-reset' : 'odds-change', null, changes.join('; ') || 'no change');
        return { ok: true, odds: o };
      } catch (e) { need(false, 400, e.message); }
    },
    'POST /api/admin/announce': async (req, res, body, ip, u) => {
      staff(u);
      const a = settings.setAnnouncement(body);
      audit(u, a ? 'announce' : 'announce-clear', null, a ? a.text.slice(0, 120) : '');
      return { ok: true, announcement: a };
    },
    'POST /api/admin/tipping': async (req, res, body, ip, u) => {
      staff(u, 'admin');
      const t = settings.setTipping(body);
      audit(u, 'tipping', null, JSON.stringify(t));
      return { ok: true, tipping: t };
    },
    'GET /api/admin/roles': async (req, res, body, ip, u) => { staff(u, 'mod'); return { ranks: RANK }; },
  };
};
