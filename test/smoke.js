/* Browser smoke test: loads every game, plays a few rounds, fails on JS errors.
 * Usage: node test/smoke.js   (needs Playwright + Chromium available) */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const PORT = 8099;
const SHOTS = path.join(__dirname, 'screens');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'casino-smoke-'));
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_FILE: path.join(tmp, 'db.sqlite'), CHAIN_ENABLED: 'false', PLAY_RATE_PER_5S: '100000' } });
  await wait(1200);
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${PORT}/#login`);
  await page.click('text=New here? Create an account');
  await page.fill('input[autocomplete=username]', 'smoketest');
  await page.fill('input[type=password]', 'password123');
  await page.click('button[type=submit]');
  await page.waitForSelector('.tile');
  const tiles = await page.locator('.tile').count();
  console.log('Lobby tiles:', tiles);
  await page.screenshot({ path: path.join(SHOTS, '00-lobby.png'), fullPage: true });
  const ids = await page.evaluate(() => Casino.games.slice().sort((a, b) => a.n - b.n).map((g) => g.id));
  const click = async (sel, n = 0) => { const l = page.locator(sel).filter({ visible: true }).nth(n); if (await l.count()) { await l.click({ timeout: 2000 }).catch(() => {}); return true; } return false; };
  const clickText = async (t) => { const l = page.locator('button', { hasText: t }).filter({ visible: true }).first(); if (await l.count() && await l.isEnabled()) { await l.click({ timeout: 2000 }).catch(() => {}); return true; } return false; };
  const results = [];
  for (const id of ids) {
    const before = errors.length;
    const bal0 = await page.evaluate(() => Casino.balance());
    await page.goto(`http://localhost:${PORT}/#${id}`);
    await wait(300);
    for (let round = 0; round < 3; round++) {
      if (await page.locator('.spot').count()) { await click('.spot', 1); await click('.spot', 3); }
      if (id === 'keno') await clickText('Quick Pick');
      if (id === 'holdem') {
        await clickText('DEAL HAND');
        for (let i = 0; i < 40; i++) { if (!(await clickText('Call') || await clickText('Check'))) await wait(400); if (await page.locator('button', { hasText: 'DEAL HAND' }).isVisible()) break; }
        continue;
      }
      if (id === 'paigow') { await clickText('DEAL'); await clickText('House Way'); await clickText('PLAY HAND'); await wait(200); continue; }
      if (['mines', 'tower'].includes(id)) { await clickText('BET'); await wait(100); await wait(200); await click('.mtile:not(.disabled):not(.open)'); await wait(400); await clickText('CASH OUT'); await wait(400); continue; }
      if (id === 'hilo') { await clickText('BET'); await wait(300); if (!(await clickText('Higher'))) await clickText('Lower'); await wait(300); await clickText('CASH OUT'); await wait(300); continue; }
      if (id === 'crash') { await clickText('BET'); await wait(2500); await clickText('CASH OUT'); await wait(3000); continue; }
      if (id === 'scratch') { await clickText('BUY TICKET'); await clickText('Reveal all'); continue; }
      if (id === 'fish') { const box = await page.locator('canvas').boundingBox(); for (let i = 0; i < 8; i++) await page.mouse.click(box.x + 100 + i * 90, box.y + 120); await wait(2500); continue; }
      if (id === 'blackjack') { await clickText('DEAL'); await wait(400); await clickText('Stand'); await wait(1800); continue; }
      if (['threecard', 'caribbean'].includes(id)) { await clickText('DEAL'); await clickText('PLAY') || await clickText('RAISE'); await wait(200); continue; }
      if (id === 'letitride') { await clickText('DEAL'); await clickText('LET IT RIDE'); await clickText('PULL BACK'); continue; }
      if (id === 'war') { await clickText('DEAL'); await clickText('SURRENDER'); continue; }
      if (id === 'videopoker') { await clickText('DEAL'); await click('.vp-slot', 0); await clickText('DRAW'); continue; }
      if (id === 'coinflip') { await clickText('HEADS'); await wait(1700); continue; }
      if (id === 'plinko') { await clickText('DROP BALL'); await wait(2500); continue; }
      const main = page.locator('.btn.big').filter({ visible: true }).first();
      if (await main.count()) await main.click({ timeout: 2000 }).catch(() => {});
      await wait(['roulette-us', 'roulette-eu'].includes(id) ? 4600 : id === 'bigsix' ? 5300 : id === 'bingo' ? 4000 : id === 'keno' ? 1800 : 1600);
    }
    await wait(300);
    await page.screenshot({ path: path.join(SHOTS, `${id}.png`) });
    await page.goto(`http://localhost:${PORT}/#lobby`); await wait(150); // leave the table (flushes batched records)
    const s = await page.evaluate(async (g) => ({ bal: Casino.balance(), hist: (await (await fetch('/api/history?mode=demo')).json()).rounds.filter((x) => x.game === g || (g.startsWith('baccarat') && x.game === 'baccarat')).length }), id);
    results.push({ id, rounds: s.hist, balanceDelta: +(s.bal - bal0).toFixed(2), errors: errors.length - before });
  }
  for (const p of ['#history', '#stats', '#edges', '#wallet', '#admin']) { await page.goto(`http://localhost:${PORT}/${p}`); await wait(200); await page.screenshot({ path: path.join(SHOTS, p.slice(1) + '.png'), fullPage: false }); }
  console.table(results);
  if (errors.length) { console.log('ERRORS:'); errors.forEach((e) => console.log(' -', e)); }
  await browser.close(); srv.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  const bad = results.filter((r) => r.errors || !r.rounds);
  if (tiles !== 30 || errors.length || bad.length) { console.log('SMOKE FAILED', bad.map((b) => b.id)); process.exit(1); }
  console.log('SMOKE OK');
})().catch((e) => { console.error(e); process.exit(1); });
