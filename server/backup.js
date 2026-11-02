/* Automatic database backups.
 *
 * Every BACKUP_INTERVAL_MIN minutes the live database is copied with SQLite's VACUUM INTO (a consistent snapshot,
 * safe while the casino is running), gzipped and encrypted with AES-256-GCM. The file is kept in DATA_DIR/backups
 * (the newest BACKUP_KEEP_LOCAL) and, when BACKUP_S3_* is set, uploaded to S3-compatible storage such as
 * Backblaze B2 or Cloudflare R2, so a lost server or disk does not lose players' balances.
 *
 * The encryption key is BACKUP_KEY, or else derived from MASTER_SEED, which you must keep safe anyway.
 * Restore with: node tools/restore-backup.js <file.db.gz.enc> <out.db>   (needs the same BACKUP_KEY / MASTER_SEED). */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const cfg = require('./config');

const MAGIC = Buffer.from('KCB1'); // file format: MAGIC | 12-byte IV | 16-byte tag | ciphertext
const DIR = path.join(cfg.DATA_DIR, 'backups');
const state = { last: null, lastOk: null, lastError: null, lastUpload: null, running: false };
const log = (...a) => console.log(new Date().toISOString(), '[backup]', ...a);

function key() {
  if (cfg.BACKUP_KEY) return crypto.createHash('sha256').update(cfg.BACKUP_KEY).digest();
  return Buffer.from(crypto.hkdfSync('sha256', cfg.MASTER_SEED, Buffer.from('krush-backup'), Buffer.from('db-backup-v1'), 32));
}
function encrypt(buf) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(zlib.gzipSync(buf)), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
function decrypt(buf) {
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error('Not a krush backup file');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(4, 16));
  d.setAuthTag(buf.subarray(16, 32));
  let plain;
  try { plain = Buffer.concat([d.update(buf.subarray(32)), d.final()]); } catch { throw new Error('Wrong key: set the same BACKUP_KEY (or MASTER_SEED) the server used'); }
  return zlib.gunzipSync(plain);
}

/* ---------- S3-compatible upload (AWS Signature V4, no extra packages) ---------- */
const s3Enabled = () => !!(cfg.BACKUP_S3_ENDPOINT && cfg.BACKUP_S3_BUCKET && cfg.BACKUP_S3_KEY_ID && cfg.BACKUP_S3_SECRET);
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
async function s3Put(name, body, now = new Date()) {
  const ep = new URL(cfg.BACKUP_S3_ENDPOINT.replace(/\/+$/, ''));
  const objectPath = `/${cfg.BACKUP_S3_BUCKET}/${(cfg.BACKUP_S3_PREFIX ? cfg.BACKUP_S3_PREFIX.replace(/^\/+|\/+$/g, '') + '/' : '')}${name}`
    .split('/').map((p) => encodeURIComponent(p)).join('/');
  const amzDate = now.toISOString().replace(/[-:]|\.\d{3}/g, ''), day = amzDate.slice(0, 8);
  const region = cfg.BACKUP_S3_REGION, hash = sha256(body);
  const headers = { host: ep.host, 'x-amz-content-sha256': hash, 'x-amz-date': amzDate };
  const signed = Object.keys(headers).sort();
  const canonical = ['PUT', objectPath, '', signed.map((h) => `${h}:${headers[h]}\n`).join(''), signed.join(';'), hash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSign = hmac(hmac(hmac(hmac('AWS4' + cfg.BACKUP_S3_SECRET, day), region), 's3'), 'aws4_request');
  const auth = `AWS4-HMAC-SHA256 Credential=${cfg.BACKUP_S3_KEY_ID}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${hmac(kSign, toSign).toString('hex')}`;
  const r = await fetch(ep.origin + objectPath, { method: 'PUT', headers: { ...headers, authorization: auth, 'content-type': 'application/octet-stream' }, body, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`upload failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

/* ---------- run ---------- */
async function runBackup(db) {
  if (state.running) throw new Error('A backup is already running');
  state.running = true;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = `casino-${stamp}.db.gz.enc`, tmp = path.join(DIR, `.snapshot-${process.pid}.db`);
  try {
    fs.mkdirSync(DIR, { recursive: true });
    try { fs.unlinkSync(tmp); } catch { /* none */ }
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const out = encrypt(fs.readFileSync(tmp));
    fs.unlinkSync(tmp);
    fs.writeFileSync(path.join(DIR, name), out, { mode: 0o600 });
    // keep only the newest local copies
    const old = fs.readdirSync(DIR).filter((f) => /^casino-.*\.db\.gz\.enc$/.test(f)).sort().reverse().slice(cfg.BACKUP_KEEP_LOCAL);
    for (const f of old) fs.unlinkSync(path.join(DIR, f));
    let uploaded = false;
    if (s3Enabled()) { await s3Put(name, out); uploaded = true; state.lastUpload = Date.now(); }
    state.last = Date.now(); state.lastOk = { name, bytes: out.length, uploaded, at: state.last }; state.lastError = null;
    log(`saved ${name} (${(out.length / 1024).toFixed(0)} KB)${uploaded ? ' and uploaded' : s3Enabled() ? '' : ' (local only: set BACKUP_S3_* to copy it off the server)'}`);
    return state.lastOk;
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* none */ }
    state.last = Date.now(); state.lastError = e.message;
    log('FAILED:', e.message);
    throw e;
  } finally { state.running = false; }
}

function start(db) {
  if (!(cfg.BACKUP_INTERVAL_MIN > 0)) { log('automatic backups are off (BACKUP_INTERVAL_MIN=0)'); return; }
  const tick = () => runBackup(db).catch(() => {});
  setTimeout(tick, 60000).unref(); // first one a minute after start
  setInterval(tick, cfg.BACKUP_INTERVAL_MIN * 60000).unref();
}

const status = () => ({
  enabled: cfg.BACKUP_INTERVAL_MIN > 0, intervalMin: cfg.BACKUP_INTERVAL_MIN, offsite: s3Enabled(), keepLocal: cfg.BACKUP_KEEP_LOCAL,
  lastOk: state.lastOk, lastError: state.lastError, running: state.running,
  local: (() => { try { return fs.readdirSync(DIR).filter((f) => f.endsWith('.db.gz.enc')).length; } catch { return 0; } })(),
});

module.exports = { start, runBackup, status, encrypt, decrypt, s3Put, DIR };
