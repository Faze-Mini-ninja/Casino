/* Fish Table: an arcade shooter. Each shot costs a bet; a fish that is hit is caught with probability (1 − edge) ÷ its
 * multiplier and pays bet × multiplier (decided on the server). Art: Kenney's Fish Pack (CC0), see img/fish/README.md.
 * The cannon, light rays, bullets, nets and effects are drawn here in the same flat, outlined style. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.fish;
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, hh) { this.rect(x, y, w, hh); }; // very old browsers: square corners
  const ART = { // by multiplier: sprite, width on the 960×540 canvas
    2: { img: 'pink', w: 58 }, 3: { img: 'orange', w: 70 }, 5: { img: 'blue', w: 80 }, 8: { img: 'green', w: 92 },
    15: { img: 'red', w: 106 }, 30: { img: 'puffer', w: 100 }, 100: { img: 'eel-gold', w: 220 },
  };
  const DECO = ['deco-028', 'deco-029', 'deco-033', 'deco-010', 'deco-014', 'deco-064', 'deco-066', 'deco-047', 'deco-051', 'deco-082', 'deco-084', 'deco-085', 'sand-top'];
  const DIGITS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9', 'd-plus', 'd-dot'];
  const IMG = {};
  const load = (n) => { if (!IMG[n]) { const i = new Image(); i.src = `img/fish/${n}.webp`; IMG[n] = i; } return IMG[n]; };
  const ready = (i) => i && i.complete && i.naturalWidth > 0;
  const silhouette = {}; // white copies for the hit flash
  function flashOf(n) {
    if (silhouette[n]) return silhouette[n];
    const i = IMG[n]; if (!ready(i)) return null;
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(i, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    return (silhouette[n] = c);
  }

  C.register({
    n: 28, id: 'fish', name: 'Fish Table', icon: '🐟', cat: 'originals', edge: (E * 100) + '%',
    blurb: 'Arcade shooter: each shot costs a bet, catch fish for multipliers.',
    rules: `<p>Tap the water to fire. Every shot costs your bet. Shots bounce off the walls until they hit a fish; a fish that is hit is caught with probability ${(1 - E).toFixed(2)} ÷ its multiplier and pays bet × multiplier. That makes every fish worth the same ${((1 - E) * 100).toFixed(0)}% return per shot (a ${(E * 100).toFixed(0)}% house edge) wherever you aim. A shot that hits nothing for 8 seconds is refunded, and so are shots still in the water when you leave.</p>`,
    edges: L.FISH.map((f) => [f.name, f.m + '×', `catch ${((1 - E) / f.m * 100).toFixed(1)}%`]).concat([['Every shot', '', (E * 100).toFixed(2) + '%']]),
    mount(root) {
      [...Object.values(ART).map((a) => a.img), ...DECO, ...DIGITS, 'bubble', 'bubble-ring', 'bubble-sm'].forEach(load);
      const bet = C.betInput({ value: 1, label: 'Bet per shot' });
      const W = 960, H = 540, SAND = H - 46;
      const cv = h('canvas', { width: W, height: H, class: 'fish-cv' });
      const ctx = cv.getContext('2d');
      const sess = { shots: 0, wager: 0, pay: 0 };
      const statEl = h('div', { class: 'fish-stats' });
      const autoChk = h('input', { type: 'checkbox' });
      let fish = [], bullets = [], fx = [], bubbles = [], alive = true, raf = 0, last = performance.now(), aim = [W / 2, H / 2], autoT = 0, recoil = 0, flash = 0;
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('label', { class: 'row fish-auto' }, autoChk, 'Auto-fire (4 shots a second at your aim)'), statEl,
          h('div', { class: 'fish-pay' }, h('div', { class: 'fish-pay-h' }, 'Catch pays'),
            L.FISH.slice().reverse().map((f) => h('div', { class: 'fish-pay-r' }, h('span', { class: 'fish-pay-i' }, h('img', { src: `img/fish/${ART[f.m].img}.webp`, alt: '' })), h('span', null, f.name), h('b', null, f.m + '×'))))),
        h('div', { class: 'stage fish-stage' }, cv)));
      const paintStats = () => { const net = sess.pay - sess.wager; statEl.innerHTML = `<div><span>Shots</span><b>${sess.shots}</b></div><div><span>Spent</span><b>${C.fmt(sess.wager)}</b></div><div><span>Won</span><b>${C.fmt(sess.pay)}</b></div><div><span>Net</span><b class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${C.fmt(net)}</b></div>`; };
      paintStats();

      /* ---------- scenery (fixed layout so it never reshuffles) ---------- */
      const weeds = [['deco-028', 34, 0.62, 0], ['deco-014', 150, 0.5, 1.3], ['deco-029', 262, 0.58, 2.1], ['deco-064', 455, 0.55, 0.7], ['deco-010', 590, 0.56, 2.6], ['deco-033', 760, 0.6, 1.8], ['deco-066', 880, 0.52, 0.4]];
      const props = [['deco-084', 92, 0.62], ['deco-047', 356, 0.56], ['deco-082', 650, 0.66], ['deco-051', 820, 0.5], ['deco-085', 930, 0.5]];
      let bg = null;
      function buildBackground() {
        if (bg || !DECO.every((n) => ready(IMG[n]))) return;
        bg = document.createElement('canvas'); bg.width = W; bg.height = H; const g = bg.getContext('2d');
        const water = g.createLinearGradient(0, 0, 0, H); water.addColorStop(0, '#62c9df'); water.addColorStop(0.55, '#2e98c3'); water.addColorStop(1, '#1b6f9c');
        g.fillStyle = water; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.07)'; for (let x = -40; x < W + 40; x += 22) { g.beginPath(); g.ellipse(x, 6, 24, 9, 0, 0, Math.PI * 2); g.fill(); } // surface glints
        const t = IMG['sand-top'], s = 0.62, tw = t.naturalWidth * s, th = t.naturalHeight * s;
        for (const [n, x, k] of props) { const i = IMG[n]; g.drawImage(i, x - i.naturalWidth * k / 2, SAND - i.naturalHeight * k + 16, i.naturalWidth * k, i.naturalHeight * k); }
        for (let x = 0; x < W; x += tw - 1) g.drawImage(t, x, SAND, tw, th);
      }

      /* ---------- fish ---------- */
      function spawn(atX) {
        const t = L.weighted(L.FISH), a = ART[t.m], i = IMG[a.img];
        const ar = ready(i) ? i.naturalHeight / i.naturalWidth : 0.6, w = a.w, hh = w * ar;
        const left = L.random() < 0.5;
        fish.push({ t, a, w, hh, x: atX != null ? atX : left ? -w : W + w, y: 50 + hh / 2 + L.random() * (SAND - 110 - hh), vx: (left ? 1 : -1) * t.speed * (0.75 + L.random() * 0.5), ph: L.random() * 6, hit: 0 });
      }
      for (let i = 0; i < 9; i++) spawn(60 + L.random() * (W - 120));
      const cannon = [W / 2, H - 38];
      let pendingShots = 0;
      function shoot(tx, ty) {
        const b = bet.value;
        if (pendingShots >= 12) return; // wait for the server to catch up
        if (b > C.balance()) { autoChk.checked = false; return C.toast('Insufficient balance', 'err'); }
        const ang = Math.atan2(Math.min(ty, cannon[1] - 30) - cannon[1], tx - cannon[0]), sp = 560;
        const bullet = { x: cannon[0] + Math.cos(ang) * 64, y: cannon[1] + Math.sin(ang) * 64, vx: Math.cos(ang) * sp, vy: Math.min(-40, Math.sin(ang) * sp), b, age: 0, trail: [] };
        pendingShots++; recoil = 1; flash = 1; C.sfx && C.sfx('tick');
        bullet.shot = C.play('fish', 'shoot', { bet: b }).then((r) => { sess.shots++; sess.wager += b; paintStats(); return r.shotId; })
          .catch(() => { bullet.done = true; autoChk.checked = false; return null; })
          .finally(() => { pendingShots--; });
        bullets.push(bullet);
      }
      async function resolveHit(b, f) {
        const id = await b.shot; if (id == null) return;
        const r = await C.try(() => C.play('fish', 'hit', { shotId: id, m: f.t.m }));
        if (!r || !r.caught) return;
        sess.pay += r.payout; paintStats();
        if (!alive) return;
        f.caught = 0.01; f.vx *= 0.15;
        fx.push({ kind: 'net', x: f.x, y: f.y, t: 0, r: Math.max(f.w, f.hh) * 0.62 });
        fx.push({ kind: 'pop', x: f.x, y: f.y - f.hh / 2, t: 0, text: '+' + C.fmt(r.payout).replace(/,/g, ''), big: f.t.m >= 30 });
        for (let k = 0; k < (f.t.m >= 30 ? 16 : 7); k++) bubbles.push({ x: f.x + (L.random() - 0.5) * f.w * 0.6, y: f.y + (L.random() - 0.5) * f.hh, r: 3 + L.random() * 6, vy: -60 - L.random() * 80, ph: L.random() * 6, life: 1.4 });
        C.sfx && C.sfx(f.t.m >= 30 ? 'bigwin' : 'win');
      }
      async function refundShot(b) {
        const id = await b.shot; if (id == null) return;
        const r = await C.try(() => C.play('fish', 'expire', { shotId: id }));
        if (r) { sess.wager -= b.b; paintStats(); }
      }
      const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
      cv.addEventListener('pointerdown', (e) => { aim = toCanvas(e); shoot(...aim); });
      cv.addEventListener('pointermove', (e) => { aim = toCanvas(e); });

      /* ---------- drawing ---------- */
      function drawFish(f, now) {
        const i = IMG[f.a.img]; if (!ready(i)) return;
        const dir = Math.sign(f.vx) || 1, wag = 1 + Math.sin(f.ph * 3.2) * 0.035, bob = Math.sin(f.ph) * 5;
        ctx.save(); ctx.translate(f.x, f.y + bob);
        if (f.caught) { const k = Math.min(1, f.caught / 0.75); ctx.rotate(k * Math.PI * 2.2 * dir); ctx.scale(1 - k * 0.65, 1 - k * 0.65); ctx.globalAlpha = 1 - k * 0.8; }
        ctx.scale(dir * wag, 1);
        ctx.drawImage(i, -f.w / 2, -f.hh / 2, f.w, f.hh);
        if (f.hit > 0) { const s = flashOf(f.a.img); if (s) { ctx.globalAlpha = Math.min(1, f.hit * 9) * 0.8; ctx.drawImage(s, -f.w / 2, -f.hh / 2, f.w, f.hh); } }
        ctx.restore();
        if (f.t.m === 100 && !f.caught && ((now / 260) | 0) !== f.sp) { f.sp = (now / 260) | 0; fx.push({ kind: 'spark', x: f.x + (L.random() - 0.5) * f.w * 0.8, y: f.y + bob + (L.random() - 0.5) * f.hh * 0.6, t: 0 }); }
      }
      function drawWeeds(now) {
        for (const [n, x, k, ph] of weeds) {
          const i = IMG[n]; if (!ready(i)) continue;
          const w = i.naturalWidth * k, hh = i.naturalHeight * k;
          ctx.save(); ctx.translate(x, SAND + 18); ctx.transform(1, 0, Math.sin(now / 900 + ph) * 0.09, 1, 0, 0); ctx.drawImage(i, -w / 2, -hh, w, hh); ctx.restore();
          if (L.random() < 0.004) bubbles.push({ x: x + (L.random() - 0.5) * w * 0.5, y: SAND - hh * 0.6, r: 3 + L.random() * 5, vy: -35 - L.random() * 30, ph: L.random() * 6, life: 9 });
        }
      }
      function drawRays(now) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 5; k++) {
          const x = 120 + k * 190 + Math.sin(now / 2600 + k * 1.7) * 40, w = 46 + (k % 2) * 24;
          const g = ctx.createLinearGradient(0, 0, 0, SAND); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + w, 0); ctx.lineTo(x + w * 2.4 - 90, SAND); ctx.lineTo(x - 90, SAND); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      function drawBubble(b) {
        const i = IMG[b.r > 6 ? 'bubble-ring' : 'bubble']; if (!ready(i)) return;
        ctx.globalAlpha = Math.max(0, Math.min(1, b.life)) * 0.75; ctx.drawImage(i, b.x - b.r, b.y - b.r, b.r * 2, b.r * 2); ctx.globalAlpha = 1;
      }
      function drawCannon(ang) {
        const [cx, cy] = cannon, rk = recoil * 7, OUT = '#16222e';
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#2b3d50'; ctx.strokeStyle = OUT; ctx.lineWidth = 4; // base plate
        ctx.beginPath(); ctx.roundRect(cx - 92, cy - 4, 184, 34, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(cx - 84, cy, 168, 3);
        ctx.save(); ctx.translate(cx, cy - 10); ctx.rotate(ang); ctx.translate(-rk, 0); // barrel
        ctx.fillStyle = '#e9a92f'; ctx.strokeStyle = '#6b440b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.roundRect(4, -14, 62, 28, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffd97a'; ctx.fillRect(10, -9, 48, 5);
        ctx.fillStyle = '#c98a1c'; ctx.beginPath(); ctx.roundRect(56, -17, 16, 34, 5); ctx.fill(); ctx.stroke();
        if (flash > 0) { ctx.globalAlpha = flash; ctx.fillStyle = '#fff6c9'; ctx.beginPath(); ctx.arc(82, 0, 10 + flash * 8, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.restore();
        ctx.fillStyle = '#3f5973'; ctx.strokeStyle = OUT; ctx.lineWidth = 4; // turret dome
        ctx.beginPath(); ctx.arc(cx, cy - 6, 30, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.arc(cx - 8, cy - 18, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e6eef6'; ctx.font = '800 14px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('BET ' + C.fmt(bet.value), cx, cy + 16);
      }
      function drawDigits(text, x, y, hgt, alpha) {
        const glyphs = [...text].map((ch) => IMG[ch === '+' ? 'd-plus' : ch === '.' ? 'd-dot' : 'd' + ch]).filter(ready);
        const scale = (g) => hgt / g.naturalHeight * (g === IMG['d-dot'] ? 0.45 : 1);
        const total = glyphs.reduce((s, g) => s + g.naturalWidth * scale(g) * 0.86, 0);
        let px = x - total / 2; ctx.globalAlpha = alpha;
        for (const g of glyphs) { const k = scale(g), w = g.naturalWidth * k, gh = g.naturalHeight * k; ctx.drawImage(g, px, y - gh, w, gh); px += w * 0.86; }
        ctx.globalAlpha = 1;
      }
      function drawFx(dt) {
        for (const e of fx) {
          e.t += dt;
          if (e.kind === 'net') { // a fishing net that drops over the catch
            const k = Math.min(1, e.t / 0.35), r = e.r * (0.4 + 0.6 * k), a = e.t < 0.55 ? 1 : Math.max(0, 1 - (e.t - 0.55) / 0.35);
            ctx.save(); ctx.globalAlpha = a; ctx.translate(e.x, e.y); ctx.strokeStyle = '#f4f0dc'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
            ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(244,240,220,.75)';
            for (let d = -r; d <= r; d += r / 4) { ctx.beginPath(); ctx.moveTo(d - r, -r); ctx.lineTo(d + r, r); ctx.stroke(); ctx.beginPath(); ctx.moveTo(d + r, -r); ctx.lineTo(d - r, r); ctx.stroke(); }
            ctx.restore(); ctx.lineWidth = 5; ctx.strokeStyle = '#a4672a'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
          } else if (e.kind === 'pop') {
            const k = Math.min(1, e.t / 0.25), bounce = e.big ? 1 + Math.sin(Math.min(1, e.t / 0.4) * Math.PI) * 0.25 : 1;
            drawDigits(e.text, e.x, e.y - e.t * 34, (e.big ? 46 : 30) * k * bounce, e.t < 1.1 ? 1 : Math.max(0, 1 - (e.t - 1.1) / 0.4));
          } else if (e.kind === 'spark') {
            const a = Math.max(0, 1 - e.t / 0.6), s = 3 + 7 * Math.sin(Math.min(1, e.t / 0.6) * Math.PI);
            ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff7cf'; ctx.translate(e.x, e.y); ctx.beginPath();
            ctx.moveTo(0, -s); ctx.lineTo(s * 0.25, -s * 0.25); ctx.lineTo(s, 0); ctx.lineTo(s * 0.25, s * 0.25); ctx.lineTo(0, s); ctx.lineTo(-s * 0.25, s * 0.25); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.25, -s * 0.25); ctx.closePath(); ctx.fill(); ctx.restore();
          }
        }
        fx = fx.filter((e) => (e.kind === 'pop' ? e.t < 1.5 : e.kind === 'net' ? e.t < 0.9 : e.t < 0.6));
      }
      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (autoChk.checked) { autoT += dt; if (autoT > 0.25) { autoT = 0; shoot(...aim); } }
        if (fish.length < 13 && L.random() < dt * 1.8) spawn();
        recoil = Math.max(0, recoil - dt * 6); flash = Math.max(0, flash - dt * 8);
        fish.forEach((f) => { f.x += f.vx * dt; f.ph += dt * 3; if (f.hit > 0) f.hit -= dt; if (f.caught) f.caught += dt; });
        fish = fish.filter((f) => f.x > -f.w - 40 && f.x < W + f.w + 40 && !(f.caught > 0.8));
        for (const b of bullets) {
          b.trail.push([b.x, b.y]); if (b.trail.length > 7) b.trail.shift();
          b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt;
          if (b.x < 6 || b.x > W - 6) { b.vx *= -1; b.x = Math.max(6, Math.min(W - 6, b.x)); }
          if (b.y < 6 || b.y > SAND) { b.vy *= -1; b.y = Math.max(6, Math.min(SAND, b.y)); }
          const f = fish.find((q) => !q.caught && ((b.x - q.x) / (q.w * 0.45)) ** 2 + ((b.y - q.y - Math.sin(q.ph) * 5) / (q.hh * 0.45)) ** 2 < 1);
          if (f) { b.done = true; f.hit = 0.12; resolveHit(b, f); bubbles.push({ x: b.x, y: b.y, r: 5, vy: -50, ph: 0, life: 0.8 }); }
          else if (b.age > 8) { b.done = true; refundShot(b); }
        }
        bullets = bullets.filter((b) => !b.done);
        bubbles.forEach((b) => { b.y += b.vy * dt; b.x += Math.sin(now / 300 + b.ph) * 0.4; b.life -= dt; });
        bubbles = bubbles.filter((b) => b.life > 0 && b.y > -10);
        // draw
        buildBackground();
        if (bg) ctx.drawImage(bg, 0, 0); else { ctx.fillStyle = '#2e98c3'; ctx.fillRect(0, 0, W, H); }
        drawRays(now);
        drawWeeds(now);
        bubbles.forEach(drawBubble);
        fish.forEach((f) => drawFish(f, now));
        for (const b of bullets) { // pearl shots with a short wake
          b.trail.forEach(([x, y], k) => { ctx.globalAlpha = (k + 1) / b.trail.length * 0.35; ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.arc(x, y, 2 + k * 0.5, 0, Math.PI * 2); ctx.fill(); });
          ctx.globalAlpha = 1; const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, 8); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ffe28a'); g.addColorStop(1, '#d9952b');
          ctx.fillStyle = g; ctx.strokeStyle = '#7a4f12'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        drawFx(dt);
        drawCannon(Math.atan2(Math.min(aim[1], cannon[1] - 30) - (cannon[1] - 10), aim[0] - cannon[0]));
        if (alive) raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
      return () => {
        alive = false; cancelAnimationFrame(raf);
        bullets.forEach((b) => refundShot(b)); // refund shots still in the water
      };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.fish-stage{padding:14px !important}
  .fish-cv{display:block;width:100%;border-radius:12px;border:3px solid #16222e;box-shadow:0 10px 30px rgba(0,0,0,.35);cursor:crosshair;touch-action:none;background:#2e98c3}
  .fish-auto{display:flex !important;flex-wrap:nowrap;font-size:13px;color:var(--muted);gap:8px;align-items:center;margin-top:10px}.fish-auto input{flex:none;width:16px;height:16px;margin:0}
  .fish-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0}.fish-stats div{display:flex;flex-direction:column;padding:8px 10px;border-radius:8px;background:var(--panel2)}
  .fish-stats span{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}.fish-stats b{font-variant-numeric:tabular-nums}
  .fish-pay{border-radius:10px;background:var(--panel2);padding:6px}.fish-pay-h{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:6px 8px}
  .fish-pay-r{display:grid;grid-template-columns:62px 1fr auto;align-items:center;gap:8px;padding:5px 8px;border-radius:7px;font-size:13px}.fish-pay-r:nth-child(odd){background:rgba(255,255,255,.025)}
  .fish-pay-i{display:grid;place-items:center;height:30px}.fish-pay-i img{max-width:60px;max-height:30px}
  .fish-pay-r b{font-variant-numeric:tabular-nums}`;
  document.head.appendChild(css);
})();
