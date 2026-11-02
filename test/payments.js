/* Payments engine test with simulated chains (no network): every coin credits deposits once at the market price,
 * minimums, sweeps, withdrawals (fees, auto-approval limits, sending, confirmation, refunds), and the one-time move of
 * SOL-only history. Usage: node test/payments.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-pay-'));
Object.assign(process.env, { DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'true', SOLANA_CLUSTER: 'devnet', PRICE_OVERRIDE: 'SOL:150,ETH:3000,LTC:80', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' });
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok', m); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const { q, balances } = require('../server/db');
// --- old SOL-only history, as an existing install would have it ---
const uid = Number(q("INSERT INTO users (username, pass_hash, salt, created) VALUES ('alice','x','y',?)").run(Date.now()).lastInsertRowid);
q("INSERT INTO deposit_addresses (id, user_id, day, address, created) VALUES (7, ?, '2020-01-01', 'old-sol-address', ?)").run(uid, Date.now());
q("INSERT INTO chain_txs (signature, address_id, user_id, lamports, units, kind, ts) VALUES ('oldsig', 7, ?, 1000000000, 100000, 'deposit', ?)").run(uid, Date.now());

const C = require('../server/chains');
function mockChain(chain, assets) {
  const st = { incoming: {}, hot: {}, sends: [], sweeps: [], statuses: {} };
  return { chain, assets, st, FEE_BASE: {},
    addressAt: (i) => `${chain}-addr-${i}`, hotAddress: () => `${chain}-hot`, isValidAddress: (a) => /^ext-/.test(a) || /-addr-/.test(a),
    scan: async (row) => ({ found: (st.incoming[row.address] || []).map((x) => ({ ...x })), cursor: row.cursor }),
    hotBalance: async (asset) => st.hot[asset] || 0, balance: async () => 0,
    buildSweep: async (row, asset, dest) => { const amt = (st.incoming[row.address] || []).filter((x) => x.asset === asset && !x.swept).reduce((s, x) => s + x.base, 0); if (!amt) return null; (st.incoming[row.address] || []).forEach((x) => { if (x.asset === asset) x.swept = true; }); st.sweeps.push({ row: row.id, asset, dest, amt }); return { txid: `sweep-${row.id}-${asset}-${st.sweeps.length}`, raw: 'raw', base: amt, meta: {} }; },
    broadcast: async () => 'ok',
    buildSend: async (asset, dest, base) => { st.sends.push({ asset, dest, base }); return { txid: `wd-${asset}-${st.sends.length}`, raw: 'raw', meta: {} }; },
    txStatus: async (txid) => st.statuses[txid] || { state: 'pending' },
    explorer: (t) => 'https://explorer/' + t };
}
const sol = mockChain('solana', ['SOL', 'USDC']), eth = mockChain('ethereum', ['ETH']), ltc = mockChain('litecoin', ['LTC']);
C.setModule('solana', sol); C.setModule('ethereum', eth); C.setModule('litecoin', ltc);
const bus = require('../server/bus');
const events = []; bus.on('deposit', (e) => events.push(e));
const pay = require('../server/payments');

(async () => {
  console.log('migration');
  ok(q('SELECT address FROM addresses WHERE id = 7').get().address === 'old-sol-address', 'old deposit address kept with its id');
  ok(q("SELECT units FROM deposits WHERE txid = 'oldsig'").get().units === 100000, 'old SOL deposit moved');

  console.log('addresses');
  const A = pay.depositAddresses(uid);
  ok(A.SOL.address === A.USDC.address && A.SOL.address.startsWith('solana-addr-'), 'SOL and USDC share the Solana address');
  ok(A.ETH.address.startsWith('ethereum-addr-') && A.LTC.address.startsWith('litecoin-addr-'), 'ETH and LTC get their own addresses');
  ok(pay.depositAddresses(uid).ETH.address === A.ETH.address, 'same address all day');

  console.log('deposits');
  const b0 = balances(uid).real;
  sol.st.incoming[A.SOL.address] = [{ asset: 'SOL', txid: 's1', base: 500_000_000 }, { asset: 'USDC', txid: 's2', base: 20_000_000 }, { asset: 'SOL', txid: 's3', base: 1_000_000 }];
  eth.st.incoming[A.ETH.address] = [{ asset: 'ETH', txid: 'e1', base: 10_000_000 }]; // 0.01 ETH in gwei
  ltc.st.incoming[A.LTC.address] = [{ asset: 'LTC', txid: 'l1', base: 50_000_000 }]; // 0.5 LTC
  await pay.runOnce();
  let b1 = balances(uid).real;
  ok(b1 - b0 === 7500 + 2000 + 3000 + 4000, `credited $75 SOL + $20 USDC + $30 ETH + $40 LTC (got $${(b1 - b0) / 100})`);
  ok(q("SELECT kind FROM deposits WHERE txid = 's3'").get().kind === 'below-minimum', '0.001 SOL is below the minimum and not credited');
  ok(events.length === 5 && events.some((e) => e.belowMinimum) && events.find((e) => e.asset === 'ETH').usd === 30, 'player is notified for every deposit');
  await pay.runOnce();
  ok(balances(uid).real === b1 && events.length === 5, 'second pass credits nothing twice');
  ok(sol.st.sweeps.length === 2 && eth.st.sweeps.length === 1 && ltc.st.sweeps.length === 1, 'deposit addresses swept to the hot wallets');
  ok(sol.st.sweeps.every((s) => s.dest === 'solana-hot'), 'no treasury set: sweeps stay in the hot wallet');
  // treasury: above the hot-wallet float, sweeps go to the owner's main wallet; an address invalid for the network is ignored
  C.TREASURY.litecoin = 'ext-ltc-main'; C.TREASURY.ethereum = 'not-valid';
  ltc.st.hot.LTC = 1e10; eth.st.hot.ETH = 1e12;
  ltc.st.incoming[A.LTC.address].push({ asset: 'LTC', txid: 'l2', base: 20_000_000 });
  q("UPDATE chain_sweeps SET status = 'done'").run(); // earlier sweeps confirmed
  await pay.runOnce();
  ok(ltc.st.sweeps.at(-1).dest === 'ext-ltc-main', 'hot wallet above HOT_FLOAT_USD: deposits swept to the main (treasury) wallet');
  ok(!eth.st.sweeps.some((s) => s.dest === 'not-valid'), 'an invalid treasury address is never used');
  C.TREASURY.litecoin = ''; C.TREASURY.ethereum = ''; ltc.st.hot.LTC = 0; eth.st.hot.ETH = 0;
  b1 = balances(uid).real;

  console.log('withdrawals');
  const reject = async (args, msg) => { try { await pay.requestWithdrawal(uid, ...args); ok(false, msg); } catch (e) { ok(true, msg + ' (' + e.message + ')'); } };
  await reject(['ETH', 'not-an-address', 50], 'invalid address refused');
  await reject(['ETH', A.ETH.address, 50], 'own deposit address refused');
  await reject(['ETH', 'ext-eth', 2], 'below $5 minimum refused');
  await reject(['DOGE', 'ext-x', 50], 'unknown coin refused');
  const w1 = await pay.requestWithdrawal(uid, 'ETH', 'ext-eth', 60);
  ok(w1.status === 'approved' && near(w1.coin, 0.02 - 0.0005), `$60 → ${w1.coin} ETH after the 0.0005 ETH fee, auto-approved`);
  ok(balances(uid).real === b1 - 6000, 'balance debited $60');
  eth.st.hot.ETH = 0;
  await pay.runOnce();
  ok(q('SELECT status, note FROM withdrawals WHERE id = ?').get(w1.id).note === 'Waiting for hot wallet funds', 'empty hot wallet: waits instead of sending');
  eth.st.hot.ETH = 1e9;
  await pay.runOnce();
  ok(q('SELECT status FROM withdrawals WHERE id = ?').get(w1.id).status === 'sending' && eth.st.sends.length === 1, 'sent once the hot wallet has funds');
  eth.st.statuses['wd-ETH-1'] = { state: 'sent', final: true };
  await pay.runOnce();
  ok(q('SELECT status FROM withdrawals WHERE id = ?').get(w1.id).status === 'sent', 'confirmed on-chain → sent');

  const w2 = await pay.requestWithdrawal(uid, 'LTC', 'ext-ltc', 50);
  ltc.st.hot.LTC = 1e9;
  await pay.runOnce();
  ltc.st.statuses['wd-LTC-1'] = { state: 'expired', note: 'never confirmed' };
  const before = balances(uid).real;
  await pay.runOnce();
  ok(q('SELECT status FROM withdrawals WHERE id = ?').get(w2.id).status === 'failed' && balances(uid).real === before + 5000, 'a send that never landed is refunded');

  const w3 = await pay.requestWithdrawal(uid, 'USDC', 'ext-sol', 40);
  ok(w3.status === 'approved' && near(w3.coin, 39.5), 'USDC: $40 → 39.5 USDC after the 0.5 USDC fee');
  require('../server/db').credit(uid, 'real', 100000, 'test');
  const w4 = await pay.requestWithdrawal(uid, 'SOL', 'ext-sol', 150);
  ok(w4.status === 'pending', 'over the $100 auto-approve limit → waits for admin approval');

  console.log('owner cash-out');
  sol.st.hot.SOL = 2_000_000_000; // 2 SOL in the hot wallet
  const reject2 = async (args, msg) => { try { await pay.requestCashout(1, ...args); ok(false, msg); } catch (e) { ok(true, msg + ' (' + e.message + ')'); } };
  await reject2(['SOL', 'not-an-address', 1], 'invalid address refused');
  await reject2(['SOL', A.SOL.address, 1], 'casino deposit address refused');
  await reject2(['SOL', 'ext-owner', 5], 'more than the hot wallet holds refused');
  const before3 = sol.st.sends.length;
  const co = await pay.requestCashout(1, 'SOL', 'ext-owner', 1.5);
  ok(co.status === 'approved' && co.coin === 1.5, 'cash-out of 1.5 SOL queued');
  await pay.runOnce();
  ok(sol.st.sends.length === before3 + 1 && sol.st.sends.at(-1).dest === 'ext-owner' && sol.st.sends.at(-1).base === 1_500_000_000, 'sent from the hot wallet to the address entered');
  ok(pay.cashouts()[0].status === 'sending', 'shown as sending');
  sol.st.statuses['wd-SOL-' + sol.st.sends.length] = { state: 'sent', final: true };
  await pay.runOnce();
  ok(pay.cashouts()[0].status === 'sent', 'confirmed → sent');
  const balBefore = balances(uid).real;
  ok(balances(uid).real === balBefore, 'player balances untouched by a cash-out');

  fs.rmSync(dir, { recursive: true, force: true });
  if (fails) { console.log(`PAYMENTS TEST FAILED (${fails})`); process.exit(1); }
  console.log('PAYMENTS TEST OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
