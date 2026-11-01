/* Server-side game logic. The browser only sends actions; every random draw and payout happens here.
 * Amounts arriving from the client are credits (2 decimals) and are converted to integer units (0.01 credit).
 *
 *  single: play(params, ctx) -> { wager, payout, detail, result }
 *  round:  start(params, ctx) -> { wager, state, view, done, payout, detail }
 *          act(state, action, params, ctx) -> { extra?, state, view, done, payout, detail }   (payout = round total)
 *          abandon(state, ctx) -> same as act; used when a new round starts while one is still open */
'use strict';
const L = require('../js/lib.js');
const cfg = require('./config');

class GameError extends Error {}
const fail = (m) => { throw new GameError(m); };
const MAX = Math.round(cfg.MAX_BET_CREDITS * 100);
/** credits -> integer units. required: must be >= 0.01 credit */
function U(x, required = true) {
  const n = Number(x ?? 0);
  if (!isFinite(n) || n < 0) fail('Invalid amount');
  const u = Math.round(n * 100);
  if (required && u < 1) fail('Bet must be at least 0.01');
  if (u > MAX) fail(`Maximum bet is ${cfg.MAX_BET_CREDITS} credits`);
  return u;
}
const floorU = (x) => Math.floor(x + 1e-9);
/** Validate a {betId: credits} map against an allowed-id predicate. Returns {bets(units), total}. */
function betMap(bets, allowed) {
  if (!bets || typeof bets !== 'object' || Array.isArray(bets)) fail('No bets');
  const out = {}; let total = 0;
  for (const [k, v] of Object.entries(bets)) {
    if (!allowed(k)) fail('Unknown bet: ' + String(k).slice(0, 30));
    const u = U(v, false); if (!u) continue;
    out[k] = u; total += u;
  }
  if (!total) fail('Place a bet first');
  if (total > MAX) fail(`Maximum total bet is ${cfg.MAX_BET_CREDITS} credits`);
  return { bets: out, total };
}
const int = (x, lo, hi, name) => { const n = Number(x); if (!Number.isInteger(n) || n < lo || n > hi) fail('Invalid ' + name); return n; };
const oneOf = (x, list, name) => { if (!list.includes(x)) fail('Invalid ' + name); return x; };
const cs = (c) => L.cardStr(c);

const G = {};

/* ---------------- single-shot games ---------------- */
G.slots = { play(p) { const b = U(p.bet); const line = L.slotSpin(); const m = L.slotPay(line); return { wager: b, payout: b * m, detail: line.join(''), result: { line, mult: m } }; } };

G.keno = { play(p) {
  const b = U(p.bet);
  if (!Array.isArray(p.picks) || p.picks.length < 1 || p.picks.length > 10) fail('Pick 1–10 numbers');
  const picks = [...new Set(p.picks.map((x) => int(x, 1, 80, 'number')))];
  if (picks.length !== p.picks.length) fail('Duplicate numbers');
  const draw = L.kenoDraw(); const hits = draw.filter((n) => picks.includes(n)).length;
  const m = L.KENO_PAYS[picks.length][hits] || 0;
  return { wager: b, payout: floorU(b * m), detail: `${hits}/${picks.length} hits`, result: { draw, hits, mult: m } };
} };

const ROULETTE_IDS = (us) => (k) => /^n:(\d|[12]\d|3[0-6])$/.test(k) || (us && (k === 'n:00' || k === 'top5')) || ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'c1', 'c2', 'c3'].includes(k);
for (const [id, us] of [['roulette-us', true], ['roulette-eu', false]]) {
  G[id] = { play(p) {
    const { bets, total } = betMap(p.bets, ROULETTE_IDS(us));
    const wheel = us ? L.WHEEL_US : L.WHEEL_EU; const k = L.int(wheel.length); const n = wheel[k];
    let pay = 0; const winners = [];
    for (const [bid, amt] of Object.entries(bets)) if (L.rouletteCovers(bid).some((x) => String(x) === String(n))) { pay += amt * (L.roulettePays(bid) + 1); winners.push(bid); }
    return { wager: total, payout: pay, detail: 'Result ' + n, result: { index: k, number: n, winners } };
  } };
}

G.baccarat = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => k in L.BAC_BETS);
  const r = L.bacDeal(new L.Shoe(8)); let pay = 0; const winners = [];
  for (const [id, amt] of Object.entries(bets)) { const m = L.bacReturn(id, r); pay += floorU(amt * m); if (m > 1) winners.push(id); }
  const out = r.pt > r.bt ? 'P' : r.bt > r.pt ? 'B' : 'T';
  return { wager: total, payout: pay, detail: out === 'P' ? `Player wins ${r.pt}–${r.bt}` : out === 'B' ? `Banker wins ${r.bt}–${r.pt}` : `Tie ${r.pt}–${r.bt}`, result: { P: r.P, B: r.B, pt: r.pt, bt: r.bt, outcome: out, winners } };
} };

G.craps = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => k in L.CRAPS_BETS || k in L.CRAPS_MULTI);
  const a = L.range(1, 6), b = L.range(1, 6); let pay = 0; const winners = [], notes = [];
  for (const [id, amt] of Object.entries(bets)) {
    const B = L.CRAPS_BETS[id], M = L.CRAPS_MULTI[id];
    if (B) { if (B.test(a, b)) { pay += amt * ((B.special ? B.special(a, b) : B.pays) + 1); winners.push(id); } }
    else { const o = L.crapsMulti(id, a, b); if (o === 'win') { pay += amt * (M.pays + 1); winners.push(id); notes.push(M.name + ' wins'); } else if (o === null) pay += amt; else notes.push(M.name + ' loses'); }
  }
  return { wager: total, payout: pay, detail: `Rolled ${a}+${b}=${a + b}`, result: { dice: [a, b], winners, notes } };
} };

const SICBO_OK = (k) => ['small', 'big', 'odd', 'even', 'anyTriple'].includes(k) || /^(t:(\d|1[0-7])|triple:[1-6]|double:[1-6]|single:[1-6]|combo:[1-6]-[1-6])$/.test(k) && (!k.startsWith('t:') || (+k.slice(2) >= 4 && +k.slice(2) <= 17)) && (!k.startsWith('combo:') || +k[6] < +k[8]);
G.sicbo = { play(p) {
  const { bets, total } = betMap(p.bets, SICBO_OK);
  const d = [L.range(1, 6), L.range(1, 6), L.range(1, 6)]; let pay = 0; const winners = [];
  for (const [id, amt] of Object.entries(bets)) { const m = L.sicboReturn(id, d); if (m) { pay += amt * m; winners.push(id); } }
  return { wager: total, payout: pay, detail: d.join('-') + ' = ' + (d[0] + d[1] + d[2]), result: { dice: d, winners } };
} };

G.bingo = { play(p) {
  const b = U(p.bet), n = int(p.cards, 1, 4, 'card count');
  const cards = Array.from({ length: n }, () => L.bingoCard()), draw = L.bingoDraw(), set = new Set(draw);
  const lines = cards.map((g) => L.bingoLines(g, set).length);
  return { wager: b * n, payout: lines.reduce((s, k) => s + b * L.bingoPay(k), 0), detail: `Lines: ${lines.join(', ')}`, result: { cards, draw, lines } };
} };

G.plinko = { play(p) {
  const b = U(p.bet), rows = oneOf(Number(p.rows), [8, 12, 16], 'rows'), risk = oneOf(p.risk, ['low', 'medium', 'high'], 'risk');
  const path = Array.from({ length: rows }, () => L.int(2)), k = path.reduce((a, c) => a + c, 0), m = L.plinkoTable(rows, risk).table[k];
  return { wager: b, payout: floorU(b * m), detail: `${rows} rows ${risk}: ${m}×`, result: { path, k, mult: m } };
} };

G.dragontiger = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => ['dragon', 'tiger', 'tie', 'suitedTie', 'dOdd', 'dEven', 'tOdd', 'tEven'].includes(k));
  const sh = new L.Shoe(8), d = sh.draw(), t = sh.draw(); let pay = 0; const winners = [];
  for (const [id, amt] of Object.entries(bets)) { const m = L.dtReturn(id, d, t); if (m) { pay += amt * m; winners.push(id); } }
  const dr = L.dtRank(d), tr = L.dtRank(t), res = dr > tr ? 'Dragon' : tr > dr ? 'Tiger' : 'Tie';
  return { wager: total, payout: pay, detail: `${cs(d)} vs ${cs(t)}: ${res}`, result: { d, t, res, winners } };
} };

const B6 = L.big6Wheel();
G.bigsix = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => L.BIG6.some((s) => s.id === k));
  const k = L.int(54), id = B6[k], seg = L.BIG6.find((s) => s.id === id);
  return { wager: total, payout: bets[id] ? bets[id] * (seg.pays + 1) : 0, detail: 'Wheel: ' + seg.label, result: { index: k, id } };
} };

G.limbo = { play(p) {
  const b = U(p.bet), t = Math.floor(Number(p.target) * 100) / 100;
  if (!(t >= 1.01 && t <= 1e6)) fail('Target must be 1.01–1,000,000');
  const r = L.limboResult(), win = r >= t;
  return { wager: b, payout: win ? floorU(b * t) : 0, detail: `Result ${r}× vs target ${t}×`, result: { r, win } };
} };

G.dice = { play(p) {
  const b = U(p.bet), target = int(p.target, 2, 98, 'target'), over = !!p.over, ch = over ? 100 - target : target;
  if (ch > 95) fail('Max win chance is 95%');
  const m = L.diceMult(ch), r = L.int(10000) / 100, win = over ? r >= target : r < target;
  return { wager: b, payout: win ? floorU(b * m) : 0, detail: `Rolled ${r.toFixed(2)} (${over ? 'over' : 'under'} ${target})`, result: { r, win, mult: m } };
} };

G.scratch = { play(p) {
  const b = U(oneOf(Number(p.price), [1, 5, 10, 25, 100, 500], 'ticket price'));
  const prize = L.scratchOutcome();
  return { wager: b, payout: b * prize, detail: prize ? `Matched 3 × ${prize}×` : 'No match', result: { prize, cells: L.scratchCard(prize) } };
} };

G.coinflip = { play(p) {
  const b = U(p.bet), call = oneOf(p.call, ['H', 'T'], 'call'), res = L.int(2) ? 'H' : 'T';
  return { wager: b, payout: res === call ? floorU(b * L.COIN_MULT) : 0, detail: `Called ${call}, landed ${res}`, result: { res } };
} };

G.wheel = { play(p) {
  const b = U(p.bet), n = oneOf(Number(p.segments), L.WHEEL_SEGMENTS, 'segments'), risk = oneOf(p.risk, ['low', 'medium', 'high'], 'risk');
  const t = L.wheelTable(n, risk), k = L.int(n), m = t.table[k];
  return { wager: b, payout: floorU(b * m), detail: `${n} segments ${risk}: ${m}×`, result: { index: k, mult: m } };
} };

G.cases = { play(p) {
  const b = U(p.bet), id = oneOf(p.case, Object.keys(L.CASES), 'case');
  const t = L.caseTable(id); let x = L.random(), k = 0;
  for (; k < t.items.length - 1; k++) { if (x < t.items[k].p) break; x -= t.items[k].p; }
  const m = t.items[k].m;
  return { wager: b, payout: floorU(b * m), detail: `${L.CASES[id].name} case: ${m}×`, result: { index: k, mult: m, rarity: t.items[k].rarity } };
} };

/* ---- 20 more games: single-shot ---- */
G.darts = { play(p) {
  const b = U(p.bet), risk = oneOf(p.risk, ['low', 'medium', 'high'], 'risk'), t = L.dartsTable(risk), k = L.pickWeighted(t.items), it = t.items[k];
  return { wager: b, payout: floorU(b * it.m), detail: `${risk}: ${it.x} ${it.m}×`, result: { index: k, ring: it.x, mult: it.m } };
} };
G.race = { play(p) {
  const b = U(p.bet), pick = int(p.horse, 0, L.HORSES.length - 1, 'horse'), odds = L.horseOdds(pick);
  const winner = L.pickWeighted(L.HORSES.map((h) => ({ p: h.p })));
  const rest = L.shuffle(L.HORSES.map((_, i) => i).filter((i) => i !== winner));
  return { wager: b, payout: winner === pick ? floorU(b * odds) : 0, detail: `Backed ${L.HORSES[pick].name}, ${L.HORSES[winner].name} won`, result: { order: [winner, ...rest], winner, odds } };
} };
G.cups = { play(p) {
  const b = U(p.bet), n = oneOf(Number(p.cups), [3, 5], 'cups'), pick = int(p.pick, 0, n - 1, 'cup'), ball = L.int(n), m = L.cupsMult(n);
  return { wager: b, payout: ball === pick ? floorU(b * m) : 0, detail: `${n} cups: picked ${pick + 1}, ball under ${ball + 1}`, result: { ball, win: ball === pick, mult: m } };
} };
G.rps = { play(p) {
  const b = U(p.bet), you = oneOf(p.hand, ['rock', 'paper', 'scissors'], 'hand'), house = L.pick(['rock', 'paper', 'scissors']);
  const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' }, res = you === house ? 'tie' : beats[you] === house ? 'win' : 'lose';
  return { wager: b, payout: res === 'win' ? floorU(b * L.rpsMult()) : res === 'tie' ? b : 0, detail: `${you} vs ${house}: ${res}`, result: { house, res } };
} };
G.colors = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => ['red', 'black', 'green'].includes(k));
  const n = L.int(15), col = L.colorOf15(n);
  return { wager: total, payout: bets[col] ? bets[col] * L.COLORS_PAYS[col] : 0, detail: `${n} ${col}`, result: { n, color: col } };
} };
G.pick3 = { play(p) {
  const b = U(p.bet), mode = oneOf(p.mode, ['straight', 'box'], 'mode');
  if (!Array.isArray(p.digits) || p.digits.length !== 3) fail('Pick three digits');
  const mine = p.digits.map((x) => int(x, 0, 9, 'digit'));
  if (mode === 'box' && L.pick3Kind(mine) === 'triple') fail('Box bets need at least two different digits');
  const draw = [L.int(10), L.int(10), L.int(10)];
  let m = 0;
  if (mode === 'straight') m = draw.join('') === mine.join('') ? L.PICK3.straight : 0;
  else m = [...draw].sort().join('') === [...mine].sort().join('') ? L.PICK3[L.pick3Kind(mine)] : 0;
  return { wager: b, payout: b * m, detail: `${mode} ${mine.join('')} vs ${draw.join('')}`, result: { draw, mult: m } };
} };
G.miniroulette = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => /^n:([0-9]|1[0-2])$/.test(k) || ['red', 'black', 'odd', 'even', 'low', 'high', 'c1', 'c2', 'c3'].includes(k));
  const n = L.int(13); let pay = 0; const winners = [];
  for (const [id, amt] of Object.entries(bets)) if (L.miniCovers(id).includes(n)) { pay += amt * (L.miniPays(id) + 1); winners.push(id); }
  return { wager: total, payout: pay, detail: 'Result ' + n, result: { n, winners } };
} };
G.andarbahar = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => k === 'andar' || k === 'bahar');
  const r = L.andarDeal();
  return { wager: total, payout: bets[r.winner] ? floorU(bets[r.winner] * L.ANDAR_PAYS[r.winner]) : 0, detail: `Joker ${cs(r.joker)}: ${r.winner} after ${r.dealt} cards`, result: r };
} };
function threeDiceFaces(p, faces, name) {
  const { bets, total } = betMap(p.bets, (k) => faces.includes(k));
  const d = [L.int(6), L.int(6), L.int(6)].map((i) => faces[i]); let pay = 0; const winners = [];
  for (const [f, amt] of Object.entries(bets)) { const k = d.filter((x) => x === f).length; if (k) { pay += amt * (k + 1); winners.push(f); } }
  return { wager: total, payout: pay, detail: `${name}: ${d.join(' ')}`, result: { dice: d, winners } };
}
G.chuckaluck = { play(p) { return threeDiceFaces(p, ['1', '2', '3', '4', '5', '6'], 'Chuck-a-luck'); } };
G.crownanchor = { play(p) { return threeDiceFaces(p, L.CROWN, 'Crown & anchor'); } };
G.uo7 = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => k in L.UO7);
  const a = L.range(1, 6), b2 = L.range(1, 6), t = a + b2, hit = t < 7 ? 'under' : t === 7 ? 'seven' : 'over';
  return { wager: total, payout: bets[hit] ? bets[hit] * L.UO7[hit] : 0, detail: `${a}+${b2}=${t}`, result: { dice: [a, b2], hit } };
} };
G.duel = { play(p) {
  const { bets, total } = betMap(p.bets, (k) => k in L.DUEL);
  const you = [L.range(1, 6), L.range(1, 6)], dealer = [L.range(1, 6), L.range(1, 6)], ys = you[0] + you[1], ds = dealer[0] + dealer[1];
  const res = ys > ds ? 'player' : ys === ds ? 'tie' : 'dealer';
  return { wager: total, payout: bets[res] ? bets[res] * L.DUEL[res] : 0, detail: `You ${ys} vs dealer ${ds}`, result: { you, dealer, res } };
} };
G.pokerdice = { play(p) {
  const b = U(p.bet), d = [0, 0, 0, 0, 0].map(() => L.range(1, 6)), k = L.pokerDice(d), m = k >= 0 ? L.POKERDICE[k][1] : 0;
  return { wager: b, payout: floorU(b * m), detail: k >= 0 ? L.POKERDICE[k][0] : 'No hand', result: { dice: d, hand: k, mult: m } };
} };
for (const id of ['fruits', 'gems', 'sevens']) G[id] = { play(p) {
  const b = U(p.bet), r = L.slotSpin2(id);
  return { wager: b, payout: floorU(b * r.mult), detail: `${L.SLOT_THEMES[id].name}: ${r.mult}×`, result: r };
} };

/* ---------------- multi-step games ---------------- */
const deck = (n = 1) => L.shuffle(L.newDeck(n));

// Blackjack: fresh 6-deck shuffle every round (continuous-shuffler style).
const bjv = (cards) => L.bjValue(cards).total;
function bjView(s) {
  const show = s.over;
  return { dealer: show ? s.dealer : [s.dealer[0], null], dealerTotal: show ? bjv(s.dealer) : bjv([s.dealer[0]]),
    hands: s.hands.map((h) => ({ cards: h.cards, bet: h.bet, result: h.result || '', total: bjv(h.cards), soft: L.bjValue(h.cards).soft })),
    cur: s.cur, over: s.over, sideNotes: s.sideNotes,
    canDouble: !s.over && s.hands[s.cur] && s.hands[s.cur].cards.length === 2 && !s.hands[s.cur].splitAces,
    canSplit: !s.over && s.hands.length === 1 && s.hands[0].cards.length === 2 && s.hands[0].cards[0].r === s.hands[0].cards[1].r };
}
function bjFinish(s, special) {
  s.over = true;
  const dv = bjv(s.dealer); let main = 0;
  if (special === 'bj') { main = s.hands[0].bet * 2.5; s.hands[0].result = 'Blackjack! 3:2'; }
  else if (special === 'push') { main = s.hands[0].bet; s.hands[0].result = 'Push (both BJ)'; }
  else if (special) s.hands[0].result = special;
  else s.hands.forEach((h) => { const v = bjv(h.cards); if (v > 21) h.result = 'Bust'; else if (dv > 21 || v > dv) { h.result = 'Win'; main += h.bet * 2; } else if (v === dv) { h.result = 'Push'; main += h.bet; } else h.result = 'Lose'; });
  const payout = s.sidePay + floorU(main);
  return { state: s, view: bjView(s), done: true, payout, detail: s.hands.map((h) => h.result).join(', ') + ` vs dealer ${dv}` };
}
function bjNext(s) {
  s.cur++;
  while (s.cur < s.hands.length && bjv(s.hands[s.cur].cards) === 21) s.cur++;
  if (s.cur < s.hands.length) return { state: s, view: bjView(s), done: false };
  if (s.hands.some((h) => bjv(h.cards) <= 21)) while (bjv(s.dealer) < 17) s.dealer.push(s.d.pop());
  return bjFinish(s);
}
G.blackjack = {
  start(p) {
    const b = U(p.bet), pp = U(p.pp, false), t3 = U(p.t3, false);
    const s = { d: deck(6), dealer: [], hands: [{ cards: [], bet: b }], cur: 0, over: false, sidePay: 0, sideNotes: [] };
    const P = s.hands[0].cards; P.push(s.d.pop()); s.dealer.push(s.d.pop()); P.push(s.d.pop()); s.dealer.push(s.d.pop());
    if (pp) { const r = L.perfectPairs(P[0], P[1]); if (r.pays > 0) { s.sidePay += pp * (r.pays + 1); s.sideNotes.push(`Perfect Pairs: ${r.name} (${r.pays}:1)`); } else s.sideNotes.push('Perfect Pairs: lose'); }
    if (t3) { const r = L.twentyOnePlus3([P[0], P[1], s.dealer[0]]); if (r.pays > 0) { s.sidePay += t3 * (r.pays + 1); s.sideNotes.push(`21+3: ${r.name} (${r.pays}:1)`); } else s.sideNotes.push('21+3: lose'); }
    const dBJ = L.isBJ(s.dealer), pBJ = L.isBJ(P), up = s.dealer[0].r;
    let r;
    if ((up >= 10) && dBJ) r = bjFinish(s, pBJ ? 'push' : 'Dealer blackjack');
    else if (pBJ) r = bjFinish(s, 'bj');
    else r = { state: s, view: bjView(s), done: false };
    return { wager: b + pp + t3, ...r };
  },
  act(s, a, p, ctx) {
    if (s.over) fail('Round over');
    const h = s.hands[s.cur];
    if (a === 'hit') { h.cards.push(s.d.pop()); const v = bjv(h.cards); if (v >= 21) { if (v > 21) h.result = 'Bust'; return bjNext(s); } return { state: s, view: bjView(s), done: false }; }
    if (a === 'stand') return bjNext(s);
    if (a === 'double') {
      if (h.cards.length !== 2 || h.splitAces) fail('Cannot double now');
      ctx.need(h.bet); const extra = h.bet; h.bet *= 2; h.cards.push(s.d.pop()); if (bjv(h.cards) > 21) h.result = 'Bust';
      return { extra, ...bjNext(s) };
    }
    if (a === 'split') {
      if (!(s.hands.length === 1 && h.cards.length === 2 && h.cards[0].r === h.cards[1].r)) fail('Cannot split');
      ctx.need(h.bet); const extra = h.bet;
      const c2 = h.cards.pop(), nh = { cards: [c2], bet: h.bet }; h.cards.push(s.d.pop()); nh.cards.push(s.d.pop()); s.hands.push(nh);
      if (c2.r === 14) { h.splitAces = nh.splitAces = true; s.cur = 1; return { extra, ...bjNext(s) }; }
      if (bjv(h.cards) === 21) return { extra, ...bjNext(s) };
      return { extra, state: s, view: bjView(s), done: false };
    }
    fail('Unknown action');
  },
  abandon(s, ctx) { let r; do { r = G.blackjack.act(s, 'stand', {}, ctx); } while (!r.done); return r; },
};

// Video poker
G.videopoker = {
  start(p) { const b = U(p.bet), d = deck(1), hand = d.splice(0, 5); const r = L.vpPay(hand); return { wager: b, state: { d, hand, b }, view: { hand, dealt: r.pays ? r.name : null }, done: false }; },
  act(s, a, p) {
    if (a !== 'draw') fail('Unknown action');
    const holds = Array.isArray(p.holds) ? p.holds.slice(0, 5).map(Boolean) : [];
    for (let i = 0; i < 5; i++) if (!holds[i]) s.hand[i] = s.d.shift();
    const r = L.vpPay(s.hand);
    return { state: s, view: { hand: s.hand, name: r.name, pays: r.pays }, done: true, payout: s.b * r.pays, detail: r.name };
  },
  abandon(s) { return G.videopoker.act(s, 'draw', { holds: [1, 1, 1, 1, 1] }); },
};

// Pai Gow
G.paigow = {
  start(p) {
    const b = U(p.bet), f = U(p.fortune, false), d = deck(1);
    const s = { b, f, p: d.slice(0, 7).sort((x, y) => y.r - x.r || x.s - y.s), d: d.slice(7, 14) };
    return { wager: b + f, state: s, view: { cards: s.p }, done: false };
  },
  act(s, a, p) {
    let high, low;
    if (a === 'houseway') ({ high, low } = L.pgHouseWay(s.p));
    else if (a === 'play') {
      const [i, j] = [int(p.low && p.low[0], 0, 6, 'card'), int(p.low && p.low[1], 0, 6, 'card')]; if (i === j) fail('Pick two different cards');
      low = [s.p[i], s.p[j]]; high = s.p.filter((_, k) => k !== i && k !== j);
      if (!L.pgValid(high, low)) fail('Foul: your 5-card hand must beat the 2-card hand');
    } else fail('Unknown action');
    const dw = L.pgHouseWay(s.d), res = L.pgCompare({ high, low }, dw);
    let pay = res === 1 ? floorU(s.b * 1.95) : res === 0 ? s.b : 0;
    const notes = [res === 1 ? 'You win both hands' : res === 0 ? 'Push (split)' : 'Dealer wins'];
    if (s.f) { const fr = L.pgFortune(s.p); if (fr.pays > 0) { pay += s.f * (fr.pays + 1); notes.push(`Fortune: ${fr.name} ${fr.pays}:1`); } else notes.push('Fortune loses'); }
    return { state: s, view: { player: { high, low }, dealer: dw, highName: L.handName(L.eval5(high)), dealerHighName: L.handName(L.eval5(dw.high)), notes }, done: true, payout: pay, detail: notes.join('; ') };
  },
  abandon(s) { return G.paigow.act(s, 'houseway', {}); },
};

// Three Card Poker
const QH = L.eval3([{ r: 12, s: 0 }, { r: 3, s: 1 }, { r: 2, s: 2 }]);
function tcpResolve(s, play) {
  const notes = []; let pay = 0;
  const ps = L.eval3(s.P), ds = L.eval3(s.D), pc = L.cat3(ps);
  if (play) {
    if (ds < QH) { pay += s.a * 3; notes.push('Dealer does not qualify: Ante wins, Play pushes'); }
    else if (ps > ds) { pay += s.a * 4; notes.push('You beat the dealer'); }
    else if (ps === ds) { pay += s.a * 2; notes.push('Tie — push'); } else notes.push('Dealer wins');
    const ab = L.TCP_ANTE_BONUS[pc]; if (ab) { pay += s.a * ab; notes.push(`Ante bonus ${ab}:1`); }
  } else if (s.a) notes.push('Folded');
  if (s.p) { const m = L.TCP_PAIRPLUS[pc]; if (m) { pay += s.p * (m + 1); notes.push(`Pair Plus ${L.HAND3_NAMES[pc]} ${m}:1`); } else notes.push('Pair Plus loses'); }
  if (s.s) { const r = L.tcpSixCard([...s.P, ...s.D]); if (r.pays > 0) { pay += s.s * (r.pays + 1); notes.push(`6-Card ${r.name} ${r.pays}:1`); } else notes.push('6-Card loses'); }
  return { state: s, view: { P: s.P, D: s.D, pName: L.HAND3_NAMES[pc], dName: L.HAND3_NAMES[L.cat3(ds)], notes }, done: true, payout: pay, detail: notes.join('; ') };
}
G.threecard = {
  start(p, ctx) {
    const a = U(p.ante, false), pp = U(p.pp, false), six = U(p.six, false);
    if (!(a + pp + six)) fail('Place at least one bet');
    if (six && !a) fail('6-Card Bonus requires an Ante');
    if (a) ctx.need(a * 2 + pp + six, 'Keep enough balance to cover the Play bet');
    const d = deck(1), s = { a, p: pp, s: six, P: d.slice(0, 3), D: d.slice(3, 6) };
    if (!a) return { wager: pp + six, ...tcpResolve(s, false) };
    return { wager: a + pp + six, state: s, view: { P: s.P, pName: L.HAND3_NAMES[L.cat3(L.eval3(s.P))] }, done: false };
  },
  act(s, a, p, ctx) {
    if (a === 'play') { ctx.need(s.a); return { extra: s.a, ...tcpResolve(s, true) }; }
    if (a === 'fold') return tcpResolve(s, false);
    fail('Unknown action');
  },
  abandon(s) { return tcpResolve(s, false); },
};

// Caribbean Stud
G.caribbean = {
  start(p, ctx) {
    const a = U(p.ante); ctx.need(a * 3, 'You need 3× the ante (ante + 2× raise)');
    const d = deck(1), s = { a, P: d.slice(0, 5).sort((x, y) => y.r - x.r), D: d.slice(5, 10) };
    return { wager: a, state: s, view: { P: s.P, up: s.D[0], pName: L.handName(L.eval5(s.P)) }, done: false };
  },
  act(s, a, p, ctx) {
    const raise = a === 'raise'; if (!raise && a !== 'fold') fail('Unknown action');
    if (raise) ctx.need(s.a * 2);
    const ps = L.eval5(s.P), ds = L.eval5(s.D), qual = L.cspQualifies(ds);
    let pay = 0, note, cat = null;
    if (!raise) note = 'Folded';
    else if (!qual) { pay = s.a * 4; note = 'Dealer does not qualify: Ante 1:1, Raise pushes'; }
    else if (ps > ds) { cat = L.catR(ps); const m = L.CSP_PAYS[cat]; pay = s.a * 2 + s.a * 2 * (m + 1); note = `You win! ${L.HAND_NAMES[cat]} pays ${m}:1 on the raise`; }
    else if (ps === ds) { pay = s.a * 3; note = 'Tie — push'; } else note = 'Dealer wins';
    return { extra: raise ? s.a * 2 : 0, state: s, view: { P: s.P, D: s.D, dName: L.handName(ds), qual, note, cat }, done: true, payout: pay, detail: note };
  },
  abandon(s, ctx) { return G.caribbean.act(s, 'fold', {}, ctx); },
};

// Let It Ride
G.letitride = {
  start(p) { const b = U(p.bet), d = deck(1); const s = { b, P: d.slice(0, 3), K: d.slice(3, 5), live: [true, true, true], stage: 0, refund: 0 }; return { wager: b * 3, state: s, view: { P: s.P, K: [], live: s.live, stage: 0 }, done: false }; },
  act(s, a) {
    if (a !== 'ride' && a !== 'pull') fail('Unknown action');
    if (a === 'pull') { s.live[s.stage] = false; s.refund += s.b; }
    s.stage++;
    if (s.stage < 2) return { state: s, view: { P: s.P, K: s.K.slice(0, 1), live: s.live, stage: s.stage }, done: false };
    const five = [...s.P, ...s.K], r = L.lirPay(five), n = s.live.filter(Boolean).length;
    const cat = r.pays > 0 ? (r.name.startsWith('Pair of 10') ? 1 : L.catR(L.eval5(five))) : null;
    return { state: s, view: { P: s.P, K: s.K, live: s.live, stage: 2, name: r.name, pays: r.pays, cat, riding: n }, done: true, payout: s.refund + (r.pays > 0 ? s.b * n * (r.pays + 1) : 0), detail: `${r.name}, ${n} bet(s) riding` };
  },
  abandon(s) { let r; do { r = G.letitride.act(s, 'ride'); } while (!r.done); return r; },
};

// Casino War
G.war = {
  start(p, ctx) {
    const a = U(p.ante), t = U(p.tie, false), d = deck(6), pc = d.pop(), dc = d.pop();
    const s = { a, t, d, p: pc, dc, notes: [], pay: 0 };
    if (pc.r === dc.r) { if (t) { s.pay += t * (L.WAR_TIE_PAYS + 1); s.notes.push(`Tie bet wins ${L.WAR_TIE_PAYS}:1`); } return { wager: a + t, state: s, view: { p: pc, d: dc, tie: true, notes: s.notes }, done: false }; }
    if (pc.r > dc.r) { s.pay += a * 2; s.notes.push('You win'); } else s.notes.push('Dealer wins');
    if (t) s.notes.push('Tie bet loses');
    return { wager: a + t, state: s, view: { p: pc, d: dc, tie: false, notes: s.notes }, done: true, payout: s.pay, detail: s.notes.join('; ') };
  },
  act(s, a, p, ctx) {
    if (a === 'surrender') { s.pay += floorU(s.a / 2); s.notes.push('Surrendered (half bet returned)'); return { state: s, view: { notes: s.notes }, done: true, payout: s.pay, detail: s.notes.join('; ') }; }
    if (a !== 'war') fail('Unknown action');
    ctx.need(s.a);
    s.d.pop(); s.d.pop(); s.d.pop(); const p2 = s.d.pop(), d2 = s.d.pop();
    if (p2.r >= d2.r) { s.pay += s.a * 3; s.notes.push('You win the war! Raise pays 1:1, bet pushes'); } else s.notes.push('Dealer wins the war');
    return { extra: s.a, state: s, view: { p2, d2, notes: s.notes }, done: true, payout: s.pay, detail: s.notes.join('; ') };
  },
  abandon(s, ctx) { return G.war.act(s, 'surrender', {}, ctx); },
};

// Mines
G.mines = {
  start(p) {
    const b = U(p.bet), m = int(p.mines, 1, 24, 'mine count');
    const mines = L.shuffle(Array.from({ length: 25 }, (_, i) => i)).slice(0, m);
    return { wager: b, state: { b, m, mines, open: [], e: L.EDGE.mines }, view: { open: [], e: L.EDGE.mines }, done: false };
  },
  act(s, a, p) {
    const fin = (pay, note, hit) => ({ state: s, view: { open: s.open, mines: s.mines, hit, mult: s.open.length ? L.minesMult(s.m, s.open.length, s.e ?? L.EDGE.mines) : 0 }, done: true, payout: pay, detail: note });
    if (a === 'cashout') {
      if (!s.open.length) fail('Reveal at least one tile first');
      const mult = L.minesMult(s.m, s.open.length, s.e ?? L.EDGE.mines); return fin(floorU(s.b * mult), `${s.m} mines, ${s.open.length} gems, ${mult}×`);
    }
    if (a !== 'pick') fail('Unknown action');
    const i = int(p.i, 0, 24, 'tile'); if (s.open.includes(i)) fail('Already revealed');
    if (s.mines.includes(i)) return fin(0, `${s.m} mines, hit after ${s.open.length} gems`, i);
    s.open.push(i);
    if (s.open.length === 25 - s.m) return G.mines.act(s, 'cashout', {});
    return { state: s, view: { open: s.open, mult: L.minesMult(s.m, s.open.length, s.e ?? L.EDGE.mines) }, done: false };
  },
  abandon(s) { return s.open.length ? G.mines.act(s, 'cashout', {}) : { state: s, view: {}, done: true, payout: s.b, detail: 'Refunded (no tiles picked)' }; },
};

// Tower
const FLOORS = 8;
G.tower = {
  start(p) {
    const b = U(p.bet), diff = oneOf(p.diff, Object.keys(L.TOWER), 'difficulty'), t = L.TOWER[diff];
    const traps = Array.from({ length: FLOORS }, () => L.shuffle(Array.from({ length: t.cols }, (_, i) => i)).slice(0, t.bombs));
    return { wager: b, state: { b, diff, traps, floor: 0, picks: [], e: L.EDGE.tower }, view: { floor: 0, e: L.EDGE.tower }, done: false };
  },
  act(s, a, p) {
    const fin = (pay, note) => ({ state: s, view: { floor: s.floor, traps: s.traps, picks: s.picks, mult: s.floor ? L.towerMult(s.diff, s.floor, s.e ?? L.EDGE.tower) : 0 }, done: true, payout: pay, detail: note });
    if (a === 'cashout') { if (!s.floor) fail('Climb at least one floor first'); const m = L.towerMult(s.diff, s.floor, s.e ?? L.EDGE.tower); return fin(floorU(s.b * m), `${s.diff}: floor ${s.floor}, ${m}×`); }
    if (a !== 'pick') fail('Unknown action');
    const c = int(p.c, 0, L.TOWER[s.diff].cols - 1, 'tile'); s.picks.push(c);
    if (s.traps[s.floor].includes(c)) return fin(0, `${s.diff}: fell on floor ${s.floor + 1}`);
    s.floor++;
    if (s.floor === FLOORS) return G.tower.act(s, 'cashout', {});
    return { state: s, view: { floor: s.floor, mult: L.towerMult(s.diff, s.floor, s.e ?? L.EDGE.tower) }, done: false };
  },
  abandon(s) { return s.floor ? G.tower.act(s, 'cashout', {}) : { state: s, view: {}, done: true, payout: s.b, detail: 'Refunded (no picks)' }; },
};

// Hi-Lo (cards with replacement)
const hiloCard = () => { const rank = L.range(1, 13); return { rank, r: rank === 1 ? 14 : rank, s: L.int(4) }; };
G.hilo = {
  start(p) { const b = U(p.bet), card = hiloCard(); return { wager: b, state: { b, card, mult: 1, n: 0, e: L.EDGE.hilo }, view: { card, mult: 1, n: 0, e: L.EDGE.hilo }, done: false }; },
  act(s, a) {
    if (a === 'skip') { s.card = hiloCard(); return { state: s, view: { card: s.card, mult: s.mult, n: s.n }, done: false }; }
    if (a === 'cashout') { if (!s.n) fail('Make at least one correct guess first'); return { state: s, view: { mult: s.mult, n: s.n }, done: true, payout: floorU(s.b * s.mult), detail: `${s.n} correct, ${s.mult.toFixed(2)}×` }; }
    const dir = a === 'hi' ? 'hi' : a === 'lo' ? 'lo' : fail('Unknown action');
    if (L.hiloProb(s.card.rank, dir) >= 1) fail('That guess is not available');
    const prev = s.card.rank, step = L.hiloStep(prev, dir, s.e ?? L.EDGE.hilo); s.card = hiloCard();
    if (dir === 'hi' ? s.card.rank >= prev : s.card.rank <= prev) { s.mult = Math.floor(s.mult * step * 10000) / 10000; s.n++; return { state: s, view: { card: s.card, mult: s.mult, n: s.n, ok: true }, done: false }; }
    return { state: s, view: { card: s.card, ok: false, n: s.n }, done: true, payout: 0, detail: `Lost after ${s.n} correct` };
  },
  abandon(s) { return s.n ? G.hilo.act(s, 'cashout') : { state: s, view: {}, done: true, payout: s.b, detail: 'Refunded (no guesses)' }; },
};

// Crash: the multiplier is a function of server time since start; the crash point is never sent until the round ends.
const CRASH_RATE = 0.15;
const crashMultAt = (ms) => Math.floor(Math.exp(CRASH_RATE * Math.max(0, ms) / 1000) * 100) / 100;
const crashTimeOf = (m) => (Math.log(m) / CRASH_RATE) * 1000;
function crashSettle(s, now, cashAt) {
  // auto cash-out triggers first if its time has passed and it is below the crash point
  if (s.auto && s.auto <= s.cp && now >= s.t0 + crashTimeOf(s.auto)) return { m: s.auto };
  if (cashAt) return { m: cashAt };
  return null;
}
G.crash = {
  start(p) {
    const b = U(p.bet); let auto = null;
    if (p.auto != null && p.auto !== '') { auto = Math.floor(Number(p.auto) * 100) / 100; if (!(auto >= 1.01 && auto <= 1e6)) fail('Auto cash-out must be ≥ 1.01'); }
    const s = { b, auto, cp: L.crashPoint(), t0: Date.now() };
    if (s.cp <= 1) return { wager: b, state: s, view: { crashed: true, cp: s.cp, cashed: 0, rate: CRASH_RATE }, done: true, payout: 0, detail: `Crash ${s.cp.toFixed(2)}× (instant)` };
    return { wager: b, state: s, view: { started: s.t0, rate: CRASH_RATE, serverNow: Date.now() }, done: false };
  },
  act(s, a) {
    const now = Date.now(), crashAt = s.t0 + crashTimeOf(s.cp), crashed = now >= crashAt;
    let cash = null;
    if (a === 'cashout' && !crashed) { const m = crashMultAt(now - s.t0); if (m < s.cp) cash = m; }
    else if (a !== 'cashout' && a !== 'status') fail('Unknown action');
    const r = crashSettle(s, Math.min(now, crashAt), cash);
    if (r) return { state: s, view: { crashed: true, cp: s.cp, cashed: r.m }, done: true, payout: floorU(s.b * r.m), detail: `Crash ${s.cp.toFixed(2)}×, cashed ${r.m.toFixed(2)}×` };
    if (crashed) return { state: s, view: { crashed: true, cp: s.cp, cashed: 0 }, done: true, payout: 0, detail: `Crash ${s.cp.toFixed(2)}×` };
    return { state: s, view: { crashed: false, mult: crashMultAt(now - s.t0) }, done: false };
  },
  abandon(s) { const r = crashSettle(s, Infinity, null); return { state: s, view: {}, done: true, payout: r ? floorU(s.b * r.m) : 0, detail: `Crash ${s.cp.toFixed(2)}× (left)` }; },
};

// Texas Hold'em vs 3 bots, fixed limit, 5% rake capped at 3 BB, no flop no drop.
const RAKE = 0.05, CAP_BB = 3;
function heEquity(hole, board, nOpp, iters = 220) {
  const id = (c) => c.r * 4 + c.s, known = new Set([...hole, ...board].map(id));
  const rest = L.newDeck(1).filter((c) => !known.has(id(c))), need = 5 - board.length + 2 * nOpp, n = rest.length;
  let win = 0;
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < need; k++) { const j = k + L.int(n - k); const t = rest[k]; rest[k] = rest[j]; rest[j] = t; }
    const b = board.concat(rest.slice(0, 5 - board.length)), me = L.best5(hole.concat(b)).score;
    let ties = 0, lost = false;
    for (let o = 0; o < nOpp; o++) { const off = 5 - board.length + o * 2, sc = L.best5([rest[off], rest[off + 1], ...b]).score; if (sc > me) { lost = true; break; } if (sc === me) ties++; }
    if (!lost) win += 1 / (ties + 1);
  }
  return win / iters;
}
const heName = ['You', 'Ava 🤖', 'Max 🤖', 'Zoe 🤖'];
function hePut(s, i, amt, ctx) {
  if (amt <= 0) return 0;
  const seat = s.seats[i];
  seat.inStreet += amt; seat.total += amt; s.pot += amt;
  return i === 0 ? amt : 0;
}
function heView(s, showdown) {
  return { seats: s.seats.map((x, i) => ({ name: heName[i], cards: i === 0 || (showdown && !x.folded) ? x.cards : x.cards.map(() => null), folded: x.folded, last: x.last, total: x.total, winner: !!x.winner, hand: showdown && !x.folded ? x.hand || '' : '' })),
    board: s.board, pot: s.pot, button: s.button, turn: s.turn, log: s.log.slice(-40), toCall: s.toCall, canRaise: s.canRaise, size: s.size, BB: s.BB, over: !!s.over, note: s.note || '' };
}
function heLog(s, t) { s.log.push(t); }
/** advance the hand until it's the player's turn or the hand is over. Returns player chips added (units). */
function heRun(s, ctx) {
  for (let guard = 0; guard < 400; guard++) {
    const active = s.seats.filter((x) => !x.folded);
    if (s.seats[0].folded || active.length === 1) return heShowdown(s);
    if (active.every((x) => x.acted && x.inStreet === s.curBet)) {
      if (s.street === 3) return heShowdown(s);
      s.street++;
      if (s.street === 1) { s.d.pop(); s.board.push(s.d.pop(), s.d.pop(), s.d.pop()); s.flopSeen = true; }
      else { s.d.pop(); s.board.push(s.d.pop()); }
      heLog(s, ['', 'Flop', 'Turn', 'River'][s.street] + ': ' + s.board.map(cs).join(' '));
      s.curBet = 0; s.raises = 0; s.seats.forEach((x) => { x.inStreet = 0; x.acted = false; if (!x.folded) x.last = ''; });
      s.turn = (s.button + 1) % 4; continue;
    }
    const seat = s.seats[s.turn];
    if (seat.folded) { s.turn = (s.turn + 1) % 4; continue; }
    const toCall = s.curBet - seat.inStreet, canRaise = s.raises < 4, size = s.street < 2 ? s.BB : s.BB * 2;
    if (s.turn === 0) { s.toCall = toCall; s.canRaise = canRaise; s.size = size; return; } // wait for player
    // bot decision
    const nOpp = active.length - 1, eq = heEquity(seat.cards, s.board, nOpp), ratio = eq * (nOpp + 1), r = L.random(), potOdds = toCall / (s.pot + toCall);
    let a;
    if (ratio > 1.7 && canRaise && r < 0.85) a = 'raise';
    else if (toCall === 0) a = canRaise && ((ratio > 1.25 && r < 0.6) || r < 0.07) ? 'raise' : 'call';
    else a = eq > potOdds * 1.1 || r < 0.04 ? 'call' : 'fold';
    heApply(s, s.turn, a, toCall, size);
  }
}
function heApply(s, i, a, toCall, size) {
  const seat = s.seats[i]; let added = 0;
  if (a === 'fold') { seat.folded = true; seat.last = 'Fold'; }
  else if (a === 'call') { added = hePut(s, i, toCall); seat.last = toCall ? 'Call ' + (toCall / 100).toFixed(2) : 'Check'; }
  else { added = hePut(s, i, toCall + size); s.curBet += size; s.raises++; s.seats.forEach((o) => { if (o !== seat) o.acted = false; }); seat.last = (s.curBet === size && s.street > 0 ? 'Bet ' : 'Raise to ') + (s.curBet / 100).toFixed(2); }
  seat.acted = true; heLog(s, `${heName[i]}: ${seat.last}`);
  s.turn = (i + 1) % 4;
  return added;
}
function heShowdown(s) {
  s.over = true; s.turn = -1;
  const rake = s.flopSeen ? Math.min(Math.floor(s.pot * RAKE), CAP_BB * s.BB) : 0, net = s.pot - rake;
  let pay = 0, note;
  const live = s.seats.filter((x) => !x.folded);
  let show = false;
  if (s.seats[0].folded) note = 'You folded';
  else {
    let winners;
    if (live.length === 1) winners = live;
    else {
      show = true; while (s.board.length < 5) s.board.push(s.d.pop());
      live.forEach((x) => { const b = L.best5([...x.cards, ...s.board]); x.score = b.score; x.hand = L.handName(b.score); });
      const best = Math.max(...live.map((x) => x.score)); winners = live.filter((x) => x.score === best);
    }
    winners.forEach((w) => (w.winner = true));
    if (winners.includes(s.seats[0])) pay = Math.floor(net / winners.length);
    note = winners.map((w) => heName[s.seats.indexOf(w)]).join(' & ') + (live.length > 1 ? ` win with ${winners[0].hand}` : ' win (everyone folded)') + ` — pot ${(s.pot / 100).toFixed(2)}, rake ${(rake / 100).toFixed(2)}`;
  }
  heLog(s, note); s.note = note; s.show = show; s.pay = pay;
}
G.holdem = {
  start(p, ctx) {
    const BB = oneOf(Number(p.bb), [2, 10, 50, 200], 'stakes') * 100;
    ctx.need(BB * 24, `You need at least ${(BB * 24 / 100).toFixed(2)} (24 big blinds) for these stakes`);
    const button = L.int(4), d = deck(1);
    const s = { d, BB, button, board: [], pot: 0, street: 0, curBet: BB, raises: 1, flopSeen: false, log: [`— New hand (blinds ${(BB / 200).toFixed(2)}/${(BB / 100).toFixed(2)}) —`],
      seats: [0, 1, 2, 3].map(() => ({ cards: [d.pop(), d.pop()], folded: false, inStreet: 0, total: 0, last: '', acted: false })) };
    const sb = (button + 1) % 4, bb = (button + 2) % 4;
    let w = hePut(s, sb, BB / 2) + hePut(s, bb, BB);
    s.seats[sb].last = 'SB ' + (BB / 200).toFixed(2); s.seats[bb].last = 'BB ' + (BB / 100).toFixed(2);
    s.turn = (button + 3) % 4;
    heRun(s, ctx);
    return { wager: w, ...heResult(s) };
  },
  act(s, a, p, ctx) {
    if (s.over || s.turn !== 0) fail('Not your turn');
    if (!['fold', 'call', 'raise'].includes(a)) fail('Unknown action');
    if (a === 'raise' && !s.canRaise) fail('Betting is capped');
    const cost = a === 'call' ? s.toCall : a === 'raise' ? s.toCall + s.size : 0;
    if (cost) ctx.need(cost);
    const extra = heApply(s, 0, a, s.toCall, s.size);
    heRun(s, ctx);
    return { extra, ...heResult(s) };
  },
  abandon(s, ctx) { return G.holdem.act(s, 'fold', {}, ctx); },
};
function heResult(s) { return s.over ? { state: s, view: heView(s, s.show), done: true, payout: s.pay, detail: s.note } : { state: s, view: heView(s, false), done: false }; }

// Red Dog: two cards; bet on the third landing between them. Raise (double) on a spread.
const rdRank = (c) => c.r; // Ace high
function rdFinish(s, raised) {
  const third = s.d.pop(), lo = Math.min(rdRank(s.c1), rdRank(s.c2)), hi = Math.max(rdRank(s.c1), rdRank(s.c2)), r = rdRank(third);
  const stake = s.a * (raised ? 2 : 1), win = r > lo && r < hi, pays = L.redDogPay(s.spread);
  const note = win ? `Between! Spread ${s.spread} pays ${pays}:1` : 'Not between — dealer wins';
  return { extra: raised ? s.a : 0, state: s, view: { c1: s.c1, c2: s.c2, third, spread: s.spread, win, pays, note }, done: true, payout: win ? stake * (pays + 1) : 0, detail: note };
}
G.reddog = {
  start(p) {
    const a = U(p.ante), d = deck(8), c1 = d.pop(), c2 = d.pop();
    const s = { a, d, c1, c2 }, diff = Math.abs(rdRank(c1) - rdRank(c2));
    if (diff === 1) return { wager: a, state: s, view: { c1, c2, note: 'Consecutive cards — push' }, done: true, payout: a, detail: 'Consecutive — push' };
    if (diff === 0) {
      const third = d.pop(), trips = rdRank(third) === rdRank(c1);
      const note = trips ? 'Three of a kind! Pays 11:1' : 'Pair — push';
      return { wager: a, state: s, view: { c1, c2, third, note, win: trips }, done: true, payout: trips ? a * 12 : a, detail: note };
    }
    s.spread = diff - 1;
    return { wager: a, state: s, view: { c1, c2, spread: s.spread, pays: L.redDogPay(s.spread) }, done: false };
  },
  act(s, a, p, ctx) {
    if (a === 'raise') { ctx.need(s.a); return rdFinish(s, true); }
    if (a === 'call') return rdFinish(s, false);
    fail('Unknown action');
  },
  abandon(s) { return rdFinish(s, false); },
};

// Pump: pump the balloon up to 25 times; it may pop on any pump.
G.pump = {
  start(p) { const b = U(p.bet), diff = oneOf(p.diff, Object.keys(L.PUMP), 'difficulty'); return { wager: b, state: { b, diff, k: 0, e: L.EDGE.pump }, view: { k: 0 }, done: false }; },
  act(s, a) {
    if (a === 'cashout') { if (!s.k) fail('Pump at least once first'); const m = L.pumpMult(s.diff, s.k, s.e); return { state: s, view: { k: s.k, mult: m, popped: false }, done: true, payout: floorU(s.b * m), detail: `${s.diff}: ${s.k} pumps, ${m}×` }; }
    if (a !== 'pump') fail('Unknown action');
    if (L.random() < L.PUMP[s.diff]) return { state: s, view: { k: s.k, popped: true }, done: true, payout: 0, detail: `${s.diff}: popped on pump ${s.k + 1}` };
    s.k++;
    if (s.k >= L.PUMP_MAX) return G.pump.act(s, 'cashout');
    return { state: s, view: { k: s.k, mult: L.pumpMult(s.diff, s.k, s.e), next: L.pumpMult(s.diff, s.k + 1, s.e) }, done: false };
  },
  abandon(s) { return s.k ? G.pump.act(s, 'cashout') : { state: s, view: {}, done: true, payout: s.b, detail: 'Refunded (no pumps)' }; },
};
// Penalty shootout: pick a zone for each kick; the keeper guards 1 of 3 (or 2 of 5).
G.penalty = {
  start(p) { const b = U(p.bet), diff = oneOf(p.diff, Object.keys(L.PENALTY), 'difficulty'); return { wager: b, state: { b, diff, k: 0, e: L.EDGE.penalty }, view: { k: 0 }, done: false }; },
  act(s, a, p) {
    if (a === 'cashout') { if (!s.k) fail('Score at least once first'); const m = L.penaltyMult(s.diff, s.k, s.e); return { state: s, view: { k: s.k, mult: m }, done: true, payout: floorU(s.b * m), detail: `${s.diff}: ${s.k} goals, ${m}×` }; }
    if (a !== 'kick') fail('Unknown action');
    const d = L.PENALTY[s.diff], zone = int(p.zone, 0, d.zones - 1, 'zone');
    const keeper = L.shuffle(Array.from({ length: d.zones }, (_, i) => i)).slice(0, d.keeper);
    if (keeper.includes(zone)) return { state: s, view: { k: s.k, zone, keeper, saved: true }, done: true, payout: 0, detail: `${s.diff}: saved on kick ${s.k + 1}` };
    s.k++;
    if (s.k >= L.PENALTY_MAX) { const m = L.penaltyMult(s.diff, s.k, s.e); return { state: s, view: { k: s.k, zone, keeper, mult: m, saved: false }, done: true, payout: floorU(s.b * m), detail: `${s.diff}: perfect ${s.k}/${s.k}, ${m}×` }; }
    return { state: s, view: { k: s.k, zone, keeper, saved: false, mult: L.penaltyMult(s.diff, s.k, s.e), next: L.penaltyMult(s.diff, s.k + 1, s.e) }, done: false };
  },
  abandon(s) { return s.k ? G.penalty.act(s, 'cashout') : { state: s, view: {}, done: true, payout: s.b, detail: 'Refunded (no kicks)' }; },
};
// Red or Black ladder.
const rbCard = () => ({ r: L.range(2, 14), s: L.int(4) });
G.redblack = {
  start(p) { const b = U(p.bet); return { wager: b, state: { b, mult: 1, n: 0, e: L.EDGE.redblack, trail: [] }, view: { mult: 1, n: 0 }, done: false }; },
  act(s, a, p) {
    if (a === 'cashout') { if (!s.n) fail('Make at least one correct guess first'); return { state: s, view: { mult: s.mult, n: s.n }, done: true, payout: floorU(s.b * s.mult), detail: `${s.n} correct, ${s.mult.toFixed(2)}×` }; }
    if (a !== 'guess') fail('Unknown action');
    const kind = p.guess === 'red' || p.guess === 'black' ? 'color' : /^suit:[0-3]$/.test(p.guess || '') ? 'suit' : fail('Invalid guess');
    const c = rbCard(), red = c.s === 1 || c.s === 2;
    const ok = kind === 'color' ? (p.guess === 'red') === red : c.s === +p.guess.slice(5);
    s.trail.push(c);
    if (!ok) return { state: s, view: { card: c, ok: false, n: s.n }, done: true, payout: 0, detail: `Lost after ${s.n} correct` };
    s.mult = Math.floor(s.mult * L.redblackStep(kind, s.e) * 10000) / 10000; s.n++;
    if (s.n >= 10) return { ...G.redblack.act(s, 'cashout'), view: { card: c, ok: true, mult: s.mult, n: s.n } };
    return { state: s, view: { card: c, ok: true, mult: s.mult, n: s.n }, done: false };
  },
  abandon(s) { return s.n ? G.redblack.act(s, 'cashout') : { state: s, view: {}, done: true, payout: s.b, detail: 'Refunded (no guesses)' }; },
};
// Casino Hold'em: ante, see your 2 cards + flop, then call (2× ante) or fold.
G.casinoholdem = {
  start(p, ctx) {
    const a = U(p.ante); ctx.need(a * 3, 'You need 3× the ante (ante + 2× call)');
    const d = deck(1), s = { a, P: [d.pop(), d.pop()], D: [d.pop(), d.pop()], B: [d.pop(), d.pop(), d.pop(), d.pop(), d.pop()] };
    return { wager: a, state: s, view: { P: s.P, flop: s.B.slice(0, 3), pName: L.handName(L.best5([...s.P, ...s.B.slice(0, 3)]).score) }, done: false };
  },
  act(s, a, p, ctx) {
    const call = a === 'call'; if (!call && a !== 'fold') fail('Unknown action');
    if (call) ctx.need(s.a * 2);
    const pb = L.best5([...s.P, ...s.B]), db = L.best5([...s.D, ...s.B]), qual = L.cheQualifies(db.score);
    const anteMult = L.CHE_ANTE[L.catR(pb.score)] || 1;
    let pay = 0, note;
    if (!call) note = 'Folded';
    else if (!qual) { pay = s.a * (anteMult + 1) + s.a * 2; note = `Dealer doesn't qualify: ante pays ${anteMult}:1, call pushes`; }
    else if (pb.score > db.score) { pay = s.a * (anteMult + 1) + s.a * 4; note = `You win with ${L.handName(pb.score)}: ante ${anteMult}:1, call 1:1`; }
    else if (pb.score === db.score) { pay = s.a * 3; note = 'Tie — push'; } else note = `Dealer wins with ${L.handName(db.score)}`;
    return { extra: call ? s.a * 2 : 0, state: s, view: { P: s.P, D: s.D, B: s.B, pName: L.handName(pb.score), dName: L.handName(db.score), qual, note }, done: true, payout: pay, detail: note };
  },
  abandon(s, ctx) { return G.casinoholdem.act(s, 'fold', {}, ctx); },
};

const ROUND_GAMES = Object.keys(G).filter((k) => G[k].start);
const SINGLE_GAMES = Object.keys(G).filter((k) => G[k].play);
module.exports = { G, GameError, U, ROUND_GAMES, SINGLE_GAMES, FISH: L.FISH };
