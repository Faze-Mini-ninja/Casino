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
// Accept either hex (npm run gen-seed) or any long random string, e.g. Render's "Generate" value; the latter is
// stretched to 64 bytes with SHA-512 so the same value always gives the same wallets.
if (!/^[0-9a-f]{64,128}$/i.test(seedHex)) {
  if (seedHex.length < 32) throw new Error('MASTER_SEED must be 64–128 hex characters, or a random string of at least 32 characters');
  seedHex = crypto.createHash('sha512').update('krush-master-seed:' + seedHex).digest('hex');
}

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
  TESTNET: cluster !== 'mainnet-beta', // every coin uses its test network unless Solana is on mainnet
  // Balances are in dollars: 1 credit = $1. Deposits and withdrawals convert at the market price (server/prices.js).
  COINS: env('COINS', 'SOL,USDC,ETH,LTC').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean),
  PRICE_OVERRIDE: env('PRICE_OVERRIDE', ''), // e.g. SOL:150,ETH:3000,LTC:80 — tests/offline only
  USDC_MINT: env('USDC_MINT', cluster === 'mainnet-beta' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
  ETH_RPC_URL: env('ETH_RPC_URL', cluster === 'mainnet-beta' ? 'https://ethereum-rpc.publicnode.com' : 'https://ethereum-sepolia-rpc.publicnode.com'),
  ETH_CONFIRMATIONS: num('ETH_CONFIRMATIONS', 12),
  LTC_API_URL: env('LTC_API_URL', cluster === 'mainnet-beta' ? 'https://litecoinspace.org/api' : 'https://litecoinspace.org/testnet/api'),
  LTC_CONFIRMATIONS: num('LTC_CONFIRMATIONS', 3),
  // cold wallets (public addresses only). Empty = keep everything in that coin's hot wallet.
  TREASURY_ADDRESS: env('TREASURY_ADDRESS', ''), // Solana wallet: receives SOL and USDC
  TREASURY_ETH: env('TREASURY_ETH', ''),
  TREASURY_LTC: env('TREASURY_LTC', ''),
  HOT_FLOAT_USD: num('HOT_FLOAT_USD', 1000), // per coin: keep about this much in the hot wallet for withdrawals, sweep the rest to treasury
  MIN_DEPOSIT: { SOL: num('MIN_DEPOSIT_SOL', 0.01), USDC: num('MIN_DEPOSIT_USDC', 1), ETH: num('MIN_DEPOSIT_ETH', 0.002), LTC: num('MIN_DEPOSIT_LTC', 0.01) },
  WITHDRAW_FEE: { SOL: num('WITHDRAW_FEE_SOL', 0.000005), USDC: num('WITHDRAW_FEE_USDC', 0.5), ETH: num('WITHDRAW_FEE_ETH', 0.0005), LTC: num('WITHDRAW_FEE_LTC', 0.0002) }, // charged in the coin
  MIN_WITHDRAW_USD: num('MIN_WITHDRAW_USD', 5),
  DEPOSIT_FEE_PCT: num('DEPOSIT_FEE_PCT', 1),
  PVP_RAKE_PCT: num('PVP_RAKE_PCT', 5), // house share of the pot in player-vs-player games (winner gets the rest)
  PVP_MOVE_SECS: num('PVP_MOVE_SECS', 30), // blackjack duel: time per move before an automatic stand
  BJT_BET_SECS: num('BJT_BET_SECS', 12), // live blackjack: betting stays open this long after the first bet
  BJT_TURN_SECS: num('BJT_TURN_SECS', 20), // live blackjack: time per player turn before an automatic stand // % of each deposit's dollar value kept as a fee; the rest is credited
  SWEEP_MIN_SOL: num('SWEEP_MIN_SOL', 0.002),
  ADDRESS_WATCH_DAYS: num('ADDRESS_WATCH_DAYS', 30), // keep crediting deposits to older daily addresses for this long
  AUTO_APPROVE_USD: num('AUTO_APPROVE_USD', 100), // withdrawals up to this are sent automatically…
  AUTO_APPROVE_DAILY_USD: num('AUTO_APPROVE_DAILY_USD', 500), // …until a player's 24h total passes this; larger needs admin approval
  MAX_BET_CREDITS: num('MAX_BET_CREDITS', 10000),
  DEMO_START_CREDITS: num('DEMO_START_CREDITS', 1000),
  WATCH_INTERVAL_MS: num('WATCH_INTERVAL_MS', 15000),
  CHAIN_ENABLED: env('CHAIN_ENABLED', 'true') === 'true',
  PLAY_RATE_PER_5S: num('PLAY_RATE_PER_5S', 40), // max game actions per player per 5 seconds
  REGISTRATION_CODE: env('REGISTRATION_CODE', ''), // if set, sign-up requires this code (private testing)
  // Accounts created at startup if they don't exist yet (never modified afterwards):
  // SEED_USERS=name:password:demoCredits:realCredits,name2:...
  SEED_USERS: env('SEED_USERS', ''),
  ADMIN_USERNAME: env('ADMIN_USERNAME', ''), // this account is created/updated at startup and is the admin
  ADMIN_PASSWORD: env('ADMIN_PASSWORD', ''),
  REFERRAL_SHARE: num('REFERRAL_SHARE', 0.10), // referrers earn this share of the house's expected profit on referrals' real bets (max 0.5)
  SHOW_ODDS: env('SHOW_ODDS', 'false') === 'true', // show house edges / RTP / win probabilities to players
  TRUST_PROXY: env('TRUST_PROXY', 'false') === 'true', // set true behind a reverse proxy (for per-IP rate limits)
  COOKIE_SECURE: env('COOKIE_SECURE', cluster === 'mainnet-beta' ? 'true' : 'false') === 'true',
  /* ----- backups (server/backup.js) ----- */
  BACKUP_INTERVAL_MIN: num('BACKUP_INTERVAL_MIN', 60), // 0 = off
  BACKUP_KEEP_LOCAL: num('BACKUP_KEEP_LOCAL', 48), // newest local copies kept in DATA_DIR/backups
  BACKUP_KEY: env('BACKUP_KEY', ''), // encryption passphrase; empty = derived from MASTER_SEED
  BACKUP_S3_ENDPOINT: env('BACKUP_S3_ENDPOINT', ''), // e.g. https://s3.us-west-004.backblazeb2.com
  BACKUP_S3_REGION: env('BACKUP_S3_REGION', 'auto'), // e.g. us-west-004 for Backblaze; auto for Cloudflare R2
  BACKUP_S3_BUCKET: env('BACKUP_S3_BUCKET', ''),
  BACKUP_S3_PREFIX: env('BACKUP_S3_PREFIX', ''),
  BACKUP_S3_KEY_ID: env('BACKUP_S3_KEY_ID', ''),
  BACKUP_S3_SECRET: env('BACKUP_S3_SECRET', ''),
  LICENSE_TEXT: env('LICENSE_TEXT', ''), // shown in the site footer, e.g. your licence holder, number and regulator
  PROXY_HOPS: num('PROXY_HOPS', 1), // with TRUST_PROXY: reverse proxies in front of the server (the client IP is read this far from the right of X-Forwarded-For)

  /* ----- compliance (server/compliance.js) ----- */
  RG_INCREASE_DELAY_HOURS: num('RG_INCREASE_DELAY_HOURS', 24), // raising or removing a deposit limit waits this long
  AML_DEPOSIT_FLAG_USD: num('AML_DEPOSIT_FLAG_USD', 2000), // flag any single deposit of this size or more
  AML_DAILY_FLAG_USD: num('AML_DAILY_FLAG_USD', 5000), // flag a player whose deposits in 24 h reach this
  AML_MIN_TURNOVER: num('AML_MIN_TURNOVER', 1), // withdrawals before wagering this multiple of recent deposits wait for review (0 = off)
};
if (!(module.exports.DEPOSIT_FEE_PCT >= 0 && module.exports.DEPOSIT_FEE_PCT < 50)) throw new Error('DEPOSIT_FEE_PCT must be between 0 and 50');
