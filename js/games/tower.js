(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.tower, FLOORS = 8;
  C.register({
    n: 26, id: 'tower', name: 'Tower', icon: '🗼', cat: 'originals', edge: (E * 100) + '%',
    blurb: 'Climb 8 floors picking safe tiles. Cash out any time.',
    rules: `<p>Each floor hides traps. Pick a safe tile to climb; hit a trap and the bet is lost. Cash out after any floor. Difficulty: Easy 4 tiles/1 trap, Medium 3/1, Hard 2/1, Expert 3/2. Multiplier for floor k = ${(1 - E).toFixed(2)} ÷ P(safe)^k — a flat ${(E * 100).toFixed(0)}% house edge.</p>`,
    edges: Object.keys(L.TOWER).map((d) => [d[0].toUpperCase() + d.slice(1), Array.from({ length: FLOORS }, (_, k) => L.towerMult(d, k + 1) + '×').join(' → '), (E * 100).toFixed(2) + '%']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let diff = 'medium', st = null;
      const dSel = C.select('Difficulty', [['easy', 'Easy (4 tiles, 1 trap)'], ['medium', 'Medium (3, 1)'], ['hard', 'Hard (2, 1)'], ['expert', 'Expert (3, 2)']], diff, (v) => { diff = v; build(); });
      const msg = C.msg();
      const towerEl = h('div', { class: 'tower' });
      const btn = h('button', { class: 'btn big', onclick: () => (st ? cashOut() : start()) }, 'BET');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, dSel.el),
        h('div', { class: 'stage' }, towerEl, msg.el, btn)));
      let rows = [];
      function build() {
        const t = L.TOWER[diff];
        towerEl.innerHTML = ''; rows = [];
        for (let f = FLOORS - 1; f >= 0; f--) {
          const cells = Array.from({ length: t.cols }, (_, c) => h('div', { class: 'mtile disabled', onclick: () => pick(f, c) }, ''));
          rows[f] = cells;
          towerEl.appendChild(h('div', { class: 'trow' }, h('div', { class: 'tmult' }, L.towerMult(diff, f + 1).toFixed(2) + '×'), h('div', { class: 'tcells', style: `grid-template-columns:repeat(${t.cols},1fr)` }, cells)));
        }
      }
      build();
      function setActive() {
        rows.forEach((cells, f) => cells.forEach((c) => { if (!c.classList.contains('open')) c.className = 'mtile' + (st && f === st.floor ? '' : ' disabled'); }));
      }
      function start() {
        const b = bet.value;
        if (!C.bet('tower', b)) return;
        const t = L.TOWER[diff];
        build();
        st = { b, floor: 0, traps: Array.from({ length: FLOORS }, () => new Set(L.shuffle(Array.from({ length: t.cols }, (_, i) => i)).slice(0, t.bombs))) };
        bet.disable(true); dSel.sel.disabled = true; btn.textContent = 'CASH OUT'; btn.className = 'btn big green'; btn.disabled = true;
        msg.set('Pick a tile on the bottom floor'); setActive();
      }
      function revealAll() {
        rows.forEach((cells, f) => cells.forEach((c, i) => { if (!c.classList.contains('open')) { c.className = 'mtile open ghost ' + (st.traps[f].has(i) ? 'bomb' : 'gem'); c.textContent = st.traps[f].has(i) ? '💀' : '⭐'; } }));
      }
      function pick(f, c) {
        if (!st || f !== st.floor) return;
        const cell = rows[f][c];
        if (st.traps[f].has(c)) {
          cell.className = 'mtile open bomb'; cell.textContent = '💀'; revealAll();
          msg.set('Trap! Bet lost', 'lose'); C.record('tower', st.b, 0, `${diff}: fell on floor ${f + 1}`); return end();
        }
        cell.className = 'mtile open gem'; cell.textContent = '⭐';
        st.floor++; btn.disabled = false;
        const m = L.towerMult(diff, st.floor);
        msg.set(`Floor ${st.floor}: ${m.toFixed(2)}× = ${C.fmt(st.b * m)}`);
        if (st.floor === FLOORS) return cashOut();
        setActive();
      }
      function cashOut() {
        if (!st || !st.floor) return;
        const m = L.towerMult(diff, st.floor), pay = C.win('tower', st.b * m);
        revealAll();
        msg.set(`Cashed out at floor ${st.floor}: ${m.toFixed(2)}× — ${C.fmt(pay)}`, 'win');
        C.record('tower', st.b, pay, `${diff}: floor ${st.floor}, ${m}×`);
        end();
      }
      function end() { st = null; bet.disable(false); dSel.sel.disabled = false; btn.textContent = 'BET'; btn.className = 'btn big'; btn.disabled = false; setActive(); }
      return () => { if (st) { if (st.floor) cashOut(); else { C.win('tower', st.b); C.record('tower', st.b, st.b, 'Refunded (no picks)'); } } };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.tower{display:flex;flex-direction:column;gap:6px;width:min(460px,100%)}.trow{display:flex;gap:8px;align-items:center}.tmult{width:70px;text-align:right;color:var(--muted);font-weight:700;font-size:13px}
  .tcells{flex:1;display:grid;gap:6px}.tcells .mtile{aspect-ratio:auto;height:44px;font-size:22px}`;
  document.head.appendChild(css);
})();
