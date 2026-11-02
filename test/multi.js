/* Multiplayer test: PvP Arena (coin flip, dice, rock paper scissors, blackjack duel) and live blackjack tables,
 * through the HTTP API with a controllable clock. Checks that money is conserved (only the rake leaves the players),
 * ties refund, timeouts and expiries settle, and cool-offs block play. Usage: node test/multi.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-mp-'));
Object.assign(process.env, { DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', SOLANA_CLUSTER: 'devnet', ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'owner-password-1',
  PVP_RAKE_PCT: '5', BJT_BET_SECS: '10', BJT_TURN_SECS: '20', PVP_MOVE_SECS: '30', DEMO_START_CREDITS: '100000', REFERRAL_SHARE: '0' });
const { server } = require('../server/index.js');
const { q, credit, balances } = require('../server/db');
const multi = require('../server/multi');
let T = Date.now(); multi.setClock(() => T);
const advance = (ms) => { T += ms; multi.tick(); };
let base = '', fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok', m); };
const client = () => { let cookie = ''; const c = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const j = await r.json(); j._status = r.status; return j; }; return c; };
const idOf = (n) => q('SELECT id FROM users WHERE username = ?').get(n).id;
const real = (n) => balances(idOf(n)).real;
const demo = (n) => balances(idOf(n)).demo;

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;
  const admin = client(); await admin('POST', '/api/login', { username: 'owner', password: 'owner-password-1' });
  const P = {};
  for (const n of ['alice', 'bob', 'carol', 'dave']) {
    await admin('POST', '/api/admin/users/create', { username: n, password: 'password123', demo: 100000, real: 0 });
    P[n] = client(); await P[n]('POST', '/api/login', { username: n, password: 'password123' });
    credit(idOf(n), 'real', 100000, 'test'); // $1,000 each
  }
  const { alice: A, bob: B, carol: Cc, dave: D } = P;

  console.log('coin flip');
  let a0 = real('alice'), b0 = real('bob');
  let r = await A('POST', '/api/pvp/create', { game: 'coinflip', mode: 'real', stake: 10, choice: 'H' });
  ok(r.match && r.match.status === 'open' && real('alice') === a0 - 1000, 'creating holds the $10 stake');
  const cf = r.match.id;
  ok((await A('POST', '/api/pvp/join', { id: cf }))._status === 400, 'cannot join your own challenge');
  ok((await B('GET', '/api/pvp?mode=real')).open.some((m) => m.id === cf && m.creatorChoice === 'H'), 'challenge listed with the creator\'s side');
  r = await B('POST', '/api/pvp/join', { id: cf });
  ok(r.match.status === 'done' && ['alice', 'bob'].includes(r.match.winner), 'joining settles the flip: ' + r.match.result.text);
  const aw = r.match.winner === 'alice';
  ok(real('alice') - a0 === (aw ? 900 : -1000) && real('bob') - b0 === (aw ? -1000 : 900), 'winner gets $19 (pot $20 minus 5%), loser loses $10');
  ok(q("SELECT COUNT(*) n FROM rounds WHERE game = 'pvp-coinflip'").get().n === 2, 'a round is recorded for each player');
  ok((await Cc('POST', '/api/pvp/join', { id: cf }))._status === 400, 'a finished challenge cannot be joined');

  console.log('cancel and expiry');
  a0 = real('alice');
  r = await A('POST', '/api/pvp/create', { game: 'dice', mode: 'real', stake: 5 });
  ok((await B('POST', '/api/pvp/cancel', { id: r.match.id }))._status === 400, 'only the creator can cancel');
  ok((await A('POST', '/api/pvp/cancel', { id: r.match.id })).ok && real('alice') === a0, 'cancel refunds the stake');
  r = await A('POST', '/api/pvp/create', { game: 'dice', mode: 'real', stake: 5 });
  advance(31 * 60000);
  ok(q('SELECT status FROM pvp_matches WHERE id = ?').get(r.match.id).status === 'expired' && real('alice') === a0, 'unjoined challenge expires after 30 minutes and is refunded');
  for (let i = 0; i < 3; i++) await A('POST', '/api/pvp/create', { game: 'dice', mode: 'demo', stake: 1 });
  ok((await A('POST', '/api/pvp/create', { game: 'dice', mode: 'demo', stake: 1 }))._status === 400, 'at most 3 open challenges each');
  for (const m of (await A('GET', '/api/pvp?mode=demo')).mine) await A('POST', '/api/pvp/cancel', { id: m.id });
  ok((await A('POST', '/api/pvp/create', { game: 'dice', mode: 'real', stake: 5000 }))._status === 400, 'stake above the balance refused');

  console.log('dice and rock paper scissors');
  let tot0 = real('alice') + real('bob'), rake = 0;
  for (let i = 0; i < 6; i++) {
    r = await A('POST', '/api/pvp/create', { game: 'dice', mode: 'real', stake: 2 });
    r = await B('POST', '/api/pvp/join', { id: r.match.id });
    ok(r.match.result.c !== r.match.result.j && (r.match.result.c > r.match.result.j) === (r.match.winner === 'alice'), `dice ${r.match.result.text}: higher roll wins`);
    rake += 20;
  }
  ok(real('alice') + real('bob') === tot0 - rake, 'players lose exactly the rake in total');
  r = await A('POST', '/api/pvp/create', { game: 'rps', mode: 'real', stake: 3, choice: 'R' });
  const pub = (await Cc('GET', '/api/pvp?mode=real')).open.find((m) => m.id === r.match.id);
  ok(pub && !pub.yourChoice && !JSON.stringify(pub).includes('"R"'), 'the creator\'s hand is secret');
  ok((await B('POST', '/api/pvp/join', { id: r.match.id }))._status === 400, 'rps join needs a hand');
  a0 = real('alice'); b0 = real('bob');
  r = await B('POST', '/api/pvp/join', { id: r.match.id, choice: 'R' });
  ok(r.match.status === 'done' && !r.match.winner && real('alice') === a0 + 300 && real('bob') === b0, 'rock vs rock: tie refunds both stakes');
  r = await A('POST', '/api/pvp/create', { game: 'rps', mode: 'real', stake: 3, choice: 'R' });
  r = await B('POST', '/api/pvp/join', { id: r.match.id, choice: 'P' });
  ok(r.match.winner === 'bob', 'paper beats rock');

  console.log('blackjack duel');
  for (let g = 0; g < 5; g++) {
    tot0 = real('carol') + real('dave');
    r = await Cc('POST', '/api/pvp/create', { game: 'bj', mode: 'real', stake: 4 });
    const id = r.match.id;
    r = await D('POST', '/api/pvp/join', { id });
    if (r.match.status === 'playing') {
      ok(r.match.you && r.match.you.cards.length === 2 && r.match.duel[0].shown.length === 1, 'each player sees their own hand and one opponent card');
      const mc = (await Cc('GET', '/api/pvp/match?id=' + id)).match;
      if (!mc.you.done) await Cc('POST', '/api/pvp/act', { id, action: mc.you.total < 15 ? 'hit' : 'stand' });
      if (g === 0) { advance(31000); } else { const md = (await D('GET', '/api/pvp/match?id=' + id)).match; if (md.status === 'playing' && !md.you.done) await D('POST', '/api/pvp/act', { id, action: 'stand' }); }
      advance(31000);
    }
    const m = (await Cc('GET', '/api/pvp/match?id=' + id)).match;
    const won = !!m.winner;
    ok(m.status === 'done' && real('carol') + real('dave') === tot0 - (won ? 40 : 0), `duel settled (${m.result.text}); only the rake leaves the players`);
    const { tc, tj } = m.result;
    const nat = (cards, t) => cards.length === 2 && t === 21;
    if (tc <= 21 && tj <= 21 && tc !== tj && !nat(m.result.c, tc) && !nat(m.result.j, tj)) ok((tc > tj) === (m.winner === 'carol'), 'higher total wins');
  }

  console.log('cool-off blocks PvP');
  await D('POST', '/api/rg/cooloff', { days: 1 });
  r = await A('POST', '/api/pvp/create', { game: 'coinflip', mode: 'real', stake: 1, choice: 'T' });
  ok((await D('POST', '/api/pvp/join', { id: r.match.id }))._status === 400 && (await D('POST', '/api/pvp/create', { game: 'dice', mode: 'real', stake: 1 }))._status === 400, 'a player on a break cannot create or join real matches');
  await A('POST', '/api/pvp/cancel', { id: r.match.id });

  console.log('live blackjack table');
  const tid = 'demo-low';
  const startD = { alice: demo('alice'), bob: demo('bob'), carol: demo('carol') };
  for (const [c, n] of [[A, 0], [B, 2], [Cc, 4]]) ok((await c('POST', '/api/bjt/sit', { id: tid, seat: n })).table, 'sat at seat ' + (n + 1));
  ok((await B('POST', '/api/bjt/sit', { id: tid, seat: 1 }))._status === 400, 'one seat per player');
  ok((await A('POST', '/api/bjt/bet', { id: tid, amount: 0.5 }))._status === 400, 'bet below the table minimum refused');
  let paid = 0, staked = 0, hands = 0;
  for (let round = 0; round < 8; round++) { // under the 10-bets-per-10-seconds anti-spam limit
    await A('POST', '/api/bjt/bet', { id: tid, amount: 10 });
    await B('POST', '/api/bjt/bet', { id: tid, amount: 20 });
    let t = (await A('GET', '/api/bjt/table?id=' + tid)).table;
    ok(t.phase === 'betting' && t.deadline > T, 'betting window open while carol decides');
    if (round % 3 === 2) advance(11000); else await Cc('POST', '/api/bjt/bet', { id: tid, amount: 5 }); // every third hand carol sits out
    t = (await A('GET', '/api/bjt/table?id=' + tid)).table;
    ok(t.phase !== 'betting' && (t.phase === 'settled' || t.dealer[1] === null), 'dealt; dealer hole card hidden while players act');
    let guard = 0;
    while (t.phase === 'playing' && guard++ < 30) {
      const s = t.seats[t.turn], who = { alice: A, bob: B, carol: Cc }[s.name];
      const other = Object.values({ alice: A, bob: B, carol: Cc }).find((c) => c !== who);
      if (guard === 1) ok((await other('POST', '/api/bjt/act', { id: tid, action: 'hit' }))._status === 400, 'acting out of turn refused');
      if (s.name === 'bob' && round === 4) { advance(21000); } // bob times out: auto-stand
      else await who('POST', '/api/bjt/act', { id: tid, action: s.cards.length === 2 && s.total === 11 ? 'double' : s.total < 16 ? 'hit' : 'stand' });
      t = (await A('GET', '/api/bjt/table?id=' + tid)).table;
    }
    ok(t.phase === 'settled', 'hand settled: dealer ' + t.dealerTotal + ' — ' + t.seats.filter(Boolean).map((s) => `${s.name} ${s.total ?? '-'} ${s.result || 'out'}`).join(', '));
    for (const s of t.seats.filter((x) => x && x.result)) {
      const exp = { 'Win': 2, 'Push': 1, 'Blackjack!': 2.5 }[s.result] || 0;
      ok(Math.abs(s.payout - s.bet * exp) < 0.011, `${s.name}: ${s.result} pays ${exp}× (bet ${s.bet}, paid ${s.payout})`);
      paid += Math.round(s.payout * 100); staked += Math.round(s.bet * 100); hands++;
    }
    advance(5100);
  }
  const delta = ['alice', 'bob', 'carol'].reduce((s, n) => s + demo(n) - startD[n], 0);
  ok(delta === paid - staked, `balances moved by exactly payouts − stakes over ${hands} hands`);
  ok(q("SELECT COUNT(*) n FROM rounds WHERE game = 'bjt' AND status = 'done'").get().n === hands, 'each hand is a finished round in the ledger');

  console.log('leaving and restarts');
  let c0 = demo('carol');
  await Cc('POST', '/api/bjt/bet', { id: tid, amount: 5 });
  ok((await Cc('POST', '/api/bjt/leave', { id: tid })).ok && demo('carol') === c0, 'leaving before the deal refunds the bet');
  await A('POST', '/api/bjt/leave', { id: tid }); await B('POST', '/api/bjt/leave', { id: tid });
  ok(!(await A('GET', '/api/bjt/table?id=' + tid)).table.seats.some(Boolean), 'everyone left');
  const did = idOf('dave');
  require('../server/db').debit(did, 'demo', 700, 'bet:bjt');
  q("INSERT INTO rounds (user_id, mode, game, status, wager, payout, created, updated) VALUES (?, 'demo', 'bjt', 'active', 700, 0, ?, ?)").run(did, T, T);
  const d0 = demo('dave');
  ok(multi.refundOrphanBets() === 1 && demo('dave') === d0 + 700, 'a hand cut off by a restart is refunded');

  server.close(); fs.rmSync(dir, { recursive: true, force: true });
  if (fails) { console.log(`MULTIPLAYER TEST FAILED (${fails})`); process.exit(1); }
  console.log('MULTIPLAYER TEST OK'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
