(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 17, id: 'caribbean', name: 'Caribbean Stud Poker', icon: '🏝️', cat: 'cards', edge: '5.22%',
    blurb: 'Five-card stud against the dealer with bonus raise payouts.',
    rules: '<p>Place an Ante. You and the dealer get 5 cards (one dealer card face up). Fold, or Raise 2× your ante. Dealer qualifies with Ace-King or better. If the dealer doesn\'t qualify, Ante pays 1:1 and the Raise pushes. If the dealer qualifies and you win, Ante pays 1:1 and the Raise pays by the bonus table; if you lose, both lose; ties push.</p>',
    edges: [...Object.entries(L.CSP_PAYS).reverse().filter(([c]) => c > 0).map(([c, p]) => ['Raise: ' + L.HAND_NAMES[c], p + ':1', '']), ['Raise: High card (AK)', '1:1', ''], ['Overall (optimal strategy, per ante)', '', '5.22%']],
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Ante' });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), pEl = h('div', { class: 'cards' });
      const dLbl = h('div', { class: 'hand-label' }, 'DEALER'), pLbl = h('div', { class: 'hand-label' }, 'YOU');
      let st = null;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const raiseBtn = h('button', { class: 'btn green big', onclick: () => resolve(true) }, 'RAISE 2×');
      const foldBtn = h('button', { class: 'btn red big', onclick: () => resolve(false) }, 'FOLD');
      const pt = h('div', { class: 'pays-list' }, Object.entries(L.CSP_PAYS).reverse().filter(([c]) => c > 0).map(([c, p]) => h('div', { 'data-c': c }, h('span', null, L.HAND_NAMES[c]), h('b', null, p + ':1'))));
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, h('h3', null, 'Raise pays'), pt, h('div', { class: 'muted', style: 'font-size:12px' }, 'Tip: raise with any pair or better; fold most hands below A-K.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, dLbl, dEl, h('div', { style: 'height:20px' }), pEl, pLbl), msg.el, h('div', { class: 'controls' }, dealBtn, raiseBtn, foldBtn))));
      ui(false);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; raiseBtn.style.display = foldBtn.style.display = d ? '' : 'none'; ante.disable(d); }
      function deal() {
        const a = ante.value;
        if (a * 3 > C.balance()) return C.toast('You need 3× the ante in balance (ante + 2× raise)', 'err');
        if (!C.bet('caribbean', a)) return;
        const d = L.shuffle(L.newDeck(1));
        st = { a, P: d.slice(0, 5).sort((x, y) => y.r - x.r), D: d.slice(5, 10) };
        pEl.innerHTML = ''; st.P.forEach((c) => pEl.appendChild(C.cardEl(c)));
        dEl.innerHTML = ''; st.D.forEach((c, i) => dEl.appendChild(C.cardEl(c, { hidden: i > 0 })));
        dLbl.textContent = 'DEALER';
        pLbl.innerHTML = `YOU <span class="tag">${L.handName(L.eval5(st.P))}</span>`;
        pt.querySelectorAll('div').forEach((x) => x.classList.remove('hit'));
        ui(true); msg.set('Raise or fold?');
      }
      function resolve(raise) {
        if (!st) return;
        if (raise && !C.bet('caribbean', st.a * 2)) return;
        ui(false);
        const wager = st.a * (raise ? 3 : 1);
        dEl.innerHTML = ''; st.D.forEach((c) => dEl.appendChild(C.cardEl(c)));
        const ps = L.eval5(st.P), ds = L.eval5(st.D);
        const qual = L.cspQualifies(ds);
        dLbl.innerHTML = `DEALER <span class="tag">${L.handName(ds)}${qual ? '' : ' — does not qualify'}</span>`;
        let pay = 0, note;
        if (!raise) note = 'Folded';
        else if (!qual) { pay = st.a * 2 + st.a * 2; note = 'Dealer does not qualify: Ante 1:1, Raise pushes'; }
        else if (ps > ds) { const c = L.catR(ps); const m = L.CSP_PAYS[c]; pay = st.a * 2 + st.a * 2 * (m + 1); note = `You win! ${L.HAND_NAMES[c]} pays ${m}:1 on the raise`; const row = pt.querySelector(`[data-c="${c}"]`); if (row) row.classList.add('hit'); }
        else if (ps === ds) { pay = wager; note = 'Tie — push'; }
        else note = 'Dealer wins';
        pay = C.win('caribbean', pay);
        C.record('caribbean', wager, pay, note);
        const net = pay - wager;
        msg.set(`${note} (${net >= 0 ? '+' : '−'}${C.fmt(Math.abs(net))})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
        st = null;
      }
    },
  });
})();
