/* House-edge verifier. Exact enumeration where practical, Monte Carlo otherwise.
 * Usage: node test/rtp.js [--quick]  */
'use strict';
const L = require('../js/lib.js');
const QUICK = process.argv.includes('--quick');
const N = (n) => (QUICK ? Math.floor(n / 10) : n);
const rows = [];
const report = (game, bet, rtp, note = '') => rows.push({ game, bet, 'RTP %': (rtp * 100).toFixed(2), 'Edge %': ((1 - rtp) * 100).toFixed(2), method: note });
const sim = (n, fn) => { let r = 0; for (let i = 0; i < n; i++) r += fn(); return r / n; };

// 1 Slots (exact)
{
  const tot = L.SLOT_SYMBOLS.reduce((s, x) => s + x.w, 0); let r = 0;
  for (const a of L.SLOT_SYMBOLS) for (const b of L.SLOT_SYMBOLS) for (const c of L.SLOT_SYMBOLS)
    r += (a.w * b.w * c.w) / tot ** 3 * L.slotPay([a.s, b.s, c.s]);
  report('Slots', '1 line', r, 'exact');
}
// 2 Keno (exact)
for (let s = 1; s <= 10; s++) report('Keno', `${s} spot`, L.kenoRTP(s), 'exact');
// 3 Blackjack side bets
{
  const shoe = new L.Shoe(6);
  let pp = 0, t3 = 0; const n = N(2e6);
  for (let i = 0; i < n; i++) {
    shoe.checkShuffle();
    const a = shoe.draw(), d = shoe.draw(), b = shoe.draw();
    pp += 1 + L.perfectPairs(a, b).pays; t3 += 1 + L.twentyOnePlus3([a, b, d]).pays;
  }
  report('Blackjack', 'Perfect Pairs', pp / n, 'sim'); report('Blackjack', '21+3', t3 / n, 'sim');
}
// 4/5 Roulette (exact)
for (const [name, wheel] of [['Roulette (American)', L.WHEEL_US], ['Roulette (European)', L.WHEEL_EU]]) {
  for (const bet of ['n:17', 'red', 'd1', ...(wheel.length === 38 ? ['top5'] : [])]) {
    const cov = L.rouletteCovers(bet), p = cov.length / wheel.length;
    report(name, bet, p * (L.roulettePays(bet) + 1), 'exact');
  }
}
// 6-8 Baccarat
{
  const shoe = new L.Shoe(8); const n = N(2e6); const acc = {};
  for (const k in L.BAC_BETS) acc[k] = 0;
  for (let i = 0; i < n; i++) { shoe.checkShuffle(); const r = L.bacDeal(shoe); for (const k in acc) acc[k] += L.bacReturn(k, r); }
  for (const k in acc) report('Baccarat', L.BAC_BETS[k].name, acc[k] / n, 'sim');
}
// 9 Craps (exact)
{
  for (const k in L.CRAPS_BETS) {
    const b = L.CRAPS_BETS[k]; let r = 0;
    for (let a = 1; a <= 6; a++) for (let c = 1; c <= 6; c++) if (b.test(a, c)) r += (1 + (b.special ? b.special(a, c) : b.pays)) / 36;
    report('Craps', b.name, r, 'exact');
  }
  for (const k in L.CRAPS_MULTI) {
    const m = L.CRAPS_MULTI[k]; let w = 0, l = 0;
    for (let a = 1; a <= 6; a++) for (let c = 1; c <= 6; c++) { const o = L.crapsMulti(k, a, c); if (o === 'win') w++; if (o === 'lose') l++; }
    report('Craps', m.name, (w / (w + l)) * (m.pays + 1), 'exact');
  }
}
// 11 Pai Gow
{
  const n = N(3e5); let f = 0, main = 0;
  for (let i = 0; i < n; i++) {
    const d = L.shuffle(L.newDeck(1)); const p = d.slice(0, 7), q = d.slice(7, 14);
    f += 1 + L.pgFortune(p).pays;
    if (i < n / 3) { const c = L.pgCompare(L.pgHouseWay(p), L.pgHouseWay(q)); main += c === 1 ? 1.95 : c === 0 ? 1 : 0; }
  }
  report('Pai Gow Poker', 'Fortune side bet', f / n, 'sim');
  report('Pai Gow Poker', 'Main (house way vs house way)', main / (n / 3), 'sim');
}
// 12 Sic Bo (exact)
{
  const bets = ['small', 'big', 'anyTriple', 'triple:1', 'double:1', 'single:1', 'combo:1-2', ...Object.keys(L.SICBO_TOTALS).map((t) => 't:' + t)];
  for (const b of bets) {
    let r = 0;
    for (let a = 1; a <= 6; a++) for (let c = 1; c <= 6; c++) for (let e = 1; e <= 6; e++) r += L.sicboReturn(b, [a, c, e]) / 216;
    report('Sic Bo', b, r);
  }
}
// 13 Bingo
report('Bingo', `${L.BINGO_DRAW} balls`, sim(N(3e5), () => { const g = L.bingoCard(); return L.bingoPay(L.bingoLines(g, new Set(L.bingoDraw())).length); }), 'sim');
// 14 Plinko (exact)
for (const risk of ['low', 'medium', 'high']) for (const r of [8, 12, 16]) report('Plinko', `${r} rows ${risk}`, L.plinkoTable(r, risk).rtp, 'exact');
// 15 Dragon Tiger
{
  const shoe = new L.Shoe(8); const n = N(2e6); const bets = ['dragon', 'tie', 'suitedTie', 'dOdd']; const acc = bets.map(() => 0);
  for (let i = 0; i < n; i++) { shoe.checkShuffle(); const d = shoe.draw(), t = shoe.draw(); bets.forEach((b, j) => (acc[j] += L.dtReturn(b, d, t))); }
  bets.forEach((b, j) => report('Dragon Tiger', b, acc[j] / n, 'sim'));
}
// 16 Three Card Poker
{
  const deck = L.newDeck(1); let r = 0, n = 0;
  for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) for (let k = j + 1; k < 52; k++) {
    const c = L.cat3(L.eval3([deck[i], deck[j], deck[k]])); r += c in L.TCP_PAIRPLUS ? 1 + L.TCP_PAIRPLUS[c] : 0; n++;
  }
  report('Three Card Poker', 'Pair Plus', r / n, 'exact');
  const m = N(5e5); let six = 0, main = 0;
  const QQ = L.eval3([{ r: 12, s: 0 }, { r: 6, s: 1 }, { r: 4, s: 2 }]);
  for (let i = 0; i < m; i++) {
    const d = L.shuffle(L.newDeck(1)); const p = d.slice(0, 3), q = d.slice(3, 6);
    six += 1 + L.tcpSixCard([...p, ...q]).pays;
    const ps = L.eval3(p), ds = L.eval3(q), pc = L.cat3(ps);
    const bonus = L.TCP_ANTE_BONUS[pc] || 0;
    let ret; // per 1 ante wagered; player stakes 2 if plays
    if (ps < QQ) ret = 0; // fold
    else {
      const qual = L.cat3(ds) >= 1 || Math.floor(ds / 225) >= 12;
      if (!qual) ret = 2 + 1 + bonus; else if (ps > ds) ret = 4 + bonus; else if (ps === ds) ret = 2 + bonus; else ret = bonus;
      main += ret - 2; continue;
    }
    main += ret - 1;
  }
  report('Three Card Poker', '6-Card Bonus', six / m, 'sim');
  report('Three Card Poker', 'Ante/Play (Q-6-4 strategy, per ante)', 1 + main / m, 'sim');
}
// 17 Caribbean Stud (raise with pair+ or AK)
{
  const n = N(5e5); let net = 0, wag = 0;
  for (let i = 0; i < n; i++) {
    const d = L.shuffle(L.newDeck(1)); const p = d.slice(0, 5), q = d.slice(5, 10);
    const ps = L.eval5(p), ds = L.eval5(q);
    wag += 1;
    if (!L.cspQualifies(ps)) { net -= 1; continue; }
    if (!L.cspQualifies(ds)) { net += 1; continue; }
    if (ps > ds) net += 1 + 2 * L.CSP_PAYS[L.catR(ps)]; else if (ps < ds) net -= 3;
  }
  report('Caribbean Stud', 'Ante (simple strategy, per ante)', 1 + net / wag, 'sim');
}
// 20 Big Six (exact)
for (const s of L.BIG6) report('Big Six Wheel', s.label, (s.count / 54) * (s.pays + 1), 'exact');
// 21-29 originals (analytic / sim)
report('Crash', 'cash out @2x', sim(N(1e6), () => (L.crashPoint() >= 2 ? 2 : 0)), 'sim');
report('Limbo', 'target 3x', sim(N(1e6), () => (L.limboResult() >= 3 ? 3 : 0)), 'sim');
report('Mines', '3 mines, 5 picks', L.minesMult(3, 5) * (L.comb(22, 5) / L.comb(25, 5)), 'exact');
report('Dice', 'roll under 50', 0.5 * L.diceMult(50), 'exact');
report('Hi-Lo', 'one guess (any card)', (() => { let s = 0; for (let r = 1; r <= 13; r++) s += L.hiloProb(r, 'hi') * L.hiloStep(r, 'hi') / 13; return s; })(), 'exact');
for (const d of Object.keys(L.TOWER)) { const t = L.TOWER[d]; report('Tower', `${d}, 4 floors`, L.towerMult(d, 4) * ((t.cols - t.bombs) / t.cols) ** 4, 'exact'); }
report('Coin Flip', 'heads', 0.5 * L.COIN_MULT, 'exact');
report('Scratch Cards', 'ticket', L.SCRATCH_PRIZES.reduce((s, [m, p]) => s + m * p, 0), 'exact');
report('Fish Table', 'per shot that hits', 1 - L.EDGE.fish, 'exact');
// 30 Casino War (always go to war)
{
  const shoe = new L.Shoe(6); const n = N(2e6); let net = 0, tie = 0;
  const v = (c) => c.r;
  for (let i = 0; i < n; i++) {
    shoe.checkShuffle();
    const p = shoe.draw(), d = shoe.draw();
    if (v(p) > v(d)) net += 1; else if (v(p) < v(d)) net -= 1;
    else { tie += 1 + L.WAR_TIE_PAYS; shoe.draw(); shoe.draw(); shoe.draw(); const p2 = shoe.draw(), d2 = shoe.draw(); net += v(p2) >= v(d2) ? 1 : -2; }
  }
  report('Casino War', 'Ante (go to war)', 1 + net / n, 'sim'); report('Casino War', 'Tie bet', tie / n, 'sim');
}
// 31 Wheel (exact) / 32 Cases (exact) / 33 Red Dog (sim, raise on spread >= 7)
for (const risk of ['low', 'medium', 'high']) for (const n of [10, 30, 50]) report('Wheel', `${n} segments ${risk}`, L.wheelTable(n, risk).rtp, 'exact');
for (const id of Object.keys(L.CASES)) report('Cases', L.CASES[id].name, L.caseTable(id).rtp, 'exact');
{
  const n = N(1e6); let net = 0, wag = 0;
  for (let i = 0; i < n; i++) {
    const sh = new L.Shoe(8); const a = sh.draw().r, b = sh.draw().r, d = Math.abs(a - b);
    wag += 1;
    if (d === 1) continue;
    if (d === 0) { if (sh.draw().r === a) net += 11; continue; }
    const spread = d - 1, raise = spread >= 7, stake = raise ? 2 : 1, r = sh.draw().r;
    if (r > Math.min(a, b) && r < Math.max(a, b)) net += stake * L.redDogPay(spread); else net -= stake;
  }
  report('Red Dog', 'per initial bet (raise on 7+)', 1 + net / wag, 'sim');
}
console.table(rows);
