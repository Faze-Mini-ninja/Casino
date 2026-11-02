(function () {
  const C = Casino, L = Lib, h = C.h;
  const edges = [];
  for (const risk of ['low', 'medium', 'high']) for (const r of [8, 12, 16]) { const t = L.plinkoTable(r, risk); edges.push([`${r} rows, ${risk} risk`, t.table.join(' · '), ((1 - t.rtp) * 100).toFixed(2) + '%']); }
  C.register({
    n: 14, id: 'plinko', name: 'Plinko', icon: '🔻', cat: 'originals', edge: '12–40%',
    blurb: 'Drop balls through pegs. Higher risk, bigger multipliers.',
    rules: '<p>Each ball bounces left or right with equal probability at every row and lands in a multiplier slot. Choose 8, 12 or 16 rows and a risk level. Low risk RTP 88%, medium 78%, high 60%: exact, from the binomial distribution.</p>',
    edges,
    mount(root) {
      const bet = C.betInput({ value: 1 });
      let rows = 12, risk = 'medium', alive = true, raf = 0;
      const rowsSel = C.select('Rows', [8, 12, 16], rows, (v) => { if (balls.length) { C.toast('Wait for balls to land'); rowsSel.sel.value = rows; return; } rows = +v; setup(); });
      const riskSel = C.select('Risk', [['low', C.odds() ? 'Low (12% edge)' : 'Low'], ['medium', C.odds() ? 'Medium (22% edge)' : 'Medium'], ['high', C.odds() ? 'High (40% edge)' : 'High']], risk, (v) => { if (balls.length) { C.toast('Wait for balls to land'); riskSel.sel.value = risk; return; } risk = v; setup(); });
      const msg = C.msg();
      const W = 640, H = 560;
      const cv = h('canvas', { width: W, height: H, class: 'plinko-cv' });
      const ctx = cv.getContext('2d');
      const lastEl = h('div', { class: 'history-strip' });
      let balls = [], table = [], gap = 0, top = 40, flash = {};
      const dropBtn = h('button', { class: 'btn big', onclick: () => drop() }, 'DROP BALL');
      const rtpEl = h('div', { class: 'muted' });
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, rowsSel.el, riskSel.el, rtpEl, h('button', { class: 'btn ghost', onclick: () => { for (let i = 0; i < 10; i++) setTimeout(() => alive && drop(), i * 160); } }, 'Drop 10')),
        h('div', { class: 'stage' }, cv, msg.el, dropBtn, lastEl)));
      function setup() {
        const t = L.plinkoTable(rows, risk); table = t.table;
        rtpEl.textContent = (C.odds() ? `RTP ${(t.rtp * 100).toFixed(2)}% • ` : '') + `Top prize ${Math.max(...table)}×`;
        gap = Math.min((W - 40) / (rows + 2), (H - 100) / (rows + 1));
      }
      const slotColor = (m) => (m >= 10 ? '#ff4d6d' : m >= 3 ? '#ff9f43' : m >= 1 ? '#f5c542' : '#4ea8ff');
      function frame(now) {
        ctx.clearRect(0, 0, W, H);
        const cx = W / 2;
        ctx.fillStyle = '#cfd8ff';
        for (let i = 0; i < rows; i++) for (let j = 0; j < i + 3; j++) { ctx.beginPath(); ctx.arc(cx + (j - (i + 2) / 2) * gap, top + i * gap, 3.5, 0, Math.PI * 2); ctx.fill(); }
        const sy = top + rows * gap + 4;
        table.forEach((m, k) => {
          const x = cx + (k - rows / 2) * gap; const fl = flash[k] && now - flash[k] < 400;
          ctx.fillStyle = slotColor(m); ctx.globalAlpha = fl ? 1 : 0.85;
          const w = gap - 3, hgt = 26, y = sy + (fl ? 5 : 0);
          ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y, w, hgt, 5) : ctx.rect(x - w / 2, y, w, hgt); ctx.fill();
          ctx.globalAlpha = 1; ctx.fillStyle = '#111'; ctx.font = `bold ${gap > 34 ? 12 : 9}px sans-serif`; ctx.textAlign = 'center';
          ctx.fillText(m + (gap > 30 ? '×' : ''), x, y + 17);
        });
        // balls
        for (const b of balls) {
          const t = (now - b.t0) / b.step; const i = Math.floor(t), f = t - i;
          let x, y;
          if (i >= rows) { x = cx + (b.k - rows / 2) * gap; y = top + rows * gap; }
          else {
            const rA = b.path.slice(0, i).reduce((a, c) => a + c, 0), rB = rA + b.path[i];
            const xa = cx + (rA - i / 2) * gap, xb = cx + (rB - (i + 1) / 2) * gap;
            x = xa + (xb - xa) * f; y = top + (i + f) * gap - Math.sin(f * Math.PI) * gap * 0.35 - 8;
          }
          ctx.beginPath(); ctx.arc(x, y, Math.max(5, gap * 0.2), 0, Math.PI * 2); ctx.fillStyle = '#ff3d71'; ctx.fill();
          if (i >= rows && !b.done) { b.done = true; land(b); }
        }
        balls = balls.filter((b) => !b.done);
        if (alive) raf = requestAnimationFrame(frame);
      }
      let inflight = 0;
      async function drop() {
        const b = bet.value, rr = rows, rk = risk, tb = table;
        if (inflight >= 20) return;
        inflight++;
        const r = await C.try(() => C.play('plinko', null, { bet: b, rows: rr, risk: rk }));
        inflight--;
        if (!r || !alive) return;
        balls.push({ path: r.result.path, k: r.result.k, t0: performance.now(), step: 140, bet: b, r, table: tb, rows: rr });
      }
      function land(b) {
        const m = b.r.result.mult, pay = b.r.payout;
        C.settle(b.r);
        flash[b.k] = performance.now();
        msg.set(`${m}×: ${pay ? 'returned ' + C.fmt(pay) : 'lost'}`, m >= 1 ? 'win' : 'lose');
        lastEl.prepend(h('span', { class: 'pill', style: `background:${slotColor(m)};color:#111` }, m + '×'));
        while (lastEl.children.length > 12) lastEl.lastChild.remove();
      }
      setup();
      raf = requestAnimationFrame(frame);
      return () => { alive = false; cancelAnimationFrame(raf); };
    },
  });
})();
