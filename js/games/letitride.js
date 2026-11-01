(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 19, id: 'letitride', name: 'Let It Ride', icon: '🏇', cat: 'cards', edge: '3.51%',
    blurb: 'Three equal bets — pull two back or let them ride.',
    rules: '<p>Place three equal bets. You get 3 cards plus 2 face-down community cards. After seeing your 3 cards you may pull back bet #1; after the first community card you may pull back bet #2. Bet #3 always plays. Every remaining bet is paid by the paytable on your final 5-card hand (pair of 10s or better). No dealer hand.</p>',
    edges: [...Object.entries(L.LIR_PAYS).reverse().map(([c, p]) => [L.HAND_NAMES[c], p + ':1', '']), ['Pair of 10s or better', '1:1', ''], ['Overall (optimal strategy)', '', '3.51%']],
    round: 'letitride',
    mount(root) {
      const bet = C.betInput({ value: 5, label: 'Bet (×3 spots)' });
      const msg = C.msg();
      const pEl = h('div', { class: 'cards' }), cEl = h('div', { class: 'cards' });
      const spotsEl = h('div', { class: 'lir-spots' });
      const pt = h('div', { class: 'pays-list' }, [...Object.entries(L.LIR_PAYS).reverse(), [1, 1]].map(([c, p]) => h('div', { 'data-c': c }, h('span', null, +c === 1 ? 'Pair 10s+' : L.HAND_NAMES[c]), h('b', null, p + ':1'))));
      let st = null, busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const rideBtn = h('button', { class: 'btn green big', onclick: () => step('ride') }, 'LET IT RIDE');
      const pullBtn = h('button', { class: 'btn red big', onclick: () => step('pull') }, 'PULL BACK');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('h3', null, 'Paytable'), pt),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, h('div', { class: 'hand-label' }, 'COMMUNITY'), cEl, h('div', { style: 'height:14px' }), h('div', { class: 'hand-label' }, 'YOUR CARDS'), pEl, spotsEl),
          msg.el, h('div', { class: 'controls' }, dealBtn, rideBtn, pullBtn))));
      ui(false); paint(null);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; rideBtn.style.display = pullBtn.style.display = d ? '' : 'none'; bet.disable(d); }
      function paint(v) {
        spotsEl.innerHTML = '';
        ['1', '2', '$'].forEach((lbl, i) => spotsEl.appendChild(h('div', { class: 'lir-spot' + (v && !v.live[i] ? ' pulled' : '') }, h('div', { class: 'lir-c' }, lbl), v ? (v.live[i] ? C.fmt(st.b) : 'pulled') : '')));
        if (!v) return;
        pEl.innerHTML = ''; v.P.forEach((c) => pEl.appendChild(C.cardEl(c)));
        cEl.innerHTML = ''; [0, 1].forEach((i) => cEl.appendChild(C.cardEl(v.K[i], { hidden: !v.K[i] })));
      }
      async function deal() {
        if (busy) return; busy = true;
        const b = bet.value;
        const r = await C.try(() => C.play('letitride', 'start', { bet: b }));
        busy = false; if (!r) return;
        st = { b }; pt.querySelectorAll('div').forEach((x) => x.classList.remove('hit'));
        ui(true); paint(r.view); msg.set('Pull back bet #1 or let it ride?');
      }
      async function step(a) {
        if (!st || busy) return; busy = true;
        const r = await C.try(() => C.play('letitride', a, {}));
        busy = false; if (!r) return;
        paint(r.view);
        if (!r.done) return msg.set('Pull back bet #2 or let it ride?');
        ui(false); C.settle(r);
        const v = r.view;
        if (v.cat != null) { const row = pt.querySelector(`[data-c="${v.cat}"]`); if (row) row.classList.add('hit'); }
        const net = C.net(r);
        msg.set(`${v.name} — ${v.pays > 0 ? `${v.pays}:1 on ${v.riding} bet${v.riding > 1 ? 's' : ''}` : 'no win'} (${C.netMsg(net)})`, net > 0 ? 'win' : 'lose');
        st = null;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.lir-spots{display:flex;gap:24px;justify-content:center;margin-top:14px}.lir-spot{width:90px;height:90px;border-radius:50%;border:3px solid rgba(255,255,255,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:13px}
  .lir-spot .lir-c{font-size:22px;color:var(--gold)}.lir-spot.pulled{opacity:.35;border-style:dashed}`;
  document.head.appendChild(css);
})();
