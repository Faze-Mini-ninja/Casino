/* Tests: roles, chat + moderation, tips, support tickets, announcements, live odds, closed games, new games, live stream.
 * Usage: node test/social.js */
'use strict';
const os = require('os'), path = require('path'), fs = require('fs'), http = require('http');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-social-'));
Object.assign(process.env, { DB_FILE: path.join(dir, 't.db'), DATA_DIR: dir, CHAIN_ENABLED: 'false', PLAY_RATE_PER_5S: '100000', ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'boss-password-1', REGISTRATION_CODE: '', SEED_USERS: '' });
const { server } = require('../server/index.js');
const { q, credit } = require('../server/db');
let base = '', fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL:', m); } else console.log('  ok', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  let cookie = '';
  const f = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const j = await r.json(); j._status = r.status; return j;
  };
  f.cookie = () => cookie;
  return f;
}
/** open an SSE connection and collect events */
function listen(cookie) {
  const events = [];
  const req = http.get(base + '/api/stream', { headers: { cookie } }, (res) => {
    let buf = '';
    res.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /event: (.+)/.exec(chunk), data = /data: (.+)/.exec(chunk); if (ev && data) events.push({ type: ev[1], data: JSON.parse(data[1]) }); } });
  });
  return { events, close: () => req.destroy() };
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port;
  const A = client(), P = client(), M = client(), X = client();
  await A('POST', '/api/login', { username: 'boss', password: 'boss-password-1' });
  await P('POST', '/api/register', { username: 'player1', password: 'password123' });
  await M('POST', '/api/register', { username: 'moddy', password: 'password123' });
  await X('POST', '/api/register', { username: 'xavier', password: 'password123' });
  const id = (n) => q('SELECT id FROM users WHERE username = ?').get(n).id;

  console.log('roles');
  ok((await P('POST', '/api/admin/users/role', { id: id('moddy'), role: 'mod' }))._status === 403, 'players cannot set roles');
  ok((await A('POST', '/api/admin/users/role', { id: id('moddy'), role: 'mod' })).ok, 'admin makes moddy a mod');
  ok((await A('POST', '/api/admin/users/role', { id: id('xavier'), role: 'staff' })).ok, 'admin makes xavier staff');
  ok((await A('POST', '/api/admin/users/role', { id: id('boss'), role: 'player' }))._status === 400, 'admin cannot demote self');
  ok((await M('GET', '/api/admin/dash')).online !== undefined, 'mod can open the dashboard');
  ok((await M('GET', '/api/admin/users'))._status === 403, 'mod cannot list players');
  ok((await X('GET', '/api/admin/users')).users.length >= 4, 'staff can list players');
  ok((await X('POST', '/api/admin/users/adjust', { id: id('player1'), mode: 'demo', amount: 5 }))._status === 403, 'staff cannot change balances');
  ok((await X('GET', '/api/admin/user?id=' + id('player1'))).user.username === 'player1', 'staff can open a player profile');

  console.log('chat + live stream');
  const sse = listen(P.cookie()), sseStaff = listen(X.cookie());
  await sleep(300);
  const msg = await P('POST', '/api/chat', { text: '  hello   <b>world</b> ' });
  ok(msg.ok && msg.message.text === 'hello <b>world</b>', 'chat message stored as plain text (rendered safely by the client)');
  ok((await P('POST', '/api/chat', { text: 'spam' }))._status === 429, 'chat is rate limited');
  ok((await client()('POST', '/api/chat', { text: 'anon' }))._status === 401, 'guests cannot chat');
  await sleep(200);
  ok(sse.events.some((e) => e.type === 'chat' && e.data.text === 'hello <b>world</b>'), 'chat message pushed live');
  ok((await P('POST', '/api/chat/delete', { id: msg.message.id }))._status === 403, 'players cannot delete messages');
  ok((await M('POST', '/api/chat/delete', { id: msg.message.id })).ok, 'mod deletes message');
  await sleep(150);
  ok(sse.events.some((e) => e.type === 'chat-del' && e.data.id === msg.message.id), 'deletion pushed live');
  ok(!(await P('GET', '/api/chat')).messages.some((m) => m.id === msg.message.id), 'deleted message hidden from history');
  ok((await M('POST', '/api/mod/mute', { username: 'xavier', minutes: 10 }))._status === 403, 'mod cannot mute staff');
  ok((await M('POST', '/api/mod/mute', { username: 'player1', minutes: 10 })).ok, 'mod mutes player1');
  await sleep(1600);
  ok((await P('POST', '/api/chat', { text: 'am I muted?' }))._status === 403, 'muted player cannot chat');
  await M('POST', '/api/mod/mute', { username: 'player1', minutes: 0 });
  await P('POST', '/api/play', { game: 'dice', params: { bet: 5, target: 50 }, mode: 'demo' });
  await sleep(200);
  const pubBet = sse.events.find((e) => e.type === 'bet'), staffBet = sseStaff.events.find((e) => e.type === 'bet');
  ok(pubBet && pubBet.data.user !== 'player1' && !pubBet.data.userId, 'public bet feed hides the username');
  ok(staffBet && staffBet.data.user === 'player1', 'staff live feed shows the username');

  console.log('tips');
  const before = (await P('GET', '/api/me')).balances.demo;
  ok((await P('POST', '/api/tip', { to: 'moddy', amount: 25, mode: 'demo' })).ok, 'demo tip sent');
  ok((await P('GET', '/api/me')).balances.demo === before - 2500, 'tip debited');
  ok((await P('POST', '/api/tip', { to: 'player1', amount: 5, mode: 'demo' }))._status === 400, 'cannot tip yourself');
  ok((await P('POST', '/api/tip', { to: 'nobody', amount: 5, mode: 'demo' }))._status === 404, 'unknown player rejected');
  credit(id('player1'), 'real', 100000, 'test');
  ok((await P('POST', '/api/tip', { to: 'moddy', amount: 10, mode: 'real' }))._status === 403, 'real tips need wagering history first');
  for (let i = 0; i < 12; i++) await P('POST', '/api/play', { game: 'coinflip', params: { bet: 10, call: 'H' }, mode: 'real' });
  const rt = await P('POST', '/api/tip', { to: 'moddy', amount: 10, mode: 'real' });
  ok(rt.ok, 'real tip allowed after wagering');
  ok((await A('POST', '/api/admin/tipping', { enabled: false, minWagered: 100, dailyMax: 5000 })).ok, 'admin turns real tipping off');
  ok((await P('POST', '/api/tip', { to: 'moddy', amount: 10, mode: 'real' }))._status === 403, 'real tips refused while off');
  await A('POST', '/api/admin/tipping', { enabled: true, minWagered: 100, dailyMax: 5000 });
  const led = (n, m) => q('SELECT SUM(delta) s FROM ledger WHERE user_id = ? AND mode = ?').get(id(n), m).s;
  ok(led('moddy', 'real') === q('SELECT real_units r FROM users WHERE username = ?').get('moddy').r, 'tip recipient ledger reconciles');

  console.log('support');
  const t = await P('POST', '/api/support/tickets', { subject: 'Deposit missing', text: 'I sent 1 SOL an hour ago' });
  ok(t.ok, 'ticket opened');
  ok((await X('GET', '/api/support/tickets?all=1')).tickets.some((x) => x.id === t.id && x.user === 'player1'), 'staff sees the ticket');
  ok((await client()('GET', '/api/support/ticket?id=' + t.id))._status === 401, 'guests cannot read tickets');
  ok((await A('GET', '/api/support/tickets?all=1')).tickets.length >= 1, 'admin sees tickets');
  ok((await M('POST', '/api/support/reply', { id: t.id, text: 'Checking now!' })).ok, 'mod replies');
  const th = await P('GET', '/api/support/ticket?id=' + t.id);
  ok(th.ticket.status === 'answered' && th.messages[1].user === 'Support', 'player sees "Support" as the replier');
  ok((await P('POST', '/api/support/status', { id: t.id, status: 'closed' })).ok, 'player closes ticket');

  console.log('announcements');
  ok((await P('POST', '/api/admin/announce', { text: 'hi' }))._status === 403, 'players cannot announce');
  const an = await X('POST', '/api/admin/announce', { text: 'Weekend race: top 10 split 5 SOL', tone: 'promo', link: '#cat-originals' });
  ok(an.announcement && an.announcement.tone === 'promo', 'staff posts announcement');
  ok((await P('GET', '/api/me')).config.announcement.text.startsWith('Weekend race'), 'announcement included for players');
  await sleep(150);
  ok(sse.events.some((e) => e.type === 'announce'), 'announcement pushed live');
  ok((await A('POST', '/api/admin/announce', { text: 'x', link: 'javascript:alert(1)' })).announcement.link === '', 'unsafe links are dropped');

  console.log('live odds');
  const cfg0 = (await P('GET', '/api/me')).config.odds;
  ok((await X('POST', '/api/admin/games', { edge: { dice: 0.03 } }))._status === 403, 'staff cannot change odds');
  ok((await A('POST', '/api/admin/games', { edge: { dice: 0.9 } }))._status === 400, 'out-of-range edge rejected');
  const ch = await A('POST', '/api/admin/games', { edge: { dice: 0.02, crash: 0.05 }, plinko: { high: 0.7 } });
  ok(ch.ok && ch.odds.edge.dice === 0.02 && ch.odds.v === cfg0.v + 1, 'admin lowers dice edge to 2%');
  const stale = await P('POST', '/api/play', { game: 'dice', params: { bet: 5, target: 50 }, mode: 'demo', ov: cfg0.v });
  ok(stale._status === 400 && stale.odds && stale.odds.edge.dice === 0.02, 'bet with old odds refused and new odds returned');
  const fresh = await P('POST', '/api/play', { game: 'dice', params: { bet: 5, target: 50 }, mode: 'demo', ov: ch.odds.v });
  ok(fresh.result.mult === 1.96, 'new dice multiplier applies (98 / 50 = 1.96×)');
  // a Mines round keeps the odds it started with
  await A('POST', '/api/admin/games', { edge: { mines: 0.1 } });
  const v1 = (await P('GET', '/api/me')).config.odds.v;
  await P('POST', '/api/play', { game: 'mines', action: 'start', params: { bet: 10, mines: 1 }, mode: 'demo', ov: v1 });
  await A('POST', '/api/admin/games', { edge: { mines: 0.4 } });
  let mr; for (let i = 0; i < 25; i++) { mr = await P('POST', '/api/play', { game: 'mines', action: 'pick', params: { i }, mode: 'demo' }); if (mr._status === 200) break; }
  if (mr.view && mr.view.mult) ok(mr.view.mult === Math.floor(0.9 * 25 / 24 * 100) / 100, 'open Mines round keeps its starting odds');
  await P('POST', '/api/play', { game: 'mines', action: 'cashout', params: {}, mode: 'demo' });
  ok((await A('POST', '/api/admin/games', { reset: true })).odds.edge.dice === 0.06, 'reset restores default odds');

  console.log('closed games');
  const v2 = (await A('POST', '/api/admin/games', { disabled: ['slots'] })).odds.v;
  ok((await P('POST', '/api/play', { game: 'slots', params: { bet: 1 }, mode: 'demo', ov: v2 })).error.includes('maintenance'), 'closed game refuses bets');
  await A('POST', '/api/admin/games', { disabled: [] });

  console.log('new games');
  const v3 = (await P('GET', '/api/me')).config.odds.v;
  const w = await P('POST', '/api/play', { game: 'wheel', params: { bet: 5, segments: 30, risk: 'high' }, mode: 'demo', ov: v3 });
  ok(w._status === 200 && typeof w.result.mult === 'number', 'wheel plays');
  const c = await P('POST', '/api/play', { game: 'cases', params: { bet: 5, case: 'jackpot' }, mode: 'demo', ov: v3 });
  ok(c._status === 200 && c.result.rarity, 'cases plays');
  let rd = await P('POST', '/api/play', { game: 'reddog', action: 'start', params: { ante: 5 }, mode: 'demo', ov: v3 });
  if (!rd.done) rd = await P('POST', '/api/play', { game: 'reddog', action: 'raise', params: {}, mode: 'demo' });
  ok(rd.done && rd.view.note, 'red dog round completes');
  ok((await P('POST', '/api/play', { game: 'wheel', params: { bet: 5, segments: 7, risk: 'high' }, mode: 'demo' }))._status === 400, 'invalid wheel config rejected');

  console.log('admin views');
  ok((await A('GET', '/api/admin/games')).games.some((g) => g.id === 'wheel' && g.edgeKey === 'wheel'), 'games list includes new games');
  ok((await M('GET', '/api/admin/live')).recent.length > 0, 'live view lists recent bets');
  ok((await A('GET', '/api/admin/users')).log.some((l) => l.action === 'odds-change'), 'odds changes are in the admin log');

  sse.close(); sseStaff.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `SOCIAL TEST FAILED (${fails})` : 'SOCIAL TEST OK'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
