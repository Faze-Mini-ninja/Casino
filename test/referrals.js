/* Referral program test against a throwaway DB (blockchain disabled). Usage: node test/referrals.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-ref-'));
Object.assign(process.env, { DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', PLAY_RATE_PER_5S: '100000', REFERRAL_SHARE: '0.10' });
const { server } = require('../server/index.js');
const { q, credit } = require('../server/db');
const { theoOf } = require('../server/theo');
let base = '', fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok', m); };
function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json(); j._status = r.status; return j;
  };
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;
  const A = client(), B = client(), X = client();
  await A('POST', '/api/register', { username: 'alice', password: 'password123' });
  const ra = await A('GET', '/api/referrals');
  ok(/^[A-Z2-9]{7}$/.test(ra.code) && ra.share === 0.1, 'referrer gets a 7-character code, share 10%');
  ok((await X('POST', '/api/register', { username: 'xx1', password: 'password123', refCode: 'NOPE123' }))._status === 400, 'unknown code rejected at sign-up');
  await B('POST', '/api/register', { username: 'bob', password: 'password123', refCode: ra.code.toLowerCase() });
  ok((await B('GET', '/api/referrals')).referredBy === 'alice', 'bob is linked to alice (code is case-insensitive)');
  ok((await A('POST', '/api/referrals/code', { code: ra.code }))._status === 400, 'cannot use your own code');
  ok((await B('POST', '/api/referrals/code', { code: ra.code }))._status === 400, 'cannot set a second code');

  // demo play earns nothing
  for (let i = 0; i < 20; i++) await B('POST', '/api/play', { game: 'slots', params: { bet: 10 }, mode: 'demo' });
  ok((await A('GET', '/api/referrals')).pending === 0, 'demo play earns no commission');

  // give bob real balance (stand-in for a deposit) and play real money
  const bobId = q("SELECT id FROM users WHERE username = 'bob'").get().id;
  credit(bobId, 'real', 100000000, 'test-deposit');
  let expected = 0;
  const plays = [
    ['slots', null, { bet: 10 }], ['roulette-eu', null, { bets: { red: 10, 'n:7': 1 } }], ['baccarat', null, { bets: { banker: 20, tie: 2 } }],
    ['craps', null, { bets: { any7: 5, hard6: 5 } }], ['sicbo', null, { bets: { big: 10, 'triple:2': 1 } }], ['dice', null, { bet: 10, target: 50, over: false }],
    ['plinko', null, { bet: 5, rows: 16, risk: 'high' }], ['keno', null, { bet: 5, picks: [1, 2, 3, 4] }],
  ];
  for (let k = 0; k < 15; k++) for (const [game, action, params] of plays) {
    const r = await B('POST', '/api/play', { game, action, params, mode: 'real' });
    if (r._status !== 200) { ok(false, game + ': ' + r.error); continue; }
    expected += Math.floor(theoOf(game, params, Math.round(r.wager * 100)) * 0.1 * 1000);
  }
  // a multi-step round (blackjack with side bets) also accrues at settlement
  let r = await B('POST', '/api/play', { game: 'blackjack', action: 'start', params: { bet: 10, pp: 2, t3: 2 }, mode: 'real' });
  while (!r.done) r = await B('POST', '/api/play', { game: 'blackjack', action: 'stand', params: {}, mode: 'real' });
  expected += Math.floor(theoOf('blackjack', { bet: 10, pp: 2, t3: 2 }, Math.round(r.wager * 100)) * 0.1 * 1000);
  const ref = await A('GET', '/api/referrals');
  const pendingMilli = q("SELECT ref_pending_milli m FROM users WHERE username = 'alice'").get().m;
  ok(pendingMilli === expected, `commission = 10% of theoretical profit (${pendingMilli} vs ${expected} milli-units)`);
  ok(ref.referrals.length === 1 && ref.referrals[0].name !== 'bob' && ref.referrals[0].rounds === 121, 'referral list shows masked name and round count');
  ok((await B('POST', '/api/referrals/code', { code: ra.code }))._status === 400, 'cannot add a code after real-money play');

  // claim
  const before = (await A('GET', '/api/me')).balances.real;
  const c = await A('POST', '/api/referrals/claim');
  const after = (await A('GET', '/api/me')).balances.real;
  ok(c.claimed > 0 && after - before === Math.round(c.claimed * 100), `claim moves ${c.claimed} credits into real balance`);
  ok((await A('GET', '/api/referrals')).pending < 0.01, 'pending is ~0 after claim');
  ok((await A('POST', '/api/referrals/claim'))._status === 400, 'nothing to claim twice');
  const led = q("SELECT SUM(delta) s FROM ledger WHERE user_id = (SELECT id FROM users WHERE username='alice') AND mode = 'real'").get().s;
  ok(led === after, 'referrer ledger reconciles with real balance');

  // safety: every theoretical edge is <= the real edge (so self-referral can't beat the house)
  const L = require('../js/lib.js');
  const lir = theoOf('letitride', {}, 300) / 300, real = 0.0351 / 3;
  ok(lir <= real, `Let It Ride theo per unit wagered ${lir.toFixed(4)} <= true ${real.toFixed(4)}`);
  ok(theoOf('slots', {}, 100) / 100 <= 0.2023 && theoOf('baccarat', { bets: { banker: 1 } }, 100) / 100 <= 0.0107, 'slots and banker theo do not exceed true edge');
  void L;
  server.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `REFERRAL TEST FAILED (${fails})` : 'REFERRAL TEST OK'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
