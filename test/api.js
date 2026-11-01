/* API test: plays every game through the real HTTP API against a throwaway database (blockchain disabled).
 * Usage: node test/api.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-test-'));
Object.assign(process.env, { DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', PORT: '0', PLAY_RATE_PER_5S: '100000', SOLANA_CLUSTER: 'devnet' });
const { server } = require('../server/index.js');
let cookie = '', base = '', fails = 0;
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const j = await r.json(); j._status = r.status; return j;
};
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL:', msg); } };
const play = (game, action, params, mode = 'demo') => api('POST', '/api/play', { game, action, params, mode });
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;
  let r = await api('POST', '/api/register', { username: 'tester', password: 'password123' });
  ok(r.user && r.user.role === 'admin' && r.balances.demo === 1000000, 'register gives 10,000 demo credits + admin for first user');
  const bal = async () => (await api('GET', '/api/me')).balances.demo;
  // security checks
  ok((await play('slots', null, { bet: -5 }))._status === 400, 'negative bet rejected');
  ok((await play('slots', null, { bet: 1e9 }))._status === 400, 'huge bet rejected');
  ok((await play('slots', null, { bet: 10 }, 'real'))._status === 400, 'real bet with zero real balance rejected');
  ok((await play('roulette-eu', null, { bets: { 'n:00': 5 } }))._status === 400, '00 rejected on European wheel');
  ok((await play('keno', null, { bet: 1, picks: [1, 1] }))._status === 400, 'duplicate keno picks rejected');
  ok((await play('mines', 'pick', { i: 3 }))._status === 400, 'action without round rejected');
  // every single-shot game: balance must change by exactly payout - wager
  const singles = {
    slots: { bet: 10 }, keno: { bet: 5, picks: [1, 7, 13, 22, 40] }, 'roulette-us': { bets: { red: 10, 'n:00': 1, top5: 2 } }, 'roulette-eu': { bets: { 'n:17': 5, d2: 5 } },
    baccarat: { bets: { player: 10, tie: 2, ppair: 1, dragon7: 1 } }, craps: { bets: { any7: 5, hard8: 5, field: 5 } }, sicbo: { bets: { big: 10, 'triple:3': 1, 'combo:2-5': 2, 't:10': 1 } },
    bingo: { bet: 2, cards: 3 }, plinko: { bet: 3, rows: 16, risk: 'high' }, dragontiger: { bets: { dragon: 10, suitedTie: 1 } }, bigsix: { bets: { 1: 5, joker: 1 } },
    limbo: { bet: 4, target: 2.5 }, dice: { bet: 4, target: 30, over: true }, scratch: { price: 5 }, coinflip: { bet: 7, call: 'T' },
  };
  for (const [g, p] of Object.entries(singles)) {
    for (let i = 0; i < 20; i++) {
      const b0 = await bal(); r = await play(g, null, p);
      if (r._status !== 200) { ok(false, `${g}: ${r.error}`); break; }
      const b1 = await bal();
      ok(Math.abs((b1 - b0) / 100 - (r.payout - r.wager)) < 1e-9, `${g}: balance delta ${(b1 - b0) / 100} != payout-wager ${r.payout - r.wager}`);
    }
    console.log('ok', g);
  }
  // round games
  const rounds = {
    blackjack: async () => { r = await play('blackjack', 'start', { bet: 10, pp: 1, t3: 1 }); let n = 0; while (r._status === 200 && !r.done && n++ < 10) r = await play('blackjack', r.view.canSplit ? 'split' : r.view.canDouble && n === 1 ? 'double' : r.view.hands[r.view.cur].total < 15 ? 'hit' : 'stand', {}); return r; },
    videopoker: async () => { await play('videopoker', 'start', { bet: 5 }); return play('videopoker', 'draw', { holds: [1, 0, 1, 0, 0] }); },
    paigow: async () => { await play('paigow', 'start', { bet: 10, fortune: 2 }); return play('paigow', 'houseway', {}); },
    threecard: async () => { r = await play('threecard', 'start', { ante: 5, pp: 2, six: 1 }); return play('threecard', 'play', {}); },
    caribbean: async () => { await play('caribbean', 'start', { ante: 5 }); return play('caribbean', 'raise', {}); },
    letitride: async () => { await play('letitride', 'start', { bet: 5 }); await play('letitride', 'pull', {}); return play('letitride', 'ride', {}); },
    war: async () => { r = await play('war', 'start', { ante: 5, tie: 1 }); return r.done ? r : play('war', 'war', {}); },
    mines: async () => { await play('mines', 'start', { bet: 5, mines: 3 }); r = await play('mines', 'pick', { i: 0 }); return r.done ? r : play('mines', 'cashout', {}); },
    tower: async () => { await play('tower', 'start', { bet: 5, diff: 'easy' }); r = await play('tower', 'pick', { c: 1 }); return r.done ? r : play('tower', 'cashout', {}); },
    hilo: async () => { r = await play('hilo', 'start', { bet: 5 }); const k = r.view.card.rank, dir = k === 1 ? 'lo' : k === 13 ? 'hi' : k <= 7 ? 'hi' : 'lo'; r = await play('hilo', dir, {}); return r.done ? r : play('hilo', 'cashout', {}); },
    crash: async () => { r = await play('crash', 'start', { bet: 5, auto: 1.1 }); if (r.done) return r; await new Promise((s) => setTimeout(s, 900)); return play('crash', 'status', {}); },
    holdem: async () => { r = await play('holdem', 'start', { bb: 2 }); let n = 0; while (!r.done && n++ < 30) r = await play('holdem', 'call', {}); return r; },
  };
  for (const [g, f] of Object.entries(rounds)) {
    for (let i = 0; i < 12; i++) {
      const b0 = await bal(); r = await f();
      if (r._status !== 200) { ok(false, `${g}: ${r.error}`); break; }
      ok(r.done, `${g}: round finished`);
      const st = (await api('GET', '/api/history?mode=demo')).rounds.find((x) => x.game === g);
      const b1 = await bal();
      ok(st && Math.abs((b1 - b0) / 100 - (st.payout - st.wager)) < 1e-9, `${g}: balance delta ${(b1 - b0) / 100} vs round ${st && st.payout - st.wager}`);
    }
    console.log('ok', g);
  }
  // starting a new round abandons the open one fairly
  await play('mines', 'start', { bet: 5, mines: 3 }); const bm = await bal(); await play('mines', 'start', { bet: 5, mines: 3 });
  ok((await bal()) === bm, 'abandoned mines round with no picks is refunded, new one debited');
  // fish
  const fb = await bal(); r = await play('fish', 'shoot', { bet: 2 }); const id = r.shotId;
  r = await play('fish', 'hit', { shotId: id, m: 5 }); ok(r._status === 200, 'fish hit');
  ok((await play('fish', 'hit', { shotId: id, m: 5 }))._status === 400, 'fish shot cannot resolve twice');
  ok((await play('fish', 'hit', { shotId: (await play('fish', 'shoot', { bet: 1 })).shotId, m: 7 }))._status === 400, 'fake fish multiplier rejected');
  r = await play('fish', 'shoot', { bet: 1 }); await play('fish', 'expire', { shotId: r.shotId });
  console.log('ok fish');
  // stats & wallet endpoint
  ok((await api('GET', '/api/stats?mode=demo')).games.length >= 25, 'stats aggregate');
  ok((await api('GET', '/api/wallet')).address === null, 'wallet works with chain disabled');
  // ledger reconciles with balance
  const { q } = require('../server/db');
  const led = q("SELECT SUM(delta) s FROM ledger WHERE user_id = 1 AND mode = 'demo'").get().s;
  ok(led === (await bal()), `ledger sum ${led} equals balance`);
  // second user is not admin, can't see admin
  cookie = ''; await api('POST', '/api/register', { username: 'player2', password: 'password123' });
  ok((await api('GET', '/api/admin/overview'))._status === 403, 'non-admin blocked from admin');
  server.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `API TEST FAILED (${fails})` : 'API TEST OK'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
