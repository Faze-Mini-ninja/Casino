/* Daily deposit wallets, deposit crediting, sweeps and withdrawals.
 *
 * Flow:
 *  1. Each player gets a fresh deposit address per UTC day, derived from the master seed (index = row id).
 *  2. The watcher reads each recent address's finalized transactions and credits incoming SOL exactly once
 *     (primary key on signature+address makes crediting idempotent, even across restarts).
 *  3. Credited balances are swept to the hot wallet (up to HOT_FLOAT_SOL) and the rest to TREASURY_ADDRESS.
 *  4. Withdrawals are debited when requested, sent from the hot wallet, and refunded only if the transaction
 *     provably never landed (blockhash expired with no signature status). */
'use strict';
const cfg = require('./config');
const { q, tx, credit, debit, balances, LAMPORTS_PER_UNIT, UNITS_PER_SOL } = require('./db');
const { keypairAt, hotWallet } = require('./wallet');
const chain = require('./chain');

const SOL = 1e9;
const today = () => new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(new Date().toISOString(), '[payments]', ...a);
try { q('ALTER TABLE deposit_addresses ADD COLUMN last_sig TEXT').run(); } catch { /* exists */ }

/** Today's deposit address for a player (created on first request of the day). */
function depositAddress(userId) {
  const day = today();
  let row = q('SELECT * FROM deposit_addresses WHERE user_id = ? AND day = ?').get(userId, day);
  if (!row) {
    tx(() => {
      const id = q('INSERT INTO deposit_addresses (user_id, day, address, created) VALUES (?,?,?,?)').run(userId, day, 'pending-' + userId + '-' + day, Date.now()).lastInsertRowid;
      q('UPDATE deposit_addresses SET address = ? WHERE id = ?').run(keypairAt(Number(id)).publicKey.toBase58(), id);
    });
    row = q('SELECT * FROM deposit_addresses WHERE user_id = ? AND day = ?').get(userId, day);
  }
  return row;
}
const ownAddresses = () => new Set([hotWallet().publicKey.toBase58(), ...q('SELECT address FROM deposit_addresses').all().map((r) => r.address)]);

/* ---------- deposits ---------- */
async function scanAddress(row) {
  const sigs = await chain.newSignatures(row.address, row.last_sig);
  for (const s of sigs) {
    if (q('SELECT 1 FROM chain_txs WHERE signature = ? AND address_id = ?').get(s.signature, row.id)) continue;
    const ch = s.err ? { delta: 0, failed: true } : await chain.netChange(s.signature, row.address);
    if (!ch) return; // not readable yet; retry next pass without advancing last_sig
    tx(() => {
      const ins = q('INSERT OR IGNORE INTO chain_txs (signature, address_id, user_id, lamports, units, kind, ts) VALUES (?,?,?,?,?,?,?)');
      if (ch.delta > 0) {
        const units = Math.floor(ch.delta / LAMPORTS_PER_UNIT), ok = ch.delta >= cfg.MIN_DEPOSIT_SOL * SOL;
        const r = ins.run(s.signature, row.id, row.user_id, ch.delta, ok ? units : 0, ok ? 'deposit' : 'below-minimum', Date.now());
        if (r.changes && ok && units > 0) { credit(row.user_id, 'real', units, 'deposit', s.signature); log(`credited ${ch.delta / SOL} SOL to user ${row.user_id} (${s.signature})`); }
      } else ins.run(s.signature, row.id, row.user_id, ch.delta, 0, ch.failed ? 'failed' : 'outgoing', Date.now());
      q('UPDATE deposit_addresses SET last_sig = ?, last_checked = ? WHERE id = ?').run(s.signature, Date.now(), row.id);
    });
  }
  q('UPDATE deposit_addresses SET last_checked = ? WHERE id = ?').run(Date.now(), row.id);
}

/* ---------- sweeps ---------- */
async function sweepAddress(row) {
  const bal = await chain.getBalance(row.address);
  if (bal < cfg.SWEEP_MIN_SOL * SOL) return;
  // only sweep once every finalized deposit to this address has been credited
  const latest = await chain.newSignatures(row.address, row.last_sig);
  if (latest.length) return;
  const hot = hotWallet().publicKey.toBase58();
  let dest = hot;
  if (cfg.TREASURY_ADDRESS && (await chain.getBalance(hot)) >= cfg.HOT_FLOAT_SOL * SOL) dest = cfg.TREASURY_ADDRESS;
  const lamports = bal - chain.FEE;
  const t = await chain.buildTransfer(keypairAt(row.id), dest, lamports);
  const id = q('INSERT INTO sweeps (address_id, dest, lamports, signature, status, ts) VALUES (?,?,?,?,?,?)').run(row.id, dest, lamports, t.signature, 'sending', Date.now()).lastInsertRowid;
  try { await chain.broadcast(t.raw); log(`sweep ${lamports / SOL} SOL from ${row.address} -> ${dest === hot ? 'hot wallet' : 'treasury'}`); }
  catch (e) { q("UPDATE sweeps SET status = 'failed' WHERE id = ?").run(id); log('sweep failed', row.address, e.message); }
}
async function confirmSweeps() {
  for (const s of q("SELECT * FROM sweeps WHERE status = 'sending'").all()) {
    const st = await chain.status(s.signature);
    if (st && st.confirmationStatus === 'finalized') q('UPDATE sweeps SET status = ? WHERE id = ?').run(st.err ? 'failed' : 'done', s.id);
    else if (!st && Date.now() - s.ts > 180000) q("UPDATE sweeps SET status = 'expired' WHERE id = ?").run(s.id);
  }
}

/* ---------- withdrawals ---------- */
function requestWithdrawal(userId, address, credits) {
  if (!cfg.CHAIN_ENABLED) throw new Error('Withdrawals are disabled');
  address = String(address || '').trim();
  if (!chain.isValidAddress(address)) throw new Error('That is not a valid Solana wallet address');
  if (ownAddresses().has(address)) throw new Error('You cannot withdraw to a casino deposit address');
  const units = Math.round(Number(credits) * 100);
  if (!(units > 0)) throw new Error('Enter an amount');
  const lamportsGross = units * LAMPORTS_PER_UNIT, lamports = lamportsGross - Math.round(cfg.WITHDRAW_FEE_SOL * SOL);
  if (lamportsGross < cfg.MIN_WITHDRAW_SOL * SOL || lamports <= 0) throw new Error(`Minimum withdrawal is ${cfg.MIN_WITHDRAW_SOL} SOL`);
  return tx(() => {
    if (q("SELECT 1 FROM rounds WHERE user_id = ? AND mode = 'real' AND status = 'active'").get(userId)) throw new Error('Finish your open real-money game first');
    debit(userId, 'real', units, 'withdrawal');
    const day = q("SELECT COALESCE(SUM(lamports),0) s FROM withdrawals WHERE user_id = ? AND created > ? AND status NOT IN ('rejected','failed')").get(userId, Date.now() - 86400000).s;
    const auto = lamportsGross <= cfg.AUTO_APPROVE_SOL * SOL && day + lamports <= cfg.AUTO_APPROVE_DAILY_SOL * SOL;
    const id = q('INSERT INTO withdrawals (user_id, dest, units, lamports, status, created, updated) VALUES (?,?,?,?,?,?,?)').run(userId, address, units, lamports, auto ? 'approved' : 'pending', Date.now(), Date.now()).lastInsertRowid;
    q("UPDATE ledger SET ref = ? WHERE id = (SELECT MAX(id) FROM ledger WHERE user_id = ? AND reason = 'withdrawal')").run('withdrawal:' + id, userId);
    return { id: Number(id), status: auto ? 'approved' : 'pending', sol: lamports / SOL, balances: balances(userId) };
  });
}
function refundWithdrawal(w, status, note) {
  tx(() => {
    const r = q("UPDATE withdrawals SET status = ?, note = ?, updated = ? WHERE id = ? AND status IN ('pending','approved','sending')").run(status, note, Date.now(), w.id);
    if (r.changes) credit(w.user_id, 'real', w.units, 'withdrawal-refund', 'withdrawal:' + w.id);
  });
}
async function processWithdrawals() {
  // 1) confirm or expire in-flight sends
  for (const w of q("SELECT * FROM withdrawals WHERE status = 'sending'").all()) {
    const st = await chain.status(w.signature);
    if (st && st.err) refundWithdrawal(w, 'failed', 'Transaction failed on-chain: ' + JSON.stringify(st.err));
    else if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) { q("UPDATE withdrawals SET status = 'sent', updated = ? WHERE id = ?").run(Date.now(), w.id); log(`withdrawal ${w.id} confirmed ${w.signature}`); }
    else if (!st && (await chain.blockHeight()) > w.last_valid_height) refundWithdrawal(w, 'failed', 'Transaction expired without landing');
  }
  // 2) send approved ones from the hot wallet
  const hot = hotWallet();
  let committed = 0; // lamports already sent this pass (finalized balance lags behind)
  for (const w of q("SELECT * FROM withdrawals WHERE status = 'approved' ORDER BY id").all()) {
    const bal = await chain.getBalance(hot.publicKey.toBase58());
    if (bal - committed < w.lamports + chain.FEE) { q('UPDATE withdrawals SET note = ? WHERE id = ?').run('Waiting for hot wallet funds', w.id); break; }
    const t = await chain.buildTransfer(hot, w.dest, w.lamports);
    const r = q("UPDATE withdrawals SET status = 'sending', signature = ?, last_valid_height = ?, note = NULL, updated = ? WHERE id = ? AND status = 'approved'").run(t.signature, t.lastValidBlockHeight, Date.now(), w.id);
    if (!r.changes) continue;
    committed += w.lamports + chain.FEE;
    try { await chain.broadcast(t.raw); log(`withdrawal ${w.id}: ${w.lamports / SOL} SOL -> ${w.dest}`); }
    catch (e) { log(`withdrawal ${w.id} broadcast error (will verify on-chain before any refund): ${e.message}`); }
  }
}

/* ---------- watcher loop ---------- */
let pass = 0, running = false, lastError = null, lastRun = 0;
async function runOnce() {
  if (running) return; running = true; pass++;
  try {
    const cutoff = new Date(Date.now() - cfg.ADDRESS_WATCH_DAYS * 86400000).toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const rows = q('SELECT * FROM deposit_addresses WHERE day >= ? ORDER BY day DESC').all(pass % 10 === 1 ? cutoff : recent);
    for (const row of rows) { await scanAddress(row); await sweepAddress(q('SELECT * FROM deposit_addresses WHERE id = ?').get(row.id)); }
    await confirmSweeps();
    await processWithdrawals();
    lastError = null;
  } catch (e) { lastError = e.message; log('watcher error:', e.message); }
  finally { running = false; lastRun = Date.now(); }
}
function startWatcher() {
  if (!cfg.CHAIN_ENABLED) { log('chain disabled (CHAIN_ENABLED=false)'); return; }
  log(`watching ${cfg.cluster} via ${cfg.RPC_URL}; hot wallet ${hotWallet().publicKey.toBase58()}`);
  runOnce(); setInterval(runOnce, cfg.WATCH_INTERVAL_MS).unref();
}
const watcherStatus = () => ({ lastRun, lastError, pass });

module.exports = { depositAddress, requestWithdrawal, refundWithdrawal, startWatcher, runOnce, watcherStatus, today, UNITS_PER_SOL };
