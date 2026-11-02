/* API test: plays every game through the real HTTP API against a throwaway database (blockchain disabled).
 * Usage: node test/api.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-test-'));
Object.assign(process.env, { DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', PORT: '0', PLAY_RATE_PER_5S: '100000', ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'owner-password-1', SOLANA_CLUSTER: 'devnet', DEMO_START_CREDITS: '100000' });
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
  ok(r.user && r.user.role === 'player' && r.balances.demo === 10000000, 'register gives DEMO_START_CREDITS demo credits; first user is NOT admin when ADMIN_USERNAME is set');
  ok((await api('GET', '/api/me')).config.showOdds === false, 'odds hidden by default');
  ok((await api('POST', '/api/demo/refill'))._status === 400, 'no demo top-up while above 10% of the starting amount');
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
    wheel: { bet: 5, segments: 30, risk: 'medium' }, cases: { bet: 3, case: 'gamble' },
    darts: { bet: 3, risk: 'high' }, race: { bet: 4, horse: 2 }, cups: { bet: 3, cups: 5, pick: 1 }, rps: { bet: 3, hand: 'paper' }, colors: { bets: { red: 3, green: 1 } },
    pick3: { bet: 1, mode: 'box', digits: [1, 1, 7] }, miniroulette: { bets: { 'n:0': 1, red: 3, c2: 2, high: 1 } }, andarbahar: { bets: { andar: 3, bahar: 2 } },
    chuckaluck: { bets: { 3: 2, 6: 1 } }, crownanchor: { bets: { crown: 2, heart: 1 } }, uo7: { bets: { under: 2, seven: 1 } }, duel: { bets: { player: 3, tie: 1 } },
    pokerdice: { bet: 4 }, ...Object.fromEntries(require('../js/lib.js').SLOT_IDS.map((id) => [id, { bet: 5 }])),
  };
  // input validation on the new games
  ok((await play('pick3', null, { bet: 1, mode: 'box', digits: [4, 4, 4] }))._status === 400, 'pick3 box with a triple rejected');
  ok((await play('miniroulette', null, { bets: { 'n:13': 1 } }))._status === 400, 'mini roulette 13 rejected');
  ok((await play('cups', null, { bet: 1, cups: 3, pick: 3 }))._status === 400, 'cups pick out of range rejected');
  ok((await play('race', null, { bet: 1, horse: 99 }))._status === 400, 'unknown horse rejected');
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
    pump: async () => { await play('pump', 'start', { bet: 5, diff: 'medium' }); r = await play('pump', 'pump', {}); if (!r.done) r = await play('pump', 'pump', {}); return r.done ? r : play('pump', 'cashout', {}); },
    penalty: async () => { await play('penalty', 'start', { bet: 5, diff: 'normal' }); r = await play('penalty', 'kick', { zone: 1 }); return r.done ? r : play('penalty', 'cashout', {}); },
    redblack: async () => { await play('redblack', 'start', { bet: 5 }); r = await play('redblack', 'guess', { guess: 'red' }); if (!r.done) r = await play('redblack', 'guess', { guess: 'suit:2' }); return r.done ? r : play('redblack', 'cashout', {}); },
    casinoholdem: async () => { await play('casinoholdem', 'start', { ante: 5 }); return play('casinoholdem', Math.random() < 0.8 ? 'call' : 'fold', {}); },
    reddog: async () => { r = await play('reddog', 'start', { ante: 5 }); return r.done ? r : play('reddog', 'call', {}); },
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
  ok(Object.keys((await api('GET', '/api/wallet')).addresses).length === 0, 'wallet works with chain disabled');
  ok((await api('POST', '/api/admin/cashout', { asset: 'SOL', amount: 1, address: 'x', password: 'x' }))._status === 403, 'players cannot cash out the hot wallet');
  // ledger reconciles with balance
  const { q } = require('../server/db');
  const led = q("SELECT SUM(delta) s FROM ledger WHERE user_id = (SELECT id FROM users WHERE username = 'tester') AND mode = 'demo'").get().s;
  ok(led === (await bal()), `ledger sum ${led} equals balance`);
  // players can't see admin; the configured admin can
  ok((await api('GET', '/api/admin/overview'))._status === 403, 'player blocked from admin');
  // password change: wrong current rejected, new one works, old one stops working
  ok((await api('POST', '/api/password', { current: 'nope', next: 'newpassword456' }))._status === 400, 'wrong current password rejected');
  ok((await api('POST', '/api/password', { current: 'password123', next: 'newpassword456' })).ok, 'password changed');
  ok((await api('GET', '/api/me')).user, 'still signed in on this device after change');
  cookie = ''; ok((await api('POST', '/api/login', { username: 'tester', password: 'password123' }))._status === 401, 'old password no longer works');
  ok((await api('POST', '/api/login', { username: 'tester', password: 'newpassword456' })).user, 'new password works');
  cookie = ''; r = await api('POST', '/api/login', { username: 'owner', password: 'owner-password-1' });
  ok(r.user && r.user.role === 'admin', 'configured admin can sign in');
  ok((await api('GET', '/api/admin/overview'))._status === 200, 'admin sees admin overview');
  ok((await api('POST', '/api/admin/cashout', { asset: 'SOL', amount: 1, address: 'x', password: 'wrong-password' }))._status === 403, 'cash-out needs the admin password');
  ok((await api('POST', '/api/admin/cashout', { asset: 'SOL', amount: 1, address: 'x', password: 'owner-password-1' }))._status === 400, 'cash-out refused while the chain is off');
  // admin user management
  ok((await api('POST', '/api/admin/users/create', { username: 'Brandon', password: 'brandon123', demo: 10000, real: 10000 })).ok, 'admin creates Brandon with 10,000 real credits');
  const bl = (await api('GET', '/api/admin/users?q=Brandon')).users[0];
  ok(bl && bl.real === 10000 && bl.demo === 10000, 'Brandon has $10,000 real + 10,000 demo');
  ok((await api('POST', '/api/admin/users/adjust', { id: bl.id, mode: 'real', amount: 250, note: 'test top-up' })).balances.real === 1025000, 'admin adds 250 real credits');
  ok((await api('POST', '/api/admin/users/adjust', { id: bl.id, mode: 'real', amount: -999999 }))._status === 400, 'cannot remove more than the balance');
  ok((await api('POST', '/api/admin/users/adjust', { id: bl.id, mode: 'demo', amount: -500 })).balances.demo === 950000, 'admin removes 500 demo credits');
  ok((await api('GET', '/api/admin/users')).log.some((l) => l.action === 'add-balance' && l.target === 'Brandon'), 'balance changes are in the admin log');
  const { q: qq } = require('../server/db');
  ok(qq("SELECT SUM(delta) s FROM ledger WHERE user_id = ? AND mode = 'real'").get(bl.id).s === 1025000, 'Brandon real ledger reconciles');
  ok((await api('POST', '/api/admin/users/disable', { id: bl.id, disabled: true })).ok, 'admin disables Brandon');
  const saved = cookie; cookie = '';
  ok((await api('POST', '/api/login', { username: 'Brandon', password: 'brandon123' }))._status === 403, 'disabled account cannot sign in');
  cookie = saved; await api('POST', '/api/admin/users/disable', { id: bl.id, disabled: false });
  cookie = ''; ok((await api('POST', '/api/login', { username: 'Brandon', password: 'brandon123' })).balances.real === 1025000, 'Brandon signs in after re-enable');
  ok((await api('POST', '/api/admin/users/adjust', { id: bl.id, mode: 'real', amount: 100 }))._status === 403, 'players cannot use admin tools');
  server.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `API TEST FAILED (${fails})` : 'API TEST OK'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
