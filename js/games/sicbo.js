(function () {
  const C = Casino, L = Lib, h = C.h;
  const edgeTot = (t) => { const ways = { 4: 3, 5: 6, 6: 10, 7: 15, 8: 21, 9: 25, 10: 27 }[t <= 10 ? t : 21 - t]; return ((1 - ways * (L.SICBO_TOTALS[t] + 1) / 216) * 100).toFixed(2) + '%'; };
  C.register({
    n: 12, id: 'sicbo', name: 'Sic Bo', icon: '🎲', cat: 'dice', edge: '2.8–33.3%',
    blurb: 'Three-dice Chinese classic. Triples and doubles carry 30%+ edges.',
    rules: '<p>Three dice are shaken. Small (4–10) and Big (11–17) lose on any triple. Single-number bets pay 1:1, 2:1 or 3:1 for one, two or three matching dice.</p>',
    edges: [['Small / Big / Odd / Even', '1:1', '2.78%'], ['Single number', '1:1 / 2:1 / 3:1', '7.87%'], ['Two-dice combination', '5:1', '16.67%'], ['Specific double', '8:1', '33.33%'], ['Any triple', '24:1', '30.56%'], ['Specific triple', '150:1', '30.09%'],
      ...Object.entries(L.SICBO_TOTALS).filter(([t]) => t <= 10).map(([t, p]) => [`Total ${t} / ${21 - t}`, p + ':1', edgeTot(+t)])],
    mount(root) {
      const T = C.chipTable();
      const msg = C.msg();
      const dice = h('div', { class: 'dice-row' }, C.dieEl(1), C.dieEl(2), C.dieEl(3));
      const hist = h('div', { class: 'history-strip' });
      let busy = false;
      const dieMini = (v) => h('span', { class: 'mini-die' }, '⚀⚁⚂⚃⚄⚅'[v - 1]);
      const sp = (id, content, pays, cls = '') => T.spot(id, [content, h('small', null, pays)], 'sbspot ' + cls);
      const nums = [1, 2, 3, 4, 5, 6];
      const combos = []; for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) combos.push([a, b]);
      const rollBtn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
      root.appendChild(h('div', null,
        h('div', { class: 'felt sicbo' },
          h('div', { class: 'sb-row4' }, sp('small', 'SMALL 4–10', '1:1', 'tall'), sp('odd', 'ODD', '1:1'), sp('even', 'EVEN', '1:1'), sp('big', 'BIG 11–17', '1:1', 'tall')),
          h('div', { class: 'sb-row13' }, nums.map((n) => sp('double:' + n, [dieMini(n), dieMini(n)], '8:1')), sp('anyTriple', 'ANY TRIPLE', '24:1'), nums.map((n) => sp('triple:' + n, [dieMini(n), dieMini(n), dieMini(n)], '150:1'))),
          h('div', { class: 'sb-row14' }, Object.keys(L.SICBO_TOTALS).map((t) => sp('t:' + t, h('b', null, t), L.SICBO_TOTALS[t] + ':1'))),
          h('div', { class: 'sb-row15' }, combos.map(([a, b]) => sp(`combo:${a}-${b}`, [dieMini(a), dieMini(b)], '5:1'))),
          h('div', { class: 'sb-row6' }, nums.map((n) => sp('single:' + n, dieMini(n), '1/2/3 : 1')))),
        h('div', { class: 'stage', style: 'min-height:0;margin-top:14px' }, dice, msg.el, rollBtn, hist), T.bar));
      async function roll() {
        if (busy || !T.ready()) return;
        busy = true; T.lock(true); rollBtn.disabled = true;
        const r = await C.try(() => C.play('sicbo', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); rollBtn.disabled = false; return; }
        T.mark([]);
        const d = r.result.dice;
        await C.rollDice(dice, d);
        const pay = r.payout, wager = r.wager;
        C.settle(r);
        T.mark(r.result.winners);
        const t = d[0] + d[1] + d[2], triple = d[0] === d[1] && d[1] === d[2];
        hist.prepend(h('span', { class: 'pill ' + (triple ? 'g' : t <= 10 ? '' : 'r') }, `${d.join('')} ${t}`));
        while (hist.children.length > 12) hist.lastChild.remove();
        msg.set(`${d.join(' · ')} = ${t}${triple ? ' TRIPLE!' : t <= 10 ? ' Small' : ' Big'} — ` + (pay ? `pays ${C.fmt(pay)}` : 'no win'), pay > wager ? 'win' : pay ? 'push' : 'lose');
        busy = false; T.lock(false); rollBtn.disabled = false;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.sicbo{display:flex;flex-direction:column;gap:6px}.sbspot{font-size:12px;padding:4px 2px;min-height:40px}.sbspot.tall{min-height:56px;font-size:15px}
  .sb-row4{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.4fr;gap:6px}.sb-row13{display:grid;grid-template-columns:repeat(13,1fr);gap:4px}
  .sb-row14{display:grid;grid-template-columns:repeat(14,1fr);gap:4px}.sb-row15{display:grid;grid-template-columns:repeat(15,1fr);gap:4px}.sb-row6{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
  .mini-die{font-size:22px;line-height:1}
  @media(max-width:900px){.sb-row13,.sb-row14,.sb-row15{grid-template-columns:repeat(7,1fr)}}`;
  document.head.appendChild(css);
})();
