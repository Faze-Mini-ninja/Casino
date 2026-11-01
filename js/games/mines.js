(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.mines;
  C.register({
    n: 22, id: 'mines', name: 'Mines', icon: '💣', cat: 'originals', edge: (E * 100) + '%',
    blurb: '5×5 grid. Reveal gems, avoid mines, cash out any time.',
    rules: `<p>Choose 1–24 mines hidden in a 5×5 grid. Each gem you reveal raises the multiplier; hit a mine and you lose the bet. Cash out whenever you like after the first gem. Multiplier = ${(1 - E).toFixed(2)} ÷ P(surviving that many picks), so the house edge is ${(E * 100).toFixed(0)}% no matter when you stop.</p>`,
    edges: [['Any number of mines / picks', '0.90 ÷ P(survive)', (E * 100).toFixed(2) + '%']],
    round: 'mines',
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let mines = 3, st = null, busy = false;
      const minesSel = C.select('Mines', Array.from({ length: 24 }, (_, i) => i + 1), mines, (v) => { mines = +v; preview(); });
      const msg = C.msg();
      const multEl = h('div', { class: 'stat-line' }), nextEl = h('div', { class: 'stat-line' });
      const tiles = Array.from({ length: 25 }, (_, i) => h('div', { class: 'mtile disabled', onclick: () => pick(i) }, ''));
      const grid = h('div', { class: 'tile-grid', style: 'grid-template-columns:repeat(5,1fr);width:min(440px,100%)' }, tiles);
      const btn = h('button', { class: 'btn big', onclick: () => (st ? cashOut() : start()) }, 'BET');
      const randBtn = h('button', { class: 'btn ghost', onclick: () => { if (st) { const free = tiles.map((_, i) => i).filter((i) => !st.open.includes(i)); pick(L.pick(free)); } } }, 'Random tile');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, minesSel.el, multEl, nextEl),
        h('div', { class: 'stage' }, grid, msg.el, h('div', { class: 'controls' }, btn, randBtn))));
      function preview() {
        const k = st ? st.open.length : 0;
        multEl.innerHTML = `Current multiplier <b>${k ? L.minesMult(mines, k).toFixed(2) + '×' : '—'}</b>`;
        nextEl.innerHTML = k < 25 - mines ? `Next gem <b>${L.minesMult(mines, k + 1).toFixed(2)}×</b>` : '';
      }
      preview();
      async function start() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('mines', 'start', { bet: bet.value, mines }));
        busy = false; if (!r) return;
        st = { b: bet.value, open: [] };
        tiles.forEach((t) => { t.className = 'mtile'; t.textContent = ''; });
        bet.disable(true); minesSel.sel.disabled = true;
        btn.textContent = 'CASH OUT'; btn.className = 'btn big green'; btn.disabled = true;
        msg.set('Pick a tile'); preview();
      }
      function reveal(minesAt, hitIdx) {
        tiles.forEach((t, i) => {
          if (st.open.includes(i)) return;
          const bomb = minesAt.includes(i);
          t.className = 'mtile open ' + (i === hitIdx ? '' : 'ghost ') + (bomb ? 'bomb' : 'gem'); t.textContent = bomb ? '💣' : '💎';
        });
      }
      async function pick(i) {
        if (!st || busy || st.open.includes(i)) return; busy = true;
        const r = await C.try(() => C.play('mines', 'pick', { i }));
        busy = false; if (!r) return;
        if (r.done && r.view.hit != null) {
          reveal(r.view.mines, i); C.settle(r);
          msg.set('💥 Boom! You hit a mine', 'lose'); return finish();
        }
        st.open.push(i); tiles[i].className = 'mtile open gem'; tiles[i].textContent = '💎';
        if (r.done) return cashed(r); // cleared the board
        btn.disabled = false; preview();
        msg.set(`${st.open.length} gem${st.open.length > 1 ? 's' : ''} • ${r.view.mult.toFixed(2)}× = ${C.fmt(st.b * r.view.mult)}`);
      }
      async function cashOut() {
        if (!st || busy || !st.open.length) return; busy = true;
        const r = await C.try(() => C.play('mines', 'cashout', {}));
        busy = false; if (r) cashed(r);
      }
      function cashed(r) { reveal(r.view.mines, -1); C.settle(r); msg.set(`Cashed out ${r.view.mult.toFixed(2)}× — won ${C.fmt(r.payout)}`, 'win'); finish(); }
      function finish() { st = null; bet.disable(false); minesSel.sel.disabled = false; btn.textContent = 'BET'; btn.className = 'btn big'; btn.disabled = false; preview(); }
    },
  });
})();
