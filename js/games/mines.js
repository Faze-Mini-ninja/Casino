(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.mines;
  C.register({
    n: 22, id: 'mines', name: 'Mines', icon: '💣', cat: 'originals', edge: (E * 100) + '%',
    blurb: '5×5 grid. Reveal gems, avoid mines, cash out any time.',
    rules: `<p>Choose 1–24 mines hidden in a 5×5 grid. Each gem you reveal raises the multiplier; hit a mine and you lose the bet. Cash out whenever you like after the first gem. Multiplier = ${(1 - E).toFixed(2)} ÷ P(surviving that many picks), so the house edge is ${(E * 100).toFixed(0)}% no matter when you stop.</p>`,
    edges: [['Any number of mines / picks', '0.90 ÷ P(survive)', (E * 100).toFixed(2) + '%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let mines = 3, st = null;
      const minesSel = C.select('Mines', Array.from({ length: 24 }, (_, i) => i + 1), mines, (v) => { mines = +v; preview(); });
      const msg = C.msg();
      const multEl = h('div', { class: 'stat-line' }), nextEl = h('div', { class: 'stat-line' });
      const tiles = Array.from({ length: 25 }, (_, i) => h('div', { class: 'mtile disabled', onclick: () => pick(i) }, ''));
      const grid = h('div', { class: 'tile-grid', style: 'grid-template-columns:repeat(5,1fr);width:min(440px,100%)' }, tiles);
      const btn = h('button', { class: 'btn big', onclick: () => (st ? cashOut() : start()) }, 'BET');
      const randBtn = h('button', { class: 'btn ghost', onclick: () => { if (st) { const free = tiles.map((_, i) => i).filter((i) => !st.open.has(i)); pick(L.pick(free)); } } }, 'Random tile');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, minesSel.el, multEl, nextEl),
        h('div', { class: 'stage' }, grid, msg.el, h('div', { class: 'controls' }, btn, randBtn))));
      function preview() {
        const k = st ? st.open.size : 0;
        multEl.innerHTML = `Current multiplier <b>${k ? L.minesMult(mines, k).toFixed(2) + '×' : '—'}</b>`;
        nextEl.innerHTML = k < 25 - mines ? `Next gem <b>${L.minesMult(mines, k + 1).toFixed(2)}×</b>` : '';
      }
      preview();
      function start() {
        const b = bet.value;
        if (!C.bet('mines', b)) return;
        const pos = L.shuffle(Array.from({ length: 25 }, (_, i) => i)).slice(0, mines);
        st = { b, mines: new Set(pos), open: new Set() };
        tiles.forEach((t) => { t.className = 'mtile'; t.textContent = ''; });
        bet.disable(true); minesSel.sel.disabled = true;
        btn.textContent = 'CASH OUT'; btn.className = 'btn big green'; btn.disabled = true;
        msg.set('Pick a tile'); preview();
      }
      function reveal(hitIdx) {
        tiles.forEach((t, i) => {
          if (st.open.has(i)) return;
          t.className = 'mtile open ghost ' + (st.mines.has(i) ? 'bomb' : 'gem'); t.textContent = st.mines.has(i) ? '💣' : '💎';
          if (i === hitIdx) t.classList.remove('ghost');
        });
      }
      function pick(i) {
        if (!st || st.open.has(i)) return;
        if (st.mines.has(i)) {
          reveal(i);
          msg.set('💥 Boom! You hit a mine', 'lose');
          C.record('mines', st.b, 0, `${mines} mines, hit after ${st.open.size} gems`);
          return finish();
        }
        st.open.add(i); tiles[i].className = 'mtile open gem'; tiles[i].textContent = '💎';
        btn.disabled = false; preview();
        const k = st.open.size;
        msg.set(`${k} gem${k > 1 ? 's' : ''} • ${L.minesMult(mines, k).toFixed(2)}× = ${C.fmt(st.b * L.minesMult(mines, k))}`);
        if (k === 25 - mines) cashOut();
      }
      function cashOut() {
        if (!st || !st.open.size) return;
        const m = L.minesMult(mines, st.open.size);
        const pay = C.win('mines', st.b * m);
        reveal(-1);
        msg.set(`Cashed out ${m.toFixed(2)}× — won ${C.fmt(pay)}`, 'win');
        C.record('mines', st.b, pay, `${mines} mines, ${st.open.size} gems, ${m}×`);
        finish();
      }
      function finish() {
        st = null; bet.disable(false); minesSel.sel.disabled = false; btn.textContent = 'BET'; btn.className = 'btn big'; btn.disabled = false; preview();
      }
      return () => { if (st) { if (st.open.size) cashOut(); else { C.win('mines', st.b); C.record('mines', st.b, st.b, 'Refunded (no tiles picked)'); } } };
    },
  });
})();
