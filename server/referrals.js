/* Referral program: a referrer earns REFERRAL_SHARE of the house's theoretical profit on every real-money
 * bet their referred players make. Commission accrues in milli-units (1/1000 of 0.01 credit) and is claimed
 * into the referrer's real balance. */
'use strict';
const crypto = require('crypto');
const cfg = require('./config');
const { db, q, tx, credit } = require('./db');
const { theoOf } = require('./theo');

for (const sql of [
  'ALTER TABLE users ADD COLUMN referred_by INTEGER REFERENCES users(id)',
  'ALTER TABLE users ADD COLUMN ref_code TEXT',
  'ALTER TABLE users ADD COLUMN ref_pending_milli INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN ref_paid_milli INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE rounds ADD COLUMN params TEXT',
]) { try { db.exec(sql); } catch { /* column exists */ } }
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_ref_code ON users(ref_code);
CREATE TABLE IF NOT EXISTS referral_stats (
  referrer_id INTEGER NOT NULL, referee_id INTEGER NOT NULL, wagered INTEGER NOT NULL DEFAULT 0, rounds INTEGER NOT NULL DEFAULT 0,
  commission_milli INTEGER NOT NULL DEFAULT 0, last_ts INTEGER, PRIMARY KEY (referrer_id, referee_id));`);

const SHARE = Math.min(0.5, Math.max(0, cfg.REFERRAL_SHARE));
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
function newCode() {
  for (;;) {
    const b = crypto.randomBytes(7); let c = '';
    for (const x of b) c += ALPHABET[x % ALPHABET.length];
    if (!q('SELECT 1 FROM users WHERE ref_code = ?').get(c)) return c;
  }
}
/** A user's referral code (created on first use). */
function codeOf(userId) {
  const u = q('SELECT ref_code FROM users WHERE id = ?').get(userId);
  if (u.ref_code) return u.ref_code;
  const c = newCode(); q('UPDATE users SET ref_code = ? WHERE id = ?').run(c, userId); return c;
}
const findByCode = (code) => q('SELECT id FROM users WHERE ref_code = ?').get(String(code || '').trim().toUpperCase());

/** Link a referee to a referrer (only once, never to yourself, only before any real-money play). */
function attach(userId, code) {
  const ref = findByCode(code);
  if (!ref) throw new Error('Referral code not found');
  if (ref.id === userId) throw new Error('You cannot use your own referral code');
  const u = q('SELECT referred_by FROM users WHERE id = ?').get(userId);
  if (u.referred_by) throw new Error('A referral code is already set on your account');
  if (q("SELECT 1 FROM rounds WHERE user_id = ? AND mode = 'real' LIMIT 1").get(userId)) throw new Error('Referral codes can only be added before your first real-money bet');
  q('UPDATE users SET referred_by = ? WHERE id = ?').run(ref.id, userId);
  q('INSERT OR IGNORE INTO referral_stats (referrer_id, referee_id) VALUES (?,?)').run(ref.id, userId);
}

/** Called inside the settlement transaction of every finished real-money round. */
function accrue(userId, mode, game, wagerUnits, params, state) {
  if (mode !== 'real' || !SHARE || !(wagerUnits > 0)) return;
  const u = q('SELECT referred_by FROM users WHERE id = ?').get(userId);
  if (!u || !u.referred_by) return;
  const milli = Math.floor(theoOf(game, params, wagerUnits, state) * SHARE * 1000);
  q('UPDATE referral_stats SET wagered = wagered + ?, rounds = rounds + 1, commission_milli = commission_milli + ?, last_ts = ? WHERE referrer_id = ? AND referee_id = ?')
    .run(wagerUnits, Math.max(0, milli), Date.now(), u.referred_by, userId);
  if (milli > 0) q('UPDATE users SET ref_pending_milli = ref_pending_milli + ? WHERE id = ?').run(milli, u.referred_by);
}

/** Move whole units of pending commission into the real balance. */
function claim(userId) {
  return tx(() => {
    const u = q('SELECT ref_pending_milli FROM users WHERE id = ?').get(userId);
    const unitsOut = Math.floor(u.ref_pending_milli / 1000);
    if (unitsOut < 1) throw new Error('Nothing to claim yet');
    q('UPDATE users SET ref_pending_milli = ref_pending_milli - ?, ref_paid_milli = ref_paid_milli + ? WHERE id = ?').run(unitsOut * 1000, unitsOut * 1000, userId);
    credit(userId, 'real', unitsOut, 'referral-commission');
    return unitsOut;
  });
}

function summary(userId) {
  const u = q('SELECT ref_pending_milli, ref_paid_milli, referred_by FROM users WHERE id = ?').get(userId);
  const rows = q('SELECT s.*, u.username, u.created FROM referral_stats s JOIN users u ON u.id = s.referee_id WHERE s.referrer_id = ? ORDER BY s.wagered DESC LIMIT 200').all(userId);
  const by = u.referred_by ? q('SELECT username FROM users WHERE id = ?').get(u.referred_by).username : null;
  const mask = (n) => (n.length <= 3 ? n[0] + '**' : n.slice(0, 2) + '*'.repeat(Math.min(6, n.length - 3)) + n.slice(-1));
  return {
    code: codeOf(userId), share: SHARE, referredBy: by,
    canAddCode: !u.referred_by && !q("SELECT 1 FROM rounds WHERE user_id = ? AND mode = 'real' LIMIT 1").get(userId),
    pending: u.ref_pending_milli / 1000 / 100, paid: u.ref_paid_milli / 1000 / 100,
    referrals: rows.map((r) => ({ name: mask(r.username), joined: r.created, rounds: r.rounds, wagered: r.wagered / 100, commission: r.commission_milli / 1000 / 100, last: r.last_ts })),
  };
}
const totals = () => q('SELECT COALESCE(SUM(ref_pending_milli),0) pending, COALESCE(SUM(ref_paid_milli),0) paid, COUNT(referred_by) referred FROM users').get();

module.exports = { SHARE, codeOf, newCode, attach, accrue, claim, summary, totals, findByCode };
