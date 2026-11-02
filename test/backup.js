/* Backup test: snapshot while running, encryption, off-site upload (to a local fake S3), local pruning and restore.
 * Usage: node test/backup.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http'), { execFileSync } = require('child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-bk-'));
const SEED = 'ab'.repeat(64);
const uploads = [];
const s3 = http.createServer((req, res) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => { uploads.push({ url: req.url, auth: req.headers.authorization || '', body: Buffer.concat(b) }); res.end(); }); });
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok', m); };
s3.listen(0, '127.0.0.1', async () => {
  Object.assign(process.env, { DB_FILE: path.join(dir, 'casino.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', SOLANA_CLUSTER: 'devnet', MASTER_SEED: SEED,
    ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'owner-password-1', BACKUP_KEEP_LOCAL: '2',
    BACKUP_S3_ENDPOINT: 'http://127.0.0.1:' + s3.address().port, BACKUP_S3_BUCKET: 'bk', BACKUP_S3_PREFIX: 'casino', BACKUP_S3_KEY_ID: 'id', BACKUP_S3_SECRET: 'secret', BACKUP_S3_REGION: 'us-west-004' });
  const { server } = require('../server/index.js');
  const { q, credit } = require('../server/db');
  const backup = require('../server/backup');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  let cookie = '';
  const api = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const j = await r.json(); j._status = r.status; return j; };
  await api('POST', '/api/register', { username: 'player1', password: 'password123', ageConfirm: true });
  ok((await api('POST', '/api/admin/backup/run'))._status === 403, 'players cannot run backups');
  const pid = q("SELECT id FROM users WHERE username = 'player1'").get().id;
  credit(pid, 'real', 12345, 'test');
  await api('POST', '/api/login', { username: 'owner', password: 'owner-password-1' });
  let st = await api('POST', '/api/admin/backup/run');
  ok(st.lastOk && st.lastOk.uploaded && st.offsite && !st.lastError, 'admin "Back up now" saves and uploads');
  ok(uploads.length === 1 && uploads[0].url.startsWith('/bk/casino/casino-') && uploads[0].auth.startsWith('AWS4-HMAC-SHA256 Credential=id/'), 'uploaded to bucket/prefix with a signed request');
  const file = path.join(backup.DIR, st.lastOk.name);
  const raw = fs.readFileSync(file);
  ok(raw.equals(uploads[0].body), 'the uploaded file is the local file');
  ok(!raw.includes(Buffer.from('player1')) && !raw.includes(Buffer.from('SQLite format')), 'backup is encrypted');
  credit(pid, 'real', 100, 'after-backup');
  // restore with the CLI
  const out = path.join(dir, 'restored.db');
  const msg = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'restore-backup.js'), file, out], { env: { ...process.env, MASTER_SEED: SEED, DATA_DIR: '', DB_FILE: '' }, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  ok(/integrity ok/.test(msg) && /\$123\.45/.test(msg), 'restore tool decrypts and checks the database: ' + msg.trim());
  const { DatabaseSync } = require('node:sqlite');
  ok(new DatabaseSync(out).prepare("SELECT real_units FROM users WHERE username = 'player1'").get().real_units === 12345, 'restored balance is the balance at backup time');
  let wrong = false; try { execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'restore-backup.js'), file, out + '2'], { env: { ...process.env, MASTER_SEED: 'cd'.repeat(64), DATA_DIR: '', DB_FILE: '' }, stdio: 'ignore' }); } catch { wrong = true; }
  ok(wrong, 'restore refuses the wrong key');
  // pruning
  for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 1100)); await backup.runBackup(require('../server/db').db); }
  ok(fs.readdirSync(backup.DIR).filter((f) => f.endsWith('.enc')).length === 2, 'only BACKUP_KEEP_LOCAL copies kept locally');
  // failed upload is reported
  s3.close(); process.env.BACKUP_S3_ENDPOINT = 'http://127.0.0.1:1';
  require('../server/config').BACKUP_S3_ENDPOINT = 'http://127.0.0.1:1';
  let failed = false; try { await backup.runBackup(require('../server/db').db); } catch { failed = true; }
  st = await api('GET', '/api/admin/backup');
  ok(failed && st.lastError, 'an upload failure is reported in the Staff Panel');
  server.close(); fs.rmSync(dir, { recursive: true, force: true });
  if (fails) { console.log(`BACKUP TEST FAILED (${fails})`); process.exit(1); }
  console.log('BACKUP TEST OK'); process.exit(0);
});
