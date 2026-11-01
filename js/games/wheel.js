(function () {
  const C = Casino, L = Lib, h = C.h;
  const colorOf = (m) => (m === 0 ? '#2b3f55' : m < 1.3 ? '#2a9d8f' : m < 1.8 ? '#22c55e' : m < 2.5 ? '#eab308' : m < 6 ? '#f97316' : '#e11d48');
  C.register({
    n: 31, id: 'wheel', name: 'Wheel', icon: '◎', cat: 'originals', edge: 'set by admin',
    blurb: 'Spin the wheel. Pick your risk and how many segments.',
    rules: '<p>Pick a risk level and the number of segments, then spin. You win your bet × the multiplier the pointer lands on. More segments on high risk means a rarer, bigger win.</p>',
    edges: [['Low risk', 'up to ~1.4×', ''], ['Medium risk', 'up to ~2.8×', ''], ['High risk', '~0.93 × segments (one winning segment)', '']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let risk = 'medium', segs = 30, busy = false, alive = true, rot = 0, raf = 0, last = -1;
      const riskSel = C.select('Risk', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], risk, (v) => { risk = v; paint(); });
      const segSel = C.select('Segments', L.WHEEL_SEGMENTS, segs, (v) => { segs = +v; paint(); });
      const msg = C.msg();
      const legend = h('div', { class: 'wheel-legend' });
      const cv = h('canvas', { width: 420, height: 420, class: 'wheel-cv' });
      const ctx = cv.getContext('2d');
      const btn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      const hist = h('div', { class: 'history-strip' });
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, riskSel.el, segSel.el), h('div', { class: 'stage' }, cv, legend, msg.el, btn, hist)));
      const table = () => L.wheelTable(segs, risk).table;
      function draw() {
        const t = table(), n = t.length, seg = (Math.PI * 2) / n, cx = 210, cy = 210, R = 200;
        ctx.clearRect(0, 0, 420, 420);
        for (let i = 0; i < n; i++) {
          const a0 = rot + i * seg - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 + 0.004, a0 + seg - 0.004); ctx.closePath();
          ctx.fillStyle = colorOf(t[i]); ctx.globalAlpha = last === -1 || last === i ? 1 : 0.55; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath(); ctx.arc(cx, cy, R - 34, 0, Math.PI * 2); ctx.fillStyle = '#0e1b28'; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 44px -apple-system,Segoe UI,Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(last >= 0 ? t[last].toFixed(2) + '×' : segs + '', cx, cy);
        ctx.beginPath(); ctx.moveTo(cx - 13, 2); ctx.lineTo(cx + 13, 2); ctx.lineTo(cx, 30); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
      }
      function paint() {
        last = -1; draw();
        const uniq = [...new Set(table())].sort((a, b) => a - b);
        legend.innerHTML = '';
        uniq.forEach((m) => legend.append(h('span', { class: 'wl', style: `--c:${colorOf(m)}` }, m.toFixed(2) + '×')));
      }
      paint();
      async function spin() {
        if (busy) return; busy = true; btn.disabled = true; riskSel.sel.disabled = segSel.sel.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('wheel', null, { bet: bet.value, risk, segments: segs }));
        if (!r) { busy = false; btn.disabled = false; riskSel.sel.disabled = segSel.sel.disabled = false; bet.disable(false); return; }
        last = -1; msg.set(' ');
        const n = segs, seg = (Math.PI * 2) / n, k = r.result.index;
        const target = (((-(k + 0.5) * seg) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), cur = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const start = rot, end = rot + Math.PI * 6 + (((target - cur) + Math.PI * 2) % (Math.PI * 2)) + (Math.random() - 0.5) * seg * 0.7, t0 = performance.now(), dur = 3200;
        await new Promise((done) => { const step = (t) => { if (!alive) return done(); const p = Math.min(1, (t - t0) / dur); rot = start + (end - start) * (1 - Math.pow(1 - p, 4)); draw(); if (p < 1) raf = requestAnimationFrame(step); else done(); }; raf = requestAnimationFrame(step); });
        if (!alive) return;
        last = k; draw(); C.settle(r);
        const m = r.result.mult;
        msg.set(m > 0 ? `${m.toFixed(2)}× · ${m >= 1 ? 'won' : 'returned'} ${C.fmt(r.payout)}` : 'No win this time', m >= 1 ? 'win' : 'lose');
        hist.prepend(h('span', { class: 'pill', style: `background:${colorOf(m)}` }, m.toFixed(2) + '×')); while (hist.children.length > 14) hist.lastChild.remove();
        busy = false; btn.disabled = false; riskSel.sel.disabled = segSel.sel.disabled = false; bet.disable(false);
      }
      return () => { alive = false; cancelAnimationFrame(raf); };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.wheel-cv{width:min(420px,86vw)}.wheel-legend{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
  .wl{font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;background:var(--panel3);border-bottom:3px solid var(--c)}`;
  document.head.appendChild(css);
})();
