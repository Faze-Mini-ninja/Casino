/* Theoretical house profit ("theo") of a settled round = Σ stake × house edge of that bet.
 * Referral commission is a share of theo, so it doesn't swing with luck.
 * Every edge here is the exact edge or a slight UNDER-estimate. That guarantees a player who refers their own
 * second account can never earn back more than the house actually keeps. */
'use strict';
const L = require('../js/lib.js');

const units = (x) => Math.round(Number(x || 0) * 100);
const cache = new Map();
const memo = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));

// exact per-roll edge for craps bets (multi-roll bets are re-wagered every roll until decided)
const crapsEdge = (id) => memo('craps:' + id, () => {
  const B = L.CRAPS_BETS[id], M = L.CRAPS_MULTI[id]; let ev = 0;
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    if (B) ev += (B.test(a, b) ? (B.special ? B.special(a, b) : B.pays) : -1) / 36;
    else { const o = L.crapsMulti(id, a, b); ev += (o === 'win' ? M.pays : o === 'lose' ? -1 : 0) / 36; }
  }
  return -ev;
});
const sicboEdge = (id) => memo('sicbo:' + id, () => { let r = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) r += L.sicboReturn(id, [a, b, c]) / 216; return 1 - r; });
const BAC = { player: 0.0124, banker: 0.0106, tie: 0.14, ppair: 0.10, bpair: 0.10, epair: 0.13, perfect: 0.10, dragon7: 0.07, panda8: 0.10 };
const DT = { dragon: 0.0746, tiger: 0.0746, tie: 0.32, suitedTie: 0.13, dOdd: 0.0769, dEven: 0.0769, tOdd: 0.0769, tEven: 0.0769 };
const B6 = Object.fromEntries(L.BIG6.map((s) => [s.id, 1 - (s.count / 54) * (s.pays + 1)]));
const SCRATCH = 1 - L.SCRATCH_PRIZES.reduce((s, [m, p]) => s + m * p, 0);
const SLOTS = (() => { const tot = L.SLOT_SYMBOLS.reduce((s, x) => s + x.w, 0); let r = 0; for (const a of L.SLOT_SYMBOLS) for (const b of L.SLOT_SYMBOLS) for (const c of L.SLOT_SYMBOLS) r += (a.w * b.w * c.w) / tot ** 3 * L.slotPay([a.s, b.s, c.s]); return 1 - r; })();

const mapTheo = (bets, edgeOf) => Object.entries(bets || {}).reduce((s, [k, v]) => s + units(v) * Math.max(0, edgeOf(k)), 0);

/** @returns expected house profit in units (float) */
function theoOf(game, p, wager, state) {
  p = p || {};
  switch (game) {
    case 'slots': return wager * SLOTS;
    case 'keno': return wager * (1 - L.kenoRTP((p.picks || []).length || 1));
    case 'roulette-us': return mapTheo(p.bets, (k) => (k === 'top5' ? 0.0789 : 0.0526));
    case 'roulette-eu': return mapTheo(p.bets, () => 0.027);
    case 'baccarat': return mapTheo(p.bets, (k) => BAC[k] || 0);
    case 'craps': return mapTheo(p.bets, crapsEdge);
    case 'sicbo': return mapTheo(p.bets, sicboEdge);
    case 'dragontiger': return mapTheo(p.bets, (k) => DT[k] || 0);
    case 'bigsix': return mapTheo(p.bets, (k) => B6[k] || 0);
    case 'bingo': return wager * 0.29;
    case 'plinko': return wager * (1 - L.plinkoTable(Number(p.rows), p.risk).rtp);
    case 'scratch': return wager * SCRATCH;
    case 'limbo': return wager * L.EDGE.limbo;
    case 'dice': return wager * L.EDGE.dice;
    case 'coinflip': return wager * L.EDGE.coinflip;
    case 'crash': return wager * L.EDGE.crash;
    case 'mines': return wager * ((state && state.e) ?? L.EDGE.mines);
    case 'tower': return wager * ((state && state.e) ?? L.EDGE.tower);
    case 'hilo': return wager * ((state && state.e) ?? L.EDGE.hilo);
    case 'wheel': return wager * (1 - L.wheelTable(Number(p.segments), p.risk).rtp);
    case 'cases': return wager * (1 - L.caseTable(p.case).rtp);
    case 'darts': return wager * (1 - L.dartsTable(p.risk).rtp);
    case 'race': return wager * (1 - L.horseOdds(Number(p.horse)) * L.HORSES[Number(p.horse)].p);
    case 'cups': return wager * (1 - L.cupsMult(Number(p.cups)) / Number(p.cups));
    case 'rps': return wager * (1 - (L.rpsMult() + 1) / 3);
    case 'colors': return wager * (1 / 15);
    case 'pick3': return wager * 0.29;
    case 'miniroulette': return wager * (1 / 13);
    case 'andarbahar': return mapTheo(p.bets, (k) => (k === 'andar' ? 0.02 : 0.03));
    case 'chuckaluck': case 'crownanchor': return wager * 0.0787;
    case 'uo7': return wager * (1 / 6);
    case 'duel': return mapTheo(p.bets, (k) => (k === 'tie' ? 0.098 : 0.112));
    case 'pokerdice': return wager * 0.11;
    case 'fruits': case 'gems': case 'sevens': return wager * (1 - L.slotTable(game).rtp);
    case 'pump': case 'penalty': case 'redblack': return wager * ((state && state.e) ?? L.EDGE[game]);
    case 'casinoholdem': return wager * 0.008; // ≈2.2% of the ante with good strategy ≈ 0.8% of everything wagered
    case 'reddog': return wager * 0.02; // ≈2.8% of the initial bet, less once raises are counted
    case 'fish': return wager * L.EDGE.fish;
    case 'videopoker': return wager * 0.06;
    case 'blackjack': { const pp = units(p.pp), t3 = units(p.t3); return pp * 0.21 + t3 * 0.16 + Math.max(0, wager - pp - t3) * 0.005; }
    case 'paigow': { const f = units(p.fortune); return f * 0.24 + Math.max(0, wager - f) * 0.025; }
    case 'threecard': { const pp = units(p.pp), six = units(p.six); return pp * 0.15 + six * 0.13 + Math.max(0, wager - pp - six) * 0.019; } // 3.37% of ante ≈ 2% of ante+play
    case 'caribbean': return wager * 0.025;
    case 'letitride': return (wager / 3) * 0.035; // 3.51% of one base bet (wager = 3 base bets, pulled bets are refunded)
    case 'war': { const t = units(p.tie); return t * 0.18 + Math.max(0, wager - t) * 0.025; }
    case 'holdem': { // poker is player-vs-player: the house only earns the rake, shared by contribution
      if (!state || !state.flopSeen || !state.pot) return 0;
      const rake = Math.min(Math.floor(state.pot * 0.05), 3 * state.BB);
      return rake * (state.seats[0].total / state.pot);
    }
  }
  return 0;
}
module.exports = { theoOf };
