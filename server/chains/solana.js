/* Solana: SOL and USDC (SPL token). Both use the same daily deposit address (USDC lands in its associated token
 * account). Only finalized data is used for crediting. Keys: SLIP-0010 m/44'/501'/i'/0' (see wallet.js). */
'use strict';
const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const spl = require('@solana/spl-token');
const cfg = require('../config');
const { keypairAt, hotWallet } = require('../wallet');

const conn = new Connection(cfg.RPC_URL, { commitment: 'finalized' });
const FEE = 5000; // lamports per signature
const MINT = new PublicKey(cfg.USDC_MINT);
const bs58 = (() => { const m = require('bs58'); return m.default || m; })();

const addressAt = (i) => keypairAt(i).publicKey.toBase58();
const hotAddress = (asset) => hotWallet().publicKey.toBase58();
function isValidAddress(a) {
  try { const pk = new PublicKey(String(a)); return pk.toBase58() === String(a) && PublicKey.isOnCurve(pk.toBytes()); } catch { return false; }
}
const ata = (owner) => spl.getAssociatedTokenAddressSync(MINT, new PublicKey(owner), true);

async function sigsSince(addr, until) {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(addr), { limit: 100, until: until || undefined }, 'finalized');
  return sigs.reverse();
}
async function parsed(signature) { return conn.getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 }); }
const keysOf = (t) => t.transaction.message.accountKeys.map((k) => (k.pubkey ? k.pubkey.toBase58() : k.toBase58()));

/** Incoming SOL to the owner address and USDC to its token account, since the stored cursors.
 * Returns { found: [{asset, txid, base, failed?, outgoing?}], cursor }, or null if a tx isn't readable yet. */
async function scan(row) {
  const cur = JSON.parse(row.cursor || '{}'), found = [], next = { ...cur };
  // SOL on the wallet address
  for (const s of await sigsSince(row.address, cur.sol)) {
    if (s.err) { found.push({ asset: 'SOL', txid: s.signature, base: 0, failed: true }); next.sol = s.signature; continue; }
    const t = await parsed(s.signature); if (!t || !t.meta) return { found, cursor: next, partial: true };
    const i = keysOf(t).indexOf(row.address), delta = i < 0 ? 0 : t.meta.postBalances[i] - t.meta.preBalances[i];
    found.push({ asset: 'SOL', txid: s.signature, base: delta > 0 ? delta : 0, outgoing: delta <= 0 });
    next.sol = s.signature;
  }
  // USDC on the associated token account
  if (cfg.COINS.includes('USDC')) {
    const tokenAcc = ata(row.address).toBase58();
    for (const s of await sigsSince(tokenAcc, cur.usdc)) {
      if (s.err) { found.push({ asset: 'USDC', txid: s.signature, base: 0, failed: true }); next.usdc = s.signature; continue; }
      const t = await parsed(s.signature); if (!t || !t.meta) return { found, cursor: next, partial: true };
      const idx = keysOf(t).indexOf(tokenAcc);
      const amt = (list) => { const b = (list || []).find((x) => x.accountIndex === idx && x.mint === MINT.toBase58()); return b ? Number(b.uiTokenAmount.amount) : 0; };
      const delta = idx < 0 ? 0 : amt(t.meta.postTokenBalances) - amt(t.meta.preTokenBalances);
      found.push({ asset: 'USDC', txid: s.signature, base: delta > 0 ? delta : 0, outgoing: delta <= 0 });
      next.usdc = s.signature;
    }
  }
  return { found, cursor: next };
}

async function balance(asset, owner) {
  if (asset === 'SOL') return conn.getBalance(new PublicKey(owner), 'finalized');
  // a missing token account just means no USDC yet; any other error (RPC down) must not look like an empty wallet
  try { return Number((await conn.getTokenAccountBalance(ata(owner), 'finalized')).value.amount); } catch (e) { if (/could not find account|Invalid param/i.test(e.message)) return 0; throw e; }
}
const hotBalance = (asset) => balance(asset, hotAddress(asset));

async function signed(feePayer, signers, ixs) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized');
  const t = new Transaction({ feePayer: feePayer.publicKey, blockhash, lastValidBlockHeight });
  ixs.forEach((ix) => t.add(ix));
  t.sign(...signers);
  return { txid: bs58.encode(t.signature), meta: { lastValidBlockHeight }, raw: t.serialize() };
}
/** Signed withdrawal from the hot wallet (not broadcast yet, so the txid can be stored first). */
async function buildSend(asset, dest, base) {
  const hot = hotWallet();
  if (asset === 'SOL') return signed(hot, [hot], [SystemProgram.transfer({ fromPubkey: hot.publicKey, toPubkey: new PublicKey(dest), lamports: base })]);
  const to = ata(dest);
  return signed(hot, [hot], [spl.createAssociatedTokenAccountIdempotentInstruction(hot.publicKey, to, new PublicKey(dest), MINT),
    spl.createTransferCheckedInstruction(ata(hot.publicKey), MINT, to, hot.publicKey, BigInt(base), 6)]);
}
/** Signed sweep of a deposit address to `dest` (hot wallet or treasury); null if nothing worth sweeping. */
async function buildSweep(row, asset, dest) {
  const kp = keypairAt(row.id);
  if (asset === 'SOL') {
    const bal = await balance('SOL', row.address);
    if (bal < cfg.SWEEP_MIN_SOL * 1e9) return null;
    return { ...(await signed(kp, [kp], [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(dest), lamports: bal - FEE })])), base: bal - FEE };
  }
  const bal = await balance('USDC', row.address);
  if (bal < 1e5) return null; // under $0.10
  const hot = hotWallet(), src = ata(row.address), to = ata(dest);
  // the hot wallet pays the fee; closing the emptied token account returns its rent to the hot wallet
  return { ...(await signed(hot, [hot, kp], [spl.createAssociatedTokenAccountIdempotentInstruction(hot.publicKey, to, new PublicKey(dest), MINT),
    spl.createTransferCheckedInstruction(src, MINT, to, kp.publicKey, BigInt(bal), 6), spl.createCloseAccountInstruction(src, hot.publicKey, kp.publicKey)])), base: bal };
}
const broadcast = (raw) => conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 });
/** 'sent' | 'failed' | 'expired' | 'pending' */
async function txStatus(txid, meta) {
  const st = (await conn.getSignatureStatuses([txid], { searchTransactionHistory: true })).value[0];
  if (st && st.err) return { state: 'failed', note: 'Transaction failed on-chain: ' + JSON.stringify(st.err) };
  if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return { state: 'sent', final: st.confirmationStatus === 'finalized' };
  if (!st && meta && meta.lastValidBlockHeight && (await conn.getBlockHeight('finalized')) > meta.lastValidBlockHeight) return { state: 'expired', note: 'Transaction expired without landing' };
  return { state: 'pending' };
}
const explorer = (txid) => `https://explorer.solana.com/tx/${txid}${cfg.cluster === 'mainnet-beta' ? '' : '?cluster=' + cfg.cluster}`;
const FEE_BASE = { SOL: FEE, USDC: 0 }; // what the hot wallet spends per withdrawal in that asset

module.exports = { conn, MINT, chain: 'solana', assets: ['SOL', 'USDC'], addressAt, hotAddress, isValidAddress, scan, hotBalance, balance, buildSend, buildSweep, broadcast, txStatus, explorer, FEE_BASE, ata };
