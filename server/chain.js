/* Thin wrapper over Solana JSON-RPC (web3.js v1). Only finalized data is used for crediting. */
'use strict';
const { Connection, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const cfg = require('./config');

const conn = new Connection(cfg.RPC_URL, { commitment: 'finalized' });
const FEE = 5000; // lamports per signature

function isValidAddress(a) {
  try { const pk = new PublicKey(String(a)); return pk.toBase58() === String(a) && PublicKey.isOnCurve(pk.toBytes()); } catch { return false; }
}
const getBalance = (addr) => conn.getBalance(new PublicKey(addr), 'finalized');

/** New finalized signatures for an address, oldest first, stopping at `until`. */
async function newSignatures(addr, until) {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(addr), { limit: 100, until: until || undefined }, 'finalized');
  return sigs.reverse();
}
/** Net lamport change of `addr` in a transaction (null if the tx failed or can't be read). */
async function netChange(signature, addr) {
  const t = await conn.getParsedTransaction(signature, { commitment: 'finalized', maxSupportedTransactionVersion: 0 });
  if (!t || !t.meta) return null;
  if (t.meta.err) return { delta: 0, failed: true };
  const keys = t.transaction.message.accountKeys.map((k) => (k.pubkey ? k.pubkey.toBase58() : k.toBase58()));
  const i = keys.indexOf(addr);
  if (i < 0) return { delta: 0 };
  return { delta: t.meta.postBalances[i] - t.meta.preBalances[i], slot: t.slot, time: t.blockTime };
}
/** Sign a transfer. Returns the signature BEFORE broadcasting so it can be stored first. */
async function buildTransfer(fromKeypair, to, lamports) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('finalized');
  const t = new Transaction({ feePayer: fromKeypair.publicKey, blockhash, lastValidBlockHeight })
    .add(SystemProgram.transfer({ fromPubkey: fromKeypair.publicKey, toPubkey: new PublicKey(to), lamports }));
  t.sign(fromKeypair);
  const bs58 = require('bs58'); const enc = bs58.default || bs58;
  return { signature: enc.encode(t.signature), lastValidBlockHeight, raw: t.serialize() };
}
const broadcast = (raw) => conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 });
async function status(signature) {
  const r = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
  return r.value[0]; // null | {confirmationStatus, err}
}
const blockHeight = () => conn.getBlockHeight('finalized');

module.exports = { conn, FEE, isValidAddress, getBalance, newSignatures, netChange, buildTransfer, broadcast, status, blockHeight };
