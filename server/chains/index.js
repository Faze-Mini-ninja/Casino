/* Coin registry. Amounts are stored as integers in each coin's "base" unit (lamports, micro-USDC, gwei, litoshi). */
'use strict';
const cfg = require('../config');

const ASSETS = {
  SOL: { id: 'SOL', name: 'Solana', chain: 'solana', decimals: 9, network: cfg.TESTNET ? `Solana ${cfg.cluster}` : 'Solana', confirm: 'about 30 seconds' },
  USDC: { id: 'USDC', name: 'USD Coin', chain: 'solana', decimals: 6, network: cfg.TESTNET ? `Solana ${cfg.cluster} (SPL)` : 'Solana (SPL)', confirm: 'about 30 seconds' },
  ETH: { id: 'ETH', name: 'Ethereum', chain: 'ethereum', decimals: 9, network: cfg.TESTNET ? 'Ethereum Sepolia' : 'Ethereum mainnet', confirm: `${cfg.ETH_CONFIRMATIONS} confirmations, about 3 minutes` },
  LTC: { id: 'LTC', name: 'Litecoin', chain: 'litecoin', decimals: 8, network: cfg.TESTNET ? 'Litecoin testnet' : 'Litecoin', confirm: `${cfg.LTC_CONFIRMATIONS} confirmations, about 8 minutes` },
};
const TREASURY = { solana: cfg.TREASURY_ADDRESS, ethereum: cfg.TREASURY_ETH, litecoin: cfg.TREASURY_LTC };
const enabled = () => cfg.COINS.filter((a) => ASSETS[a]);
const chains = () => [...new Set(enabled().map((a) => ASSETS[a].chain))];

const mods = {};
/** The chain module for a chain name (tests can replace it with setModule). */
const mod = (chain) => mods[chain] || (mods[chain] = require('./' + chain));
const setModule = (chain, m) => { mods[chain] = m; };
const forAsset = (asset) => { const a = ASSETS[asset]; if (!a || !enabled().includes(asset)) throw new Error('Unsupported coin'); return mod(a.chain); };

const unit = (asset) => 10 ** ASSETS[asset].decimals;
const toCoin = (asset, base) => base / unit(asset);
const toBase = (asset, coin) => Math.floor(coin * unit(asset) + 1e-9);

module.exports = { ASSETS, TREASURY, enabled, chains, mod, setModule, forAsset, unit, toCoin, toBase };
