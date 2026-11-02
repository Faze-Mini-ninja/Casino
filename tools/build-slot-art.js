/* Renders slot art to img/slots/<theme>/: polished symbol sprites (<symbol>.webp), the background scene (bg.webp)
 * and the logo (logo.webp). Source drawings: js/art.js, js/art-slots.js, js/covers.js and js/slot-assets.js.
 * Usage: npm run slot-art              (everything)
 *        npm run slot-art -- pharaoh   (only the listed themes)
 * Needs Playwright + Chromium (dev only); the generated images are committed. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'img', 'slots'), PORT = 8095;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'casino-slotart-'));
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { stdio: 'ignore', env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_FILE: path.join(tmp, 'db.sqlite'), CHAIN_ENABLED: 'false', ADMIN_USERNAME: '', ADMIN_PASSWORD: '' } });
  try {
    await new Promise((r) => setTimeout(r, 1200));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://localhost:${PORT}/`);
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'covers.js') });
    await page.addScriptTag({ path: path.join(ROOT, 'js', 'slot-assets.js') });
    await page.evaluate(async () => {
      const fams = ['Lilita One', 'Bungee', 'Luckiest Guy', 'Rye', 'Russo One', 'Monoton', 'Titan One', 'Anton', 'Righteous'];
      await Promise.all([...fams.map((f) => document.fonts.load(`40px "${f}"`)), document.fonts.load('900 40px "Cinzel Decorative"')]);
      document.body.style.display = 'none'; document.documentElement.style.setProperty('background', 'transparent', 'important');
      const el = document.createElement('div'); el.id = 'art-stage';
      el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;line-height:0';
      document.documentElement.appendChild(el);
    });
    const shoot = async (svgFn, args, file, w, h, q, alpha) => {
      await page.evaluate(({ fn, a, w, h }) => { const el = document.getElementById('art-stage'); el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.background = 'transparent'; el.innerHTML = SlotAssets[fn](...a); Covers.fit(el); }, { fn: svgFn, a: args, w, h });
      await page.waitForTimeout(40);
      const png = await page.locator('#art-stage').screenshot({ type: 'png', omitBackground: alpha });
      const webp = await page.evaluate(async ({ b64, q }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/webp', q).split(',')[1];
      }, { b64: png.toString('base64'), q });
      fs.writeFileSync(file, Buffer.from(webp, 'base64'));
    };
    const want = process.argv.slice(2);
    const themes = (await page.evaluate(() => SlotAssets.themes())).filter((t) => !want.length || want.includes(t));
    for (const t of themes) {
      const dir = path.join(OUT, t); fs.mkdirSync(dir, { recursive: true });
      await shoot('sceneSvg', [t], path.join(dir, 'bg.webp'), 1600, 1000, 0.8, false);
      await shoot('logoSvg', [t], path.join(dir, 'logo.webp'), 1200, 300, 0.9, true);
      const syms = await page.evaluate((th) => SlotAssets.symbolsOf(th), t);
      for (const s of syms) await shoot('symbolSvg', [t, s], path.join(dir, s + '.webp'), 240, 240, 0.9, true);
      console.log(t, syms.length + 2, 'images');
    }
    if (errors.length) { console.log('Page errors:', errors); process.exitCode = 1; }
    await browser.close();
  } finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
