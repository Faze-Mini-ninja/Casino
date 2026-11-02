(function () {
  const C = Casino, L = Lib, h = C.h;
  const pattern = L.big6Wheel();
  const S = Object.fromEntries(L.BIG6.map((s) => [s.id, s]));
  C.register({
    n: 20, id: 'bigsix', name: 'Big Six Wheel', icon: '🎡', cat: 'dice', edge: '11.1–24.07%',
    blurb: 'Money wheel with 54 slots. Joker & logo pay 40:1.',
    rules: '<p>A 54-segment wheel. Bet on the symbol you think the pointer will stop on; payout equals the symbol value (e.g. $5 pays 5:1).</p>',
    edges: L.BIG6.map((s) => [`${s.label} (${s.count} of 54)`, s.pays + ':1', ((1 - (s.count / 54) * (s.pays + 1)) * 100).toFixed(2) + '%']),
    mount(root) {
      const T = C.chipTable();
      const msg = C.msg();
      const hist = h('div', { class: 'history-strip' });
      const cv = h('canvas', { width: 420, height: 420 });
      const ctx = cv.getContext('2d');
      const seg = (Math.PI * 2) / 54;
      let rot = 0, busy = false, alive = true, raf = 0;
      function draw() {
        const cx = 210, cy = 210, R = 200;
        ctx.clearRect(0, 0, 420, 420);
        ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fillStyle = '#5a3a1a'; ctx.fill();
        pattern.forEach((id, i) => {
          const a0 = rot + i * seg - Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a0 + seg); ctx.closePath();
          ctx.fillStyle = S[id].color; ctx.fill(); ctx.strokeStyle = '#3b2410'; ctx.stroke();
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + seg / 2); ctx.translate(R - 34, 0); ctx.rotate(Math.PI / 2);
          ctx.fillStyle = '#111'; ctx.font = `bold ${id.length > 2 ? 8 : 12}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(S[id].label, 0, 4); ctx.restore();
        });
        ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI * 2); ctx.fillStyle = '#d4af37'; ctx.fill();
        ctx.fillStyle = '#3b2410'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('BIG SIX', cx, cy + 6);
        ctx.beginPath(); ctx.moveTo(cx - 12, 0); ctx.lineTo(cx + 12, 0); ctx.lineTo(cx, 24); ctx.fillStyle = '#ff3046'; ctx.fill();
      }
      draw();
      const spinBtn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      root.appendChild(h('div', { class: 'roulette' },
        h('div', { class: 'rleft' }, cv),
        h('div', { class: 'rright' }, h('div', { class: 'felt b6' }, L.BIG6.map((s) => T.spot(s.id, [h('b', null, s.label), h('small', null, `${s.pays}:1 • ${s.count} slots`)], 'b6spot', ''))),
          h('div', { class: 'stage', style: 'min-height:0;margin-top:12px' }, msg.el, spinBtn, hist), T.bar)));
      root.querySelectorAll('.b6spot').forEach((e) => { e.style.background = S[e.dataset.id].color + '55'; });
      async function spin() {
        if (busy || !T.ready()) return;
        busy = true; T.lock(true); spinBtn.disabled = true;
        const r = await C.try(() => C.play('bigsix', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); spinBtn.disabled = false; return; }
        T.mark([]); msg.set('Spinning…');
        const k = r.result.index;
        const target = (((-(k + 0.5) * seg) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const cur = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const start = rot, end = rot + Math.PI * 8 + (((target - cur) + Math.PI * 2) % (Math.PI * 2)), t0 = performance.now(), dur = 5000;
        const stepf = (t) => {
          if (!alive) return;
          const p = Math.min(1, (t - t0) / dur); rot = start + (end - start) * (1 - Math.pow(1 - p, 4)); draw();
          if (p < 1) raf = requestAnimationFrame(stepf); else done(pattern[k], r);
        };
        raf = requestAnimationFrame(stepf);
      }
      function done(id, r) {
        const pay = r.payout;
        C.settle(r);
        T.mark([id]);
        hist.prepend(h('span', { class: 'pill', style: `background:${S[id].color};color:#111` }, S[id].label));
        while (hist.children.length > 14) hist.lastChild.remove();
        msg.set(`${S[id].label}: ` + (pay ? `win ${C.fmt(pay)}` : 'no win'), pay ? 'win' : 'lose');
        busy = false; T.lock(false); spinBtn.disabled = false;
      }
      return () => { alive = false; cancelAnimationFrame(raf); };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.b6{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}.b6spot{min-height:80px;font-size:18px}`;
  document.head.appendChild(css);
})();
