/* Multiplayer games.
 *
 * PvP Arena (player vs player). A player opens a challenge and their stake is held; another player joins with the
 * same stake. The winner takes both stakes minus the house rake (PVP_RAKE_PCT of the pot). Ties refund both.
 *   coinflip  creator calls heads or tails, the joiner gets the other side
 *   dice      both roll 1–100, higher roll wins (re-rolled on a tie)
 *   rps       rock paper scissors; the creator's hand stays secret until the joiner picks
 *   bj        blackjack duel: both play their own hand from one shoe (hit / stand), best hand wins,
 *             a natural blackjack beats any other 21, both bust = push. 30 s per move, then auto-stand.
 *
 * Live Blackjack tables (multiplayer vs the dealer). Up to 5 seats per table. Betting opens when the first bet is
 * placed and closes after BJT_BET_SECS; players act in seat order (BJT_TURN_SECS each, then auto-stand); the dealer
 * stands on all 17s; blackjack pays 3:2; double on the first two cards; no splits. Each hand is a round in the
 * ledger (game "bjt"); if the server restarts mid-hand, open bets are refunded.
 *
 * All stakes go through the ledger, appear in bet history and the live feed, count for AML turnover and referral
 * commission (on the house's rake / edge), and respect cool-offs and self-exclusion. */
'use strict';
const L = require('../js/lib.js');
const cfg = require('./config');
const { q, tx, debit, credit, balances, BalanceError } = require('./db');
const bus = require('./bus');
const referrals = require('./referrals');
const rg = require('./compliance');

class MultiError extends Error {}
const fail = (m) => { throw new MultiError(m); };
let clock = () => Date.now();
const now = () => clock();

q(`CREATE TABLE IF NOT EXISTS pvp_matches (
  id INTEGER PRIMARY KEY, game TEXT NOT NULL, mode TEXT NOT NULL, stake INTEGER NOT NULL,
  creator_id INTEGER NOT NULL REFERENCES users(id), creator_choice TEXT, creator_ip TEXT,
  joiner_id INTEGER REFERENCES users(id), joiner_choice TEXT,
  status TEXT NOT NULL, state TEXT, result TEXT, winner_id INTEGER, rake INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, updated INTEGER NOT NULL)`).run();
q('CREATE INDEX IF NOT EXISTS pvp_status ON pvp_matches(status, mode)').run();

const MAX = Math.round(cfg.MAX_BET_CREDITS * 100);
const RAKE = () => cfg.PVP_RAKE_PCT;
const nameOf = (id) => (q('SELECT username FROM users WHERE id = ?').get(id) || {}).username || '?';
const C2 = (u) => Math.round(u) / 100;
function stakeUnits(x, min = 100, max = MAX) {
  const n = Number(x), u = Math.round(n * 100);
  if (!isFinite(n) || u < min) fail(`Minimum stake is ${C2(min)}`);
  if (u > max) fail(`Maximum stake is ${C2(max)}`);
  return u;
}
const mode = (m) => (m === 'real' || m === 'demo' ? m : fail('Choose demo or real mode'));
function canPlay(userId, m) { const b = rg.playBlock(userId, m); if (b) fail(b); }

/* events are queued inside transactions and sent once committed */
let pending = [];
const queue = (type, data) => pending.push([type, data]);
function committed(fn) { try { const r = tx(fn); const evs = pending; pending = []; evs.forEach(([t, d]) => bus.emit(t, d)); return r; } catch (e) { pending = []; throw e; } }

const insRound = q('INSERT INTO rounds (user_id, mode, game, status, state, wager, payout, detail, created, updated) VALUES (?,?,?,?,?,?,?,?,?,?)');
/** A finished stake in the ledger's round history (history, stats, live feed, AML turnover, referrals). */
function recordRound(userId, m, game, wager, payout, detail, rakeShare) {
  const id = Number(insRound.run(userId, m, game, 'done', null, wager, payout, detail, now(), now()).lastInsertRowid);
  referrals.accrue(userId, m, game, wager, { rakeShare: rakeShare || 0 });
  queue('bet', { userId, game, mode: m, wager, payout, roundId: id, t: now() });
  return id;
}

/* ======================================================================================================
 * PvP Arena
 * ==================================================================================================== */
const PVP_GAMES = { coinflip: 'Coin Flip', dice: 'Dice Duel', rps: 'Rock Paper Scissors', bj: 'Blackjack Duel' };
const RPS_BEATS = { R: 'S', P: 'R', S: 'P' };
const MOVE_MS = () => cfg.PVP_MOVE_SECS * 1000;
const OPEN_MS = 30 * 60000;
const getMatch = (id) => q('SELECT * FROM pvp_matches WHERE id = ?').get(Number(id));
const bjTotal = (cards) => L.bjValue(cards).total;

function choiceFor(game, c, role) {
  if (game === 'coinflip') return role === 'joiner' ? null : (c === 'H' || c === 'T' ? c : fail('Pick heads or tails'));
  if (game === 'rps') return ['R', 'P', 'S'].includes(c) ? c : fail('Pick rock, paper or scissors');
  return null;
}

/** What everyone may see. The creator's RPS hand and hidden blackjack cards stay private. */
function publicMatch(m) {
  const st = m.state ? JSON.parse(m.state) : null, res = m.result ? JSON.parse(m.result) : null;
  const v = {
    id: m.id, game: m.game, gameName: PVP_GAMES[m.game], mode: m.mode, stake: C2(m.stake), status: m.status,
    creator: nameOf(m.creator_id), creatorId: m.creator_id, joiner: m.joiner_id ? nameOf(m.joiner_id) : null, joinerId: m.joiner_id,
    creatorChoice: m.game === 'coinflip' ? m.creator_choice : null, created: m.created, updated: m.updated, rakePct: RAKE(),
    winner: m.winner_id ? nameOf(m.winner_id) : null, winnerId: m.winner_id, prize: C2(m.status === 'done' ? m.stake * 2 - m.rake : m.stake * 2 - Math.round(m.stake * 2 * RAKE() / 100)), result: res,
    now: now(), moveSecs: cfg.PVP_MOVE_SECS,
  };
  if (m.game === 'bj' && st && m.status === 'playing') {
    v.duel = ['c', 'j'].map((s) => ({ shown: st.hands[s].slice(0, 1), count: st.hands[s].length, done: st.done[s], deadline: st.deadline[s] }));
  }
  return v;
}
/** The view for one of the two players (their own blackjack hand in full). */
function playerMatch(m, userId) {
  const v = publicMatch(m);
  if (m.game === 'bj' && m.status === 'playing') {
    const st = JSON.parse(m.state), side = userId === m.creator_id ? 'c' : userId === m.joiner_id ? 'j' : null;
    if (side) v.you = { side, cards: st.hands[side], total: bjTotal(st.hands[side]), done: st.done[side], deadline: st.deadline[side] };
  }
  if (m.game === 'rps' && userId === m.creator_id && m.status === 'open') v.yourChoice = m.creator_choice;
  return v;
}
const emitMatch = (m) => queue('pvp', publicMatch(m));

function createMatch(user, body, ip) {
  const game = PVP_GAMES[body.game] ? body.game : fail('Unknown game');
  const md = mode(body.mode); canPlay(user.id, md);
  const stake = stakeUnits(body.stake);
  const choice = choiceFor(game, body.choice, 'creator');
  if (q("SELECT COUNT(*) n FROM pvp_matches WHERE creator_id = ? AND status = 'open'").get(user.id).n >= 3) fail('You already have 3 open challenges — cancel one first');
  return committed(() => {
    const id = Number(q("INSERT INTO pvp_matches (game, mode, stake, creator_id, creator_choice, creator_ip, status, created, updated) VALUES (?,?,?,?,?,?,'open',?,?)")
      .run(game, md, stake, user.id, choice, ip || null, now(), now()).lastInsertRowid);
    try { debit(user.id, md, stake, 'pvp-stake', 'pvp:' + id); } catch (e) { if (e instanceof BalanceError) fail('Not enough balance for that stake'); throw e; }
    const m = getMatch(id); emitMatch(m);
    return { match: playerMatch(m, user.id), balances: balances(user.id) };
  });
}

function cancelMatch(user, id) {
  return committed(() => {
    const m = getMatch(id);
    if (!m || m.creator_id !== user.id) fail('Challenge not found');
    if (m.status !== 'open') fail('Someone already joined — it can no longer be cancelled');
    credit(m.creator_id, m.mode, m.stake, 'pvp-refund', 'pvp:' + m.id);
    q("UPDATE pvp_matches SET status = 'cancelled', updated = ? WHERE id = ?").run(now(), m.id);
    emitMatch(getMatch(m.id));
    return { ok: true, balances: balances(user.id) };
  });
}

/** Pay out a finished match. winner: 'c' | 'j' | null (push). */
function settleMatch(m, winner, result) {
  const pot = m.stake * 2, rake = winner ? Math.round(pot * RAKE() / 100) : 0, prize = pot - rake;
  const game = 'pvp-' + m.game, label = PVP_GAMES[m.game];
  const ids = { c: m.creator_id, j: m.joiner_id };
  if (winner) credit(ids[winner], m.mode, prize, 'pvp-win', 'pvp:' + m.id);
  else for (const s of ['c', 'j']) credit(ids[s], m.mode, m.stake, 'pvp-push', 'pvp:' + m.id);
  for (const s of ['c', 'j']) {
    const other = nameOf(ids[s === 'c' ? 'j' : 'c']);
    const payout = winner ? (winner === s ? prize : 0) : m.stake;
    recordRound(ids[s], m.mode, game, m.stake, payout, `${label} vs ${other}: ${winner ? (winner === s ? 'won' : 'lost') : 'tie'}${result.text ? ' — ' + result.text : ''}`, rake / 2);
  }
  q("UPDATE pvp_matches SET status = 'done', result = ?, winner_id = ?, rake = ?, updated = ? WHERE id = ?")
    .run(JSON.stringify(result), winner ? ids[winner] : null, rake, now(), m.id);
  emitMatch(getMatch(m.id));
}

function joinMatch(user, body, ip) {
  const pre = getMatch(body.id);
  if (!pre || pre.status !== 'open') fail('That challenge is no longer open');
  if (pre.creator_id === user.id) fail('You cannot join your own challenge');
  canPlay(user.id, pre.mode);
  const choice = choiceFor(pre.game, body.choice, 'joiner');
  return committed(() => {
    const m = getMatch(pre.id);
    if (m.status !== 'open') fail('That challenge is no longer open');
    try { debit(user.id, m.mode, m.stake, 'pvp-stake', 'pvp:' + m.id); } catch (e) { if (e instanceof BalanceError) fail('Not enough balance to match that stake'); throw e; }
    q("UPDATE pvp_matches SET joiner_id = ?, joiner_choice = ?, status = 'playing', updated = ? WHERE id = ?").run(user.id, choice, now(), m.id);
    if (m.mode === 'real' && ip && m.creator_ip && ip === m.creator_ip) { // possible collusion / multi-accounting
      rg.flag(m.creator_id, 'pvp-same-ip', `PvP match #${m.id} against ${user.username} from the same IP`, m.stake);
      rg.flag(user.id, 'pvp-same-ip', `PvP match #${m.id} against ${nameOf(m.creator_id)} from the same IP`, m.stake);
    }
    const cur = getMatch(m.id);
    if (m.game === 'coinflip') {
      const side = L.int(2) ? 'H' : 'T', joinerSide = m.creator_choice === 'H' ? 'T' : 'H';
      settleMatch(cur, side === m.creator_choice ? 'c' : 'j', { side, creatorSide: m.creator_choice, joinerSide, text: `landed ${side === 'H' ? 'heads' : 'tails'}` });
    } else if (m.game === 'dice') {
      let a, b; do { a = L.range(1, 100); b = L.range(1, 100); } while (a === b);
      settleMatch(cur, a > b ? 'c' : 'j', { c: a, j: b, text: `${a} vs ${b}` });
    } else if (m.game === 'rps') {
      const c = m.creator_choice, j = choice, w = c === j ? null : RPS_BEATS[c] === j ? 'c' : 'j';
      const N = { R: 'rock', P: 'paper', S: 'scissors' };
      settleMatch(cur, w, { c, j, text: `${N[c]} vs ${N[j]}` });
    } else if (m.game === 'bj') {
      const d = L.shuffle(L.newDeck(6)), hands = { c: [d.pop(), d.pop()], j: [d.pop(), d.pop()] };
      const st = { d, hands, done: { c: L.isBJ(hands.c), j: L.isBJ(hands.j) }, deadline: { c: now() + MOVE_MS(), j: now() + MOVE_MS() } };
      q('UPDATE pvp_matches SET state = ? WHERE id = ?').run(JSON.stringify(st), m.id);
      finishDuelIfDone(getMatch(m.id), st);
    }
    const out = getMatch(m.id);
    if (out.status === 'playing') emitMatch(out);
    return { match: playerMatch(out, user.id), balances: balances(user.id) };
  });
}

function finishDuelIfDone(m, st) {
  if (!(st.done.c && st.done.j)) return false;
  const tc = bjTotal(st.hands.c), tj = bjTotal(st.hands.j), bc = L.isBJ(st.hands.c), bj = L.isBJ(st.hands.j);
  let w;
  if (tc > 21 && tj > 21) w = null;
  else if (tc > 21) w = 'j';
  else if (tj > 21) w = 'c';
  else if (bc !== bj) w = bc ? 'c' : 'j';
  else w = tc === tj ? null : tc > tj ? 'c' : 'j';
  const label = (cards, t) => (L.isBJ(cards) ? 'blackjack' : t > 21 ? `bust (${t})` : String(t));
  settleMatch(m, w, { c: st.hands.c, j: st.hands.j, tc, tj, text: `${label(st.hands.c, tc)} vs ${label(st.hands.j, tj)}` });
  return true;
}

function duelMove(m, side, action) {
  const st = JSON.parse(m.state);
  if (st.done[side]) fail('You have already finished your hand');
  if (action === 'hit') { st.hands[side].push(st.d.pop()); if (bjTotal(st.hands[side]) >= 21) st.done[side] = true; }
  else if (action === 'stand') st.done[side] = true;
  else fail('Unknown action');
  st.deadline[side] = now() + MOVE_MS();
  q('UPDATE pvp_matches SET state = ?, updated = ? WHERE id = ?').run(JSON.stringify(st), now(), m.id);
  if (!finishDuelIfDone(getMatch(m.id), st)) emitMatch(getMatch(m.id));
}

function actMatch(user, body) {
  return committed(() => {
    const m = getMatch(body.id);
    if (!m || m.game !== 'bj' || m.status !== 'playing') fail('No duel in progress');
    const side = user.id === m.creator_id ? 'c' : user.id === m.joiner_id ? 'j' : fail('You are not in this duel');
    duelMove(m, side, body.action);
    return { match: playerMatch(getMatch(m.id), user.id), balances: balances(user.id) };
  });
}

function lobby(userId, md) {
  const open = q("SELECT * FROM pvp_matches WHERE status = 'open' AND mode = ? ORDER BY id DESC LIMIT 100").all(md);
  const mine = userId ? q("SELECT * FROM pvp_matches WHERE (creator_id = ? OR joiner_id = ?) AND status IN ('open','playing') AND mode = ? ORDER BY id DESC").all(userId, userId, md) : [];
  const recent = q("SELECT * FROM pvp_matches WHERE status = 'done' AND mode = ? ORDER BY updated DESC LIMIT 15").all(md);
  return { open: open.map((m) => playerMatch(m, userId)), mine: mine.map((m) => playerMatch(m, userId)), recent: recent.map(publicMatch), rakePct: RAKE(), games: PVP_GAMES, moveSecs: cfg.PVP_MOVE_SECS };
}

function pvpTick() {
  const t = now();
  // open challenges nobody took: refund
  for (const m of q("SELECT * FROM pvp_matches WHERE status = 'open' AND created < ?").all(t - OPEN_MS)) {
    committed(() => { const cur = getMatch(m.id); if (cur.status !== 'open') return; credit(cur.creator_id, cur.mode, cur.stake, 'pvp-refund', 'pvp:' + cur.id); q("UPDATE pvp_matches SET status = 'expired', updated = ? WHERE id = ?").run(t, cur.id); emitMatch(getMatch(cur.id)); });
  }
  // duel players who ran out of time stand
  for (const m of q("SELECT * FROM pvp_matches WHERE status = 'playing' AND game = 'bj'").all()) {
    const st = JSON.parse(m.state);
    for (const s of ['c', 'j']) if (!st.done[s] && st.deadline[s] <= t) { committed(() => duelMove(getMatch(m.id), s, 'stand')); break; }
  }
}

/* ======================================================================================================
 * Live Blackjack tables (multiplayer vs dealer)
 * ==================================================================================================== */
const SEATS = 5;
const TABLE_DEFS = [
  { key: 'low', name: 'Low Stakes', min: 100, max: 10000 },
  { key: 'mid', name: 'Main Table', min: 500, max: 50000 },
  { key: 'high', name: 'High Rollers', min: 2500, max: MAX },
];
const tables = new Map();
for (const md of ['demo', 'real']) for (const d of TABLE_DEFS) {
  const id = `${md}-${d.key}`;
  tables.set(id, { id, mode: md, name: d.name, min: d.min, max: Math.min(d.max, MAX), seats: Array(SEATS).fill(null), dealer: [], phase: 'betting', turn: -1, deadline: 0, hand: 0, d: null });
}
const BET_MS = () => cfg.BJT_BET_SECS * 1000, TURN_MS = () => cfg.BJT_TURN_SECS * 1000, SHOW_MS = 5000;

/** Bets left open by a restart are refunded (tables live in memory). Runs at startup. */
function refundOrphanBets() {
  const live = new Set([...tables.values()].flatMap((t) => t.seats.filter((x) => x && x.roundId).map((x) => x.roundId)));
  return committed(() => {
    let n = 0;
    for (const r of q("SELECT * FROM rounds WHERE game = 'bjt' AND status = 'active'").all()) {
      if (live.has(r.id)) continue;
      credit(r.user_id, r.mode, r.wager, 'bjt-refund', r.id);
      q("UPDATE rounds SET status = 'done', payout = ?, detail = 'Refunded: table restarted mid-hand', updated = ? WHERE id = ?").run(r.wager, now(), r.id);
      n++;
    }
    return n;
  });
}
refundOrphanBets();

function tableView(t, userId) {
  const hide = t.phase === 'playing';
  return {
    id: t.id, mode: t.mode, name: t.name, min: C2(t.min), max: C2(t.max), phase: t.phase, turn: t.turn, deadline: t.deadline, hand: t.hand, now: now(),
    dealer: hide ? [t.dealer[0], null].filter((c, i) => i < t.dealer.length) : t.dealer,
    dealerTotal: t.dealer.length ? (hide ? bjTotal([t.dealer[0]]) : bjTotal(t.dealer)) : null,
    seats: t.seats.map((s) => (s ? { name: s.name, userId: s.userId, bet: C2(s.bet), cards: s.cards, total: s.cards.length ? bjTotal(s.cards) : null,
      soft: s.cards.length ? L.bjValue(s.cards).soft : false, status: s.status, result: s.result, payout: C2(s.payout || 0), leaving: !!s.leaving } : null)),
    you: userId ? t.seats.findIndex((s) => s && s.userId === userId) : -1,
  };
}
const emitTable = (t) => queue('bjt', tableView(t));
const getTable = (id) => tables.get(String(id)) || fail('Table not found');
const seatOf = (t, userId) => t.seats.findIndex((s) => s && s.userId === userId);

function sit(user, body) {
  const t = getTable(body.id); canPlay(user.id, t.mode);
  if (seatOf(t, user.id) >= 0) fail('You are already seated here');
  for (const o of tables.values()) if (o !== t && seatOf(o, user.id) >= 0) fail(`Leave ${o.name} first`);
  let i = Number(body.seat);
  if (!(Number.isInteger(i) && i >= 0 && i < SEATS)) i = t.seats.findIndex((s) => !s);
  if (i < 0) fail('The table is full');
  if (t.seats[i]) fail('That seat is taken');
  t.seats[i] = { userId: user.id, name: user.username, bet: 0, cards: [], status: 'idle', result: '', payout: 0, idle: 0, roundId: null };
  return committed(() => { emitTable(t); return { table: tableView(t, user.id) }; });
}

function leave(user, body) {
  const t = getTable(body.id), i = seatOf(t, user.id);
  if (i < 0) fail('You are not seated');
  const s = t.seats[i];
  return committed(() => {
    if (t.phase === 'betting' && s.bet) { // bet not dealt yet: give it back
      credit(s.userId, t.mode, s.bet, 'bjt-refund', s.roundId);
      q("UPDATE rounds SET status = 'done', payout = wager, detail = 'Left before the deal', updated = ? WHERE id = ?").run(now(), s.roundId);
      s.bet = 0;
    }
    if (s.bet && (t.phase === 'playing' || t.phase === 'dealer')) { s.leaving = true; if (t.turn === i) standAndAdvance(t); }
    else t.seats[i] = null;
    if (t.phase === 'betting' && !t.seats.some((x) => x && x.bet)) t.deadline = 0;
    emitTable(t);
    return { ok: true, balances: balances(user.id) };
  });
}

function placeBet(user, body) {
  const t = getTable(body.id), i = seatOf(t, user.id);
  if (i < 0) fail('Take a seat first');
  if (t.phase !== 'betting') fail('Wait for the next hand');
  canPlay(user.id, t.mode);
  const s = t.seats[i];
  if (s.bet) fail('Your bet is already in');
  const units = stakeUnits(body.amount, t.min, t.max);
  return committed(() => {
    s.roundId = Number(insRound.run(user.id, t.mode, 'bjt', 'active', null, units, 0, '', now(), now()).lastInsertRowid);
    try { debit(user.id, t.mode, units, 'bet:bjt', s.roundId); } catch (e) { if (e instanceof BalanceError) fail('Not enough balance'); throw e; }
    s.bet = units; s.status = 'ready'; s.idle = 0;
    if (!t.deadline) t.deadline = now() + BET_MS();
    queue('round', { userId: user.id, game: 'bjt', mode: t.mode, wager: units, roundId: s.roundId, t: now() });
    const seated = t.seats.filter((x) => x && !x.leaving);
    if (seated.every((x) => x.bet)) deal(t); else emitTable(t);
    return { table: tableView(t, user.id), balances: balances(user.id) };
  });
}

function deal(t) {
  t.d = L.shuffle(L.newDeck(6)); t.hand++; t.dealer = [];
  const inHand = t.seats.filter((s) => s && s.bet);
  for (const s of t.seats) if (s && !s.bet) { s.cards = []; s.status = 'out'; s.result = ''; s.payout = 0; }
  for (const s of inHand) { s.cards = [t.d.pop()]; s.result = ''; s.payout = 0; s.doubled = false; }
  t.dealer.push(t.d.pop());
  for (const s of inHand) s.cards.push(t.d.pop());
  t.dealer.push(t.d.pop());
  for (const s of inHand) s.status = L.isBJ(s.cards) ? 'bj' : 'playing';
  const up = t.dealer[0].r;
  if (up >= 10 && L.isBJ(t.dealer)) return finishHand(t); // dealer peeks
  t.phase = 'playing'; t.turn = -1;
  nextTurn(t);
}
function nextTurn(t) {
  for (let i = t.turn + 1; i < SEATS; i++) {
    const s = t.seats[i];
    if (s && s.status === 'playing') { t.turn = i; t.deadline = now() + TURN_MS(); if (s.leaving) return standAndAdvance(t); emitTable(t); return; }
  }
  t.turn = -1; finishHand(t);
}
function standAndAdvance(t) { const s = t.seats[t.turn]; if (s) s.status = 'stood'; nextTurn(t); }

function finishHand(t) {
  t.phase = 'dealer'; t.turn = -1;
  const live = t.seats.filter((s) => s && s.bet && (s.status === 'stood' || s.status === 'playing') && bjTotal(s.cards) <= 21);
  if (live.length) while (bjTotal(t.dealer) < 17) t.dealer.push(t.d.pop());
  const dv = bjTotal(t.dealer), dBJ = L.isBJ(t.dealer);
  for (const s of t.seats) {
    if (!s || !s.bet) continue;
    const v = bjTotal(s.cards), pBJ = L.isBJ(s.cards);
    let pay = 0, res;
    if (pBJ && dBJ) { pay = s.bet; res = 'Push'; }
    else if (pBJ) { pay = Math.floor(s.bet * 2.5); res = 'Blackjack!'; }
    else if (dBJ) res = 'Dealer blackjack';
    else if (v > 21) res = 'Bust';
    else if (dv > 21 || v > dv) { pay = s.bet * 2; res = 'Win'; }
    else if (v === dv) { pay = s.bet; res = 'Push'; }
    else res = 'Lose';
    if (pay) credit(s.userId, t.mode, pay, 'win:bjt', s.roundId);
    q("UPDATE rounds SET status = 'done', wager = ?, payout = ?, detail = ?, updated = ? WHERE id = ?").run(s.bet, pay, `${t.name} seat ${t.seats.indexOf(s) + 1}: ${res} (${v} vs dealer ${dv})`, now(), s.roundId);
    referrals.accrue(s.userId, t.mode, 'bjt', s.bet, {});
    queue('bet', { userId: s.userId, game: 'bjt', mode: t.mode, wager: s.bet, payout: pay, roundId: s.roundId, t: now() });
    s.result = res; s.payout = pay; s.status = 'done';
  }
  t.phase = 'settled'; t.deadline = now() + SHOW_MS;
  emitTable(t);
}

function act(user, body) {
  const t = getTable(body.id), i = seatOf(t, user.id);
  if (t.phase !== 'playing' || t.turn !== i || i < 0) fail('It is not your turn');
  const s = t.seats[i];
  return committed(() => {
    if (body.action === 'hit') {
      s.cards.push(t.d.pop());
      const v = bjTotal(s.cards);
      if (v > 21) { s.status = 'bust'; nextTurn(t); } else if (v === 21) standAndAdvance(t); else { t.deadline = now() + TURN_MS(); emitTable(t); }
    } else if (body.action === 'stand') standAndAdvance(t);
    else if (body.action === 'double') {
      if (s.cards.length !== 2) fail('You can only double on your first two cards');
      try { debit(user.id, t.mode, s.bet, 'bet:bjt', s.roundId); } catch (e) { if (e instanceof BalanceError) fail('Not enough balance to double'); throw e; }
      s.bet *= 2; s.doubled = true;
      q('UPDATE rounds SET wager = ? WHERE id = ?').run(s.bet, s.roundId);
      s.cards.push(t.d.pop());
      if (bjTotal(s.cards) > 21) { s.status = 'bust'; nextTurn(t); } else standAndAdvance(t);
    } else fail('Unknown action');
    return { table: tableView(t, user.id), balances: balances(user.id) };
  });
}

function tableTick() {
  const n = now();
  for (const t of tables.values()) {
    if (!t.deadline || t.deadline > n) continue;
    committed(() => {
      if (t.phase === 'betting') { if (t.seats.some((s) => s && s.bet)) deal(t); else { t.deadline = 0; emitTable(t); } }
      else if (t.phase === 'playing') standAndAdvance(t);
      else if (t.phase === 'settled') {
        t.phase = 'betting'; t.deadline = 0; t.dealer = []; t.turn = -1;
        t.seats.forEach((s, i) => {
          if (!s) return;
          if (s.leaving) { t.seats[i] = null; return; }
          if (!s.bet) s.idle++;
          if (s.idle >= 5) { t.seats[i] = null; return; } // sat out five hands: seat freed
          Object.assign(s, { bet: 0, cards: [], status: 'idle', result: '', payout: 0, roundId: null });
        });
        emitTable(t);
      }
    });
  }
}
const tableList = () => [...tables.values()].map((t) => ({ id: t.id, mode: t.mode, name: t.name, min: C2(t.min), max: C2(t.max), players: t.seats.filter(Boolean).length, seats: SEATS, phase: t.phase }));

/* ---------- timers ---------- */
function tick() { try { pvpTick(); } catch (e) { console.error('[pvp]', e); } try { tableTick(); } catch (e) { console.error('[bjt]', e); } }
let timer = null;
function start() { if (!timer) { timer = setInterval(tick, 500); timer.unref(); } }

/* ---------- routes ---------- */
module.exports = function multiRoutes({ need, HttpError, limited }) {
  const wrap = (fn) => { try { return fn(); } catch (e) { if (e instanceof MultiError) throw new HttpError(400, e.message); throw e; } };
  const login = (u) => need(u, 401, 'Please log in');
  const slow = (u, k, n) => need(!limited(k + ':' + u.id, n, 10000), 429, 'Slow down');
  return {
    'GET /api/pvp': async (req, res, body, ip, u, url) => lobby(u ? u.id : null, url.searchParams.get('mode') === 'real' ? 'real' : 'demo'),
    'GET /api/pvp/match': async (req, res, body, ip, u, url) => { const m = getMatch(url.searchParams.get('id')); need(m, 404, 'Match not found'); return { match: playerMatch(m, u ? u.id : null) }; },
    'POST /api/pvp/create': async (req, res, body, ip, u) => { login(u); slow(u, 'pvpc', 20); return wrap(() => createMatch(u, body, ip)); },
    'POST /api/pvp/join': async (req, res, body, ip, u) => { login(u); slow(u, 'pvpj', 20); return wrap(() => joinMatch(u, body, ip)); },
    'POST /api/pvp/cancel': async (req, res, body, ip, u) => { login(u); return wrap(() => cancelMatch(u, body.id)); },
    'POST /api/pvp/act': async (req, res, body, ip, u) => { login(u); slow(u, 'pvpa', 30); return wrap(() => actMatch(u, body)); },
    'GET /api/bjt': async () => ({ tables: tableList(), betSecs: cfg.BJT_BET_SECS, turnSecs: cfg.BJT_TURN_SECS }),
    'GET /api/bjt/table': async (req, res, body, ip, u, url) => wrap(() => ({ table: tableView(getTable(url.searchParams.get('id')), u ? u.id : null) })),
    'POST /api/bjt/sit': async (req, res, body, ip, u) => { login(u); slow(u, 'bjts', 10); return wrap(() => sit(u, body)); },
    'POST /api/bjt/leave': async (req, res, body, ip, u) => { login(u); return wrap(() => leave(u, body)); },
    'POST /api/bjt/bet': async (req, res, body, ip, u) => { login(u); slow(u, 'bjtb', 10); return wrap(() => placeBet(u, body)); },
    'POST /api/bjt/act': async (req, res, body, ip, u) => { login(u); slow(u, 'bjta', 30); return wrap(() => act(u, body)); },
  };
};
Object.assign(module.exports, { start, tick, tables, refundOrphanBets, setClock: (f) => { clock = f; }, PVP_GAMES });
