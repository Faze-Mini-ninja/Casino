/* Chain modules against canned network answers (no network needed): Litecoin and Ethereum transactions are signed
 * correctly (right outputs, fee, chain id, signer), Ethereum deposit maths, Solana USDC deposits are read from token
 * balances and USDC withdrawals build a valid token transfer. Usage: node test/chains.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-chains-'));
Object.assign(process.env, { DATA_DIR: dir, DB_FILE: path.join(dir, 't.db'), SOLANA_CLUSTER: 'devnet', MASTER_SEED: '7'.repeat(128), LTC_CONFIRMATIONS: '3', ETH_CONFIRMATIONS: '12' });
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok', m); };

(async () => {
  /* ---------- Litecoin ---------- */
  console.log('litecoin');
  const btc = require('@scure/btc-signer');
  const ltc = require('../server/chains/litecoin');
  const dep = ltc.addressAt(5), hot = ltc.hotAddress();
  ok(dep.startsWith('tltc1q') && ltc.isValidAddress(dep) && !ltc.isValidAddress('ltc1qnotvalid') && !ltc.isValidAddress(require('../server/chains/ethereum').addressAt(1)), 'testnet bech32 addresses; garbage and other coins refused');
  const fake = (routes) => { global.fetch = async (url, opts = {}) => { const key = Object.keys(routes).find((k) => url.endsWith(k)); if (!key) return { ok: false, status: 404, text: async () => 'not found' }; const v = typeof routes[key] === 'function' ? routes[key](opts) : routes[key]; return { ok: true, status: 200, text: async () => (typeof v === 'string' ? v : JSON.stringify(v)) }; }; };
  const txid = (n) => n.repeat(64).slice(0, 64);
  fake({
    '/blocks/tip/height': '1000', '/v1/fees/recommended': { halfHourFee: 5 },
    [`/address/${dep}/utxo`]: [{ txid: txid('a'), vout: 0, value: 30_000_000, status: { confirmed: true, block_height: 990 } }, { txid: txid('b'), vout: 1, value: 20_000_000, status: { confirmed: true, block_height: 999 } }],
    [`/address/${dep}/txs`]: [
      { txid: txid('c'), status: { confirmed: true, block_height: 990 }, vin: [{ prevout: { scriptpubkey_address: 'someone' } }], vout: [{ scriptpubkey_address: dep, value: 30_000_000 }, { scriptpubkey_address: 'change', value: 5 }] },
      { txid: txid('d'), status: { confirmed: true, block_height: 999 }, vin: [{ prevout: { scriptpubkey_address: 'someone' } }], vout: [{ scriptpubkey_address: dep, value: 20_000_000 }] },
      { txid: txid('e'), status: { confirmed: true, block_height: 995 }, vin: [{ prevout: { scriptpubkey_address: dep } }], vout: [{ scriptpubkey_address: hot, value: 1 }] }],
    [`/address/${hot}/utxo`]: [{ txid: txid('f'), vout: 0, value: 100_000_000, status: { confirmed: true, block_height: 900 } }],
  });
  const sc = await ltc.scan({ address: dep, cursor: null });
  ok(sc.found.length === 2 && sc.found.find((f) => f.txid === txid('c')).base === 30_000_000 && sc.found.find((f) => f.txid === txid('e')).outgoing, '3-confirmation deposit found, too-recent one skipped, our sweep marked outgoing');
  const sw = await ltc.buildSweep({ id: 5, address: dep }, 'LTC', hot);
  const swTx = btc.Transaction.fromRaw(Uint8Array.from(Buffer.from(sw.raw, 'hex')));
  ok(swTx.inputsLength === 1 && swTx.getOutput(0).amount === 30_000_000n - BigInt(Math.ceil(10.5 + 68 + 31) * 5) && sw.base === Number(swTx.getOutput(0).amount), 'sweep spends only the confirmed coin, pays the fee from it');
  const send = await ltc.buildSend('LTC', dep, 40_000_000, {});
  const sTx = btc.Transaction.fromRaw(Uint8Array.from(Buffer.from(send.raw, 'hex')));
  const outs = [0, 1].map((i) => sTx.getOutput(i));
  ok(outs[0].amount === 40_000_000n && outs[1].amount === 100_000_000n - 40_000_000n - BigInt(Math.ceil(10.5 + 68 + 62) * 5) && send.txid === sTx.id, 'withdrawal: amount to player, change back to the hot wallet, txid matches');
  try { await ltc.buildSend('LTC', dep, 200_000_000, {}); ok(false, 'insufficient hot funds'); } catch (e) { ok(e.funds, 'withdrawal larger than the hot wallet waits for funds'); }

  /* ---------- Ethereum ---------- */
  console.log('ethereum');
  const { ethers } = require('ethers');
  const eth = require('../server/chains/ethereum');
  const P = eth.provider;
  const ref = ethers.HDNodeWallet.fromSeed(Buffer.from('7'.repeat(128), 'hex')).derivePath("m/44'/60'/0'/0/3").address;
  ok(eth.addressAt(3) === ref, 'addresses follow the standard m/44\'/60\'/0\'/0/i path (same as MetaMask/Trust)');
  ok(eth.isValidAddress(ref) && !eth.isValidAddress('0x' + '12'.repeat(20).replace(/2/g, 'G')) && !eth.isValidAddress(ethers.ZeroAddress), 'address checks');
  P.getBlockNumber = async () => 1000; P.getBalance = async (a, at) => (at === 988 ? 25_000_000_000_000_000n : 0n);
  const s1 = await eth.scan({ address: ref, cursor: null, seenGwei: 0, outWei: '0' });
  ok(s1.found.length === 1 && s1.found[0].base === 25_000_000 && s1.found[0].txid.endsWith('@988'), '0.025 ETH found, read 12 blocks behind the head');
  const s2 = await eth.scan({ address: ref, cursor: null, seenGwei: 25_000_000, outWei: '0' });
  ok(s2.found.length === 0, 'already-recorded inflow is not found again');
  P.getBalance = async () => 1_000_000_000n; // dust left after a sweep
  const s3 = await eth.scan({ address: ref, cursor: null, seenGwei: 25_000_000, outWei: (25_000_000_000_000_000n - 1_000_000_000n).toString() });
  ok(s3.found.length === 0, 'after a sweep (out + leftover = deposits) nothing new is found');
  P.getTransactionCount = async () => 7; P.getFeeData = async () => ({ maxFeePerGas: 20_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }); P.estimateGas = async () => 21000n;
  const ctx = {};
  const w = await eth.buildSend('ETH', ref, 12_345_678, ctx), t = ethers.Transaction.from(w.raw);
  ok(t.to === ref && t.value === 12_345_678n * 1_000_000_000n && t.chainId === 11155111n && t.nonce === 7 && t.from === eth.hotAddress() && t.hash === w.txid, 'withdrawal signed by the hot wallet for Sepolia with the right value and nonce');
  const w2 = await eth.buildSend('ETH', ref, 1, ctx);
  ok(ethers.Transaction.from(w2.raw).nonce === 8, 'second withdrawal in the same pass uses the next nonce');
  P.getBalance = async () => 50_000_000_000_000_000n;
  const sw2 = await eth.buildSweep({ id: 3, address: ref }, 'ETH', eth.hotAddress()), st = ethers.Transaction.from(sw2.raw);
  ok(st.from === ref && st.value === 50_000_000_000_000_000n - 21000n * 20_000_000_000n && sw2.meta.valueWei === st.value.toString(), 'sweep sends everything minus the gas budget');

  /* ---------- Solana USDC ---------- */
  console.log('solana usdc');
  const { Transaction, PublicKey } = require('@solana/web3.js');
  const sol = require('../server/chains/solana');
  const owner = sol.addressAt(4), ata = sol.ata(owner).toBase58(), mint = sol.MINT.toBase58();
  sol.conn.getSignaturesForAddress = async (pk) => (pk.toBase58() === ata ? [{ signature: 'usdcSig', err: null }] : []);
  sol.conn.getParsedTransaction = async () => ({ meta: { err: null, preTokenBalances: [{ accountIndex: 1, mint, uiTokenAmount: { amount: '0' } }], postTokenBalances: [{ accountIndex: 1, mint, uiTokenAmount: { amount: '25000000' } }], preBalances: [], postBalances: [] },
    transaction: { message: { accountKeys: [{ pubkey: new PublicKey(sol.hotAddress()) }, { pubkey: new PublicKey(ata) }] } } });
  const us = await sol.scan({ address: owner, cursor: null });
  ok(us.found.length === 1 && us.found[0].asset === 'USDC' && us.found[0].base === 25_000_000 && JSON.parse(JSON.stringify(us.cursor)).usdc === 'usdcSig', '25 USDC read from the token account balance change');
  sol.conn.getLatestBlockhash = async () => ({ blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 99 });
  const ws = await sol.buildSend('USDC', owner, 5_000_000), wt = Transaction.from(ws.raw);
  ok(wt.instructions.length === 2 && wt.instructions[1].programId.equals(require('@solana/spl-token').TOKEN_PROGRAM_ID) && wt.verifySignatures() && ws.meta.lastValidBlockHeight === 99, 'USDC withdrawal: creates the token account if needed, then a signed token transfer');
  ok(!sol.isValidAddress(ata), 'token account addresses are refused as withdrawal destinations (wallet address needed)');

  fs.rmSync(dir, { recursive: true, force: true });
  if (fails) { console.log(`CHAINS TEST FAILED (${fails})`); process.exit(1); }
  console.log('CHAINS TEST OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
