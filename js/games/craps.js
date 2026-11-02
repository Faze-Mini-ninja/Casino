(function () {
  const C = Casino, L = Lib, h = C.h;
  // shared dice renderer
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  C.dieEl = (v, cls = '') => h('div', { class: 'die ' + cls }, Array.from({ length: 9 }, (_, i) => h('span', { class: PIPS[v].includes(i) ? 'pip' : '' })));
  C.rollDice = async (row, values, cls = '') => {
    row.innerHTML = '';
    const ds = values.map(() => { const d = C.dieEl(L.range(1, 6), cls + ' rolling'); row.appendChild(d); return d; });
    for (let i = 0; i < 8; i++) { await C.sleep(80); ds.forEach((d, j) => d.replaceWith((ds[j] = C.dieEl(L.range(1, 6), cls + ' rolling')))); }
    row.innerHTML = ''; values.forEach((v) => row.appendChild(C.dieEl(v, cls)));
  };

  C.register({
    n: 9, id: 'craps', name: 'Craps Props', icon: '🎲', cat: 'dice', edge: '9.1–16.7%',
    blurb: 'Proposition bets: Any 7, Hops, Horn numbers, Hardways.',
    rules: '<p>Two dice. One-roll bets (Any 7, Any Craps, 2, 3, 11, 12, hard hops, Field) are settled on every roll. Hardways and Big 6/8 stay up until they win or lose: a hardway loses on 7 or on the "easy" way; Big 6/8 lose on 7. Pays are "to 1".</p>',
    edges: [...Object.values(L.CRAPS_BETS).map((b) => [b.name, b.special ? '1:1 (2 & 12 pay 2:1)' : b.pays + ':1', '']),
      ...Object.values(L.CRAPS_MULTI).map((b) => [b.name, b.pays + ':1', ''])].map((r) => {
      const ed = { 'Any Seven': '16.67%', 'Any Craps': '11.11%', 'Yo-Eleven': '11.11%', 'Ace-Deuce (3)': '11.11%', 'Snake Eyes (2)': '13.89%', 'Boxcars (12)': '13.89%', Field: '5.56%', 'Hard 4': '11.11%', 'Hard 10': '11.11%', 'Hard 6': '9.09%', 'Hard 8': '9.09%', 'Big 6': '9.09%', 'Big 8': '9.09%' };
      r[2] = ed[r[0]] || '13.89%'; return r;
    }),
    mount(root) {
      const T = C.chipTable();
      const msg = C.msg();
      const dice = h('div', { class: 'dice-row' }, C.dieEl(6, 'red'), C.dieEl(1, 'red'));
      const hist = h('div', { class: 'history-strip' });
      let busy = false;
      const sp = (id, b, cls = '') => T.spot(id, [b.name, h('small', null, b.special ? '1:1 • 2/12 pay 2:1' : b.pays + ' : 1')], 'cspot ' + cls);
      const B = L.CRAPS_BETS, M = L.CRAPS_MULTI;
      const rollBtn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
      root.appendChild(h('div', null,
        h('div', { class: 'felt craps' },
          h('div', { class: 'csec' }, h('div', { class: 'ctitle' }, 'Hardways & Big 6/8 (multi-roll)'),
            h('div', { class: 'cgrid4' }, sp('hard4', M.hard4), sp('hard6', M.hard6), sp('hard8', M.hard8), sp('hard10', M.hard10)),
            h('div', { class: 'cgrid2' }, sp('big6', M.big6), sp('big8', M.big8))),
          h('div', { class: 'csec' }, h('div', { class: 'ctitle' }, 'One-roll propositions'),
            h('div', { class: 'cgrid2' }, sp('any7', B.any7, 'wide'), sp('anyCraps', B.anyCraps, 'wide')),
            h('div', { class: 'cgrid4' }, sp('aces', B.aces), sp('aceDeuce', B.aceDeuce), sp('yo', B.yo), sp('boxcars', B.boxcars)),
            h('div', { class: 'cgrid4' }, sp('hop4', B.hop4), sp('hop6', B.hop6), sp('hop8', B.hop8), sp('hop10', B.hop10)),
            sp('field', B.field, 'field'))),
        h('div', { class: 'stage', style: 'min-height:0;margin-top:14px' }, dice, msg.el, rollBtn, hist), T.bar));
      async function roll() {
        if (busy || !T.ready()) return;
        busy = true; T.lock(true); rollBtn.disabled = true;
        const r = await C.try(() => C.play('craps', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); rollBtn.disabled = false; return; }
        T.mark([]);
        const [a, b] = r.result.dice, t = a + b, wager = r.wager;
        await C.rollDice(dice, [a, b], 'red');
        const pay = r.payout, winners = r.result.winners, notes = r.result.notes;
        C.settle(r);
        T.mark(winners);
        hist.prepend(h('span', { class: 'pill ' + (t === 7 ? 'r' : '') }, String(t)));
        while (hist.children.length > 16) hist.lastChild.remove();
        const net = pay - wager;
        msg.set(`${t}${a === b ? ' (hard)' : ''}: ` + (net > 0 ? `win +${C.fmt(net)}` : net === 0 ? 'no action' : `lose ${C.fmt(-net)}`) + (notes.length ? ' • ' + notes.join(', ') : ''), net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
        busy = false; T.lock(false); rollBtn.disabled = false;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.craps{display:grid;grid-template-columns:1fr 1fr;gap:16px}.csec{display:flex;flex-direction:column;gap:8px}.ctitle{color:#d6f5e3;font-weight:700;text-align:center}
  .cgrid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.cgrid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}.cspot{font-size:13px}.cspot.field{background:rgba(255,255,255,.08)}
  @media(max-width:800px){.craps{grid-template-columns:1fr}}`;
  document.head.appendChild(css);
})();
