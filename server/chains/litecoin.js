/* Litecoin (LTC), native SegWit addresses (ltc1…). Keys: BIP-84 m/84'/2'/0'/0/i from the master seed (coin type 1 on
 * testnet); index 0 = hot wallet, n = deposit address row n. Chain data comes from an Esplora API (litecoinspace.org
 * by default). A deposit is credited once it has LTC_CONFIRMATIONS confirmations. */
'use strict';
const { HDKey } = require('@scure/bip32');
const btc = require('@scure/btc-signer');
const cfg = require('../config');

const NET = cfg.TESTNET ? { bech32: 'tltc', pubKeyHash: 0x6f, scriptHash: 0x3a, wif: 0xef } : { bech32: 'ltc', pubKeyHash: 0x30, scriptHash: 0x32, wif: 0xb0 };
const API = cfg.LTC_API_URL.replace(/\/$/, '');
let root = null; const cache = new Map();
function keyAt(i) {
  if (!root) root = HDKey.fromMasterSeed(cfg.MASTER_SEED).derive(`m/84'/${cfg.TESTNET ? 1 : 2}'/0'/0`);
  if (!cache.has(i)) { if (cache.size > 5000) cache.clear(); const k = root.deriveChild(i); cache.set(i, { priv: k.privateKey, pub: k.publicKey, pay: btc.p2wpkh(k.publicKey, NET) }); }
  return cache.get(i);
}
const addressAt = (i) => keyAt(i).pay.address;
const hotAddress = () => addressAt(0);
function isValidAddress(a) { try { btc.Address(NET).decode(String(a)); return true; } catch { return false; } }

async function api(path, opts = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(API + path, { ...opts, signal: ctl.signal });
    const text = await r.text();
    if (!r.ok) { const e = new Error(text || 'HTTP ' + r.status); e.status = r.status; throw e; }
    return /^[[{]/.test(text.trim()) ? JSON.parse(text) : text.trim();
  } finally { clearTimeout(t); }
}
const tip = async () => Number(await api('/blocks/tip/height'));
async function allTxs(addr) {
  const first = await api(`/address/${addr}/txs`);
  const out = first.slice();
  let chain = first.filter((t) => t.status.confirmed);
  while (chain.length >= 25) { chain = await api(`/address/${addr}/txs/chain/${chain[chain.length - 1].txid}`); out.push(...chain); }
  return out.reverse();
}
/** Confirmed incoming payments (txid = deposit id); outgoing (our sweeps) are reported with base 0. */
async function scan(row) {
  const height = await tip(), found = [];
  for (const t of await allTxs(row.address)) {
    if (!t.status.confirmed || height - t.status.block_height + 1 < cfg.LTC_CONFIRMATIONS) continue;
    const fromUs = t.vin.some((v) => v.prevout && v.prevout.scriptpubkey_address === row.address);
    const value = t.vout.filter((o) => o.scriptpubkey_address === row.address).reduce((s, o) => s + o.value, 0);
    found.push({ asset: 'LTC', txid: t.txid, base: fromUs ? 0 : value, outgoing: fromUs });
  }
  return { found, cursor: row.cursor };
}
async function utxos(addr, minConf = 1) {
  const height = await tip();
  return (await api(`/address/${addr}/utxo`)).filter((u) => (minConf === 0 || (u.status.confirmed && height - u.status.block_height + 1 >= minConf)));
}
const balance = async (asset, addr) => (await utxos(addr, 0)).reduce((s, u) => s + u.value, 0);
const hotBalance = () => balance('LTC', hotAddress());
async function feeRate() { try { const f = await api('/v1/fees/recommended'); return Math.max(2, Math.ceil(f.halfHourFee || f.fastestFee || 10)); } catch { return 10; } }
const vsize = (ins, outs) => Math.ceil(10.5 + ins * 68 + outs * 31);
function signTx(inputs, key, outputs) {
  const tx = new btc.Transaction();
  inputs.forEach((u) => tx.addInput({ txid: u.txid, index: u.vout, witnessUtxo: { script: key.pay.script, amount: BigInt(u.value) } }));
  outputs.forEach(([addr, v]) => tx.addOutputAddress(addr, BigInt(v), NET));
  tx.sign(key.priv); tx.finalize();
  return { txid: tx.id, raw: tx.hex };
}
const DUST = 1000;
/** Signed withdrawal from the hot wallet; `ctx.used` holds outpoints already spent this pass. */
async function buildSend(asset, dest, litoshi, ctx = {}) {
  const key = keyAt(0), rate = await feeRate();
  ctx.used = ctx.used || new Set();
  const pool = (await utxos(key.pay.address, 1)).filter((u) => !ctx.used.has(u.txid + ':' + u.vout)).sort((a, b) => b.value - a.value);
  const pick = []; let sum = 0;
  for (const u of pool) { pick.push(u); sum += u.value; if (sum >= litoshi + vsize(pick.length, 2) * rate) break; }
  const fee = vsize(pick.length, 2) * rate;
  if (sum < litoshi + fee) { const e = new Error('Waiting for hot wallet funds'); e.funds = true; throw e; }
  const change = sum - litoshi - fee;
  const s = signTx(pick, key, change > DUST ? [[dest, litoshi], [key.pay.address, change]] : [[dest, litoshi]]);
  pick.forEach((u) => ctx.used.add(u.txid + ':' + u.vout));
  return { ...s, meta: { raw: s.raw, at: Date.now() } };
}
/** Signed sweep of every confirmed coin on a deposit address. */
async function buildSweep(row, asset, dest) {
  const key = keyAt(row.id), list = await utxos(row.address, cfg.LTC_CONFIRMATIONS);
  if (!list.length) return null;
  const total = list.reduce((s, u) => s + u.value, 0), fee = vsize(list.length, 1) * (await feeRate()), value = total - fee;
  if (value < 10 * DUST) return null;
  return { ...signTx(list, key, [[dest, value]]), base: value, meta: {} };
}
const broadcast = (raw) => api('/tx', { method: 'POST', body: raw, headers: { 'content-type': 'text/plain' } });
async function txStatus(txid, meta = {}) {
  try {
    const st = await api(`/tx/${txid}/status`);
    if (st.confirmed) { const deep = (await tip()) - st.block_height + 1 >= cfg.LTC_CONFIRMATIONS; return { state: 'sent', final: deep }; }
    return { state: 'pending' };
  } catch (e) {
    if (e.status !== 404 || !meta.raw) return { state: 'pending' };
    try { await broadcast(meta.raw); return { state: 'pending' }; } // dropped from mempool: send it again
    catch (b) { return /missingorspent|missing inputs|bad-txns-inputs/i.test(b.message) ? { state: 'expired', note: 'Inputs were spent elsewhere; never confirmed' } : { state: 'pending' }; }
  }
}
const explorer = (txid) => `https://litecoinspace.org/${cfg.TESTNET ? 'testnet/' : ''}tx/${txid}`;
const FEE_BASE = { LTC: 0 };

module.exports = { chain: 'litecoin', assets: ['LTC'], addressAt, hotAddress, isValidAddress, scan, hotBalance, balance, buildSend, buildSweep, broadcast, txStatus, explorer, FEE_BASE, NET };
