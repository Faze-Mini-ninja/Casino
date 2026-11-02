(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.fish;
  C.register({
    n: 28, id: 'fish', name: 'Fish Table', icon: '🐟', cat: 'originals', edge: (E * 100) + '%',
    blurb: 'Arcade shooter: each shot costs a bet, catch fish for multipliers.',
    rules: `<p>Click or tap the water to fire the cannon. Every shot costs your bet. Bullets bounce off the walls until they hit a fish; a hit fish is caught with probability ${(1 - E).toFixed(2)} ÷ its multiplier, paying bet × multiplier. That makes every fish worth the same ${((1 - E) * 100).toFixed(0)}% return per shot: a ${(E * 100).toFixed(0)}% house edge regardless of aim. A bullet that hits nothing within 8 seconds is refunded.</p>`,
    edges: L.FISH.map((f) => [f.name, f.m + '×', `catch ${((1 - E) / f.m * 100).toFixed(1)}%`]).concat([['Every shot', '', (E * 100).toFixed(2) + '%']]),
    mount(root) {
      const bet = C.betInput({ value: 1, label: 'Bet per shot' });
      const W = 960, H = 540;
      const cv = h('canvas', { width: W, height: H, class: 'fish-cv' });
      const ctx = cv.getContext('2d');
      const sess = { shots: 0, wager: 0, pay: 0 };
      const statEl = h('div');
      const autoChk = h('input', { type: 'checkbox' });
      let fish = [], bullets = [], fx = [], alive = true, raf = 0, last = performance.now(), aim = [W / 2, H / 2], autoT = 0;
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('label', { class: 'row' }, autoChk, 'Auto-fire (4 shots/s at the aim point)'), statEl,
          h('div', { class: 'pays-list' }, L.FISH.map((f) => h('div', null, h('span', { style: `color:${f.color}` }, '● ' + f.name), h('b', null, f.m + '×'))))),
        h('div', { class: 'stage' }, cv)));
      const paintStats = () => { statEl.innerHTML = `<div class="stat-line">Shots <b>${sess.shots}</b></div><div class="stat-line">Session spent <b>${C.fmt(sess.wager)}</b></div><div class="stat-line">Session won <b>${C.fmt(sess.pay)}</b></div><div class="stat-line">Net <b class="${sess.pay - sess.wager >= 0 ? 'pos' : 'neg'}">${C.fmt(sess.pay - sess.wager)}</b></div>`; };
      paintStats();
      function spawn() {
        const t = L.weighted(L.FISH);
        const left = L.random() < 0.5;
        fish.push({ t, x: left ? -t.size * 2 : W + t.size * 2, y: 40 + L.random() * (H - 160), vx: (left ? 1 : -1) * t.speed * (0.7 + L.random() * 0.6), ph: L.random() * 6, hit: 0 });
      }
      for (let i = 0; i < 10; i++) { spawn(); fish[i].x = L.random() * W; }
      const cannon = [W / 2, H - 10];
      let pendingShots = 0;
      function shoot(tx, ty) {
        const b = bet.value;
        if (pendingShots >= 12) return; // wait for the server to catch up
        if (b > C.balance()) { autoChk.checked = false; return C.toast('Insufficient balance', 'err'); }
        const ang = Math.atan2(ty - cannon[1], tx - cannon[0]), sp = 520;
        const bullet = { x: cannon[0], y: cannon[1], vx: Math.cos(ang) * sp, vy: Math.min(-40, Math.sin(ang) * sp), b, age: 0 };
        pendingShots++;
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
        f.dead = true;
        fx.push({ x: f.x, y: f.y, text: '+' + C.fmt(r.payout), t: 1.2, big: f.t.m >= 30 });
      }
      async function refundShot(b) {
        const id = await b.shot; if (id == null) return;
        const r = await C.try(() => C.play('fish', 'expire', { shotId: id }));
        if (r) { sess.wager -= b.b; paintStats(); }
      }
      const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
      cv.addEventListener('pointerdown', (e) => { aim = toCanvas(e); shoot(...aim); });
      cv.addEventListener('pointermove', (e) => { aim = toCanvas(e); });
      function drawFish(f) {
        const s = f.t.size, dir = Math.sign(f.vx);
        ctx.save(); ctx.translate(f.x, f.y + Math.sin(f.ph) * 6); ctx.scale(dir, 1);
        ctx.fillStyle = f.t.color; if (f.hit > 0) ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 0.8, 0); ctx.lineTo(-s * 1.5, -s * 0.5); ctx.lineTo(-s * 1.5, s * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(s * 0.55, -s * 0.12, Math.max(2, s * 0.09), 0, Math.PI * 2); ctx.fill();
        if (f.t.m >= 100) { ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2); ctx.stroke(); }
        ctx.scale(dir, 1); ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(10, s * 0.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(f.t.m + '×', 0, s * 0.15 + 4);
        ctx.restore();
      }
      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (autoChk.checked) { autoT += dt; if (autoT > 0.25) { autoT = 0; shoot(...aim); } }
        if (fish.length < 14 && L.random() < dt * 2) spawn();
        fish.forEach((f) => { f.x += f.vx * dt; f.ph += dt * 3; if (f.hit > 0) f.hit -= dt; });
        fish = fish.filter((f) => f.x > -200 && f.x < W + 200 && !f.dead);
        for (const b of bullets) {
          b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt;
          if (b.x < 4 || b.x > W - 4) { b.vx *= -1; b.x = Math.max(4, Math.min(W - 4, b.x)); }
          if (b.y < 4 || b.y > H - 4) { b.vy *= -1; b.y = Math.max(4, Math.min(H - 4, b.y)); }
          const f = fish.find((q) => !q.dead && Math.hypot(q.x - b.x, q.y + Math.sin(q.ph) * 6 - b.y) < q.t.size);
          if (f) { b.done = true; f.hit = 0.1; resolveHit(b, f); }
          else if (b.age > 8) { b.done = true; refundShot(b); }
        }
        bullets = bullets.filter((b) => !b.done);
        // draw
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b4f7a'); g.addColorStop(1, '#03203a');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc((i * 150 + now / 40) % (W + 100) - 50, 60 + i * 55, 30, 0, Math.PI * 2); ctx.fill(); }
        fish.forEach(drawFish);
        ctx.fillStyle = '#ffd166'; bullets.forEach((b) => { ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); });
        // cannon
        const ang = Math.atan2(aim[1] - cannon[1], aim[0] - cannon[0]);
        ctx.save(); ctx.translate(cannon[0], cannon[1]); ctx.rotate(ang); ctx.fillStyle = '#c0c8e0'; ctx.fillRect(0, -9, 46, 18); ctx.restore();
        ctx.beginPath(); ctx.arc(cannon[0], cannon[1], 26, Math.PI, 0); ctx.fillStyle = '#f5c542'; ctx.fill();
        fx.forEach((e) => { e.t -= dt; e.y -= 40 * dt; ctx.globalAlpha = Math.max(0, e.t); ctx.fillStyle = e.big ? '#ffd166' : '#7CFC9A'; ctx.font = `bold ${e.big ? 30 : 20}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(e.text, e.x, e.y); ctx.globalAlpha = 1; });
        fx = fx.filter((e) => e.t > 0);
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
  css.textContent = `.fish-cv{width:100%;border-radius:14px;border:4px solid #1b4f8a;cursor:crosshair;touch-action:none}`;
  document.head.appendChild(css);
})();
