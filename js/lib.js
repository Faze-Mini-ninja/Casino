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
    const key = rows + risk + ':' + L.PLINKO_CFG[risk].target;
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
  // House edges for the parametric games. The server can change these live (admin → Games); rounds lock the edge at start.
  L.EDGE = { crash: 0.08, mines: 0.1, limbo: 0.08, dice: 0.06, hilo: 0.06, tower: 0.1, coinflip: 0.1, fish: 0.2, wheel: 0.07, cases: 0.1,
    pump: 0.08, penalty: 0.07, darts: 0.08, race: 0.1, cups: 0.07, rps: 0.06, redblack: 0.05, fruits: 0.12, gems: 0.12, sevens: 0.15,
    pharaoh: 0.1, ocean: 0.1, goldrush: 0.12, dragon: 0.1, candy: 0.12, neon: 0.12, clover: 0.12, cosmic: 0.1 };
  L.DEFAULT_EDGE = { ...L.EDGE };
  L.crashPoint = (e = L.EDGE.crash) => { const u = 1 - L.random(); return Math.max(1, Math.floor((1 - e) / u * 100) / 100); };
  L.limboResult = (e = L.EDGE.limbo) => { const u = 1 - L.random(); return Math.min(1e6, Math.max(1, Math.floor((1 - e) / u * 100) / 100)); };
  L.minesMult = (mines, k, e = L.EDGE.mines) => { let m = 1 - e; for (let i = 0; i < k; i++) m *= (25 - i) / (25 - mines - i); return Math.floor(m * 100) / 100; };
  L.diceMult = (chance, e = L.EDGE.dice) => Math.floor((1 - e) * 100 / chance * 10000) / 10000;
  L.TOWER = {
    easy: { cols: 4, bombs: 1 }, medium: { cols: 3, bombs: 1 }, hard: { cols: 2, bombs: 1 }, expert: { cols: 3, bombs: 2 },
  };
  L.towerMult = (diff, k, e = L.EDGE.tower) => { const t = L.TOWER[diff], p = (t.cols - t.bombs) / t.cols; return Math.floor((1 - e) / p ** k * 100) / 100; };
  L.HILO_RANKS = 13; // A(1)..K(13), infinite deck
  L.hiloProb = (r, dir) => (dir === 'hi' ? (14 - r) / 13 : r / 13);
  L.hiloStep = (r, dir, e = L.EDGE.hilo) => (1 - e) / L.hiloProb(r, dir);
  Object.defineProperty(L, 'COIN_MULT', { get: () => Math.round(2 * (1 - L.EDGE.coinflip) * 10000) / 10000, enumerable: true });

  /* ---- Wheel: n equal segments, layout per risk, scaled to RTP = 1 - EDGE.wheel ---- */
  L.WHEEL_SEGMENTS = [10, 20, 30, 40, 50];
  const WHEEL_SHAPES = { // repeating base patterns (relative weights), 0 = lose
    low: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0],
    medium: [0, 1.9, 0, 1.5, 0, 2, 0, 1.5, 0, 3],
    high: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  };
  const wheelCache = {};
  L.wheelTable = (n, risk, e = L.EDGE.wheel) => {
    const key = n + risk + e; if (wheelCache[key]) return wheelCache[key];
    const shape = WHEEL_SHAPES[risk];
    const raw = risk === 'high' ? Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)) : Array.from({ length: n }, (_, i) => shape[i % shape.length]);
    const mean = raw.reduce((a, b) => a + b, 0) / n;
    const table = raw.map((x) => (x ? Math.floor((x * (1 - e) / mean) * 100) / 100 : 0));
    const rtp = table.reduce((a, b) => a + b, 0) / n;
    return (wheelCache[key] = { table, rtp });
  };

  /* ---- Cases: open a case, win one item; item multipliers scaled to RTP = 1 - EDGE.cases ---- */
  L.CASES = {
    starter: { name: 'Starter', color: '#3d8bff', items: [[0.2, 30], [0.5, 28], [1, 20], [1.5, 12], [3, 6], [8, 3], [25, 1]] },
    gamble: { name: 'Gamble', color: '#8b5cf6', items: [[0, 40], [0.5, 25], [1.5, 18], [3, 10], [10, 5], [50, 1.6], [250, 0.4]] },
    jackpot: { name: 'Jackpot', color: '#f0a91c', items: [[0, 70], [1, 15], [4, 9], [20, 4], [100, 1.6], [1000, 0.4]] },
  };
  const RARITY = ['common', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
  const caseCache = {};
  L.caseTable = (id, e = L.EDGE.cases) => {
    const key = id + e; if (caseCache[key]) return caseCache[key];
    const c = L.CASES[id], tw = c.items.reduce((a, [, w]) => a + w, 0);
    const mean = c.items.reduce((a, [m, w]) => a + m * w, 0) / tw;
    const items = c.items.map(([m, w], i) => ({ m: Math.floor(m * (1 - e) / mean * 100) / 100, p: w / tw, rarity: RARITY[i] || 'mythic' }));
    const rtp = items.reduce((a, it) => a + it.m * it.p, 0);
    return (caseCache[key] = { items, rtp });
  };

  /* ---- Red Dog (8 decks, Ace high) ---- */
  L.REDDOG_PAYS = { 1: 5, 2: 4, 3: 2 }; // spread 4+ pays 1:1; consecutive = push; pair then trips pays 11:1
  L.redDogPay = (spread) => L.REDDOG_PAYS[spread] || 1;

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


  /* =============== 20 more games =============== */
  const tableOf = (items, e) => { // items: [mult, weight, extra]; scaled so RTP = 1 - e
    const tw = items.reduce((a, it) => a + it[1], 0), mean = items.reduce((a, [m, w]) => a + m * w, 0) / tw;
    const out = items.map(([m, w, x]) => ({ m: Math.floor((m * (1 - e) / mean) * 100) / 100, p: w / tw, x }));
    return { items: out, rtp: out.reduce((a, it) => a + it.m * it.p, 0) };
  };
  L.pickWeighted = (items) => { let x = L.random(), k = 0; for (; k < items.length - 1; k++) { if (x < items[k].p) break; x -= items[k].p; } return k; };

  // Pump: each pump pops with a fixed chance; cash out any time.
  L.PUMP = { easy: 0.04, medium: 0.1, hard: 0.2, expert: 0.33 };
  L.PUMP_MAX = 25;
  L.pumpMult = (diff, k, e = L.EDGE.pump) => Math.floor((1 - e) / Math.pow(1 - L.PUMP[diff], k) * 100) / 100;

  // Penalty shootout: keeper guards 1 of 3 corners (2 of 5 on hard). Up to 5 kicks.
  L.PENALTY = { normal: { zones: 3, keeper: 1 }, hard: { zones: 5, keeper: 2 } };
  L.PENALTY_MAX = 5;
  L.penaltyMult = (diff, k, e = L.EDGE.penalty) => { const d = L.PENALTY[diff], p = (d.zones - d.keeper) / d.zones; return Math.floor((1 - e) / Math.pow(p, k) * 100) / 100; };

  // Darts: rings with multipliers by risk.
  L.DART_RINGS = ['miss', 'single', 'treble', 'double', 'outer bull', 'bullseye'];
  const DARTS = {
    low: [[0, 10, 'miss'], [0.6, 42, 'single'], [1.3, 26, 'treble'], [1.6, 12, 'double'], [2.5, 7, 'outer bull'], [5, 3, 'bullseye']],
    medium: [[0, 30, 'miss'], [0.4, 30, 'single'], [1.6, 18, 'treble'], [3, 13, 'double'], [7, 6, 'outer bull'], [18, 3, 'bullseye']],
    high: [[0, 52, 'miss'], [0, 26, 'single'], [2.2, 10, 'treble'], [6, 7, 'double'], [16, 3.6, 'outer bull'], [70, 1.4, 'bullseye']],
  };
  const dcache = {};
  L.dartsTable = (risk, e = L.EDGE.darts) => dcache[risk + e] || (dcache[risk + e] = tableOf(DARTS[risk], e));

  // Horse race: six runners with fixed win chances; odds = (1 - edge) / chance.
  L.HORSES = [
    { name: 'Midnight Run', color: '#3d8bff', p: 0.30 }, { name: 'Copper Kettle', color: '#f97316', p: 0.22 }, { name: 'Lucky Clover', color: '#22c55e', p: 0.17 },
    { name: 'Red Baron', color: '#e11d48', p: 0.13 }, { name: 'Silver Lining', color: '#94a3b8', p: 0.11 }, { name: 'Long Shot', color: '#a855f7', p: 0.07 },
  ];
  L.horseOdds = (i, e = L.EDGE.race) => Math.floor((1 - e) / L.HORSES[i].p * 100) / 100;

  // Cups: find the ball under 3 or 5 cups.
  L.cupsMult = (n, e = L.EDGE.cups) => Math.floor(n * (1 - e) * 100) / 100;
  // Rock paper scissors vs the house: tie returns the bet, a win pays this multiplier.
  L.rpsMult = (e = L.EDGE.rps) => Math.floor((2 - 3 * e) * 100) / 100;
  // Red or black ladder (infinite deck): colour p = 1/2, suit p = 1/4.
  L.redblackStep = (kind, e = L.EDGE.redblack) => (1 - e) / (kind === 'suit' ? 0.25 : 0.5);

  // Colors: 15 pockets — 0 green, 1–7 red, 8–14 black.
  L.colorOf15 = (n) => (n === 0 ? 'green' : n <= 7 ? 'red' : 'black');
  L.COLORS_PAYS = { red: 2, black: 2, green: 14 };

  // Pick 3 lottery (digits 0–9 ×3).
  L.PICK3 = { straight: 700, box6: 115, box3: 230 };
  L.pick3Kind = (d) => (d[0] === d[1] && d[1] === d[2] ? 'triple' : d[0] === d[1] || d[1] === d[2] || d[0] === d[2] ? 'box3' : 'box6');

  // Mini roulette: 0–12. Red = 1,3,5,7,9,11? classic mini wheel colours alternate.
  L.MINI_REDS = new Set([1, 3, 5, 7, 9, 11]);
  L.miniCovers = (bet) => {
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    if (bet.startsWith('n:')) return [+bet.slice(2)];
    return { red: all.filter((n) => L.MINI_REDS.has(n)), black: all.filter((n) => !L.MINI_REDS.has(n)), odd: all.filter((n) => n % 2), even: all.filter((n) => !(n % 2)), low: all.filter((n) => n <= 6), high: all.filter((n) => n > 6),
      c1: [1, 4, 7, 10], c2: [2, 5, 8, 11], c3: [3, 6, 9, 12] }[bet] || [];
  };
  L.miniPays = (bet) => { const n = L.miniCovers(bet).length; return n === 1 ? 11 : n === 4 ? 2 : 1; };

  // Andar Bahar (single deck). Andar gets the first card.
  L.ANDAR_PAYS = { andar: 1.9, bahar: 2 }; // total return per unit
  L.andarDeal = () => {
    const d = L.shuffle(L.newDeck(1)), joker = d.pop(), andar = [], bahar = [];
    for (let i = 0; ; i++) { const c = d.pop(); (i % 2 ? bahar : andar).push(c); if (c.r === joker.r) return { joker, andar, bahar, winner: i % 2 ? 'bahar' : 'andar', dealt: i + 1 }; }
  };

  // Chuck-a-luck and Crown & Anchor: 3 dice, bet on a face; pays 1/2/3 to 1.
  L.CROWN = ['crown', 'anchor', 'heart', 'spade', 'diamond', 'club'];
  // Under / Over 7.
  L.UO7 = { under: 2, seven: 5, over: 2 }; // total return
  // Dice duel: 2d6 each, higher total wins; dealer wins ties. Tie bet pays 7:1.
  L.DUEL = { player: 2, tie: 8 };
  // Poker dice: five dice, one roll.
  L.POKERDICE = [['Five of a kind', 100], ['Four of a kind', 8], ['Full house', 4], ['Straight', 4], ['Three of a kind', 1.7], ['Two pair', 0.5]];
  L.pokerDice = (d) => {
    const c = {}; d.forEach((x) => (c[x] = (c[x] || 0) + 1));
    const g = Object.values(c).sort((a, b) => b - a), s = [...d].sort().join('');
    if (g[0] === 5) return 0; if (g[0] === 4) return 1; if (g[0] === 3 && g[1] === 2) return 2;
    if (s === '12345' || s === '23456') return 3; if (g[0] === 3) return 4; if (g[0] === 2 && g[1] === 2) return 5;
    return -1;
  };

  // Casino Hold'em: ante; call 2× after the flop. Ante pays by the bonus table when you win or the dealer doesn't qualify.
  L.CHE_ANTE = { 9: 100, 8: 20, 7: 10, 6: 3, 5: 2 }; // by catR; everything else 1:1
  L.cheQualifies = (score) => { const c = L.cat5(score); if (c >= 2) return true; if (c === 1) return Math.floor(score / 15 ** 4) % 15 >= 4; return false; };

  /* ---- video slot engine ----
   * Every cell is an independent weighted draw, which makes the return exactly computable:
   *  - "lines": wins on fixed paylines from the leftmost reel (bet split evenly across lines)
   *  - "ways": a symbol pays when it lands on adjacent reels from the left, anywhere on each reel; the win is
   *            multiplied by the number of combinations (243 ways on 5x3, 1024 on 5x4)
   *  - scatters pay anywhere; 3+ scatters can award free spins at a multiplier (no retriggers).
   * Pay tables are scaled so the RTP equals 1 - EDGE[id] (then rounded down, so the true RTP is a hair lower). */
  const LINES5 = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1]];
  const LINES3 = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
  /** More paylines: left-to-right paths moving at most one row per reel, simplest (fewest bends, symmetric) first. */
  function genLines(rows, reels, n, base = []) {
    const all = [];
    const walk = (path) => { if (path.length === reels) { all.push(path.slice()); return; } const last = path[path.length - 1]; for (const d of [0, -1, 1]) { const r = last + d; if (r >= 0 && r < rows) { path.push(r); walk(path); path.pop(); } } };
    for (let r = 0; r < rows; r++) walk([r]);
    const bends = (q) => q.reduce((acc, r, i) => acc + (i && r !== q[i - 1] ? 1 : 0), 0);
    const sym = (q) => (q.join() === q.slice().reverse().join() ? 0 : 1);
    all.sort((x, y) => bends(x) + sym(x) - (bends(y) + sym(y)) || x.join('').localeCompare(y.join('')));
    const out = base.slice(), seen = new Set(base.map((q) => q.join()));
    for (const q of all) { if (out.length >= n) break; if (!seen.has(q.join())) { seen.add(q.join()); out.push(q); } }
    return out;
  }
  const ROYALS = (w) => [['T', w], ['J', w - 1], ['Q', w - 2], ['K', w - 3], ['A', w - 4]];
  const RP = { T: [5, 20, 80], J: [5, 20, 80], Q: [5, 25, 100], K: [8, 30, 120], A: [8, 35, 150] }; // royal line pays
  const RW = { T: [1, 3, 8], J: [1, 3, 8], Q: [1, 4, 10], K: [2, 5, 12], A: [2, 5, 15] }; // royal ways pays
  L.SLOT_THEMES = {
    fruits: { name: 'Fruit Frenzy', reels: 5, rows: 3, mode: 'lines', lines: LINES5,
      symbols: [['cherry', 20], ['lemon', 18], ['orange', 16], ['plum', 14], ['grape', 11], ['melon', 8], ['bell', 5], ['seven', 2.6], ['wild', 2.4], ['scatter', 2.2]],
      pays: { cherry: [5, 15, 40], lemon: [5, 15, 40], orange: [8, 20, 60], plum: [8, 20, 60], grape: [12, 40, 100], melon: [15, 60, 150], bell: [25, 100, 300], seven: [50, 250, 1000], wild: [50, 250, 1000] },
      scatter: { 3: 2, 4: 10, 5: 50 } },
    gems: { name: 'Gem Rush', reels: 5, rows: 3, mode: 'lines', lines: LINES5,
      symbols: [['g-blue', 19], ['g-green', 18], ['g-purple', 16], ['g-orange', 14], ['g-red', 11], ['g-pink', 8], ['crown', 4.4], ['diamond', 2.4], ['wild', 2.6], ['scatter', 2.2]],
      pays: { 'g-blue': [5, 12, 40], 'g-green': [5, 12, 40], 'g-purple': [8, 20, 60], 'g-orange': [8, 25, 75], 'g-red': [12, 40, 120], 'g-pink': [15, 60, 160], crown: [30, 120, 400], diamond: [60, 300, 1500], wild: [60, 300, 1500] },
      scatter: { 3: 2, 4: 12, 5: 60 } },
    sevens: { name: 'Lucky 7s', reels: 3, rows: 3, mode: 'lines', lines: LINES3,
      symbols: [['cherry', 22], ['bar', 18], ['bar2', 12], ['bar3', 8], ['bell', 7], ['seven', 3.2], ['wild', 2.2]],
      pays: { cherry: [6], bar: [10], bar2: [20], bar3: [40], bell: [60], seven: [200], wild: [400] },
      scatter: null },
    pharaoh: { name: "Pharaoh's Fortune", reels: 5, rows: 3, mode: 'lines', lines: genLines(3, 5, 20, LINES5),
      symbols: [...ROYALS(15), ['ankh', 8], ['eye', 7], ['scarab', 5.5], ['cat', 4], ['wild', 2.4], ['scatter', 2.8]],
      pays: { ...RP, ankh: [15, 60, 250], eye: [20, 80, 300], scarab: [30, 120, 500], cat: [50, 200, 1000], wild: [100, 500, 2500] },
      scatter: { 3: 2, 4: 15, 5: 100 }, free: { spins: { 3: 10, 4: 12, 5: 15 }, mult: 2 } },
    ocean: { name: 'Deep Sea Treasure', reels: 5, rows: 3, mode: 'ways',
      symbols: [...ROYALS(15), ['starfish', 8], ['octopus', 6.5], ['shell', 5], ['chest', 3.5], ['wild', 2.6], ['scatter', 2.7]],
      pays: { ...RW, starfish: [3, 10, 30], octopus: [4, 15, 50], shell: [6, 25, 80], chest: [10, 40, 150] },
      scatter: { 3: 2, 4: 10, 5: 50 }, free: { spins: { 3: 8, 4: 10, 5: 12 }, mult: 3 } },
    goldrush: { name: 'Gold Rush', reels: 5, rows: 3, mode: 'lines', lines: genLines(3, 5, 25, LINES5),
      symbols: [...ROYALS(15), ['horseshoe', 8], ['lantern', 7], ['pickaxe', 5.5], ['nugget', 4], ['wild', 2.3], ['scatter', 2.7]],
      pays: { ...RP, horseshoe: [15, 50, 200], lantern: [20, 75, 300], pickaxe: [25, 100, 400], nugget: [50, 200, 1000], wild: [80, 400, 2000] },
      scatter: { 3: 2, 4: 10, 5: 50 }, free: { spins: { 3: 10, 4: 15, 5: 20 }, mult: 2 } },
    dragon: { name: 'Dragon Pearl', reels: 5, rows: 4, mode: 'ways',
      symbols: [...ROYALS(16), ['fan', 9], ['coin', 8], ['lantern2', 7], ['koi', 5.5], ['ingot', 4], ['wild', 1.8], ['scatter', 2.2]],
      pays: { ...RW, fan: [2, 8, 20], coin: [3, 10, 25], lantern2: [4, 12, 40], koi: [5, 20, 60], ingot: [8, 30, 120] },
      scatter: { 3: 2, 4: 10, 5: 50 }, free: { spins: { 3: 8, 4: 12, 5: 15 }, mult: 2 } },
    candy: { name: 'Candy Pop', reels: 5, rows: 3, mode: 'ways',
      symbols: [['c-wrap', 16], ['c-drop', 15], ['c-heart', 14], ['c-bear', 13], ['c-lolly', 10], ['c-donut', 7.5], ['c-cupcake', 5], ['wild', 2.2], ['scatter', 2.3]],
      pays: { 'c-wrap': [1, 3, 8], 'c-drop': [1, 4, 10], 'c-heart': [2, 5, 12], 'c-bear': [2, 6, 15], 'c-lolly': [3, 10, 30], 'c-donut': [5, 20, 60], 'c-cupcake': [10, 40, 150] },
      scatter: { 3: 3, 4: 12, 5: 60 }, free: { spins: { 3: 10, 4: 12, 5: 15 }, mult: 3 } },
    neon: { name: 'Neon Nights', reels: 5, rows: 3, mode: 'lines', lines: LINES5,
      symbols: [['n-cherry', 18], ['n-lemon', 16], ['n-bell', 13], ['n-bar', 11], ['n-diamond', 8], ['n-star', 6], ['n-seven', 3.5], ['wild', 2.4], ['scatter', 2.3]],
      pays: { 'n-cherry': [5, 15, 50], 'n-lemon': [5, 15, 50], 'n-bell': [8, 25, 80], 'n-bar': [10, 30, 100], 'n-diamond': [15, 50, 200], 'n-star': [25, 100, 400], 'n-seven': [50, 250, 1000], wild: [100, 500, 2000] },
      scatter: { 3: 2, 4: 10, 5: 50 }, free: { spins: { 3: 10, 4: 12, 5: 15 }, mult: 2 } },
    clover: { name: 'Lucky Clover', reels: 5, rows: 3, mode: 'lines', lines: genLines(3, 5, 20, LINES5),
      symbols: [...ROYALS(15), ['clover', 8], ['horseshoe2', 7], ['hat', 5.5], ['pot', 4], ['wild', 2.4], ['scatter', 2.8]],
      pays: { ...RP, clover: [15, 60, 250], horseshoe2: [20, 75, 300], hat: [25, 100, 500], pot: [50, 250, 1000], wild: [100, 500, 2500] },
      scatter: { 3: 2, 4: 10, 5: 50 }, free: { spins: { 3: 10, 4: 15, 5: 20 }, mult: 2 } },
    cosmic: { name: 'Cosmic Cash', reels: 5, rows: 4, mode: 'lines', lines: genLines(4, 5, 40, [[1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [0, 0, 0, 0, 0], [3, 3, 3, 3, 3]]),
      symbols: [...ROYALS(15), ['planet', 8], ['comet', 7], ['ufo', 5.5], ['astronaut', 4], ['wild', 2.2], ['scatter', 2.1]],
      pays: { ...RP, planet: [15, 60, 250], comet: [20, 80, 300], ufo: [30, 120, 500], astronaut: [50, 250, 1000], wild: [100, 500, 2500] },
      scatter: { 3: 2, 4: 10, 5: 50 }, free: { spins: { 3: 10, 4: 12, 5: 15 }, mult: 2 } },
  };
  L.SLOT_IDS = Object.keys(L.SLOT_THEMES);
  /** One payline: {sym, n, pay} or null. Wilds substitute for the first real symbol; pay index = n - 3 (or 0 on 3 reels). */
  function lineWin(theme, pays, cells) {
    let sym = null, n = 0;
    for (const c of cells) {
      if (c === 'scatter') break;
      if (c === 'wild') { n++; continue; }
      if (sym === null) { sym = c; n++; continue; }
      if (c === sym) { n++; continue; }
      break;
    }
    if (sym === null) sym = 'wild';
    if (n < 3) return null;
    const pt = pays[sym]; if (!pt) return null;
    const pay = pt[Math.min(n, theme.reels) - 3];
    return pay ? { sym, n, pay } : null;
  }
  /** Ways wins for one grid: a symbol (or wild) on reels 1..n, with at least one real symbol among them. */
  function waysWins(theme, pays, grid) {
    const out = [];
    for (const s of Object.keys(pays)) {
      let n = 0, ways = 1, real = false; const cells = [];
      for (let r = 0; r < theme.reels; r++) {
        let cnt = 0;
        grid[r].forEach((c, row) => { if (c === s || c === 'wild') { cnt++; cells.push([r, row]); if (c === s) real = true; } });
        if (!cnt) break; ways *= cnt; n++;
      }
      if (n >= 3 && real && pays[s][n - 3]) out.push({ sym: s, n, ways, pay: pays[s][n - 3] * ways, cells: cells.filter(([r]) => r < n) });
    }
    return out;
  }
  const qOf = (t) => { const W = t.symbols.reduce((a, x) => a + x[1], 0); return Object.fromEntries(t.symbols.map((x) => [x[0], x[1] / W])); };
  const binomP = (n, k, p) => L.comb(n, k) * p ** k * (1 - p) ** (n - k);
  const tierOf = (tbl, c) => { if (!tbl) return null; const ks = Object.keys(tbl).map(Number).sort((x, y) => y - x); const k = ks.find((x) => c >= x); return k ? tbl[k] : null; };
  /** Exact expected return of one spin (per unit of total bet) for given pay tables. */
  function spinEv(t, pays, scatter) {
    const q = qOf(t), syms = t.symbols.map((x) => x[0]);
    let lineEv = 0;
    if (t.mode === 'ways') {
      const qw = q.wild || 0, R = t.rows;
      for (const s of Object.keys(pays)) {
        const p = q[s] + qw, none = (1 - p) ** R;
        const all = R * p, onlyW = R * qw * (1 - q[s]) ** (R - 1);
        for (let k = 3; k <= t.reels; k++) {
          const pay = pays[s][k - 3]; if (!pay) continue;
          lineEv += pay * (all ** k - onlyW ** k) * (k < t.reels ? none : 1);
        }
      }
    } else {
      const cells = new Array(t.reels), idx = new Array(t.reels).fill(0), total = syms.length ** t.reels, qs = syms.map((x) => q[x]);
      for (let i = 0; i < total; i++) {
        let x = i, pr = 1;
        for (let r = 0; r < t.reels; r++) { idx[r] = x % syms.length; x = Math.floor(x / syms.length); cells[r] = syms[idx[r]]; pr *= qs[idx[r]]; }
        const w = lineWin(t, pays, cells); if (w) lineEv += pr * w.pay;
      }
    }
    let scatEv = 0; const N = t.reels * t.rows;
    if (scatter && q.scatter) for (let c = 0; c <= N; c++) { const v = tierOf(scatter, c); if (v) scatEv += binomP(N, c, q.scatter) * v; }
    return lineEv + scatEv;
  }
  /** Expected number of free spins awarded per paid spin. */
  function freeSpinsEv(t) {
    if (!t.free) return 0;
    const q = qOf(t), N = t.reels * t.rows; let ev = 0;
    for (let c = 0; c <= N; c++) { const v = tierOf(t.free.spins, c); if (v) ev += binomP(N, c, q.scatter) * v; }
    return ev;
  }
  const scaledCache = {};
  /** Pay tables scaled to RTP = 1 - EDGE[id]; `rtp` is recomputed exactly from the rounded tables. */
  L.slotTable = (id, e = L.EDGE[id]) => {
    const key = id + ':' + e; if (scaledCache[key]) return scaledCache[key];
    const t = L.SLOT_THEMES[id], fsEv = freeSpinsEv(t), feature = 1 + (t.free ? t.free.mult * fsEv : 0);
    const f = (1 - e) / (spinEv(t, t.pays, t.scatter) * feature), dec = t.mode === 'ways' ? 10000 : 100;
    const pays = Object.fromEntries(Object.entries(t.pays).map(([k, v]) => [k, v.map((x) => Math.floor(x * f * dec) / dec)]));
    const scatter = t.scatter ? Object.fromEntries(Object.entries(t.scatter).map(([k, v]) => [k, Math.floor(v * f * 100) / 100])) : null;
    const rtp = spinEv(t, pays, scatter) * feature;
    return (scaledCache[key] = { ...t, id, pays, scatter, rtp, f, freeSpinsEv: fsEv });
  };
  /** Chance that a paid spin triggers free spins. */
  L.slotFeatureChance = (id) => { const t = L.SLOT_THEMES[id]; if (!t.free) return 0; const q = qOf(t), N = t.reels * t.rows, min = Math.min(...Object.keys(t.free.spins).map(Number)); let p = 0; for (let c = min; c <= N; c++) p += binomP(N, c, q.scatter); return p; };
  const floor4 = (x) => Math.floor(x * 10000 + 1e-9) / 10000;
  function spinOnce(t, items) {
    const grid = Array.from({ length: t.reels }, () => Array.from({ length: t.rows }, () => items[L.pickWeighted(items)].id));
    let wins, lineMult;
    if (t.mode === 'ways') { wins = waysWins(t, t.pays, grid); lineMult = wins.reduce((a, w) => a + w.pay, 0); }
    else {
      wins = [];
      t.lines.forEach((ln, li) => { const w = lineWin(t, t.pays, ln.map((row, r) => grid[r][row])); if (w) wins.push({ line: li, ...w, cells: ln.slice(0, w.n).map((row, r) => [r, row]) }); });
      lineMult = wins.reduce((a, w) => a + w.pay, 0) / t.lines.length;
    }
    let scat = 0; grid.forEach((col) => col.forEach((c) => { if (c === 'scatter') scat++; }));
    const scatterPay = tierOf(t.scatter, scat) || 0;
    return { grid, wins, scatter: scat, scatterPay, mult: floor4(lineMult + scatterPay) };
  }
  /** Spin a theme: base spin plus any free spins it triggers. `mult` is the total return as a multiple of the bet. */
  L.slotSpin2 = (id, e = L.EDGE[id]) => {
    const t = L.slotTable(id, e), q = qOf(t), items = t.symbols.map((x) => ({ id: x[0], p: q[x[0]] }));
    const base = spinOnce(t, items), free = [];
    let total = base.mult;
    const n = t.free ? tierOf(t.free.spins, base.scatter) : 0;
    for (let i = 0; i < (n || 0); i++) { const s = spinOnce(t, items); free.push(s); total += s.mult * t.free.mult; }
    return { ...base, baseMult: base.mult, free, freeMult: t.free ? t.free.mult : 0, mult: floor4(total) };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else root.Lib = L;
})(typeof window !== 'undefined' ? window : globalThis);
