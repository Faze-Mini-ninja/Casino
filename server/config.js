/* All configuration comes from environment variables (or a .env file in the project root). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => { const v = Number(env(k, d)); if (!isFinite(v)) throw new Error(`${k} must be a number`); return v; };

const cluster = env('SOLANA_CLUSTER', 'devnet');
const DATA_DIR = env('DATA_DIR', path.join(ROOT, 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });

// Master seed: every deposit wallet and the hot wallet are derived from it.
let seedHex = env('MASTER_SEED', '');
if (!seedHex) {
  if (cluster === 'mainnet-beta') throw new Error('MASTER_SEED must be set explicitly on mainnet (run: npm run gen-seed).');
  const f = path.join(DATA_DIR, 'devnet-master-seed.hex');
  if (!fs.existsSync(f)) { fs.writeFileSync(f, crypto.randomBytes(64).toString('hex'), { mode: 0o600 }); console.warn(`[config] Generated a devnet master seed at ${f}`); }
  seedHex = fs.readFileSync(f, 'utf8').trim();
}
if (!/^[0-9a-f]{64,128}$/i.test(seedHex)) throw new Error('MASTER_SEED must be 32–64 bytes of hex');

if (cluster === 'mainnet-beta' && env('REAL_MONEY_ACKNOWLEDGED', '') !== 'yes') {
  throw new Error('Refusing to start on mainnet: set REAL_MONEY_ACKNOWLEDGED=yes only once you hold a gambling licence (or legal sign-off) for every jurisdiction you accept players from, with KYC/AML and geo-blocking in place.');
}

module.exports = {
  ROOT, DATA_DIR,
  PORT: num('PORT', 8080),
  HOST: env('HOST', '0.0.0.0'),
  DB_FILE: env('DB_FILE', path.join(DATA_DIR, 'casino.db')),
  cluster,
  RPC_URL: env('RPC_URL', cluster === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : `https://api.${cluster}.solana.com`),
  MASTER_SEED: Buffer.from(seedHex, 'hex'),
  TREASURY_ADDRESS: env('TREASURY_ADDRESS', ''), // cold wallet (public key only). Empty = keep everything in the hot wallet.
  CREDITS_PER_SOL: num('CREDITS_PER_SOL', 1000), // 1 credit = 0.001 SOL by default
  HOT_FLOAT_SOL: num('HOT_FLOAT_SOL', 5), // keep this much in the hot wallet for withdrawals, sweep the rest to treasury
  MIN_DEPOSIT_SOL: num('MIN_DEPOSIT_SOL', 0.01),
  SWEEP_MIN_SOL: num('SWEEP_MIN_SOL', 0.002),
  ADDRESS_WATCH_DAYS: num('ADDRESS_WATCH_DAYS', 30), // keep crediting deposits to older daily addresses for this long
  MIN_WITHDRAW_SOL: num('MIN_WITHDRAW_SOL', 0.01),
  WITHDRAW_FEE_SOL: num('WITHDRAW_FEE_SOL', 0.000005),
  AUTO_APPROVE_SOL: num('AUTO_APPROVE_SOL', 0.5), // withdrawals up to this are sent automatically…
  AUTO_APPROVE_DAILY_SOL: num('AUTO_APPROVE_DAILY_SOL', 2), // …until a player's 24h total passes this; larger needs admin approval
  MAX_BET_CREDITS: num('MAX_BET_CREDITS', 10000),
  DEMO_START_CREDITS: num('DEMO_START_CREDITS', 10000),
  WATCH_INTERVAL_MS: num('WATCH_INTERVAL_MS', 15000),
  CHAIN_ENABLED: env('CHAIN_ENABLED', 'true') === 'true',
  PLAY_RATE_PER_5S: num('PLAY_RATE_PER_5S', 40), // max game actions per player per 5 seconds
  ADMIN_USERNAME: env('ADMIN_USERNAME', ''), // this account is created/updated at startup and is the admin
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', ''),
  SHOW_ODDS: env('SHOW_ODDS', 'false') === 'true', // show house edges / RTP / win probabilities to players
  TRUST_PROXY: env('TRUST_PROXY', 'false') === 'true', // set true behind a reverse proxy (for per-IP rate limits)
  COOKIE_SECURE: env('COOKIE_SECURE', cluster === 'mainnet-beta' ? 'true' : 'false') === 'true',
};
