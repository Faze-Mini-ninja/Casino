(function () {
  const C = Casino, L = Lib, h = C.h;
  const colorOf = (m) => (m === 0 ? '#2a3a4c' : m < 1.3 ? '#2a9d8f' : m < 1.8 ? '#3ec46d' : m < 2.5 ? '#f2b632' : m < 6 ? '#f2762e' : '#e2335a');
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
      const cv = h('canvas', { width: 560, height: 560, class: 'wheel-cv' });
      const ctx = cv.getContext('2d');
      const btn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      const hist = h('div', { class: 'history-strip' });
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, riskSel.el, segSel.el), h('div', { class: 'stage' }, cv, legend, msg.el, btn, hist)));
      const table = () => L.wheelTable(segs, risk).table;
      let flap = 0, lastSeg = 0, spinning = false;
      const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
      function draw(now = performance.now()) {
        const t = table(), n = t.length, seg = (Math.PI * 2) / n, cx = 280, cy = 284, R0 = 226, R1 = 168;
        ctx.clearRect(0, 0, 560, 560);
        // bezel with lights
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
        const bz = ctx.createRadialGradient(cx - 60, cy - 80, 40, cx, cy, 262); bz.addColorStop(0, '#2c3d50'); bz.addColorStop(0.7, '#152230'); bz.addColorStop(1, '#0a121a');
        ctx.fillStyle = bz; ctx.beginPath(); ctx.arc(cx, cy, 258, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 256, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
        const LEDS = 36, chase = spinning ? Math.floor(now / 70) : -99;
        for (let k = 0; k < LEDS; k++) {
          const a = k / LEDS * Math.PI * 2, x = cx + Math.cos(a) * 243, y = cy + Math.sin(a) * 243, on = spinning ? (k + chase) % 6 < 2 : last >= 0 ? k % 2 === Math.floor(now / 400) % 2 : k % 3 === 0;
          const g = ctx.createRadialGradient(x - 1, y - 1, 0.5, x, y, 6); g.addColorStop(0, on ? '#fffbe6' : '#55606b'); g.addColorStop(0.5, on ? '#ffd76a' : '#2f3a45'); g.addColorStop(1, on ? 'rgba(255,190,60,0)' : '#1a232c');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, on ? 6 : 4.2, 0, Math.PI * 2); ctx.fill();
        }
        // segments
        for (let i = 0; i < n; i++) {
          const a0 = rot + i * seg - Math.PI / 2, col = colorOf(t[i]), dim = last >= 0 && last !== i;
          const g = ctx.createRadialGradient(cx, cy, R1, cx, cy, R0); g.addColorStop(0, shade(col, -0.35)); g.addColorStop(0.7, col); g.addColorStop(1, shade(col, 0.18));
          ctx.beginPath(); ctx.arc(cx, cy, R0, a0, a0 + seg); ctx.arc(cx, cy, R1, a0 + seg, a0, true); ctx.closePath();
          ctx.fillStyle = g; ctx.globalAlpha = dim ? 0.35 : 1; ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = '#0b141d'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        if (last >= 0) { const a0 = rot + last * seg - Math.PI / 2; ctx.save(); ctx.shadowColor = colorOf(t[last]); ctx.shadowBlur = 22; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R0 - 1, a0, a0 + seg); ctx.arc(cx, cy, R1 + 1, a0 + seg, a0, true); ctx.closePath(); ctx.stroke(); ctx.restore(); }
        const gl = ctx.createLinearGradient(0, cy - R0, 0, cy); gl.addColorStop(0, 'rgba(255,255,255,.16)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); // gloss on the upper half
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R0, Math.PI, 0); ctx.arc(cx, cy, R1, 0, Math.PI, true); ctx.closePath(); ctx.fill();
        // inner dial
        const d = ctx.createRadialGradient(cx - 40, cy - 50, 10, cx, cy, R1); d.addColorStop(0, '#1d2d3e'); d.addColorStop(1, '#0b141d');
        ctx.fillStyle = d; ctx.beginPath(); ctx.arc(cx, cy, R1 - 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; [R1 - 20, R1 - 44].forEach((r) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (last >= 0) { ctx.fillStyle = colorOf(t[last]) === '#2a3a4c' ? '#8aa0b6' : colorOf(t[last]); ctx.font = '800 64px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; ctx.fillText(t[last].toFixed(2) + '×', cx, cy + 2); }
        else { ctx.fillStyle = '#e6eef6'; ctx.font = '800 58px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; ctx.fillText(String(segs), cx, cy - 8); ctx.fillStyle = '#7f93a8'; ctx.font = '700 14px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; ctx.fillText(`SEGMENTS · ${risk.toUpperCase()} RISK`, cx, cy + 34); }
        // pointer
        ctx.save(); ctx.translate(cx, cy - R0 - 10); ctx.rotate(flap);
        ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        const pg = ctx.createLinearGradient(-16, 0, 16, 0); pg.addColorStop(0, '#9aa7b4'); pg.addColorStop(0.5, '#ffffff'); pg.addColorStop(1, '#7c8996');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(-16, -14); ctx.lineTo(16, -14); ctx.lineTo(0, 30); ctx.closePath(); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.fillStyle = '#e2335a'; ctx.beginPath(); ctx.arc(0, -6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      function paint() {
        last = -1; draw();
        const uniq = [...new Set(table())].sort((a, b) => a - b);
        legend.innerHTML = '';
        uniq.forEach((m) => legend.append(h('span', { class: 'wl', style: `--c:${colorOf(m)}` }, m.toFixed(2) + '×')));
      }
      paint();
      const idle = setInterval(() => { if (!alive) return clearInterval(idle); if (!busy) draw(); }, 400);
      async function spin() {
        if (busy) return; busy = true; btn.disabled = true; riskSel.sel.disabled = segSel.sel.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('wheel', null, { bet: bet.value, risk, segments: segs }));
        if (!r) { busy = false; btn.disabled = false; riskSel.sel.disabled = segSel.sel.disabled = false; bet.disable(false); return; }
        last = -1; msg.set(' ');
        const n = segs, seg = (Math.PI * 2) / n, k = r.result.index;
        const target = (((-(k + 0.5) * seg) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), cur = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const start = rot, end = rot + Math.PI * 6 + (((target - cur) + Math.PI * 2) % (Math.PI * 2)) + (Math.random() - 0.5) * seg * 0.7, t0 = performance.now(), dur = 3200;
        spinning = true; await new Promise((done) => { const step = (t) => { if (!alive) return done(); const p = Math.min(1, (t - t0) / dur); rot = start + (end - start) * (1 - Math.pow(1 - p, 4)); const sg = Math.floor(rot / seg); if (sg !== lastSeg) { lastSeg = sg; flap = -0.45; if (p < 0.98) C.sfx && C.sfx('tick'); } flap *= 0.8; draw(t); if (p < 1) raf = requestAnimationFrame(step); else { spinning = false; flap = 0; done(); } }; raf = requestAnimationFrame(step); });
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
  css.textContent = `.wheel-cv{display:block;width:min(440px,86vw);margin:0 auto}.wheel-legend{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
  .wl{font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px;background:var(--panel3);border-bottom:3px solid var(--c)}`;
  document.head.appendChild(css);
})();
