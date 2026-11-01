/* Video slots (Fruit Frenzy, Gem Rush, Lucky 7s) and Pick 3. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const css = (t) => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); };
  const NS = 'http://www.w3.org/2000/svg';
  const LINE_COLORS = ['#ffc24b', '#22e58b', '#3d8bff', '#ff4d63', '#a855f7', '#00d1d1', '#ff8a3d', '#f472b6', '#a3e635', '#e5e7eb'];

  /* ---------------- video slot ---------------- */
  function videoSlot(cfg) {
    const T0 = L.SLOT_THEMES[cfg.id];
    const pct = (L.EDGE[cfg.id] * 100).toFixed(0) + '%';
    C.register({
      n: cfg.n, id: cfg.id, name: T0.name, icon: '7', cat: 'lottery', edge: pct, blurb: cfg.blurb,
      rules: `<p>${T0.reels} reels, ${T0.rows} rows and ${T0.lines.length} fixed paylines. Your bet is spread evenly across every line. Wins pay for ${T0.reels === 3 ? 'three' : 'three or more'} matching symbols on a line from the leftmost reel; Wild substitutes for any paying symbol.${T0.scatter ? ' Scatters pay anywhere on the screen.' : ''} Every winning line is added together.</p>`,
      get edges() {
        const t = L.slotTable(cfg.id);
        return [...Object.entries(t.pays).map(([s, p]) => [SYM_NAME[s] || s, p.map((x) => r2(x / t.lines.length) + '×').join(' / '), '']),
          ...(t.scatter ? Object.entries(t.scatter).map(([k, v]) => [k + ' scatters', r2(v) + '×', '']) : []), ['Overall', '', pct]];
      },
      mount(root) {
        const bet = C.betInput({ value: 10, label: 'Total bet' });
        const msg = C.msg();
        let alive = true, spinning = false, auto = false, cycle = null;
        const t = () => L.slotTable(cfg.id);
        const syms = T0.symbols.map((x) => x[0]), weights = T0.symbols.map((x) => x[1]);
        const rnd = () => { let x = Math.random() * weights.reduce((a, b) => a + b, 0); for (let i = 0; i < syms.length; i++) { x -= weights[i]; if (x < 0) return syms[i]; } return syms[0]; };
        const put = (cell, s) => { cell.dataset.s = s; cell.innerHTML = C.art(s); };
        const reels = Array.from({ length: T0.reels }, () => {
          const cells = Array.from({ length: T0.rows }, () => { const c = h('div', { class: 'vs-cell' }); put(c, rnd()); return c; });
          return { el: h('div', { class: 'vs-reel' }, cells), cells };
        });
        const lines = document.createElementNS(NS, 'svg'); lines.setAttribute('class', 'vs-lines'); lines.setAttribute('viewBox', '0 0 100 100'); lines.setAttribute('preserveAspectRatio', 'none');
        const pt = h('div', { class: 'pays-list vs-pays' });
        function paintTable() {
          const tb = t(); pt.innerHTML = '';
          Object.entries(tb.pays).forEach(([s, p]) => pt.append(h('div', { 'data-s': s }, h('span', { class: 'pt-art' }, C.artEl(s)), h('b', null, p.map((x, i) => (T0.reels === 3 ? '' : 3 + i + '× ') + fmtX(x / tb.lines.length)).join('  ')))));
          if (tb.scatter) pt.append(h('div', { 'data-s': 'scatter' }, h('span', { class: 'pt-art' }, C.artEl('scatter')), h('b', null, Object.entries(tb.scatter).map(([k, v]) => k + '× ' + fmtX(v)).join('  '))));
        }
        paintTable();
        const lineInfo = h('div', { class: 'muted', style: 'font-size:12px' }, `${T0.lines.length} lines · pays shown as multiples of your total bet · Wild substitutes${T0.scatter ? ' · scatters pay anywhere' : ''}`);
        const winEl = h('div', { class: 'vs-win' }, h('span', null, 'WIN'), h('b', null, '0.00'));
        const spinBtn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
        const autoBtn = h('button', { class: 'btn ghost', onclick: () => { auto = !auto; autoBtn.textContent = auto ? 'Stop Auto' : 'Auto Spin'; if (auto && !spinning) spin(); } }, 'Auto Spin');
        root.appendChild(h('div', { class: 'layout' },
          h('div', { class: 'side' }, bet.el, h('h3', null, 'Paytable'), pt, lineInfo),
          h('div', { class: 'stage' },
            h('div', { class: 'vslot ' + cfg.id }, h('div', { class: 'vs-title' }, T0.name), h('div', { class: 'vs-window r' + T0.reels }, reels.map((r) => r.el), lines), winEl),
            msg.el, h('div', { class: 'controls' }, spinBtn, autoBtn))));
        function clearWins() { if (cycle) { clearInterval(cycle); cycle = null; } lines.innerHTML = ''; reels.forEach((r) => r.cells.forEach((c) => c.classList.remove('hit', 'dim'))); pt.querySelectorAll('div').forEach((d) => d.classList.remove('hit')); }
        function drawLine(li, color) {
          const pts = T0.lines[li].map((row, r) => `${((r + 0.5) / T0.reels) * 100},${((row + 0.5) / T0.rows) * 100}`).join(' ');
          const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('stroke', color); pl.setAttribute('vector-effect', 'non-scaling-stroke'); lines.append(pl);
        }
        function showWins(res) {
          const all = res.wins;
          const light = (ws, scat) => {
            lines.innerHTML = ''; reels.forEach((r) => r.cells.forEach((c) => { c.classList.remove('hit'); c.classList.add('dim'); }));
            ws.forEach((w) => { drawLine(w.line, LINE_COLORS[w.line % LINE_COLORS.length]); T0.lines[w.line].slice(0, w.n).forEach((row, r) => { const c = reels[r].cells[row]; c.classList.add('hit'); c.classList.remove('dim'); }); });
            if (scat) reels.forEach((r) => r.cells.forEach((c) => { if (c.dataset.s === 'scatter') { c.classList.add('hit'); c.classList.remove('dim'); } }));
          };
          light(all, res.scatterPay > 0);
          all.forEach((w) => { const row = pt.querySelector(`[data-s="${w.sym}"]`); if (row) row.classList.add('hit'); });
          if (res.scatterPay > 0) { const row = pt.querySelector('[data-s="scatter"]'); if (row) row.classList.add('hit'); }
          if (all.length > 1) { let k = -1; cycle = setInterval(() => { k = (k + 1) % (all.length + 1); light(k === all.length ? all : [all[k]], k === all.length && res.scatterPay > 0); }, 1100); }
        }
        async function spin() {
          if (spinning || !alive) return;
          spinning = true; spinBtn.disabled = true; bet.disable(true); clearWins();
          const r = await C.try(() => C.play(cfg.id, null, { bet: bet.value }));
          if (!r) { spinning = false; spinBtn.disabled = false; bet.disable(false); auto = false; autoBtn.textContent = 'Auto Spin'; return; }
          paintTable(); msg.set(' '); winEl.classList.remove('on'); winEl.lastChild.textContent = '0.00';
          const res = r.result;
          const timers = reels.map((rl) => { rl.el.classList.add('spin'); return setInterval(() => rl.cells.forEach((c) => put(c, rnd())), 70); });
          for (let i = 0; i < reels.length; i++) {
            await C.sleep(i ? 260 : 520);
            if (!alive) { timers.forEach(clearInterval); return; }
            clearInterval(timers[i]); reels[i].el.classList.remove('spin'); reels[i].cells.forEach((c, row) => put(c, res.grid[i][row]));
            reels[i].el.classList.add('stop'); setTimeout(() => reels[i].el.classList.remove('stop'), 300); C.sfx && C.sfx('tick');
          }
          C.settle(r);
          if (r.payout > 0) {
            showWins(res); winEl.classList.add('on'); winEl.lastChild.textContent = C.fmt(r.payout);
            const parts = []; if (res.wins.length) parts.push(res.wins.length + (res.wins.length === 1 ? ' line' : ' lines')); if (res.scatterPay) parts.push(res.scatter + ' scatters');
            msg.set(`WIN ${C.fmt(r.payout)} — ${parts.join(' + ')} (${res.mult}×)`, r.payout >= r.wager ? 'win' : '');
          } else msg.set('No win', 'lose');
          spinning = false; spinBtn.disabled = false; bet.disable(false);
          if (auto && alive) setTimeout(spin, r.payout ? 1400 : 600);
        }
        return () => { alive = false; auto = false; if (cycle) clearInterval(cycle); };
      },
    });
  }
  const r2 = (x) => Math.floor(x * 100) / 100;
  const SYM_NAME = { cherry: 'Cherry', lemon: 'Lemon', orange: 'Orange', plum: 'Plum', grape: 'Grapes', melon: 'Melon', bell: 'Bell', seven: 'Seven', wild: 'Wild', bar: 'Bar', bar2: 'Double bar', bar3: 'Triple bar',
    'g-blue': 'Blue gem', 'g-green': 'Green gem', 'g-purple': 'Purple gem', 'g-orange': 'Amber gem', 'g-red': 'Ruby', 'g-pink': 'Pink gem', crown: 'Crown', diamond: 'Diamond' };
  const fmtX = (x) => (x >= 10 ? Math.floor(x) : x >= 1 ? r2(x) : r2(x).toFixed(2)) + '×';
  videoSlot({ n: 50, id: 'fruits', blurb: 'Five reels of fruit, ten lines, wilds and scatters.' });
  videoSlot({ n: 51, id: 'gems', blurb: 'Cut gems and crowns across ten lines. Diamonds pay big.' });
  videoSlot({ n: 52, id: 'sevens', blurb: 'Three reels, five lines, bars and sevens. Wild sevens pay 400× a line.' });
  css(`.vslot{background:linear-gradient(180deg,#1d3147,#0f1c2a);border-radius:22px;padding:12px 14px 14px;box-shadow:0 14px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);width:100%;max-width:640px}
  .vslot.gems{background:linear-gradient(180deg,#2a1e4a,#140f2a)}.vslot.sevens{background:linear-gradient(180deg,#4a1d1d,#240c0c);max-width:420px}
  .vs-title{text-align:center;font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:13px;color:#ffc24b;margin-bottom:8px}
  .vs-window{position:relative;display:grid;gap:6px;background:#070d14;padding:8px;border-radius:14px}.vs-window.r5{grid-template-columns:repeat(5,1fr)}.vs-window.r3{grid-template-columns:repeat(3,1fr)}
  .vs-reel{display:flex;flex-direction:column;gap:6px;border-radius:10px;overflow:hidden}
  .vs-cell{aspect-ratio:1;background:radial-gradient(circle at 50% 40%,#22303f,#141d27);border-radius:10px;display:grid;place-items:center;transition:opacity .2s,transform .2s}
  .vs-cell .art{width:78%;height:78%}.vs-reel.spin .vs-cell{filter:blur(2.5px) brightness(.85)}.vs-reel.stop{animation:vstop .3s ease-out}
  @keyframes vstop{0%{transform:translateY(-10px)}60%{transform:translateY(4px)}100%{transform:none}}
  .vs-cell.dim{opacity:.35}.vs-cell.hit{box-shadow:inset 0 0 0 2px #ffc24b,0 0 16px rgba(255,194,75,.45);animation:vhit .9s ease-in-out infinite alternate}
  @keyframes vhit{to{transform:scale(1.05)}}
  .vs-lines{position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);pointer-events:none}.vs-lines polyline{fill:none;stroke-width:4;stroke-linejoin:round;stroke-linecap:round;opacity:.9;filter:drop-shadow(0 0 4px rgba(0,0,0,.8))}
  .vs-win{display:flex;justify-content:center;gap:10px;align-items:baseline;margin-top:10px;color:var(--muted);font-weight:700}.vs-win b{font-size:22px;color:#fff;font-variant-numeric:tabular-nums}
  .vs-win.on b{color:#22e58b}.vs-pays .pt-art .artw{width:26px;height:26px}.vs-pays>div>b{font-size:12px;white-space:pre}`);

  /* ---------------- Pick 3 ---------------- */
  C.register({
    n: 53, id: 'pick3', name: 'Pick 3', icon: '3', cat: 'lottery', edge: '30%',
    blurb: 'Choose three digits. Straight pays 700×.',
    rules: '<p>Pick three digits from 0 to 9, then three balls are drawn. <b>Straight</b> wins if the draw matches your digits in exact order. <b>Box</b> wins if the draw contains your digits in any order (needs at least two different digits).</p>',
    edges: [['Straight (exact order)', '700×', '30%'], ['Box — 3 different digits (6 ways)', '115×', '30.8%'], ['Box — one pair (3 ways)', '230×', '30.8%']],
    mount(root) {
      const bet = C.betInput({ value: 1 });
      let mode = 'straight', digits = [1, 2, 3], busy = false;
      const msg = C.msg(), hist = h('div', { class: 'history-strip' });
      const dEls = digits.map((_, i) => {
        const v = h('div', { class: 'p3-d' }, String(digits[i]));
        const set = (x) => { if (busy) return; digits[i] = (x + 10) % 10; v.textContent = digits[i]; paintMode(); };
        return h('div', { class: 'p3-col' }, h('button', { class: 'btn small ghost', onclick: () => set(digits[i] + 1) }, '▲'), v, h('button', { class: 'btn small ghost', onclick: () => set(digits[i] - 1) }, '▼'));
      });
      const modeSel = C.select('Bet type', [['straight', 'Straight — exact order'], ['box', 'Box — any order']], mode, (v) => { mode = v; paintMode(); });
      const payInfo = h('div', { class: 'p3-pay' });
      const quick = h('button', { class: 'btn ghost small', onclick: () => { if (busy) return; digits = digits.map(() => Math.floor(Math.random() * 10)); dEls.forEach((c, i) => (c.children[1].textContent = digits[i])); paintMode(); } }, 'Quick pick');
      function paintMode() {
        const k = L.pick3Kind(digits);
        payInfo.textContent = mode === 'straight' ? 'Pays 700× your bet' : k === 'triple' ? 'Box needs two different digits' : `Pays ${L.PICK3[k]}× your bet (${k === 'box6' ? '6' : '3'} winning orders)`;
        payInfo.className = 'p3-pay' + (mode === 'box' && k === 'triple' ? ' bad' : '');
      }
      paintMode();
      const balls = h('div', { class: 'p3-balls' }, [0, 1, 2].map(() => h('div', { class: 'p3-ball' }, '?')));
      const btn = h('button', { class: 'btn big', onclick: () => draw() }, 'DRAW');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, modeSel.el, h('div', { class: 'field' }, h('label', null, 'Your numbers'), h('div', { class: 'p3-pick' }, dEls), quick), payInfo),
        h('div', { class: 'stage' }, h('div', { class: 'felt p3-felt' }, h('div', { class: 'hand-label' }, 'DRAW'), balls), msg.el, h('div', { class: 'controls' }, btn), hist)));
      async function draw() {
        if (busy) return; busy = true; btn.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('pick3', null, { bet: bet.value, mode, digits }));
        if (!r) { busy = false; btn.disabled = false; bet.disable(false); return; }
        const bs = [...balls.children]; bs.forEach((b) => { b.textContent = '?'; b.className = 'p3-ball'; });
        for (let i = 0; i < 3; i++) {
          const b = bs[i]; b.classList.add('roll');
          for (let k = 0; k < 10; k++) { b.textContent = Math.floor(Math.random() * 10); await C.sleep(55); }
          b.classList.remove('roll'); b.textContent = r.result.draw[i]; C.sfx && C.sfx('tick');
          const hit = mode === 'straight' ? r.result.draw[i] === digits[i] : digits.includes(r.result.draw[i]);
          b.classList.add(hit ? 'hit' : 'miss');
        }
        C.settle(r);
        hist.prepend(h('span', { class: 'pill' + (r.payout ? ' g' : '') }, r.result.draw.join(''))); while (hist.children.length > 12) hist.lastChild.remove();
        msg.set(r.payout ? `Winner! Pays ${C.fmt(r.payout)} (${r.result.mult}×)` : `Drew ${r.result.draw.join(' ')} — no win`, r.payout ? 'win' : 'lose');
        busy = false; btn.disabled = false; bet.disable(false);
      }
    },
  });
  css(`.p3-pick{display:flex;gap:10px;justify-content:center;margin:6px 0}.p3-col{display:flex;flex-direction:column;align-items:center;gap:4px}
  .p3-d{width:54px;height:62px;border-radius:12px;background:var(--panel2,#1a2c3d);display:grid;place-items:center;font-size:32px;font-weight:800;font-variant-numeric:tabular-nums}
  .p3-pay{font-size:13px;color:var(--muted);margin-top:4px}.p3-pay.bad{color:var(--red,#ff4d63)}
  .p3-felt{display:flex;flex-direction:column;align-items:center;gap:14px;padding:34px 10px}.p3-balls{display:flex;gap:18px}
  .p3-ball{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-size:38px;font-weight:800;color:#1b1b1b;background:radial-gradient(circle at 35% 30%,#fff,#e8e8e8 45%,#a9b0b8);box-shadow:0 8px 18px rgba(0,0,0,.5)}
  .p3-ball.roll{animation:p3r .12s linear infinite}@keyframes p3r{50%{transform:translateY(-4px) rotate(8deg)}}
  .p3-ball.hit{background:radial-gradient(circle at 35% 30%,#d9ffe9,#22e58b 55%,#0e8a52)}.p3-ball.miss{opacity:.75}
  @media(max-width:600px){.p3-ball{width:66px;height:66px;font-size:30px}}`);
})();
