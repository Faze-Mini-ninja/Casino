/* SQLite (built into Node 22) — accounts, ledger, rounds, deposit addresses, deposits, sweeps, withdrawals.
 * Balances are integer "units": 1 unit = 0.01 credit. Every balance change goes through credit()/debit()
 * inside a transaction and writes a ledger row, so the books always reconcile. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const cfg = require('./config');

const db = new DatabaseSync(cfg.DB_FILE);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player', demo_units INTEGER NOT NULL DEFAULT 0, real_units INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, CHECK (demo_units >= 0), CHECK (real_units >= 0));
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mode TEXT NOT NULL, delta INTEGER NOT NULL,
  reason TEXT NOT NULL, ref TEXT, balance_after INTEGER NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id);
CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), mode TEXT NOT NULL, game TEXT NOT NULL,
  status TEXT NOT NULL, state TEXT, wager INTEGER NOT NULL DEFAULT 0, payout INTEGER NOT NULL DEFAULT 0, detail TEXT,
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rounds_user ON rounds(user_id, id);
CREATE INDEX IF NOT EXISTS rounds_active ON rounds(user_id, game, status);
CREATE TABLE IF NOT EXISTS deposit_addresses (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), day TEXT NOT NULL, address TEXT UNIQUE NOT NULL,
  created INTEGER NOT NULL, last_checked INTEGER NOT NULL DEFAULT 0, UNIQUE (user_id, day));
CREATE TABLE IF NOT EXISTS chain_txs (
  signature TEXT NOT NULL, address_id INTEGER NOT NULL REFERENCES deposit_addresses(id), user_id INTEGER NOT NULL,
  lamports INTEGER NOT NULL, units INTEGER NOT NULL DEFAULT 0, kind TEXT NOT NULL, ts INTEGER NOT NULL,
  PRIMARY KEY (signature, address_id));
CREATE TABLE IF NOT EXISTS sweeps (
  id INTEGER PRIMARY KEY, address_id INTEGER NOT NULL REFERENCES deposit_addresses(id), dest TEXT NOT NULL, lamports INTEGER NOT NULL,
  signature TEXT, status TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), dest TEXT NOT NULL, units INTEGER NOT NULL,
  lamports INTEGER NOT NULL, status TEXT NOT NULL, signature TEXT, last_valid_height INTEGER, note TEXT,
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fish_shots (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, mode TEXT NOT NULL, units INTEGER NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL);
`);

const UNITS_PER_SOL = cfg.CREDITS_PER_SOL * 100;
const LAMPORTS_PER_UNIT = 1e9 / UNITS_PER_SOL;
if (!Number.isInteger(LAMPORTS_PER_UNIT)) throw new Error('CREDITS_PER_SOL must divide 10,000,000 evenly');

let depth = 0;
/** Run fn inside a transaction (nested calls join the outer one). */
function tx(fn) {
  if (depth > 0) { depth++; try { return fn(); } finally { depth--; } }
  db.exec('BEGIN IMMEDIATE'); depth = 1;
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth = 0; }
}
const col = (mode) => { if (mode !== 'demo' && mode !== 'real') throw new Error('bad mode'); return mode + '_units'; };
const q = (sql) => db.prepare(sql);
const getUser = q('SELECT * FROM users WHERE id = ?');

class BalanceError extends Error {}
function balance(userId, mode) { return getUser.get(userId)[col(mode)]; }
function adjust(userId, mode, delta, reason, ref) {
  if (!Number.isInteger(delta)) throw new Error('non-integer amount');
  return tx(() => {
    const c = col(mode);
    const cur = getUser.get(userId)[c];
    if (cur + delta < 0) throw new BalanceError('Insufficient balance');
    q(`UPDATE users SET ${c} = ${c} + ? WHERE id = ?`).run(delta, userId);
    q('INSERT INTO ledger (user_id, mode, delta, reason, ref, balance_after, ts) VALUES (?,?,?,?,?,?,?)').run(userId, mode, delta, reason, ref == null ? null : String(ref), cur + delta, Date.now());
    return cur + delta;
  });
}
const debit = (u, m, units, reason, ref) => (units > 0 ? adjust(u, m, -units, reason, ref) : balance(u, m));
const credit = (u, m, units, reason, ref) => (units > 0 ? adjust(u, m, units, reason, ref) : balance(u, m));
const balances = (userId) => { const u = getUser.get(userId); return { demo: u.demo_units, real: u.real_units }; };

module.exports = { db, q, tx, debit, credit, balance, balances, getUser, BalanceError, UNITS_PER_SOL, LAMPORTS_PER_UNIT };
