(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 17, id: 'caribbean', name: 'Caribbean Stud Poker', icon: '🏝️', cat: 'cards', edge: '5.22%',
    blurb: 'Five-card stud against the dealer with bonus raise payouts.',
    rules: '<p>Place an Ante. You and the dealer get 5 cards (one dealer card face up). Fold, or Raise 2× your ante. Dealer qualifies with Ace-King or better. If the dealer doesn\'t qualify, Ante pays 1:1 and the Raise pushes. If the dealer qualifies and you win, Ante pays 1:1 and the Raise pays by the bonus table; if you lose, both lose; ties push.</p>',
    edges: [...Object.entries(L.CSP_PAYS).reverse().filter(([c]) => c > 0).map(([c, p]) => ['Raise: ' + L.HAND_NAMES[c], p + ':1', '']), ['Raise: High card (AK)', '1:1', ''], ['Overall (optimal strategy, per ante)', '', '5.22%']],
    round: 'caribbean',
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Ante' });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), pEl = h('div', { class: 'cards' });
      const dLbl = h('div', { class: 'hand-label' }, 'DEALER'), pLbl = h('div', { class: 'hand-label' }, 'YOU');
      let busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const raiseBtn = h('button', { class: 'btn green big', onclick: () => resolve('raise') }, 'RAISE 2×');
      const foldBtn = h('button', { class: 'btn red big', onclick: () => resolve('fold') }, 'FOLD');
      const pt = h('div', { class: 'pays-list' }, Object.entries(L.CSP_PAYS).reverse().filter(([c]) => c > 0).map(([c, p]) => h('div', { 'data-c': c }, h('span', null, L.HAND_NAMES[c]), h('b', null, p + ':1'))));
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, h('h3', null, 'Raise pays'), pt, h('div', { class: 'muted', style: 'font-size:12px' }, 'Tip: raise with any pair or better; fold most hands below A-K.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, dLbl, dEl, h('div', { style: 'height:20px' }), pEl, pLbl), msg.el, h('div', { class: 'controls' }, dealBtn, raiseBtn, foldBtn))));
      ui(false);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; raiseBtn.style.display = foldBtn.style.display = d ? '' : 'none'; ante.disable(d); }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('caribbean', 'start', { ante: ante.value }));
        busy = false; if (!r) return;
        const v = r.view;
        pEl.innerHTML = ''; v.P.forEach((c) => pEl.appendChild(C.cardEl(c)));
        dEl.innerHTML = ''; [v.up, null, null, null, null].forEach((c) => dEl.appendChild(C.cardEl(c, { hidden: !c })));
        dLbl.textContent = 'DEALER'; pLbl.innerHTML = `YOU <span class="tag">${v.pName}</span>`;
        pt.querySelectorAll('div').forEach((x) => x.classList.remove('hit'));
        ui(true); msg.set('Raise or fold?');
      }
      async function resolve(a) {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('caribbean', a, {}));
        busy = false; if (!r) return;
        ui(false);
        const v = r.view;
        dEl.innerHTML = ''; v.D.forEach((c) => dEl.appendChild(C.cardEl(c)));
        dLbl.innerHTML = `DEALER <span class="tag">${v.dName}${v.qual ? '' : ': does not qualify'}</span>`;
        if (v.cat != null) { const row = pt.querySelector(`[data-c="${v.cat}"]`); if (row) row.classList.add('hit'); }
        C.settle(r);
        const net = C.net(r);
        msg.set(`${v.note} (${C.netMsg(net)})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
    },
  });
})();
