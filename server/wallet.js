/* HD key derivation (SLIP-0010 ed25519, Solana path m/44'/501'/i'/0' — same scheme as Phantom/solana-keygen).
 * Index 0 = hot wallet (pays withdrawals). Index n >= 1 = deposit address row n (one per player per UTC day). */
'use strict';
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');
const cfg = require('./config');

const HARDENED = 0x80000000;
function derive(seed, path) {
  let I = crypto.createHmac('sha512', 'ed25519 seed').update(seed).digest();
  let k = I.subarray(0, 32), c = I.subarray(32);
  for (const idx of path) {
    const data = Buffer.alloc(37);
    data[0] = 0; k.copy(data, 1); data.writeUInt32BE((idx | HARDENED) >>> 0, 33);
    I = crypto.createHmac('sha512', c).update(data).digest();
    k = I.subarray(0, 32); c = I.subarray(32);
  }
  return Buffer.from(k);
}
const cache = new Map();
function keypairAt(index, seed = cfg.MASTER_SEED) {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED) throw new Error('bad derivation index');
  if (seed === cfg.MASTER_SEED && cache.has(index)) return cache.get(index);
  const kp = Keypair.fromSeed(derive(seed, [44, 501, index, 0]));
  if (seed === cfg.MASTER_SEED) { if (cache.size > 5000) cache.clear(); cache.set(index, kp); }
  return kp;
}
module.exports = { derive, keypairAt, hotWallet: () => keypairAt(0) };
