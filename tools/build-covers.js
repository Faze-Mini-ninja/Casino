/* Renders every game's cover (js/covers.js) to img/covers/<id>.webp using headless Chromium.
 * Usage: npm run covers            (all games)
 *        npm run covers -- crash   (only the listed ids)
 * Needs Playwright + Chromium (dev only); the generated images are committed, so production does not need them. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'img', 'covers'), PORT = 8096;
const W = 480, H = 640; // stored size (3:4); rendered at 2× and downscaled for crisp edges

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-covers-'));
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_FILE: path.join(tmp, 'db.sqlite'), CHAIN_ENABLED: 'false', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' } });
  try {
    await new Promise((r) => setTimeout(r, 1200));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/`);
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'covers.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'slot-assets.js') });
    await page.evaluate(async () => {
      const fams = ['Lilita One', 'Bungee', 'Luckiest Guy', 'Rye', 'Russo One', 'Monoton', 'Pirata One', 'Titan One', 'Righteous', 'Anton', 'Fredoka'];
      await Promise.all([...fams.map((f) => document.fonts.load(`40px "${f}"`)), document.fonts.load('900 40px "Cinzel Decorative"')]);
      const el = document.createElement('div'); el.id = 'cover-stage';
      el.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:400px;z-index:2147483647;background:#000';
      document.documentElement.appendChild(el);
    });
    const want = process.argv.slice(2);
    const ids = (await page.evaluate(() => Covers.ids())).filter((x) => !want.length || want.includes(x));
    for (const id of ids) {
      await page.evaluate((gid) => { const el = document.getElementById('cover-stage'); el.innerHTML = Covers.svg(gid); Covers.fit(el); }, id);
      await page.waitForTimeout(60);
      const png = await page.locator('#cover-stage').screenshot({ type: 'png', omitBackground: true });
      const webp = await page.evaluate(async ({ b64, w, h }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/webp', 0.86).split(',')[1];
      }, { b64: png.toString('base64'), w: W, h: H });
      fs.writeFileSync(path.join(OUT, id + '.webp'), Buffer.from(webp, 'base64'));
      process.stdout.write(id + ' ');
    }
    console.log(`\n${ids.length} covers written to img/covers/`);
    if (errors.length) { console.log('Page errors:', errors); process.exitCode = 1; }
    await browser.close();
  } finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
