/* Compliance: responsible gambling (deposit limits, cool-off, self-exclusion) and AML review flags.
 * Geo-blocking is handled outside this app.
 *
 * Responsible gambling (set by the player on the Responsible Gambling page)
 *   Deposit limits per 24 h / 7 days / 30 days. Lowering or adding a limit is immediate; raising or removing one
 *   takes effect after RG_INCREASE_DELAY_HOURS. Cool-off (1 day to 6 weeks) stops real-money play and deposits.
 *   Self-exclusion (6 months to permanent) also stops demo play. Neither can be lifted early, by the player or staff.
 *   Withdrawals always stay open, so players can take their money out.
 *
 * AML
 *   Large deposits, high 24 h deposit totals, deposits made during a break or over a limit, and withdrawals with
 *   little wagering since the last deposit raise a flag for staff. Any withdrawal while a flag is open waits for review. */
'use strict';
const cfg = require('./config');
const { q, tx } = require('./db');

/* ---------- schema ---------- */
for (const [c, def] of [['age_confirmed', 'INTEGER NOT NULL DEFAULT 0']]) {
  try { q(`ALTER TABLE users ADD COLUMN ${c} ${def}`).run(); } catch { /* exists */ }
}
q(`CREATE TABLE IF NOT EXISTS rg_limits (
  user_id INTEGER PRIMARY KEY REFERENCES users(id), daily INTEGER, weekly INTEGER, monthly INTEGER,
  pending TEXT, pending_at INTEGER, updated INTEGER NOT NULL)`).run();
q(`CREATE TABLE IF NOT EXISTS rg_blocks (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, until INTEGER, set_by INTEGER, created INTEGER NOT NULL)`).run();
q('CREATE INDEX IF NOT EXISTS rg_blocks_user ON rg_blocks(user_id)').run();
q(`CREATE TABLE IF NOT EXISTS aml_flags (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL, detail TEXT, units INTEGER,
  status TEXT NOT NULL DEFAULT 'open', note TEXT, reviewed_by INTEGER, reviewed_at INTEGER, created INTEGER NOT NULL)`).run();
q('CREATE INDEX IF NOT EXISTS aml_flags_user ON aml_flags(user_id, status)').run();

const DAY = 86400000;
const WINDOWS = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };
const COOLOFF_DAYS = [1, 7, 30, 42];
const EXCLUSION_MONTHS = [6, 12, 60, 0]; // 0 = permanent

/* ---------- responsible gambling ---------- */
function activeBlock(userId) {
  const now = Date.now();
  // the strongest block wins: any self-exclusion over a cool-off; the later end date otherwise
  const rows = q('SELECT kind, until, created FROM rg_blocks WHERE user_id = ? AND (until IS NULL OR until > ?)').all(userId, now);
  if (!rows.length) return null;
  const rank = (r) => (r.kind === 'exclusion' ? 2 : 1) * 1e15 + (r.until == null ? 1e14 : r.until);
  const b = rows.sort((a, z) => rank(z) - rank(a))[0];
  return { kind: b.kind, until: b.until, since: b.created };
}
function limitsRow(userId) {
  let r = q('SELECT * FROM rg_limits WHERE user_id = ?').get(userId);
  if (r && r.pending && r.pending_at <= Date.now()) { // a delayed increase has come due
    const p = JSON.parse(r.pending);
    q('UPDATE rg_limits SET daily = ?, weekly = ?, monthly = ?, pending = NULL, pending_at = NULL, updated = ? WHERE user_id = ?').run(p.daily, p.weekly, p.monthly, Date.now(), userId);
    r = q('SELECT * FROM rg_limits WHERE user_id = ?').get(userId);
  }
  return r || { daily: null, weekly: null, monthly: null, pending: null, pending_at: null };
}
const depositedSince = (userId, since) => q("SELECT COALESCE(SUM(units),0) s FROM deposits WHERE user_id = ? AND kind = 'deposit' AND ts > ?").get(userId, since).s;

/** Limits with how much is used and left in each window (all in cents). */
function limits(userId) {
  const r = limitsRow(userId), now = Date.now(), out = {};
  for (const k of Object.keys(WINDOWS)) {
    const used = depositedSince(userId, now - WINDOWS[k]);
    out[k] = { limit: r[k], used, left: r[k] == null ? null : Math.max(0, r[k] - used) };
  }
  return { ...out, pending: r.pending ? { ...JSON.parse(r.pending), at: r.pending_at } : null };
}

/** Set deposit limits (dollars, or null for none). Tighter limits apply now; looser ones after the delay. */
function setLimits(userId, input) {
  const cur = limitsRow(userId), next = {};
  for (const k of Object.keys(WINDOWS)) {
    const v = input[k];
    if (v === null || v === '' || v === undefined) next[k] = null;
    else {
      const units = Math.round(Number(v) * 100);
      if (!Number.isInteger(units) || units < 100 || units > 1e11) throw new Error('Limits must be at least $1');
      next[k] = units;
    }
  }
  if (next.daily != null && next.weekly != null && next.daily > next.weekly) throw new Error('Your 24-hour limit cannot be higher than your 7-day limit');
  if (next.weekly != null && next.monthly != null && next.weekly > next.monthly) throw new Error('Your 7-day limit cannot be higher than your 30-day limit');
  const looser = (k) => cur[k] != null && (next[k] == null || next[k] > cur[k]);
  const now = Date.now(), immediate = {}, delayed = {};
  for (const k of Object.keys(WINDOWS)) { immediate[k] = looser(k) ? cur[k] : next[k]; delayed[k] = next[k]; }
  const anyLooser = Object.keys(WINDOWS).some(looser);
  tx(() => {
    q(`INSERT INTO rg_limits (user_id, daily, weekly, monthly, pending, pending_at, updated) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET daily = excluded.daily, weekly = excluded.weekly, monthly = excluded.monthly, pending = excluded.pending, pending_at = excluded.pending_at, updated = excluded.updated`)
      .run(userId, immediate.daily, immediate.weekly, immediate.monthly, anyLooser ? JSON.stringify(delayed) : null, anyLooser ? now + cfg.RG_INCREASE_DELAY_HOURS * 3600000 : null, now);
  });
  return limits(userId);
}

function coolOff(userId, days) {
  if (!COOLOFF_DAYS.includes(Number(days))) throw new Error('Choose a cool-off period');
  q("INSERT INTO rg_blocks (user_id, kind, until, set_by, created) VALUES (?, 'cooloff', ?, ?, ?)").run(userId, Date.now() + Number(days) * DAY, userId, Date.now());
  return activeBlock(userId);
}
function selfExclude(userId, months, setBy = userId) {
  months = Number(months);
  if (!EXCLUSION_MONTHS.includes(months)) throw new Error('Choose a self-exclusion period');
  const until = months === 0 ? null : (() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + months); return d.getTime(); })();
  q("INSERT INTO rg_blocks (user_id, kind, until, set_by, created) VALUES (?, 'exclusion', ?, ?, ?)").run(userId, until, setBy, Date.now());
  return activeBlock(userId);
}
const blockText = (b) => {
  const when = b.until == null ? 'permanently' : 'until ' + new Date(b.until).toUTCString().replace(/:\d\d GMT$/, ' UTC');
  return b.kind === 'exclusion' ? `Your account is self-excluded ${when}. You can still withdraw your balance.` : `You are on a cool-off break ${when}. You can still withdraw your balance.`;
};

/* ---------- checks used by the routes ---------- */
/** Why this player may not bet in this mode right now, or null. */
function playBlock(userId, mode) {
  const b = activeBlock(userId);
  if (b && (b.kind === 'exclusion' || mode === 'real')) return blockText(b);
  return null;
}
/** Why this player cannot deposit now, or null. */
function depositBlock(userId) {
  const b = activeBlock(userId); if (b) return blockText(b);
  const l = limits(userId);
  for (const [k, label] of [['daily', '24-hour'], ['weekly', '7-day'], ['monthly', '30-day']]) {
    if (l[k].limit != null && l[k].left <= 0) return `You have reached your ${label} deposit limit. Deposits open again as older deposits leave the window.`;
  }
  return null;
}
/** Lowest remaining deposit allowance in cents, or null for no limit. */
function depositRoom(userId) {
  const l = limits(userId), left = Object.keys(WINDOWS).map((k) => l[k].left).filter((x) => x != null);
  return left.length ? Math.min(...left) : null;
}

/* ---------- AML ---------- */
function flag(userId, kind, detail, units) {
  q('INSERT INTO aml_flags (user_id, kind, detail, units, created) VALUES (?,?,?,?,?)').run(userId, kind, String(detail || '').slice(0, 300), units == null ? null : Math.round(units), Date.now());
}
const openFlags = (userId) => q("SELECT COUNT(*) n FROM aml_flags WHERE user_id = ? AND status = 'open'").get(userId).n;

/** Called inside the deposit transaction, after the credit. */
function onDeposit(userId, units, asset, txid) {
  const usd = units / 100;
  if (cfg.AML_DEPOSIT_FLAG_USD > 0 && usd >= cfg.AML_DEPOSIT_FLAG_USD) flag(userId, 'large-deposit', `$${usd.toFixed(2)} in ${asset} (${txid})`, units);
  const day = depositedSince(userId, Date.now() - DAY);
  if (cfg.AML_DAILY_FLAG_USD > 0 && day >= cfg.AML_DAILY_FLAG_USD * 100 && day - units < cfg.AML_DAILY_FLAG_USD * 100) flag(userId, 'daily-deposits', `$${(day / 100).toFixed(2)} deposited in 24 hours`, day);
  const b = activeBlock(userId);
  if (b) flag(userId, 'deposit-while-' + b.kind, `$${usd.toFixed(2)} in ${asset} arrived during ${b.kind === 'exclusion' ? 'self-exclusion' : 'a cool-off'} (${txid})`, units);
  const l = limits(userId); // already includes this deposit
  for (const k of Object.keys(WINDOWS)) {
    if (l[k].limit != null && l[k].used > l[k].limit && l[k].used - units <= l[k].limit) { flag(userId, 'over-deposit-limit', `$${usd.toFixed(2)} in ${asset} went over the player's ${k} limit (${txid})`, units); break; }
  }
}

/** Reason a withdrawal must be reviewed by staff, or null. Also raises a flag for low turnover. */
function withdrawalReview(userId, units) {
  if (openFlags(userId)) return 'open-flag';
  if (cfg.AML_MIN_TURNOVER > 0) {
    const last = q("SELECT MAX(ts) t FROM deposits WHERE user_id = ? AND kind = 'deposit'").get(userId).t;
    if (last) {
      const since = last - 7 * DAY; // deposits of the last week before the latest one
      const dep = depositedSince(userId, since);
      const wag = q("SELECT COALESCE(SUM(wager),0) s FROM rounds WHERE user_id = ? AND mode = 'real' AND status = 'done' AND updated > ?").get(userId, since).s;
      if (wag < dep * cfg.AML_MIN_TURNOVER) {
        flag(userId, 'low-turnover', `Withdrawal of $${(units / 100).toFixed(2)} after wagering $${(wag / 100).toFixed(2)} on $${(dep / 100).toFixed(2)} deposited`, units);
        return 'low-turnover';
      }
    }
  }
  return null;
}

function listFlags(status = 'open') {
  return q(`SELECT f.*, u.username, r.username AS reviewer FROM aml_flags f JOIN users u ON u.id = f.user_id LEFT JOIN users r ON r.id = f.reviewed_by
    WHERE (? = 'all' OR f.status = ?) ORDER BY f.id DESC LIMIT 200`).all(status, status);
}
function reviewFlag(id, adminId, note) {
  const r = q("UPDATE aml_flags SET status = 'cleared', note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'open'").run(String(note || '').slice(0, 300), adminId, Date.now(), id);
  if (!r.changes) throw new Error('That flag is not open');
}

/** What the player sees about their own status. */
function status(userId) {
  const b = activeBlock(userId), l = limits(userId);
  const cents = (x) => (x == null ? null : x / 100);
  const lim = Object.fromEntries(Object.keys(WINDOWS).map((k) => [k, { limit: cents(l[k].limit), used: cents(l[k].used), left: cents(l[k].left) }]));
  return {
    block: b ? { ...b, text: blockText(b) } : null,
    limits: lim, pending: l.pending ? { daily: cents(l.pending.daily), weekly: cents(l.pending.weekly), monthly: cents(l.pending.monthly), at: l.pending.at } : null,
    depositBlock: depositBlock(userId),
    cooloffDays: COOLOFF_DAYS, exclusionMonths: EXCLUSION_MONTHS, increaseDelayHours: cfg.RG_INCREASE_DELAY_HOURS,
  };
}

module.exports = {
  activeBlock, limits, setLimits, coolOff, selfExclude, playBlock, depositBlock, depositRoom,
  onDeposit, withdrawalReview, flag, openFlags, listFlags, reviewFlag, status, COOLOFF_DAYS, EXCLUSION_MONTHS,
};
