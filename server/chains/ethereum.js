/* Ethereum (ETH). Keys: BIP-44 m/44'/60'/0'/0/i from the master seed (index 0 = hot wallet, n = deposit address row n).
 * Deposits are detected from balances read ETH_CONFIRMATIONS blocks behind the head, so a deposit is only credited
 * once it is that deep. Inflow = balance + everything already swept out, minus what was already recorded. */
'use strict';
const { ethers } = require('ethers');
const cfg = require('../config');

const CHAIN_ID = cfg.TESTNET ? 11155111 : 1; // Sepolia / mainnet
const provider = new ethers.JsonRpcProvider(cfg.ETH_RPC_URL, CHAIN_ID, { staticNetwork: true, batchMaxCount: 20 });
const GWEI = 1_000_000_000n;
let base = null; const cache = new Map();
function walletAt(i) {
  if (!base) base = ethers.HDNodeWallet.fromSeed(cfg.MASTER_SEED).derivePath("m/44'/60'/0'/0");
  if (!cache.has(i)) { if (cache.size > 5000) cache.clear(); cache.set(i, base.deriveChild(i)); }
  return cache.get(i);
}
const addressAt = (i) => walletAt(i).address;
const hotAddress = () => addressAt(0);
// ethers.isAddress also rejects mixed-case addresses with a wrong checksum
const isValidAddress = (a) => { try { return ethers.isAddress(String(a)) && ethers.getAddress(String(a)) !== ethers.ZeroAddress; } catch { return false; } };

/** New inflow in gwei since what was already recorded. `row.seenGwei` / `row.outWei` come from the payments engine. */
async function scan(row) {
  const head = await provider.getBlockNumber(), at = head - cfg.ETH_CONFIRMATIONS;
  if (at <= 0) return { found: [], cursor: row.cursor };
  const wei = await provider.getBalance(row.address, at);
  const inflow = wei + BigInt(row.outWei || '0') - BigInt(row.seenGwei || 0) * GWEI;
  const gwei = inflow / GWEI;
  // anything under 1000 gwei is rounding dust from earlier sweeps, not a deposit
  return { found: gwei >= 1000n ? [{ asset: 'ETH', txid: `${row.address.toLowerCase()}@${at}`, base: Number(gwei) }] : [], cursor: String(at) };
}
async function fees() {
  const f = await provider.getFeeData();
  const tip = f.maxPriorityFeePerGas || 1_000_000_000n, max = f.maxFeePerGas || (f.gasPrice || 30_000_000_000n) * 2n;
  return { maxFeePerGas: max, maxPriorityFeePerGas: tip };
}
async function gasFor(from, to) { try { return await provider.estimateGas({ from, to, value: 1n }); } catch { return 21000n; } }
async function sign(wallet, to, value, nonce, gasLimit, f) {
  f = f || (await fees()); gasLimit = gasLimit || (await gasFor(wallet.address, to));
  const tx = ethers.Transaction.from({ type: 2, chainId: CHAIN_ID, to, value, nonce, gasLimit, ...f });
  const raw = await wallet.signTransaction(tx);
  return { txid: ethers.Transaction.from(raw).hash, raw };
}
const balance = async (asset, addr) => Number((await provider.getBalance(addr, 'latest')) / GWEI);
const hotBalance = () => balance('ETH', hotAddress());

/** Signed withdrawal from the hot wallet. `ctx.nonce` lets one pass send several without reusing a nonce. */
async function buildSend(asset, dest, gwei, ctx = {}) {
  const w = walletAt(0);
  const nonce = ctx.nonce ?? (await provider.getTransactionCount(w.address, 'pending'));
  const s = await sign(w, ethers.getAddress(dest), BigInt(gwei) * GWEI, nonce);
  if (ctx) ctx.nonce = nonce + 1;
  return { txid: s.txid, raw: s.raw, meta: { nonce, raw: s.raw } };
}
/** Signed sweep of a deposit address: everything minus the gas it costs. */
async function buildSweep(row, asset, dest) {
  const w = walletAt(row.id), to = ethers.getAddress(dest), wei = await provider.getBalance(row.address, 'latest');
  const f = await fees(), gasLimit = await gasFor(row.address, to), cost = gasLimit * f.maxFeePerGas;
  if (wei <= cost * 4n) return null; // not worth the gas yet
  const nonce = await provider.getTransactionCount(row.address, 'pending'), value = wei - cost;
  const s = await sign(w, to, value, nonce, gasLimit, f);
  return { txid: s.txid, raw: s.raw, base: Number(value / GWEI), meta: { valueWei: value.toString(), nonce, raw: s.raw } };
}
const broadcast = (raw) => provider.broadcastTransaction(raw);
/** Withdrawal / sweep status. Sweeps report the exact wei that left (value + gas) once final, for the deposit maths. */
async function txStatus(txid, meta = {}, from = hotAddress()) {
  const r = await provider.getTransactionReceipt(txid);
  if (r) {
    if (r.status === 0) return { state: 'failed', note: 'Transaction reverted on-chain' };
    const head = await provider.getBlockNumber(), deep = head - r.blockNumber + 1 >= cfg.ETH_CONFIRMATIONS;
    const out = BigInt(meta.valueWei || 0) + r.gasUsed * (r.gasPrice || r.effectiveGasPrice || 0n);
    return { state: 'sent', final: deep, outWei: out.toString(), block: r.blockNumber };
  }
  const mined = await provider.getTransactionCount(from, 'latest');
  if (meta.nonce != null && mined > meta.nonce) return { state: 'expired', note: 'Replaced or dropped (nonce already used)' };
  if (meta.raw && !(await provider.getTransaction(txid))) { try { await broadcast(meta.raw); } catch { /* already known or will retry */ } }
  return { state: 'pending' };
}
const explorer = (txid) => `https://${cfg.TESTNET ? 'sepolia.' : ''}etherscan.io/tx/${txid}`;
const FEE_BASE = { ETH: 1_050_000 }; // gwei kept back for gas when checking the hot wallet can pay (21000 gas at 50 gwei)

module.exports = { provider, chain: 'ethereum', assets: ['ETH'], addressAt, hotAddress, isValidAddress, scan, hotBalance, balance, buildSend, buildSweep, broadcast, txStatus, explorer, FEE_BASE, walletAt };
