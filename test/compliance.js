/* Compliance test: geo-blocking, age confirmation, deposit limits, cool-off, self-exclusion and AML flags,
 * through the HTTP API against a throwaway database (blockchain disabled; the country comes from a test header).
 * Usage: node test/compliance.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-rg-'));
Object.assign(process.env, {
  DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', PORT: '0', SOLANA_CLUSTER: 'devnet',
  ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'owner-password-1', GEO_HEADER: 'x-test-country', GEO_UNKNOWN: 'block',
  BLOCKED_COUNTRIES: 'US,GB', RG_INCREASE_DELAY_HOURS: '24', AML_DEPOSIT_FLAG_USD: '1000', AML_DAILY_FLAG_USD: '3000', AML_MIN_TURNOVER: '1',
});
const { server } = require('../server/index.js');
const { q, credit } = require('../server/db');
const rg = require('../server/compliance');
let base = '', fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL:', msg); } else console.log('  ok', msg); };
const client = (country) => {
  let cookie = '';
  const c = async (method, p, body) => {
    const headers = { 'content-type': 'application/json', cookie }; if (c.country) headers['x-test-country'] = c.country;
    const r = await fetch(base + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json(); j._status = r.status; return j;
  };
  c.country = country; return c;
};
const reg = (c, username) => c('POST', '/api/register', { username, password: 'password123', ageConfirm: true });
// a confirmed deposit, as the payments watcher would record it
let txn = 0;
const deposit = (uid, usd, ago = 0) => {
  const units = Math.round(usd * 100), id = 'tx' + ++txn;
  let a = q("SELECT id FROM addresses WHERE user_id = ? AND chain = 'solana'").get(uid);
  if (!a) a = { id: Number(q("INSERT INTO addresses (user_id, chain, day, address, created) VALUES (?, 'solana', '2026-01-01', ?, ?)").run(uid, 'addr-' + uid, Date.now()).lastInsertRowid) };
  q("INSERT INTO deposits (txid, address_id, asset, user_id, base, units, price, kind, ts) VALUES (?,?,'USDC',?,?,?,1,'deposit',?)").run(id, a.id, uid, units * 10000, units, Date.now() - ago);
  credit(uid, 'real', units, 'deposit', id); rg.onDeposit(uid, units, 'USDC', id);
};
const flags = (uid) => q("SELECT kind FROM aml_flags WHERE user_id = ? AND status = 'open'").all(uid).map((f) => f.kind);

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;

  const admin = client('DE');
  await admin('POST', '/api/login', { username: 'owner', password: 'owner-password-1' });
  // sign-ups are rate-limited per IP, so extra accounts are created by the admin and logged in
  const make = async (username) => { const c = client('DE'); await admin('POST', '/api/admin/users/create', { username, password: 'password123', demo: 0, real: 0 }); return [c, (await c('POST', '/api/login', { username, password: 'password123' })).user.id]; };

  console.log('sign-up');
  const de = client('DE');
  ok((await de('POST', '/api/register', { username: 'noage', password: 'password123' }))._status === 400, 'sign-up without the 18+ confirmation is refused');
  ok((await reg(client('US'), 'yankee'))._status === 403, 'sign-up from a blocked country is refused');
  ok((await reg(client('gb'), 'brit'))._status === 403, 'country codes are case-insensitive');
  let r = await reg(de, 'hans');
  ok(r.user && r.rg && !r.rg.geoBlocked && !r.rg.block, 'sign-up from an allowed country works and returns RG status');
  ok(r.config.blockedCountries.join() === 'US,GB', 'blocked countries are published to the client');
  const hans = r.user.id;
  ok(q('SELECT signup_country, age_confirmed FROM users WHERE id = ?').get(hans).signup_country === 'DE', 'sign-up country recorded');
  credit(hans, 'real', 50000, 'test');

  console.log('geo-blocking an existing player');
  ok((await de('POST', '/api/play', { game: 'dice', mode: 'real', params: { bet: 1, target: 50, over: true } }))._status === 200, 'real bet from an allowed country works');
  de.country = 'US';
  r = await de('POST', '/api/play', { game: 'dice', mode: 'real', params: { bet: 1, target: 50, over: true } });
  ok(r._status === 403 && /not available in your country/.test(r.error), 'real bet from a blocked country refused');
  ok((await de('POST', '/api/play', { game: 'dice', mode: 'demo', params: { bet: 1, target: 50, over: true } }))._status === 200, 'demo play still allowed from a blocked country');
  r = await de('GET', '/api/wallet');
  ok(r.depositBlock && Object.keys(r.addresses).length === 0, 'no deposit address shown from a blocked country');
  ok((await de('GET', '/api/me')).rg.geoBlocked && q('SELECT country FROM users WHERE id = ?').get(hans).country === 'US', 'player told, and last country updated');
  de.country = '';
  ok((await de('POST', '/api/play', { game: 'dice', mode: 'real', params: { bet: 1, target: 50, over: true } }))._status === 403, 'unknown location blocks real money when GEO_UNKNOWN=block');
  de.country = 'T1';
  ok((await de('POST', '/api/play', { game: 'dice', mode: 'real', params: { bet: 1, target: 50, over: true } }))._status === 403, 'Tor (T1) counts as unknown');
  de.country = 'DE';

  console.log('deposit limits');
  r = await de('POST', '/api/rg/limits', { daily: 100, weekly: 500, monthly: null });
  ok(r.limits.daily.limit === 100 && r.limits.weekly.limit === 500 && !r.pending, 'new limits apply at once');
  ok((await de('POST', '/api/rg/limits', { daily: 600, weekly: 500 }))._status === 400, 'daily above weekly refused');
  r = await de('POST', '/api/rg/limits', { daily: 50, weekly: 1000, monthly: null });
  ok(r.limits.daily.limit === 50 && r.limits.weekly.limit === 500 && r.pending && r.pending.weekly === 1000, 'lowering is immediate, raising waits');
  q('UPDATE rg_limits SET pending_at = ? WHERE user_id = ?').run(Date.now() - 1, hans);
  r = await de('GET', '/api/rg');
  ok(r.limits.weekly.limit === 1000 && !r.pending, 'a raise applies once the delay has passed');
  deposit(hans, 30);
  r = await de('GET', '/api/wallet');
  ok(!r.depositBlock && r.depositRoom === 20, '$30 of $50 used: $20 of room left');
  deposit(hans, 25);
  r = await de('GET', '/api/wallet');
  ok(/24-hour deposit limit/.test(r.depositBlock || '') && Object.keys(r.addresses).length === 0, 'limit reached: deposits closed');
  ok(flags(hans).includes('over-deposit-limit'), 'a deposit that crossed the limit is flagged');

  console.log('AML');
  const amy = client('DE'); const amyId = (await reg(amy, 'amy')).user.id;
  deposit(amyId, 1200);
  ok(flags(amyId).includes('large-deposit'), 'single deposit over AML_DEPOSIT_FLAG_USD flagged');
  deposit(amyId, 1000); deposit(amyId, 900);
  ok(flags(amyId).filter((f) => f === 'daily-deposits').length === 1, '24 h total over AML_DAILY_FLAG_USD flagged once');
  ok(rg.withdrawalReview(amyId, 1000) === 'open-flag', 'withdrawal with open flags goes to review');
  const [, loId] = await make('lowplay');
  deposit(loId, 100);
  ok(rg.withdrawalReview(loId, 9000) === 'low-turnover' && flags(loId).includes('low-turnover'), 'withdrawal before wagering the deposit goes to review and is flagged');
  const [pl, plId] = await make('player');
  deposit(plId, 20);
  for (let i = 0; i < 25 && rg.withdrawalReview(plId, 100) !== null; i++) { // keep wagering until turnover is met
    q('DELETE FROM aml_flags WHERE user_id = ?').run(plId);
    await pl('POST', '/api/play', { game: 'dice', mode: 'real', params: { bet: 1, target: 50, over: true } });
  }
  q('DELETE FROM aml_flags WHERE user_id = ?').run(plId);
  ok(rg.withdrawalReview(plId, 100) === null, 'withdrawal after wagering the deposit is not held');

  console.log('staff');
  r = await admin('GET', '/api/admin/compliance');
  ok(r.flags.some((f) => f.username === 'amy' && f.kind === 'large-deposit'), 'admin sees open flags');
  const fid = r.flags.find((f) => f.username === 'amy').id;
  ok((await admin('POST', '/api/admin/compliance/clear', { id: fid, note: '' }))._status === 400, 'clearing needs a note');
  ok((await admin('POST', '/api/admin/compliance/clear', { id: fid, note: 'Checked source of funds' })).ok, 'admin clears a flag with a note');
  ok((await amy('GET', '/api/admin/compliance'))._status === 403, 'players cannot see the compliance tab');
  await de('GET', '/api/me'); // country is refreshed on page load / login
  r = await admin('GET', '/api/admin/user?id=' + hans);
  ok(r.user.country === 'DE' && r.flags.length && r.rg.limits.daily.limit === 50, 'player profile shows country, limits and flags');
  ok((await admin('GET', '/api/admin/dash')).openFlags > 0, 'dashboard counts open flags');

  console.log('cool-off');
  ok((await de('POST', '/api/rg/cooloff', { days: 3 }))._status === 400, 'only offered periods accepted');
  r = await de('POST', '/api/rg/cooloff', { days: 1 });
  ok(r.block && r.block.kind === 'cooloff', 'cool-off started');
  r = await de('POST', '/api/play', { game: 'dice', mode: 'real', params: { bet: 1, target: 50, over: true } });
  ok(r._status === 403 && /cool-off/.test(r.error), 'real bet refused during cool-off');
  ok((await de('POST', '/api/play', { game: 'dice', mode: 'demo', params: { bet: 1, target: 50, over: true } }))._status === 200, 'demo still allowed during cool-off');
  ok((await de('POST', '/api/tip', { to: 'amy', amount: 5, mode: 'real' }))._status === 403, 'real tips refused during cool-off');
  ok(/cool-off/.test((await de('GET', '/api/wallet')).depositBlock || ''), 'deposits closed during cool-off');
  deposit(hans, 5);
  ok(flags(hans).includes('deposit-while-cooloff'), 'a deposit that still arrives is flagged');

  console.log('self-exclusion');
  ok((await de('POST', '/api/rg/exclude', { months: 6, password: 'wrong' }))._status === 403, 'self-exclusion needs the password');
  r = await de('POST', '/api/rg/exclude', { months: 6, password: 'password123' });
  ok(r.block && r.block.kind === 'exclusion' && r.block.until > Date.now() + 150 * 86400000, 'self-excluded for 6 months (exclusion outranks the cool-off)');
  ok((await de('POST', '/api/play', { game: 'dice', mode: 'demo', params: { bet: 1, target: 50, over: true } }))._status === 403, 'demo play refused while self-excluded');
  r = await admin('POST', '/api/admin/rg/exclude', { id: amyId, months: 0 });
  ok(r.ok && rg.activeBlock(amyId).until === null, 'admin can exclude a player permanently');
  ok((await admin('GET', '/api/admin/compliance')).blocks.length >= 2, 'active exclusions listed for staff');

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (fails) { console.log(`COMPLIANCE TEST FAILED (${fails})`); process.exit(1); }
  console.log('COMPLIANCE TEST OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
