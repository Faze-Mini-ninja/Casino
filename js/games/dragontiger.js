(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 15, id: 'dragontiger', name: 'Dragon Tiger', icon: '🐉', cat: 'cards', edge: '7.5–32.8%',
    blurb: 'One card each, highest wins. Ties take the whole bet.',
    rules: '<p>8 decks. One card to Dragon, one to Tiger; the higher card wins (Ace is low, King high). <b>On a tie, Dragon and Tiger bets lose in full</b> (many casinos only take half). Odd/Even bets lose when the card is a 7.</p>',
    edges: [['Dragon / Tiger', '1:1', '≈7.47%'], ['Tie', '8:1', '≈32.8%'], ['Suited Tie', '50:1', '≈13.9%'], ['Dragon/Tiger Odd or Even (7 loses)', '1:1', '7.69%']],
    mount(root) {
      const T = C.chipTable();
      const msg = C.msg();
      const dEl = h('div', { class: 'cards dt-card' }, C.cardEl(null, { hidden: true })), tEl = h('div', { class: 'cards dt-card' }, C.cardEl(null, { hidden: true }));
      const hist = h('div', { class: 'history-strip' });
      let busy = false;
      const sp = (id, label, pays, cls = '') => T.spot(id, [label, h('small', null, pays)], 'dtspot ' + cls);
      const btn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      root.appendChild(h('div', null,
        h('div', { class: 'felt dt' },
          h('div', { class: 'dt-side' }, h('div', { class: 'dt-title drag' }, 'DRAGON'), dEl, sp('dragon', 'DRAGON', '1:1', 'big drag'), h('div', { class: 'dt-two' }, sp('dOdd', 'Odd', '1:1'), sp('dEven', 'Even', '1:1'))),
          h('div', { class: 'dt-mid' }, sp('tie', 'TIE', '8:1', 'big tie'), sp('suitedTie', 'SUITED TIE', '50:1')),
          h('div', { class: 'dt-side' }, h('div', { class: 'dt-title tig' }, 'TIGER'), tEl, sp('tiger', 'TIGER', '1:1', 'big tig'), h('div', { class: 'dt-two' }, sp('tOdd', 'Odd', '1:1'), sp('tEven', 'Even', '1:1')))),
        h('div', { class: 'stage', style: 'min-height:0' }, msg.el, btn, hist), T.bar));
      async function deal() {
        if (busy || !T.ready()) return;
        busy = true; T.lock(true); btn.disabled = true;
        const r = await C.try(() => C.play('dragontiger', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
        T.mark([]);
        const { d, t } = r.result;
        dEl.innerHTML = ''; tEl.innerHTML = '';
        await C.sleep(250); dEl.appendChild(C.cardEl(d)); await C.sleep(450); tEl.appendChild(C.cardEl(t)); await C.sleep(250);
        const pay = r.payout, wager = r.wager, res = r.result.res;
        C.settle(r);
        T.mark(r.result.winners);
        hist.prepend(h('span', { class: 'pill ' + (res === 'Dragon' ? 'r' : res === 'Tiger' ? 'bl' : 'g') }, res[0]));
        while (hist.children.length > 24) hist.lastChild.remove();
        msg.set(`${res}${res === 'Tie' ? '!' : ' wins'} — ` + (pay ? `pays ${C.fmt(pay)}` : 'no win'), pay > wager ? 'win' : pay ? 'push' : 'lose');
        busy = false; T.lock(false); btn.disabled = false;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.dt{display:grid;grid-template-columns:1fr 200px 1fr;gap:16px;align-items:center}.dt-side,.dt-mid{display:flex;flex-direction:column;gap:8px}
  .dt-title{text-align:center;font-weight:900;font-size:22px}.dt-title.drag{color:#ff6b6b}.dt-title.tig{color:#74c0fc}.dt-card{min-height:104px}
  .dtspot.big{min-height:64px;font-size:20px}.dtspot.drag{background:rgba(200,30,40,.35)}.dtspot.tig{background:rgba(30,90,200,.35)}.dtspot.tie{background:rgba(30,160,80,.35)}
  .dt-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}@media(max-width:700px){.dt{grid-template-columns:1fr}}`;
  document.head.appendChild(css);
})();
