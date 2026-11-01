/* Shared casino engine: RNG, cards, hand evaluators and all paytables.
 * Runs in the browser (window.Lib) and in Node (module.exports) so the
 * house-edge simulator in test/rtp.js uses exactly the same math. */
(function (root) {
  'use strict';
  const L = {};

  /* ---------------- RNG (crypto-grade) ---------------- */
  const cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  const buf = new Uint32Array(512);
  let bi = buf.length;
  function u32() {
    if (bi >= buf.length) { cryptoObj.getRandomValues(buf); bi = 0; }
    return buf[bi++];
  }
  L.random = () => (u32() * 2097152 + (u32() >>> 11)) / 9007199254740992; // [0,1) 53 bits
  L.int = (n) => Math.floor(L.random() * n);
  L.range = (a, b) => a + L.int(b - a + 1);
  L.pick = (arr) => arr[L.int(arr.length)];
  L.shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = L.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  L.weighted = (items, key = 'w') => {
    let tot = 0; for (const it of items) tot += it[key];
    let x = L.random() * tot;
    for (const it of items) { x -= it[key]; if (x < 0) return it; }
    return items[items.length - 1];
  };
  L.round2 = (x) => Math.floor(x * 100 + 1e-9) / 100;
  L.comb = (n, k) => { if (k < 0 || k > n) return 0; let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };

  /* ---------------- Cards ---------------- */
  L.SUITS = ['♠', '♥', '♦', '♣'];
  L.RANK_STR = { 1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  L.newDeck = (n = 1) => { const d = []; for (let k = 0; k < n; k++) for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s }); return d; };
  L.cardStr = (c) => L.RANK_STR[c.r] + L.SUITS[c.s];
  class Shoe {
    constructor(decks = 1, pen = 0.75) { this.decks = decks; this.pen = pen; this.reset(); }
    reset() { this.cards = L.shuffle(L.newDeck(this.decks)); this.pos = 0; }
    draw() { if (this.pos >= this.cards.length) this.reset(); return this.cards[this.pos++]; }
    checkShuffle() { if (this.pos > this.cards.length * this.pen || this.decks === 1) { this.reset(); return true; } return false; }
    get left() { return this.cards.length - this.pos; }
  }
  L.Shoe = Shoe;

  /* ---------------- Poker evaluation ---------------- */
  L.HAND_NAMES = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];
  const P5 = 15 ** 5;
  L.eval5 = function (cs) {
    const rs = [cs[0].r, cs[1].r, cs[2].r, cs[3].r, cs[4].r].sort((a, b) => b - a);
    const s0 = cs[0].s;
    const flush = cs[1].s === s0 && cs[2].s === s0 && cs[3].s === s0 && cs[4].s === s0;
    const cnt = {};
    for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
    const groups = Object.keys(cnt).map((r) => [cnt[r], +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let st = 0;
    if (groups.length === 5) { if (rs[0] - rs[4] === 4) st = rs[0]; else if (rs[0] === 14 && rs[1] === 5) st = 5; }
    let cat, k;
    if (st && flush) { cat = 8; k = [st]; }
    else if (groups[0][0] === 4) { cat = 7; k = [groups[0][1], groups[1][1]]; }
    else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; k = [groups[0][1], groups[1][1]]; }
    else if (flush) { cat = 5; k = rs; }
    else if (st) { cat = 4; k = [st]; }
    else if (groups[0][0] === 3) { cat = 3; k = groups.map((g) => g[1]); }
    else if (groups[0][0] === 2 && groups[1][0] === 2) { cat = 2; k = groups.map((g) => g[1]); }
    else if (groups[0][0] === 2) { cat = 1; k = groups.map((g) => g[1]); }
    else { cat = 0; k = rs; }
    let sc = cat;
    for (let i = 0; i < 5; i++) sc = sc * 15 + (k[i] || 0);
    return sc;
  };
  L.cat5 = (score) => Math.floor(score / P5);
  /** Category including Royal (9) */
  L.catR = (score) => { const c = L.cat5(score); return c === 8 && (Math.floor(score / 15 ** 4) % 15) === 14 ? 9 : c; };
  L.handName = (score) => L.HAND_NAMES[L.catR(score)];
  /** Best 5 of n cards -> {score, cards} */
  L.best5 = function (cards) {
    const n = cards.length;
    if (n === 5) return { score: L.eval5(cards), cards: cards.slice() };
    let best = -1, bc = null;
    const idx = [0, 1, 2, 3, 4];
    const pick = new Array(5);
    (function rec(start, d) {
      if (d === 5) { const s = L.eval5(pick); if (s > best) { best = s; bc = pick.slice(); } return; }
      for (let i = start; i <= n - (5 - d); i++) { pick[d] = cards[i]; rec(i + 1, d + 1); }
    })(0, 0);
    void idx;
    return { score: best, cards: bc };
  };
  /** Three-card poker evaluation. cats: 0 HC,1 Pair,2 Flush,3 Straight,4 Trips,5 Straight Flush */
  L.HAND3_NAMES = ['High Card', 'Pair', 'Flush', 'Straight', 'Three of a Kind', 'Straight Flush'];
  L.eval3 = function (cs) {
    const rs = cs.map((c) => c.r).sort((a, b) => b - a);
    const flush = cs[0].s === cs[1].s && cs[1].s === cs[2].s;
    let st = 0;
    if (rs[0] !== rs[1] && rs[1] !== rs[2]) { if (rs[0] - rs[2] === 2) st = rs[0]; else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) st = 3; }
    let cat, k;
    if (st && flush) { cat = 5; k = [st, 0, 0]; }
    else if (rs[0] === rs[2]) { cat = 4; k = rs; }
    else if (st) { cat = 3; k = [st, 0, 0]; }
    else if (flush) { cat = 2; k = rs; }
    else if (rs[0] === rs[1] || rs[1] === rs[2]) { cat = 1; const p = rs[1]; const kick = rs[0] === rs[1] ? rs[2] : rs[0]; k = [p, kick, 0]; }
    else { cat = 0; k = rs; }
    return ((cat * 15 + k[0]) * 15 + k[1]) * 15 + k[2];
  };
  L.cat3 = (s) => Math.floor(s / 3375);

  /* =============== GAME MATH / PAYTABLES =============== */

  /* ---- 1. Slots: 3 reels, 1 payline ---- */
  L.SLOT_SYMBOLS = [
    { s: '🍒', w: 8 }, { s: '🍋', w: 7 }, { s: '🍊', w: 6 }, { s: '🔔', w: 4 }, { s: '⭐', w: 3 }, { s: '7️⃣', w: 2 },
  ];
  L.SLOT_PAYS = { '7️⃣': 200, '⭐': 80, '🔔': 40, '🍊': 20, '🍋': 12, '🍒': 5 }; // three of a kind
  L.SLOT_TWO_CHERRY = 1; // exactly two cherries anywhere
  L.slotSpin = () => [0, 1, 2].map(() => L.weighted(L.SLOT_SYMBOLS).s);
  L.slotPay = (line) => {
    if (line[0] === line[1] && line[1] === line[2]) return L.SLOT_PAYS[line[0]];
    const ch = line.filter((x) => x === '🍒').length;
    return ch === 2 ? L.SLOT_TWO_CHERRY : 0;
  };

  /* ---- 2. Keno: 80 balls, 20 drawn. Multipliers (total return per 1 bet) ---- */
  L.KENO_PAYS = {
    1: { 1: 2.8 },
    2: { 2: 12 },
    3: { 2: 2, 3: 30 },
    4: { 2: 1, 3: 5, 4: 90 },
    5: { 3: 3, 4: 15, 5: 400 },
    6: { 3: 1, 4: 6, 5: 60, 6: 1600 },
    7: { 3: 1, 4: 3, 5: 20, 6: 150, 7: 3000 },
    8: { 4: 2, 5: 11, 6: 80, 7: 600, 8: 10000 },
    9: { 4: 1, 5: 5, 6: 30, 7: 200, 8: 3000, 9: 20000 },
    10: { 5: 4, 6: 18, 7: 80, 8: 800, 9: 5000, 10: 20000 },
  };
  L.kenoProb = (spots, hits) => L.comb(spots, hits) * L.comb(80 - spots, 20 - hits) / L.comb(80, 20);
  L.kenoRTP = (spots) => { let r = 0; const t = L.KENO_PAYS[spots]; for (const h in t) r += L.kenoProb(spots, +h) * t[h]; return r; };
  L.kenoDraw = () => L.shuffle(Array.from({ length: 80 }, (_, i) => i + 1)).slice(0, 20);

  /* ---- 3. Blackjack ---- */
  L.bjValue = (cards) => {
    let t = 0, aces = 0;
    for (const c of cards) { if (c.r === 14) { aces++; t += 11; } else t += Math.min(10, c.r); }
    while (t > 21 && aces) { t -= 10; aces--; }
    return { total: t, soft: aces > 0 };
  };
  L.isBJ = (cards) => cards.length === 2 && L.bjValue(cards).total === 21;
  // Perfect Pairs (player first two cards) — return multiplier (to 1) or -1 for loss
  L.PERFECT_PAIRS = { perfect: 20, colored: 10, mixed: 5 };
  L.perfectPairs = (a, b) => {
    if (a.r !== b.r) return { pays: -1, name: 'No pair' };
    if (a.s === b.s) return { pays: L.PERFECT_PAIRS.perfect, name: 'Perfect Pair' };
    const red = (s) => s === 1 || s === 2;
    if (red(a.s) === red(b.s)) return { pays: L.PERFECT_PAIRS.colored, name: 'Colored Pair' };
    return { pays: L.PERFECT_PAIRS.mixed, name: 'Mixed Pair' };
  };
  // 21+3 (player two cards + dealer up card)
  L.P21_3 = { suitedTrips: 100, straightFlush: 40, trips: 25, straight: 9, flush: 4 };
  L.twentyOnePlus3 = (cs) => {
    const s = L.eval3(cs), cat = L.cat3(s);
    const suited = cs[0].s === cs[1].s && cs[1].s === cs[2].s;
    if (cat === 4 && suited) return { pays: L.P21_3.suitedTrips, name: 'Suited Trips' };
    if (cat === 5) return { pays: L.P21_3.straightFlush, name: 'Straight Flush' };
    if (cat === 4) return { pays: L.P21_3.trips, name: 'Three of a Kind' };
    if (cat === 3) return { pays: L.P21_3.straight, name: 'Straight' };
    if (cat === 2) return { pays: L.P21_3.flush, name: 'Flush' };
    return { pays: -1, name: 'No hand' };
  };

  /* ---- 4/5. Roulette ---- */
  L.WHEEL_EU = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  L.WHEEL_US = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
  L.REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  /** bet ids: 'n:17', 'n:0', 'n:00', red, black, odd, even, low, high, d1..d3, c1..c3, top5 */
  L.rouletteCovers = (bet) => {
    const all = Array.from({ length: 36 }, (_, i) => i + 1);
    if (bet.startsWith('n:')) { const v = bet.slice(2); return [v === '00' ? '00' : +v]; }
    switch (bet) {
      case 'red': return all.filter((n) => L.REDS.has(n));
      case 'black': return all.filter((n) => !L.REDS.has(n));
      case 'odd': return all.filter((n) => n % 2);
      case 'even': return all.filter((n) => !(n % 2));
      case 'low': return all.filter((n) => n <= 18);
      case 'high': return all.filter((n) => n > 18);
      case 'd1': return all.filter((n) => n <= 12);
      case 'd2': return all.filter((n) => n > 12 && n <= 24);
      case 'd3': return all.filter((n) => n > 24);
      case 'c1': return all.filter((n) => n % 3 === 1);
      case 'c2': return all.filter((n) => n % 3 === 2);
      case 'c3': return all.filter((n) => n % 3 === 0);
      case 'top5': return [0, '00', 1, 2, 3];
    }
    return [];
  };
  L.roulettePays = (bet) => { const n = L.rouletteCovers(bet).length; return n === 5 ? 6 : 36 / n - 1; };

  /* ---- 6/7/8. Baccarat (8 decks) ---- */
  L.bacVal = (c) => (c.r >= 10 && c.r <= 13 ? 0 : c.r === 14 ? 1 : c.r);
  L.bacTotal = (cs) => cs.reduce((t, c) => t + L.bacVal(c), 0) % 10;
  L.bacDeal = (shoe) => {
    const P = [shoe.draw()], B = [shoe.draw()];
    P.push(shoe.draw()); B.push(shoe.draw());
    let pt = L.bacTotal(P), bt = L.bacTotal(B);
    if (pt < 8 && bt < 8) {
      let p3 = null;
      if (pt <= 5) { p3 = shoe.draw(); P.push(p3); }
      if (!p3) { if (bt <= 5) B.push(shoe.draw()); }
      else {
        const v = L.bacVal(p3);
        const draw = bt <= 2 || (bt === 3 && v !== 8) || (bt === 4 && v >= 2 && v <= 7) || (bt === 5 && v >= 4 && v <= 7) || (bt === 6 && (v === 6 || v === 7));
        if (draw) B.push(shoe.draw());
      }
    }
    return { P, B, pt: L.bacTotal(P), bt: L.bacTotal(B) };
  };
  /** returns total returned per 1 unit (0 = lost) */
  L.BAC_BETS = {
    player: { name: 'Player', pays: '1:1' }, banker: { name: 'Banker', pays: '0.95:1' }, tie: { name: 'Tie', pays: '8:1' },
    ppair: { name: 'Player Pair', pays: '11:1' }, bpair: { name: 'Banker Pair', pays: '11:1' }, epair: { name: 'Either Pair', pays: '5:1' },
    perfect: { name: 'Perfect Pair', pays: '25:1' }, dragon7: { name: 'Dragon 7', pays: '40:1' }, panda8: { name: 'Panda 8', pays: '25:1' },
  };
  L.bacReturn = (bet, r) => {
    const pp = r.P[0].r === r.P[1].r, bp = r.B[0].r === r.B[1].r;
    switch (bet) {
      case 'player': return r.pt > r.bt ? 2 : r.pt === r.bt ? 1 : 0;
      case 'banker': return r.bt > r.pt ? 1.95 : r.pt === r.bt ? 1 : 0;
      case 'tie': return r.pt === r.bt ? 9 : 0;
      case 'ppair': return pp ? 12 : 0;
      case 'bpair': return bp ? 12 : 0;
      case 'epair': return pp || bp ? 6 : 0;
      case 'perfect': return (pp && r.P[0].s === r.P[1].s) || (bp && r.B[0].s === r.B[1].s) ? 26 : 0;
      case 'dragon7': return r.B.length === 3 && r.bt === 7 && r.bt > r.pt ? 41 : 0;
      case 'panda8': return r.P.length === 3 && r.pt === 8 && r.pt > r.bt ? 26 : 0;
    }
    return 0;
  };

  /* ---- 9. Craps proposition bets ---- */
  L.CRAPS_BETS = {
    any7: { name: 'Any Seven', pays: 4, test: (a, b) => a + b === 7 },
    anyCraps: { name: 'Any Craps', pays: 7, test: (a, b) => [2, 3, 12].includes(a + b) },
    yo: { name: 'Yo-Eleven', pays: 15, test: (a, b) => a + b === 11 },
    aceDeuce: { name: 'Ace-Deuce (3)', pays: 15, test: (a, b) => a + b === 3 },
    aces: { name: 'Snake Eyes (2)', pays: 30, test: (a, b) => a + b === 2 },
    boxcars: { name: 'Boxcars (12)', pays: 30, test: (a, b) => a + b === 12 },
    hop4: { name: 'Hard 4 Hop', pays: 30, test: (a, b) => a === 2 && b === 2 },
    hop6: { name: 'Hard 6 Hop', pays: 30, test: (a, b) => a === 3 && b === 3 },
    hop8: { name: 'Hard 8 Hop', pays: 30, test: (a, b) => a === 4 && b === 4 },
    hop10: { name: 'Hard 10 Hop', pays: 30, test: (a, b) => a === 5 && b === 5 },
    field: { name: 'Field', pays: 1, test: (a, b) => [2, 3, 4, 9, 10, 11, 12].includes(a + b), special: (a, b) => (a + b === 2 || a + b === 12 ? 2 : 1) },
  };
  // Multi-roll: hardways & big 6/8 — resolved when decided
  L.CRAPS_MULTI = {
    hard4: { name: 'Hard 4', pays: 7, n: 4 }, hard6: { name: 'Hard 6', pays: 9, n: 6 },
    hard8: { name: 'Hard 8', pays: 9, n: 8 }, hard10: { name: 'Hard 10', pays: 7, n: 10 },
    big6: { name: 'Big 6', pays: 1, n: 6, big: true }, big8: { name: 'Big 8', pays: 1, n: 8, big: true },
  };
  /** returns 'win' | 'lose' | null(still working) */
  L.crapsMulti = (id, a, b) => {
    const m = L.CRAPS_MULTI[id], t = a + b;
    if (t === 7) return 'lose';
    if (m.big) return t === m.n ? 'win' : null;
    if (t === m.n) return a === b ? 'win' : 'lose';
    return null;
  };

  /* ---- 10. Video poker: Jacks or Better (short pay) ---- */
  L.VP_PAYS = [
    ['Royal Flush', 250], ['Straight Flush', 50], ['Four of a Kind', 25], ['Full House', 6], ['Flush', 5],
    ['Straight', 4], ['Three of a Kind', 3], ['Two Pair', 2], ['Jacks or Better', 1],
  ];
  L.vpPay = (cards) => {
    const s = L.eval5(cards), c = L.catR(s);
    const map = { 9: 0, 8: 1, 7: 2, 6: 3, 5: 4, 4: 5, 3: 6, 2: 7 };
    if (c in map) return { pays: L.VP_PAYS[map[c]][1], name: L.VP_PAYS[map[c]][0] };
    if (c === 1) { const pr = Math.floor(s / 15 ** 4) % 15; if (pr >= 11) return { pays: 1, name: 'Jacks or Better' }; }
    return { pays: 0, name: L.HAND_NAMES[c] };
  };

  /* ---- 11. Pai Gow Poker ---- */
  L.eval2 = (cs) => { const a = Math.max(cs[0].r, cs[1].r), b = Math.min(cs[0].r, cs[1].r); return a === b ? 1000 + a : a * 15 + b; };
  L.PG_FORTUNE = [ // [catR, pays to 1]
    [9, 150], [8, 50], [7, 25], [6, 5], [5, 4], [4, 3], [3, 3],
  ];
  L.pgFortune = (seven) => {
    const c = L.catR(L.best5(seven).score);
    for (const [k, p] of L.PG_FORTUNE) if (c === k) return { pays: p, name: L.HAND_NAMES[c] };
    return { pays: -1, name: L.HAND_NAMES[c] };
  };
  /** valid split: 5-card high must outrank the 2-card low */
  L.pgValid = (high, low) => {
    const hs = L.eval5(high), hc = L.cat5(hs);
    const lp = low[0].r === low[1].r;
    if (hc >= 2) return true;
    if (hc === 1) {
      if (!lp) return true;
      const hp = Math.floor(hs / 15 ** 4) % 15;
      return hp >= low[0].r; // equal pair: kickers make the 5-card hand at least equal
    }
    if (lp) return false;
    const hr = [...high].map((c) => c.r).sort((a, b) => b - a), lr = [low[0].r, low[1].r].sort((a, b) => b - a);
    return hr[0] > lr[0] || (hr[0] === lr[0] && hr[1] >= lr[1]);
  };
  const PG_CATW = [0, 3, 5, 7, 8, 8.5, 9, 10, 11];
  /** House-way style heuristic: returns {high, low} */
  L.pgHouseWay = (seven) => {
    let best = null;
    for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) {
      const low = [seven[i], seven[j]], high = seven.filter((_, k) => k !== i && k !== j);
      if (!L.pgValid(high, low)) continue;
      const hs = L.eval5(high), ls = L.eval2(low);
      const lw = ls >= 1000 ? 3 + (ls - 1000) / 14 * 2 : (Math.floor(ls / 15) - 2) / 12 * 2 + (ls % 15) / 200;
      const f = PG_CATW[L.cat5(hs)] + lw;
      if (!best || f > best.f + 1e-9 || (Math.abs(f - best.f) < 1e-9 && hs > best.hs)) best = { f, hs, high, low };
    }
    return { high: best.high, low: best.low };
  };
  /** compare: returns 1 player wins, 0 push, -1 dealer wins (dealer takes copies) */
  L.pgCompare = (p, d) => {
    const h = L.eval5(p.high) > L.eval5(d.high) ? 1 : -1;
    const l = L.eval2(p.low) > L.eval2(d.low) ? 1 : -1;
    return h === 1 && l === 1 ? 1 : h === -1 && l === -1 ? -1 : 0;
  };

  /* ---- 12. Sic Bo ---- */
  L.SICBO_TOTALS = { 4: 50, 5: 25, 6: 14, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 14, 16: 25, 17: 50 };
  /** returns total return per unit for a sic bo bet id */
  L.sicboReturn = (bet, d) => {
    const [a, b, c] = d, t = a + b + c, triple = a === b && b === c;
    const count = (n) => d.filter((x) => x === n).length;
    if (bet === 'small') return !triple && t >= 4 && t <= 10 ? 2 : 0;
    if (bet === 'big') return !triple && t >= 11 && t <= 17 ? 2 : 0;
    if (bet === 'odd') return !triple && t % 2 ? 2 : 0;
    if (bet === 'even') return !triple && !(t % 2) ? 2 : 0;
    if (bet === 'anyTriple') return triple ? 25 : 0;
    if (bet.startsWith('t:')) return t === +bet.slice(2) ? L.SICBO_TOTALS[t] + 1 : 0;
    if (bet.startsWith('triple:')) return triple && a === +bet.slice(7) ? 151 : 0;
    if (bet.startsWith('double:')) return count(+bet.slice(7)) >= 2 ? 9 : 0;
    if (bet.startsWith('single:')) { const k = count(+bet.slice(7)); return k ? k + 1 : 0; }
    if (bet.startsWith('combo:')) { const [x, y] = bet.slice(6).split('-').map(Number); return count(x) && count(y) ? 6 : 0; }
    return 0;
  };

  /* ---- 13. Bingo: 75-ball, 30 balls drawn, paid by completed lines ---- */
  L.BINGO_DRAW = 30;
  L.BINGO_PAYS = { 1: 3, 2: 18, 3: 100, 4: 500, 5: 2500 }; // lines >= 5 pay 1000
  L.bingoCard = () => {
    const cols = [];
    for (let c = 0; c < 5; c++) cols.push(L.shuffle(Array.from({ length: 15 }, (_, i) => c * 15 + i + 1)).slice(0, 5));
    const grid = [];
    for (let r = 0; r < 5; r++) { grid.push([]); for (let c = 0; c < 5; c++) grid[r].push(r === 2 && c === 2 ? 0 : cols[c][r]); }
    return grid; // 0 = free
  };
  L.bingoLines = (grid, drawnSet) => {
    const m = (r, c) => grid[r][c] === 0 || drawnSet.has(grid[r][c]);
    const lines = [];
    for (let i = 0; i < 5; i++) {
      if ([0, 1, 2, 3, 4].every((c) => m(i, c))) lines.push({ t: 'r', i });
      if ([0, 1, 2, 3, 4].every((r) => m(r, i))) lines.push({ t: 'c', i });
    }
    if ([0, 1, 2, 3, 4].every((k) => m(k, k))) lines.push({ t: 'd', i: 0 });
    if ([0, 1, 2, 3, 4].every((k) => m(k, 4 - k))) lines.push({ t: 'd', i: 1 });
    return lines;
  };
  L.bingoPay = (n) => (n <= 0 ? 0 : L.BINGO_PAYS[Math.min(n, 5)]);
  L.bingoDraw = () => L.shuffle(Array.from({ length: 75 }, (_, i) => i + 1)).slice(0, L.BINGO_DRAW);

  /* ---- 14. Plinko: tables generated to a target RTP ---- */
  L.PLINKO_CFG = {
    low: { target: 0.88, min: 0.5, max: { 8: 5.6, 12: 10, 16: 16 } },
    medium: { target: 0.78, min: 0.3, max: { 8: 13, 12: 33, 16: 110 } },
    high: { target: 0.6, min: 0.2, max: { 8: 29, 12: 170, 16: 1000 } },
  };
  const binom = (n, k) => L.comb(n, k) / 2 ** n;
  const plinkoCache = {};
  L.plinkoTable = (rows, risk) => {
    const key = rows + risk;
    if (plinkoCache[key]) return plinkoCache[key];
    const cfg = L.PLINKO_CFG[risk], mx = cfg.max[rows], mn = cfg.min;
    const rnd = (x) => (x >= 100 ? Math.round(x) : x >= 10 ? Math.round(x * 10) / 10 : Math.round(x * 100) / 100);
    const build = (p) => Array.from({ length: rows + 1 }, (_, k) => {
      const d = Math.abs(k - rows / 2) / (rows / 2);
      return rnd(k === 0 || k === rows ? mx : mn + (mx - mn) * d ** p);
    });
    const rtp = (t) => t.reduce((s, m, k) => s + m * binom(rows, k), 0);
    let lo = 0.5, hi = 30;
    for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (rtp(build(mid)) > cfg.target) lo = mid; else hi = mid; }
    const table = build(hi);
    return (plinkoCache[key] = { table, rtp: rtp(table) });
  };
  L.plinkoProb = (rows, k) => binom(rows, k);

  /* ---- 15. Dragon Tiger (8 decks, A low). Tie loses Dragon/Tiger bets in full ---- */
  L.dtRank = (c) => (c.r === 14 ? 1 : c.r);
  L.dtReturn = (bet, d, t) => {
    const dr = L.dtRank(d), tr = L.dtRank(t);
    switch (bet) {
      case 'dragon': return dr > tr ? 2 : 0;
      case 'tiger': return tr > dr ? 2 : 0;
      case 'tie': return dr === tr ? 9 : 0;
      case 'suitedTie': return dr === tr && d.s === t.s ? 51 : 0;
      case 'dOdd': return dr !== 7 && dr % 2 ? 2 : 0;
      case 'dEven': return dr !== 7 && !(dr % 2) ? 2 : 0;
      case 'tOdd': return tr !== 7 && tr % 2 ? 2 : 0;
      case 'tEven': return tr !== 7 && !(tr % 2) ? 2 : 0;
    }
    return 0;
  };

  /* ---- 16. Three Card Poker ---- */
  L.TCP_PAIRPLUS = { 5: 30, 4: 20, 3: 5, 2: 3, 1: 1 }; // by eval3 category
  L.TCP_ANTE_BONUS = { 5: 5, 4: 4, 3: 1 };
  L.TCP_SIX = [[9, 1000], [8, 200], [7, 50], [6, 20], [5, 15], [4, 10], [3, 6]]; // 6-card bonus by catR
  L.tcpSixCard = (six) => {
    const c = L.catR(L.best5(six).score);
    for (const [k, p] of L.TCP_SIX) if (c === k) return { pays: p, name: L.HAND_NAMES[c] };
    return { pays: -1, name: L.HAND_NAMES[c] };
  };

  /* ---- 17. Caribbean Stud ---- */
  L.CSP_PAYS = { 9: 100, 8: 50, 7: 20, 6: 7, 5: 5, 4: 4, 3: 3, 2: 2, 1: 1, 0: 1 };
  L.cspQualifies = (score) => {
    const c = L.cat5(score);
    if (c >= 1) return true;
    const r = []; let s = score; for (let i = 0; i < 5; i++) { r.unshift(s % 15); s = Math.floor(s / 15); }
    return r[0] === 14 && r[1] === 13;
  };

  /* ---- 19. Let It Ride ---- */
  L.LIR_PAYS = { 9: 1000, 8: 200, 7: 50, 6: 11, 5: 8, 4: 5, 3: 3, 2: 2 };
  L.lirPay = (five) => {
    const s = L.eval5(five), c = L.catR(s);
    if (c >= 2) return { pays: L.LIR_PAYS[c], name: L.HAND_NAMES[c] };
    if (c === 1 && Math.floor(s / 15 ** 4) % 15 >= 10) return { pays: 1, name: 'Pair of 10s or Better' };
    return { pays: -1, name: L.HAND_NAMES[c] };
  };

  /* ---- 20. Big Six wheel (54 segments) ---- */
  L.BIG6 = [
    { id: '1', label: '$1', pays: 1, count: 24, color: '#e8e8e8' },
    { id: '2', label: '$2', pays: 2, count: 15, color: '#5aa9e6' },
    { id: '5', label: '$5', pays: 5, count: 7, color: '#7bd389' },
    { id: '10', label: '$10', pays: 10, count: 4, color: '#f4d35e' },
    { id: '20', label: '$20', pays: 20, count: 2, color: '#ee964b' },
    { id: 'joker', label: 'JOKER', pays: 40, count: 1, color: '#c33c54' },
    { id: 'logo', label: 'CASINO', pays: 40, count: 1, color: '#7b2cbf' },
  ];
  L.big6Wheel = () => {
    // fixed, interleaved layout
    const pattern = [];
    const pool = L.BIG6.map((s) => ({ ...s, left: s.count }));
    const order = ['1', '2', '1', '5', '1', '2', '1', '10', '1', '2', '1', '5', '1', '2', '1', '20', '1', '2', '1', '5', '1', '2', '1', 'joker',
      '1', '2', '1', '5', '1', '2', '1', '10', '1', '2', '1', '5', '1', '2', '1', '20', '1', '2', '1', '5', '1', '2', '1', '10', '1', '2', '1', '10', '1', 'logo'];
    for (const id of order) { const p = pool.find((x) => x.id === id); p.left--; pattern.push(id); }
    return pattern;
  };

  /* ---- 21-26, 29: "original" style games ---- */
  L.EDGE = { crash: 0.08, mines: 0.1, limbo: 0.08, dice: 0.06, hilo: 0.06, tower: 0.1, coinflip: 0.1, fish: 0.2 };
  L.crashPoint = () => { const u = 1 - L.random(); return Math.max(1, Math.floor((1 - L.EDGE.crash) / u * 100) / 100); };
  L.limboResult = () => { const u = 1 - L.random(); return Math.min(1e6, Math.max(1, Math.floor((1 - L.EDGE.limbo) / u * 100) / 100)); };
  L.minesMult = (mines, k) => { let m = 1 - L.EDGE.mines; for (let i = 0; i < k; i++) m *= (25 - i) / (25 - mines - i); return Math.floor(m * 100) / 100; };
  L.diceMult = (chance) => Math.floor((1 - L.EDGE.dice) * 100 / chance * 10000) / 10000;
  L.TOWER = {
    easy: { cols: 4, bombs: 1 }, medium: { cols: 3, bombs: 1 }, hard: { cols: 2, bombs: 1 }, expert: { cols: 3, bombs: 2 },
  };
  L.towerMult = (diff, k) => { const t = L.TOWER[diff], p = (t.cols - t.bombs) / t.cols; return Math.floor((1 - L.EDGE.tower) / p ** k * 100) / 100; };
  L.HILO_RANKS = 13; // A(1)..K(13), infinite deck
  L.hiloProb = (r, dir) => (dir === 'hi' ? (14 - r) / 13 : r / 13);
  L.hiloStep = (r, dir) => (1 - L.EDGE.hilo) / L.hiloProb(r, dir);
  L.COIN_MULT = 2 * (1 - L.EDGE.coinflip);

  /* ---- 27. Scratch cards ---- */
  L.SCRATCH_PRIZES = [ // multiplier, probability
    [1000, 0.00003], [100, 0.0005], [25, 0.003], [10, 0.01], [5, 0.03], [2, 0.08], [1, 0.12],
  ];
  L.SCRATCH_DECOYS = [3, 50, 500];
  L.scratchOutcome = () => {
    let x = L.random();
    for (const [m, p] of L.SCRATCH_PRIZES) { if (x < p) return m; x -= p; }
    return 0;
  };
  L.scratchCard = (prize) => {
    const values = [...L.SCRATCH_PRIZES.map((p) => p[0]), ...L.SCRATCH_DECOYS];
    const cells = [];
    if (prize) cells.push(prize, prize, prize);
    const others = L.shuffle(values.filter((v) => v !== prize));
    let i = 0;
    while (cells.length < 9) { cells.push(others[i % others.length]); i++; } // each other value appears at most twice
    return L.shuffle(cells);
  };

  /* ---- 28. Fish table ---- */
  L.FISH = [
    { name: 'Minnow', m: 2, size: 18, speed: 70, color: '#ffd166', w: 30 },
    { name: 'Clownfish', m: 3, size: 22, speed: 60, color: '#f78c6b', w: 22 },
    { name: 'Angelfish', m: 5, size: 26, speed: 55, color: '#83d483', w: 16 },
    { name: 'Puffer', m: 8, size: 30, speed: 45, color: '#e9c46a', w: 10 },
    { name: 'Turtle', m: 15, size: 36, speed: 35, color: '#2a9d8f', w: 7 },
    { name: 'Shark', m: 30, size: 52, speed: 50, color: '#8d99ae', w: 4 },
    { name: 'Golden Dragon', m: 100, size: 64, speed: 40, color: '#ffb703', w: 1 },
  ];
  L.fishCatch = (m) => L.random() < (1 - L.EDGE.fish) / m;

  /* ---- 30. Casino War (6 decks) ---- */
  L.WAR_TIE_PAYS = 10;

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.Lib = L;
})(typeof window !== 'undefined' ? window : globalThis);
