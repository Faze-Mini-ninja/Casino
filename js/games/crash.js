(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.crash;
  C.register({
    n: 21, id: 'crash', name: 'Crash', icon: '🚀', cat: 'originals', edge: (E * 100) + '%',
    blurb: 'Cash out before the rocket crashes.',
    rules: `<p>The multiplier climbs from 1.00× until it crashes at a random point. Cash out any time before the crash to win your bet × the current multiplier. Crash point distribution: P(crash ≥ m) = ${(1 - E).toFixed(2)} / m, so every cash-out strategy returns ${((1 - E) * 100).toFixed(0)}% (${(E * 100).toFixed(0)}% house edge). About ${(E * 100).toFixed(0)}% of rounds crash instantly at 1.00×.</p>`,
    edges: [['Any cash-out target', 'target ×', (E * 100).toFixed(2) + '%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const autoIn = h('input', { type: 'number', min: '1.01', step: '0.01', value: '2.00', class: 'bet-amt' });
      const msg = C.msg();
      const hist = h('div', { class: 'history-strip' });
      const W = 720, H = 380;
      const cv = h('canvas', { width: W, height: H, class: 'crash-cv' });
      const ctx = cv.getContext('2d');
      let alive = true, raf = 0, st = null;
      const btn = h('button', { class: 'btn big', onclick: () => (st && st.flying ? cashOut() : start()) }, 'BET');
      const autoChk = h('input', { type: 'checkbox', checked: true });
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('div', { class: 'field' }, h('label', null, h('span', null, 'Auto cash-out '), autoChk), autoIn),
          h('div', { class: 'muted', style: 'font-size:12px' }, 'Untick auto cash-out to cash out manually.')),
        h('div', { class: 'stage' }, cv, msg.el, btn, hist)));
      const RATE = 0.15; // e^(RATE * seconds)
      const multAt = (ms) => Math.floor(Math.exp(RATE * ms / 1000) * 100) / 100;
      function draw(m, t, crashed) {
        ctx.clearRect(0, 0, W, H);
        const maxT = Math.max(8000, t * 1.15), maxM = Math.max(2, m * 1.2);
        ctx.strokeStyle = '#2c3a6e'; ctx.fillStyle = '#8e9ac0'; ctx.font = '12px sans-serif';
        for (let i = 1; i <= 4; i++) { const v = 1 + (maxM - 1) * i / 4; const y = H - 30 - (v - 1) / (maxM - 1) * (H - 60); ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillText(v.toFixed(2) + '×', 2, y + 4); }
        ctx.beginPath(); ctx.lineWidth = 4; ctx.strokeStyle = crashed ? '#ff4d6d' : '#2fd17a';
        for (let s = 0; s <= 60; s++) { const tt = t * s / 60; const mv = Math.exp(RATE * tt / 1000); const x = 40 + tt / maxT * (W - 60), y = H - 30 - (mv - 1) / (maxM - 1) * (H - 60); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); ctx.lineWidth = 1;
        const x = 40 + t / maxT * (W - 60), y = H - 30 - (Math.exp(RATE * t / 1000) - 1) / (maxM - 1) * (H - 60);
        ctx.font = '28px serif'; ctx.fillText(crashed ? '💥' : '🚀', x - 14, y + 8);
        ctx.font = 'bold 64px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = crashed ? '#ff4d6d' : '#fff';
        ctx.fillText(m.toFixed(2) + '×', W / 2, H / 2 - 10);
        if (crashed) { ctx.font = 'bold 22px sans-serif'; ctx.fillText('CRASHED', W / 2, H / 2 + 24); }
        ctx.textAlign = 'left';
      }
      draw(1, 0, false);
      function start() {
        const b = bet.value;
        const auto = autoChk.checked ? Math.max(1.01, Math.floor(+autoIn.value * 100) / 100) : null;
        if (!C.bet('crash', b)) return;
        st = { b, auto, cp: L.crashPoint(), t0: performance.now(), flying: true, cashed: 0 };
        bet.disable(true); autoIn.disabled = true; btn.textContent = 'CASH OUT'; btn.className = 'btn big green';
        msg.set(' ');
        raf = requestAnimationFrame(tick);
      }
      function tick(now) {
        if (!alive || !st) return;
        const t = now - st.t0; let m = multAt(t);
        if (st.auto && !st.cashed && m >= st.auto && st.auto <= st.cp) cashOut(st.auto);
        if (m >= st.cp) { m = st.cp; draw(m, Math.log(Math.max(1, st.cp)) / RATE * 1000, true); return end(); }
        draw(m, t, false);
        raf = requestAnimationFrame(tick);
      }
      function cashOut(at) {
        if (!st || !st.flying || st.cashed) return;
        const m = at || multAt(performance.now() - st.t0);
        if (m >= st.cp) return; // too late
        st.cashed = m;
        const pay = C.win('crash', st.b * m);
        msg.set(`Cashed out at ${m.toFixed(2)}× — +${C.fmt(pay - st.b)}`, 'win');
        btn.disabled = true;
      }
      function end() {
        st.flying = false;
        if (!st.cashed) msg.set(`Crashed at ${st.cp.toFixed(2)}× — lost ${C.fmt(st.b)}`, 'lose');
        C.record('crash', st.b, st.cashed ? L.round2(st.b * st.cashed) : 0, `Crash ${st.cp.toFixed(2)}×${st.cashed ? ', cashed ' + st.cashed.toFixed(2) + '×' : ''}`);
        hist.prepend(h('span', { class: 'pill ' + (st.cp >= 2 ? 'g' : 'r') }, st.cp.toFixed(2) + '×'));
        while (hist.children.length > 16) hist.lastChild.remove();
        st = null; bet.disable(false); autoIn.disabled = false; btn.disabled = false; btn.textContent = 'BET'; btn.className = 'btn big';
      }
      return () => {
        alive = false; cancelAnimationFrame(raf);
        if (st && st.flying) C.record('crash', st.b, st.cashed ? L.round2(st.b * st.cashed) : 0, `Left during round (crash ${st.cp.toFixed(2)}×)`);
      };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.crash-cv{background:linear-gradient(180deg,#0e1430,#141d42);border-radius:14px;border:1px solid var(--line);width:100%}`;
  document.head.appendChild(css);
})();
