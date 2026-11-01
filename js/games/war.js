(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 30, id: 'war', name: 'Casino War', icon: '⚔️', cat: 'cards', edge: '2.87%',
    blurb: 'High card wins. On a tie: surrender or go to war.',
    rules: `<p>6 decks, Ace high. You and the dealer get one card; higher card wins 1:1. On a tie you may <b>surrender</b> (lose half your bet) or <b>go to war</b>: match your bet, three cards are burned and one more card each is dealt. If your war card is equal or higher, your raise wins 1:1 and the original bet pushes; otherwise you lose both. Optional Tie side bet pays ${L.WAR_TIE_PAYS}:1.</p>`,
    edges: [['Ante (always go to war)', '1:1', '≈2.87%'], ['Ante (always surrender)', '1:1', '≈3.70%'], ['Tie side bet', `${L.WAR_TIE_PAYS}:1`, '≈18.6%']],
    mount(root) {
      const shoe = new L.Shoe(6, 0.75);
      const ante = C.betInput({ value: 10, label: 'Bet' });
      const tie = C.betInput({ value: 0, label: `Tie bet (${L.WAR_TIE_PAYS}:1)` });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), pEl = h('div', { class: 'cards' });
      let st = null;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const warBtn = h('button', { class: 'btn red big', onclick: () => war() }, 'GO TO WAR');
      const surBtn = h('button', { class: 'btn ghost big', onclick: () => surrender() }, 'SURRENDER');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, tie.el),
        h('div', { class: 'stage' }, h('div', { class: 'felt war-felt' }, h('div', null, h('div', { class: 'hand-label' }, 'DEALER'), dEl), h('div', { class: 'war-vs' }, 'VS'), h('div', null, h('div', { class: 'hand-label' }, 'YOU'), pEl)),
          msg.el, h('div', { class: 'controls' }, dealBtn, warBtn, surBtn))));
      ui(false);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; warBtn.style.display = surBtn.style.display = d ? '' : 'none'; ante.disable(d); tie.disable(d); }
      function deal() {
        const a = ante.value, t = tie.value;
        if (!(a > 0)) return C.toast('Bet required', 'err');
        if (!C.bet('war', a + t)) return;
        if (shoe.checkShuffle()) C.toast('New 6-deck shoe');
        const p = shoe.draw(), d = shoe.draw();
        st = { a, t, p, d, wager: a + t, paid: 0 };
        pEl.innerHTML = ''; dEl.innerHTML = ''; pEl.appendChild(C.cardEl(p)); dEl.appendChild(C.cardEl(d));
        const notes = [];
        if (p.r === d.r) {
          if (t > 0) { st.paid += C.win('war', t * (L.WAR_TIE_PAYS + 1)); notes.push(`Tie bet wins ${L.WAR_TIE_PAYS}:1`); }
          st.notes = notes; ui(true);
          msg.set('TIE! Go to war or surrender?' + (notes.length ? ' • ' + notes.join(' ') : ''), 'push');
          return;
        }
        if (p.r > d.r) { st.paid += C.win('war', a * 2); notes.push('You win'); } else notes.push('Dealer wins');
        if (t > 0) notes.push('Tie bet loses');
        done(notes);
      }
      function surrender() { if (!st) return; st.paid += C.win('war', st.a / 2); done([...st.notes, 'Surrendered (half bet returned)']); }
      async function war() {
        if (!st) return;
        if (!C.bet('war', st.a)) return;
        st.wager += st.a; ui(false); dealBtn.disabled = true;
        shoe.draw(); shoe.draw(); shoe.draw();
        const p = shoe.draw(), d = shoe.draw();
        for (let i = 0; i < 3; i++) { await C.sleep(150); pEl.appendChild(C.cardEl(null, { hidden: true })); dEl.appendChild(C.cardEl(null, { hidden: true })); }
        await C.sleep(300); pEl.appendChild(C.cardEl(p, { cls: 'glow' })); dEl.appendChild(C.cardEl(d, { cls: 'glow' }));
        dealBtn.disabled = false;
        if (p.r >= d.r) { st.paid += C.win('war', st.a * 3); done([...st.notes, 'You win the war! Raise pays 1:1, bet pushes']); }
        else done([...st.notes, 'Dealer wins the war']);
      }
      function done(notes) {
        ui(false);
        C.record('war', st.wager, st.paid, notes.join('; '));
        const net = st.paid - st.wager;
        msg.set(notes.join(' • ') + ` (${net >= 0 ? '+' : '−'}${C.fmt(Math.abs(net))})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
        st = null;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.war-felt{display:flex;justify-content:space-around;align-items:center;gap:20px}.war-vs{font-size:40px;font-weight:900;color:var(--gold)}`;
  document.head.appendChild(css);
})();
