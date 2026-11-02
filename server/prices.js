/* USD prices for the deposit coins. Balances are kept in dollars (1 credit = $1), so every deposit and withdrawal
 * is converted at the market price. The price is the median of several public sources, cached briefly; if no source
 * answers and the cache is stale, conversions are refused (deposits simply wait for the next pass). */
'use strict';
const cfg = require('./config');

const IDS = { SOL: { gecko: 'solana', cb: 'SOL-USD', kraken: 'SOLUSD' }, ETH: { gecko: 'ethereum', cb: 'ETH-USD', kraken: 'XETHZUSD' }, LTC: { gecko: 'litecoin', cb: 'LTC-USD', kraken: 'XLTCZUSD' } };
const cache = {}; // asset -> { usd, at, sources }
const FRESH_MS = 60_000, STALE_MS = 10 * 60_000;

// PRICE_OVERRIDE=SOL:150,ETH:3000,LTC:80 fixes prices (tests and offline development only)
const overrides = Object.fromEntries(String(cfg.PRICE_OVERRIDE || '').split(',').map((s) => s.split(':')).filter(([k, v]) => k && +v > 0).map(([k, v]) => [k.trim().toUpperCase(), +v]));

async function getJson(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try { const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
const SOURCES = [
  async (a) => +(await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${IDS[a].gecko}&vs_currencies=usd`))[IDS[a].gecko].usd,
  async (a) => +(await getJson(`https://api.coinbase.com/v2/prices/${IDS[a].cb}/spot`)).data.amount,
  async (a) => { const j = await getJson(`https://api.kraken.com/0/public/Ticker?pair=${IDS[a].kraken}`); const k = Object.values(j.result || {})[0]; return +k.c[0]; },
];
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** USD price of one coin. USDC is treated as exactly $1. */
async function usd(asset) {
  asset = String(asset).toUpperCase();
  if (overrides[asset]) return overrides[asset];
  if (asset === 'USDC') return 1;
  if (!IDS[asset]) throw new Error('No price for ' + asset);
  const c = cache[asset];
  if (c && Date.now() - c.at < FRESH_MS) return c.usd;
  const got = (await Promise.allSettled(SOURCES.map((f) => f(asset)))).filter((r) => r.status === 'fulfilled' && r.value > 0 && isFinite(r.value)).map((r) => r.value);
  if (got.length) { cache[asset] = { usd: median(got), at: Date.now(), sources: got.length }; return cache[asset].usd; }
  if (c && Date.now() - c.at < STALE_MS) return c.usd;
  throw new Error(`The ${asset} price is unavailable right now`);
}
/** Prices for display (never throws; missing ones are null). */
async function all() {
  const ids = ['SOL', 'USDC', 'ETH', 'LTC'];
  const got = await Promise.all(ids.map((a) => usd(a).catch(() => null)));
  return Object.fromEntries(ids.map((a, i) => [a, got[i]]));
}
module.exports = { usd, all };
