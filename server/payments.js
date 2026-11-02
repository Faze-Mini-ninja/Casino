/* Deposits, sweeps and withdrawals for every coin (SOL, USDC, ETH, LTC). Balances are dollars (1 credit = $1).
 *
 * Flow:
 *  1. Each player gets a fresh deposit address per chain per UTC day, derived from the master seed (index = row id).
 *  2. The watcher reads each recent address and credits confirmed incoming coins exactly once, converted to dollars at
 *     the market price (primary key on txid+address+coin makes crediting idempotent, even across restarts).
 *  3. Deposit addresses are swept to that coin's hot wallet, or to its treasury once the hot wallet holds HOT_FLOAT_USD.
 *  4. Withdrawals are debited in dollars when requested, converted to the coin, sent from the hot wallet, and refunded
 *     only if the transaction provably never landed. */
'use strict';
const cfg = require('./config');
const { q, tx, credit, debit, balances } = require('./db');
const bus = require('./bus');
const prices = require('./prices');
const C = require('./chains');

const today = () => new Date().toISOString().slice(0, 10);
const log = (...a) => console.log(new Date().toISOString(), '[payments]', ...a);

/* ---------- schema (and one-time move of the SOL-only tables) ---------- */
q(`CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), chain TEXT NOT NULL, day TEXT NOT NULL, address TEXT UNIQUE NOT NULL,
  cursor TEXT, created INTEGER NOT NULL, last_checked INTEGER NOT NULL DEFAULT 0, UNIQUE (user_id, chain, day))`).run();
q(`CREATE TABLE IF NOT EXISTS deposits (
  txid TEXT NOT NULL, address_id INTEGER NOT NULL REFERENCES addresses(id), asset TEXT NOT NULL, user_id INTEGER NOT NULL,
  base INTEGER NOT NULL, units INTEGER NOT NULL DEFAULT 0, price REAL, kind TEXT NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (txid, address_id, asset))`).run();
q(`CREATE TABLE IF NOT EXISTS chain_sweeps (
  id INTEGER PRIMARY KEY, address_id INTEGER NOT NULL REFERENCES addresses(id), asset TEXT NOT NULL, dest TEXT NOT NULL, base INTEGER NOT NULL,
  txid TEXT, status TEXT NOT NULL, meta TEXT, note TEXT, ts INTEGER NOT NULL)`).run();
for (const [col, def] of [['asset', "TEXT NOT NULL DEFAULT 'SOL'"], ['base', 'INTEGER'], ['price', 'REAL'], ['meta', 'TEXT']]) { try { q(`ALTER TABLE withdrawals ADD COLUMN ${col} ${def}`).run(); } catch { /* exists */ } }
try { q('ALTER TABLE deposit_addresses ADD COLUMN last_sig TEXT').run(); } catch { /* exists */ }
if (!q('SELECT 1 FROM addresses LIMIT 1').get() && q('SELECT 1 FROM deposit_addresses LIMIT 1').get()) {
  tx(() => {
    // ids are kept: the Solana key of a deposit address is derived from its row id
    q("INSERT INTO addresses (id, user_id, chain, day, address, cursor, created, last_checked) SELECT id, user_id, 'solana', day, address, json_object('sol', last_sig), created, last_checked FROM deposit_addresses").run();
    q("INSERT OR IGNORE INTO deposits (txid, address_id, asset, user_id, base, units, kind, ts) SELECT signature, address_id, 'SOL', user_id, lamports, units, kind, ts FROM chain_txs WHERE lamports > 0").run();
    q("INSERT INTO chain_sweeps (address_id, asset, dest, base, txid, status, ts) SELECT address_id, 'SOL', dest, lamports, signature, CASE status WHEN 'sending' THEN 'sending' WHEN 'done' THEN 'done' ELSE 'failed' END, ts FROM sweeps").run();
  });
  log('moved SOL deposit history to the multi-coin tables');
}
q("UPDATE withdrawals SET base = lamports, meta = json_object('lastValidBlockHeight', last_valid_height) WHERE base IS NULL").run();

/* ---------- addresses ---------- */
/** Today's deposit address on one chain (created on first request of the day). */
function depositAddress(userId, chain) {
  const day = today();
  let row = q('SELECT * FROM addresses WHERE user_id = ? AND chain = ? AND day = ?').get(userId, chain, day);
  if (!row) {
    tx(() => {
      const id = Number(q('INSERT INTO addresses (user_id, chain, day, address, created) VALUES (?,?,?,?,?)').run(userId, chain, day, `pending-${chain}-${userId}-${day}`, Date.now()).lastInsertRowid);
      q('UPDATE addresses SET address = ? WHERE id = ?').run(C.mod(chain).addressAt(id), id);
    });
    row = q('SELECT * FROM addresses WHERE user_id = ? AND chain = ? AND day = ?').get(userId, chain, day);
  }
  return row;
}
/** Today's address for every enabled coin: { SOL: {address, day}, … } */
function depositAddresses(userId) {
  const byChain = Object.fromEntries(C.chains().map((ch) => [ch, depositAddress(userId, ch)]));
  return Object.fromEntries(C.enabled().map((a) => [a, { address: byChain[C.ASSETS[a].chain].address, day: byChain[C.ASSETS[a].chain].day }]));
}
const ownAddresses = (chain) => new Set([C.mod(chain).hotAddress(), ...q('SELECT address FROM addresses WHERE chain = ?').all(chain).map((r) => r.address)].map((x) => x.toLowerCase()));

/* ---------- deposits ---------- */
async function scanRow(m, row) {
  if (m.chain === 'ethereum') {
    // balance-based detection: wait while a sweep is still settling, then account for everything swept out so far
    if (q("SELECT 1 FROM chain_sweeps WHERE address_id = ? AND status = 'sending'").get(row.id)) return false;
    row.seenGwei = q("SELECT COALESCE(SUM(base),0) s FROM deposits WHERE address_id = ? AND asset = 'ETH'").get(row.id).s;
    row.outWei = q("SELECT meta FROM chain_sweeps WHERE address_id = ? AND status = 'done'").all(row.id).reduce((s, r) => s + BigInt(JSON.parse(r.meta || '{}').outWei || 0), 0n).toString();
  }
  const r = await m.scan(row);
  const fresh = r.found.filter((f) => f.base > 0 && !q('SELECT 1 FROM deposits WHERE txid = ? AND address_id = ? AND asset = ?').get(f.txid, row.id, f.asset));
  const px = {};
  for (const f of fresh) px[f.asset] = px[f.asset] || (await prices.usd(f.asset)); // no price → retry next pass, nothing saved
  const notes = [];
  tx(() => {
    for (const f of fresh) {
      const coin = C.toCoin(f.asset, f.base), ok = coin >= (cfg.MIN_DEPOSIT[f.asset] || 0);
      const units = ok ? Math.floor(coin * px[f.asset] * 100 + 1e-6) : 0;
      const ins = q('INSERT OR IGNORE INTO deposits (txid, address_id, asset, user_id, base, units, price, kind, ts) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(f.txid, row.id, f.asset, row.user_id, f.base, units, px[f.asset], ok ? 'deposit' : 'below-minimum', Date.now());
      if (!ins.changes) continue;
      if (units > 0) credit(row.user_id, 'real', units, 'deposit', `${f.asset}:${f.txid}`);
      log(`${ok ? 'credited' : 'below minimum:'} ${coin} ${f.asset} ($${(units / 100).toFixed(2)}) to user ${row.user_id} (${f.txid})`);
      notes.push({ to: row.user_id, asset: f.asset, coin, usd: units / 100, credits: units / 100, belowMinimum: !ok, signature: f.txid });
    }
    q('UPDATE addresses SET cursor = ?, last_checked = ? WHERE id = ?').run(r.cursor == null ? row.cursor : typeof r.cursor === 'string' ? r.cursor : JSON.stringify(r.cursor), Date.now(), row.id);
  });
  notes.forEach((n) => bus.emit('deposit', n)); // after commit: tell the player's open tabs
  return !r.partial;
}

/* ---------- sweeps ---------- */
const badTreasury = new Set();
/** The treasury address for a chain, or null if unset or not valid on this network (warned once). */
function treasuryFor(m) {
  const t = C.TREASURY[m.chain];
  if (!t) return null;
  if (!m.isValidAddress(t)) { if (!badTreasury.has(m.chain)) { badTreasury.add(m.chain); log(`treasury address for ${m.chain} is not valid on ${cfg.TESTNET ? 'the test network' : 'mainnet'}; keeping funds in the hot wallet`); } return null; }
  return t;
}
async function sweepDest(m, asset) {
  const treasury = treasuryFor(m);
  if (!treasury) return m.hotAddress(asset);
  try { const usdHeld = C.toCoin(asset, await m.hotBalance(asset)) * (await prices.usd(asset)); return usdHeld >= cfg.HOT_FLOAT_USD ? treasury : m.hotAddress(asset); }
  catch { return m.hotAddress(asset); }
}
async function sweepRow(m, row) {
  if (q("SELECT 1 FROM chain_sweeps WHERE address_id = ? AND status = 'sending'").get(row.id)) return;
  for (const asset of m.assets.filter((a) => C.enabled().includes(a))) {
    const dest = await sweepDest(m, asset);
    const s = await m.buildSweep(row, asset, dest);
    if (!s) continue;
    const id = q('INSERT INTO chain_sweeps (address_id, asset, dest, base, txid, status, meta, ts) VALUES (?,?,?,?,?,?,?,?)').run(row.id, asset, dest, s.base, s.txid, 'sending', JSON.stringify(s.meta || {}), Date.now()).lastInsertRowid;
    try { await m.broadcast(s.raw); log(`sweep ${C.toCoin(asset, s.base)} ${asset} from ${row.address} -> ${dest === m.hotAddress(asset) ? 'hot wallet' : 'treasury'}`); }
    catch (e) { q("UPDATE chain_sweeps SET status = 'failed', note = ? WHERE id = ?").run(e.message.slice(0, 300), id); log('sweep failed', asset, row.address, e.message); }
  }
}
async function confirmSweeps(m) {
  for (const s of q("SELECT s.*, a.address FROM chain_sweeps s JOIN addresses a ON a.id = s.address_id WHERE s.status = 'sending' AND a.chain = ?").all(m.chain)) {
    const meta = JSON.parse(s.meta || '{}'), st = await m.txStatus(s.txid, meta, s.address);
    if (st.state === 'sent' && st.final) q("UPDATE chain_sweeps SET status = 'done', meta = ? WHERE id = ?").run(JSON.stringify({ ...meta, raw: undefined, outWei: st.outWei }), s.id);
    else if (st.state === 'failed' || st.state === 'expired') q("UPDATE chain_sweeps SET status = 'failed', note = ? WHERE id = ?").run(st.note || st.state, s.id);
    else if (st.state === 'pending' && m.chain === 'solana' && Date.now() - s.ts > 180000 && !meta.lastValidBlockHeight) q("UPDATE chain_sweeps SET status = 'expired' WHERE id = ?").run(s.id);
  }
}

/* ---------- withdrawals ---------- */
/** Debit `credits` dollars now and queue a payout of the same value in `asset` (minus that coin's network fee). */
async function requestWithdrawal(userId, asset, address, credits) {
  if (!cfg.CHAIN_ENABLED) throw new Error('Withdrawals are disabled');
  asset = String(asset || 'SOL').toUpperCase();
  if (!C.enabled().includes(asset)) throw new Error('That coin is not available');
  const a = C.ASSETS[asset], m = C.mod(a.chain);
  address = String(address || '').trim();
  if (!m.isValidAddress(address)) throw new Error(`That is not a valid ${a.network} address`);
  if (ownAddresses(a.chain).has(address.toLowerCase())) throw new Error('You cannot withdraw to a casino deposit address');
  const units = Math.round(Number(credits) * 100);
  if (!(units > 0)) throw new Error('Enter an amount');
  if (units < cfg.MIN_WITHDRAW_USD * 100) throw new Error(`Minimum withdrawal is $${cfg.MIN_WITHDRAW_USD}`);
  const price = await prices.usd(asset);
  const base = C.toBase(asset, units / 100 / price) - C.toBase(asset, cfg.WITHDRAW_FEE[asset] || 0);
  if (base <= 0) throw new Error('Amount is too small to cover the network fee');
  return tx(() => {
    if (q("SELECT 1 FROM rounds WHERE user_id = ? AND mode = 'real' AND status = 'active'").get(userId)) throw new Error('Finish your open real-money game first');
    debit(userId, 'real', units, 'withdrawal');
    const day = q("SELECT COALESCE(SUM(units),0) s FROM withdrawals WHERE user_id = ? AND created > ? AND status NOT IN ('rejected','failed')").get(userId, Date.now() - 86400000).s;
    const auto = units <= cfg.AUTO_APPROVE_USD * 100 && day + units <= cfg.AUTO_APPROVE_DAILY_USD * 100;
    const id = q('INSERT INTO withdrawals (user_id, dest, units, lamports, status, created, updated, asset, base, price) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(userId, address, units, base, auto ? 'approved' : 'pending', Date.now(), Date.now(), asset, base, price).lastInsertRowid;
    q("UPDATE ledger SET ref = ? WHERE id = (SELECT MAX(id) FROM ledger WHERE user_id = ? AND reason = 'withdrawal')").run('withdrawal:' + id, userId);
    return { id: Number(id), status: auto ? 'approved' : 'pending', asset, coin: C.toCoin(asset, base), sol: asset === 'SOL' ? C.toCoin(asset, base) : undefined, balances: balances(userId) };
  });
}
function refundWithdrawal(w, status, note) {
  tx(() => {
    const r = q("UPDATE withdrawals SET status = ?, note = ?, updated = ? WHERE id = ? AND status IN ('pending','approved','sending')").run(status, note, Date.now(), w.id);
    if (r.changes) credit(w.user_id, 'real', w.units, 'withdrawal-refund', 'withdrawal:' + w.id);
  });
}
async function processWithdrawals(m) {
  const assets = m.assets.filter((a) => C.enabled().includes(a));
  if (!assets.length) return;
  const inList = assets.map(() => '?').join(',');
  // 1) confirm or expire in-flight sends
  for (const w of q(`SELECT * FROM withdrawals WHERE status = 'sending' AND asset IN (${inList})`).all(...assets)) {
    const st = await m.txStatus(w.signature, JSON.parse(w.meta || '{}'));
    if (st.state === 'failed' || st.state === 'expired') refundWithdrawal(w, 'failed', st.note || 'Transaction did not land');
    else if (st.state === 'sent') { q("UPDATE withdrawals SET status = 'sent', updated = ? WHERE id = ?").run(Date.now(), w.id); log(`withdrawal ${w.id} confirmed ${w.signature}`); }
  }
  // 2) send approved ones from the hot wallet
  const ctx = {}, committed = {};
  for (const w of q(`SELECT * FROM withdrawals WHERE status = 'approved' AND asset IN (${inList}) ORDER BY id`).all(...assets)) {
    const bal = await m.hotBalance(w.asset) - (committed[w.asset] || 0);
    if (bal < w.base + (m.FEE_BASE[w.asset] || 0)) { q('UPDATE withdrawals SET note = ? WHERE id = ?').run('Waiting for hot wallet funds', w.id); continue; }
    let t;
    try { t = await m.buildSend(w.asset, w.dest, w.base, ctx); }
    catch (e) { q('UPDATE withdrawals SET note = ? WHERE id = ?').run(e.funds ? 'Waiting for hot wallet funds' : 'Could not build transaction: ' + e.message.slice(0, 200), w.id); continue; }
    const r = q("UPDATE withdrawals SET status = 'sending', signature = ?, meta = ?, last_valid_height = ?, note = NULL, updated = ? WHERE id = ? AND status = 'approved'")
      .run(t.txid, JSON.stringify(t.meta || {}), (t.meta && t.meta.lastValidBlockHeight) || null, Date.now(), w.id);
    if (!r.changes) continue;
    committed[w.asset] = (committed[w.asset] || 0) + w.base + (m.FEE_BASE[w.asset] || 0);
    try { await m.broadcast(t.raw); log(`withdrawal ${w.id}: ${C.toCoin(w.asset, w.base)} ${w.asset} -> ${w.dest}`); }
    catch (e) {
      // a node that refuses for lack of funds never relayed the transaction: put it back in the queue
      if (/insufficient funds|insufficient lamports|insufficient balance/i.test(e.message)) { q("UPDATE withdrawals SET status = 'approved', signature = NULL, meta = NULL, note = 'Waiting for hot wallet funds' WHERE id = ? AND status = 'sending'").run(w.id); committed[w.asset] -= w.base + (m.FEE_BASE[w.asset] || 0); continue; }
      log(`withdrawal ${w.id} broadcast error (will verify on-chain before any refund): ${e.message}`);
    }
  }
}

/* ---------- watcher loop ---------- */
let pass = 0, running = false, lastRun = 0;
const errors = {};
async function runOnce() {
  if (running) return; running = true; pass++;
  const cutoff = new Date(Date.now() - cfg.ADDRESS_WATCH_DAYS * 86400000).toISOString().slice(0, 10);
  const recent = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  for (const chain of C.chains()) {
    try {
      const m = C.mod(chain);
      for (const row of q('SELECT * FROM addresses WHERE chain = ? AND day >= ? ORDER BY day DESC').all(chain, pass % 10 === 1 ? cutoff : recent)) {
        if (await scanRow(m, row)) await sweepRow(m, q('SELECT * FROM addresses WHERE id = ?').get(row.id));
      }
      await confirmSweeps(m);
      await processWithdrawals(m);
      errors[chain] = null;
    } catch (e) { errors[chain] = e.message; log(`${chain} watcher error:`, e.message); }
  }
  running = false; lastRun = Date.now();
}
function startWatcher() {
  if (!cfg.CHAIN_ENABLED) { log('chain disabled (CHAIN_ENABLED=false)'); return; }
  log(`coins ${C.enabled().join(', ')} on ${cfg.TESTNET ? 'test networks' : 'mainnet'}; hot wallets: ${C.chains().map((c) => `${c} ${C.mod(c).hotAddress()}`).join(', ')}`);
  runOnce(); setInterval(runOnce, cfg.WATCH_INTERVAL_MS).unref();
}
const watcherStatus = () => ({ lastRun, pass, lastError: Object.values(errors).filter(Boolean).join('; ') || null, errors: { ...errors } });

/** Hot wallet balances and addresses for the Staff Panel. */
async function treasury() {
  const out = [];
  for (const asset of C.enabled()) {
    const a = C.ASSETS[asset], m = C.mod(a.chain);
    let bal = null, usd = null;
    try { bal = C.toCoin(asset, await m.hotBalance(asset)); usd = bal * (await prices.usd(asset)); } catch { /* network down */ }
    out.push({ asset, name: a.name, network: a.network, hot: m.hotAddress(asset), treasury: treasuryFor(m) || (C.TREASURY[a.chain] ? 'invalid for this network: ' + C.TREASURY[a.chain] : null), balance: bal, usd });
  }
  return out;
}
const explorer = (asset, txid) => {
  const a = C.ASSETS[asset]; if (!a) return null;
  if (asset === 'ETH' && txid.includes('@')) return `https://${cfg.TESTNET ? 'sepolia.' : ''}etherscan.io/address/${txid.split('@')[0]}`;
  return C.mod(a.chain).explorer(txid);
};

module.exports = { depositAddress, depositAddresses, requestWithdrawal, refundWithdrawal, startWatcher, runOnce, watcherStatus, treasury, explorer, today };
