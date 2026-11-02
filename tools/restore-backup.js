/* Decrypt a backup made by server/backup.js back into a SQLite database file.
 * Usage: MASTER_SEED=... node tools/restore-backup.js <casino-....db.gz.enc> <restored.db>
 *        (or BACKUP_KEY=... if the server used BACKUP_KEY)
 * Then stop the casino, put restored.db in place of DATA_DIR/casino.db (delete casino.db-wal and casino.db-shm), and start it. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('Usage: node tools/restore-backup.js <backup.db.gz.enc> <restored.db>'); process.exit(1); }
if (!process.env.MASTER_SEED && !process.env.BACKUP_KEY) { console.error('Set MASTER_SEED (or BACKUP_KEY) to the value the server used.'); process.exit(1); }
if (fs.existsSync(out)) { console.error(`${out} already exists; choose another name.`); process.exit(1); }
// config.js wants a data dir; point it at a throwaway one so nothing real is touched
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'krush-restore-'));
process.env.SOLANA_CLUSTER = 'devnet'; // only used to load settings; the key does not depend on the network
const { decrypt } = require('../server/backup');
fs.writeFileSync(out, decrypt(fs.readFileSync(src)));
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(out, { readOnly: true });
const ok = db.prepare('PRAGMA integrity_check').get();
const users = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(real_units),0) r FROM users').get();
console.log(`Restored ${out}: integrity ${Object.values(ok)[0]}, ${users.n} accounts, $${(users.r / 100).toFixed(2)} in real balances.`);
