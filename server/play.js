/* Round engine: validates, debits, settles and records every game action inside one DB transaction. */
'use strict';
const L = require('../js/lib.js');
const { q, tx, debit, credit, balance, balances, BalanceError } = require('./db');
const { G, GameError, U, FISH } = require('./games');
const referrals = require('./referrals');
const settings = require('./settings');
const bus = require('./bus');

// Events are queued during the DB transaction and only emitted once it has committed.
let pending = [];
const queue = (ev) => pending.push({ ...ev, t: Date.now() });
function flush(ok) { const evs = pending; pending = []; if (ok) for (const e of evs) bus.emit(e.type, e); }
function committed(fn) { try { const r = fn(); flush(true); return r; } catch (e) { flush(false); throw e; } }

const toCredits = (u) => Math.round(u) / 100;
const now = () => Date.now();
const insRound = q('INSERT INTO rounds (user_id, mode, game, status, state, wager, payout, detail, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?)');
const getActive = q("SELECT * FROM rounds WHERE user_id = ? AND game = ? AND status = 'active' ORDER BY id DESC LIMIT 1");
const updRound = q('UPDATE rounds SET status = ?, state = ?, wager = ?, payout = ?, detail = ?, updated = ? WHERE id = ?');

function ctxFor(userId, mode) {
  return { need(units, msg) { if (balance(userId, mode) < units) throw new GameError(msg || 'Insufficient balance'); } };
}
/** settle helper: credit payout for a finished round */
function settle(userId, mode, roundId, game, payout) { if (payout > 0) credit(userId, mode, payout, 'win:' + game, roundId); }

function finishRound(row, r, userId) {
  const mode = row.mode, wager = row.wager + (r.extra || 0);
  if (r.extra) debit(userId, mode, r.extra, 'bet:' + row.game, row.id);
  if (r.done) {
    const pay = Math.floor(r.payout || 0); settle(userId, mode, row.id, row.game, pay); updRound.run('done', null, wager, pay, r.detail || '', now(), row.id);
    referrals.accrue(userId, mode, row.game, wager, row.params ? JSON.parse(row.params) : {}, r.state);
    queue({ type: 'bet', userId, game: row.game, mode, wager, payout: pay, roundId: Number(row.id) });
  }
  else updRound.run('active', JSON.stringify(r.state), wager, 0, '', now(), row.id);
  return wager;
}

function play(userId, body) {
  const { game, action, params = {}, mode } = body || {};
  if (mode !== 'demo' && mode !== 'real') throw new GameError('Choose demo or real mode');
  if (game === 'fish') return fish(userId, mode, action, params);
  const g = G[game];
  if (!g) throw new GameError('Unknown game');
  const ctx = ctxFor(userId, mode);
  if (g.play || action === 'start') guard(game, body);

  return committed(() => tx(() => {
    if (g.play) {
      const r = g.play(params, ctx);
      const pay = Math.floor(r.payout);
      debit(userId, mode, r.wager, 'bet:' + game);
      const pre = balances(userId);
      const info = insRound.run(userId, mode, game, 'done', null, r.wager, pay, r.detail, now(), now());
      settle(userId, mode, info.lastInsertRowid, game, pay);
      referrals.accrue(userId, mode, game, r.wager, params);
      queue({ type: 'bet', userId, game, mode, wager: r.wager, payout: pay, roundId: Number(info.lastInsertRowid) });
      return { result: r.result, wager: toCredits(r.wager), payout: toCredits(pay), done: true, preBalances: pre, balances: balances(userId) };
    }
    if (action === 'start') {
      const old = getActive.get(userId, game);
      if (old) { // close the previous unfinished round of this game first
        const r = g.abandon(JSON.parse(old.state), ctxFor(userId, old.mode));
        finishRound(old, r, userId);
      }
      const r = g.start(params, ctx);
      debit(userId, mode, r.wager, 'bet:' + game);
      const pre = balances(userId);
      const info = insRound.run(userId, mode, game, 'active', JSON.stringify(r.state), r.wager, 0, '', now(), now());
      const ps = JSON.stringify(params); q('UPDATE rounds SET params = ? WHERE id = ?').run(ps, info.lastInsertRowid);
      const row = { id: info.lastInsertRowid, mode, game, wager: r.wager, params: ps };
      if (r.done) finishRound(row, r, userId);
      else queue({ type: 'round', userId, game, mode, wager: r.wager, roundId: Number(row.id) });
      return { view: r.view, done: !!r.done, wager: toCredits(r.wager), payout: toCredits(r.done ? r.payout : 0), preBalances: pre, balances: balances(userId) };
    }
    const row = getActive.get(userId, game);
    if (!row) throw new GameError('No round in progress — start a new one');
    const r = g.act(JSON.parse(row.state), action, params, ctxFor(userId, row.mode));
    const wager = finishRound(row, { ...r, payout: r.done ? r.payout : 0 }, userId);
    if (r.extra) {} // already debited in finishRound
    const bal = balances(userId);
    const pre = { ...bal }; if (r.done) pre[row.mode] -= Math.floor(r.payout || 0);
    return { view: r.view, done: !!r.done, wager: toCredits(wager), payout: toCredits(r.done ? r.payout : 0), extra: toCredits(r.extra || 0), preBalances: pre, balances: bal };
  }));
}

/** Refuse new bets on closed games, and bets placed against out-of-date odds. */
function guard(game, body) {
  if (settings.disabled().includes(game)) throw new GameError('This game is closed for maintenance right now');
  if (body.ov != null && Number(body.ov) !== settings.version()) {
    const e = new GameError('Payouts were just updated. Check the new numbers and bet again.'); e.data = { odds: settings.odds() }; throw e;
  }
}

/* Fish Table: each shot is debited when fired; a hit rolls the catch on the server. A shot that never hits is refunded.
 * Every fish has the same expected return (0.8), so the client choosing which fish it "hit" cannot change the edge. */
const FISH_MULTS = new Set(FISH.map((f) => f.m));
function fish(userId, mode, action, p) {
  return committed(() => tx(() => {
    if (action === 'shoot') {
      guard('fish', { ov: p.ov });
      const u = U(p.bet);
      debit(userId, mode, u, 'bet:fish');
      const id = q('INSERT INTO fish_shots (user_id, mode, units, status, created) VALUES (?,?,?,?,?)').run(userId, mode, u, 'flying', now()).lastInsertRowid;
      return { shotId: Number(id), balances: balances(userId) };
    }
    const shot = q("SELECT * FROM fish_shots WHERE id = ? AND user_id = ? AND status = 'flying'").get(Number(p.shotId), userId);
    if (!shot) throw new GameError('Unknown shot');
    if (action === 'hit') {
      const m = Number(p.m); if (!FISH_MULTS.has(m)) throw new GameError('Unknown fish');
      const caught = L.fishCatch(m), pay = caught ? shot.units * m : 0;
      q("UPDATE fish_shots SET status = 'done' WHERE id = ?").run(shot.id);
      const rid = insRound.run(userId, shot.mode, 'fish', 'done', null, shot.units, pay, caught ? `Caught ${m}× fish` : `Missed catch (${m}× fish)`, now(), now()).lastInsertRowid;
      settle(userId, shot.mode, rid, 'fish', pay);
      referrals.accrue(userId, shot.mode, 'fish', shot.units);
      queue({ type: 'bet', userId, game: 'fish', mode: shot.mode, wager: shot.units, payout: pay, roundId: Number(rid) });
      return { caught, payout: toCredits(pay), balances: balances(userId) };
    }
    if (action === 'expire') {
      q("UPDATE fish_shots SET status = 'refunded' WHERE id = ?").run(shot.id);
      credit(userId, shot.mode, shot.units, 'refund:fish', shot.id);
      return { refunded: toCredits(shot.units), balances: balances(userId) };
    }
    throw new GameError('Unknown action');
  }));
}
/** refund fish shots left flying (closed tab etc.) */
function refundStaleShots(maxAgeMs = 60000) {
  const rows = q("SELECT * FROM fish_shots WHERE status = 'flying' AND created < ?").all(now() - maxAgeMs);
  for (const s of rows) tx(() => { q("UPDATE fish_shots SET status = 'refunded' WHERE id = ?").run(s.id); credit(s.user_id, s.mode, s.units, 'refund:fish', s.id); });
  return rows.length;
}
/** close a player's open round of a game (used when they leave a table) */
function abandon(userId, game) {
  const g = G[game]; if (!g || !g.abandon) return null;
  return committed(() => tx(() => { const row = getActive.get(userId, game); if (!row) return null; const r = g.abandon(JSON.parse(row.state), ctxFor(userId, row.mode)); finishRound(row, r, userId); return { view: r.view, payout: toCredits(r.payout || 0), balances: balances(userId) }; }));
}

module.exports = { play, abandon, refundStaleShots, GameError, BalanceError, toCredits };
