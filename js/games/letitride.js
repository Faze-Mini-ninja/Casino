(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 19, id: 'letitride', name: 'Let It Ride', icon: '🏇', cat: 'cards', edge: '3.51%',
    blurb: 'Three equal bets — pull two back or let them ride.',
    rules: '<p>Place three equal bets. You get 3 cards plus 2 face-down community cards. After seeing your 3 cards you may pull back bet #1; after the first community card you may pull back bet #2. Bet #3 always plays. Every remaining bet is paid by the paytable on your final 5-card hand (pair of 10s or better). No dealer hand.</p>',
    edges: [...Object.entries(L.LIR_PAYS).reverse().map(([c, p]) => [L.HAND_NAMES[c], p + ':1', '']), ['Pair of 10s or better', '1:1', ''], ['Overall (optimal strategy)', '', '3.51%']],
    mount(root) {
      const bet = C.betInput({ value: 5, label: 'Bet (×3 spots)' });
      const msg = C.msg();
      const pEl = h('div', { class: 'cards' }), cEl = h('div', { class: 'cards' });
      const spotsEl = h('div', { class: 'lir-spots' });
      const pt = h('div', { class: 'pays-list' }, [...Object.entries(L.LIR_PAYS).reverse(), [1, 1]].map(([c, p]) => h('div', { 'data-c': c }, h('span', null, +c === 1 ? 'Pair 10s+' : L.HAND_NAMES[c]), h('b', null, p + ':1'))));
      let st = null;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const rideBtn = h('button', { class: 'btn green big', onclick: () => step(true) }, 'LET IT RIDE');
      const pullBtn = h('button', { class: 'btn red big', onclick: () => step(false) }, 'PULL BACK');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('h3', null, 'Paytable'), pt),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, h('div', { class: 'hand-label' }, 'COMMUNITY'), cEl, h('div', { style: 'height:14px' }), h('div', { class: 'hand-label' }, 'YOUR CARDS'), pEl, spotsEl),
          msg.el, h('div', { class: 'controls' }, dealBtn, rideBtn, pullBtn))));
      ui(false); paintSpots();
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; rideBtn.style.display = pullBtn.style.display = d ? '' : 'none'; bet.disable(d); }
      function paintSpots() {
        spotsEl.innerHTML = '';
        ['1', '2', '$'].forEach((lbl, i) => spotsEl.appendChild(h('div', { class: 'lir-spot' + (st && !st.live[i] ? ' pulled' : '') }, h('div', { class: 'lir-c' }, lbl), st ? (st.live[i] ? C.fmt(st.b) : 'pulled') : '')));
      }
      function deal() {
        const b = bet.value;
        if (!C.bet('letitride', b * 3)) return;
        const d = L.shuffle(L.newDeck(1));
        st = { b, P: d.slice(0, 3), K: d.slice(3, 5), live: [true, true, true], stage: 0 };
        pEl.innerHTML = ''; st.P.forEach((c) => pEl.appendChild(C.cardEl(c)));
        cEl.innerHTML = ''; st.K.forEach(() => cEl.appendChild(C.cardEl(null, { hidden: true })));
        pt.querySelectorAll('div').forEach((x) => x.classList.remove('hit'));
        ui(true); paintSpots(); msg.set('Pull back bet #1 or let it ride?');
      }
      function step(ride) {
        if (!st) return;
        if (!ride) { st.live[st.stage] = false; C.win('letitride', st.b); }
        st.stage++;
        cEl.innerHTML = ''; st.K.forEach((c, i) => cEl.appendChild(C.cardEl(c, { hidden: i >= st.stage })));
        paintSpots();
        if (st.stage === 1) { msg.set('Pull back bet #2 or let it ride?'); return; }
        ui(false);
        const five = [...st.P, ...st.K];
        const r = L.lirPay(five);
        const liveN = st.live.filter(Boolean).length;
        const returned = 3 - liveN; // already refunded pulled bets
        let pay = r.pays > 0 ? st.b * liveN * (r.pays + 1) : 0;
        pay = C.win('letitride', pay);
        const c = r.pays > 0 ? (r.name.startsWith('Pair of 10') ? 1 : L.catR(L.eval5(five))) : null;
        const row = c != null && pt.querySelector(`[data-c="${c}"]`); if (row) row.classList.add('hit');
        C.record('letitride', st.b * 3, pay + st.b * returned, `${r.name}, ${liveN} bet(s) riding`);
        const net = pay - st.b * liveN;
        msg.set(`${r.name} — ${r.pays > 0 ? `${r.pays}:1 on ${liveN} bet${liveN > 1 ? 's' : ''}` : 'no win'} (${net >= 0 ? '+' : '−'}${C.fmt(Math.abs(net))})`, net > 0 ? 'win' : 'lose');
        st = null;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.lir-spots{display:flex;gap:24px;justify-content:center;margin-top:14px}.lir-spot{width:90px;height:90px;border-radius:50%;border:3px solid rgba(255,255,255,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:13px}
  .lir-spot .lir-c{font-size:22px;color:var(--gold)}.lir-spot.pulled{opacity:.35;border-style:dashed}`;
  document.head.appendChild(css);
})();
