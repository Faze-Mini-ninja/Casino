(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 30, id: 'war', name: 'Casino War', icon: '⚔️', cat: 'cards', edge: '2.87%',
    blurb: 'High card wins. On a tie: surrender or go to war.',
    rules: `<p>6 decks, Ace high. You and the dealer get one card; higher card wins 1:1. On a tie you may <b>surrender</b> (lose half your bet) or <b>go to war</b>: match your bet, three cards are burned and one more card each is dealt. If your war card is equal or higher, your raise wins 1:1 and the original bet pushes; otherwise you lose both. Optional Tie side bet pays ${L.WAR_TIE_PAYS}:1.</p>`,
    edges: [['Ante (always go to war)', '1:1', '≈2.87%'], ['Ante (always surrender)', '1:1', '≈3.70%'], ['Tie side bet', `${L.WAR_TIE_PAYS}:1`, '≈18.6%']],
    round: 'war',
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Bet' });
      const tie = C.betInput({ value: 0, label: `Tie bet (${L.WAR_TIE_PAYS}:1)` });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), pEl = h('div', { class: 'cards' });
      let busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const warBtn = h('button', { class: 'btn red big', onclick: () => decide('war') }, 'GO TO WAR');
      const surBtn = h('button', { class: 'btn ghost big', onclick: () => decide('surrender') }, 'SURRENDER');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, tie.el),
        h('div', { class: 'stage' }, h('div', { class: 'felt war-felt' }, h('div', null, h('div', { class: 'hand-label' }, 'DEALER'), dEl), h('div', { class: 'war-vs' }, 'VS'), h('div', null, h('div', { class: 'hand-label' }, 'YOU'), pEl)),
          msg.el, h('div', { class: 'controls' }, dealBtn, warBtn, surBtn))));
      ui(false);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; warBtn.style.display = surBtn.style.display = d ? '' : 'none'; ante.disable(d); tie.disable(d); }
      const done = (r) => { ui(false); C.settle(r); const net = C.net(r); msg.set(r.view.notes.join(' • ') + ` (${C.netMsg(net)})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose'); };
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('war', 'start', { ante: ante.value, tie: tie.value }));
        busy = false; if (!r) return;
        pEl.innerHTML = ''; dEl.innerHTML = ''; pEl.appendChild(C.cardEl(r.view.p)); dEl.appendChild(C.cardEl(r.view.d));
        if (r.done) return done(r);
        ui(true); msg.set('TIE! Go to war or surrender?' + (r.view.notes.length ? ' • ' + r.view.notes.join(' ') : ''), 'push');
      }
      async function decide(a) {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('war', a, {}));
        busy = false; if (!r) return;
        if (a === 'war') {
          ui(false); dealBtn.disabled = true;
          for (let i = 0; i < 3; i++) { await C.sleep(150); pEl.appendChild(C.cardEl(null, { hidden: true })); dEl.appendChild(C.cardEl(null, { hidden: true })); }
          await C.sleep(300); pEl.appendChild(C.cardEl(r.view.p2, { cls: 'glow' })); dEl.appendChild(C.cardEl(r.view.d2, { cls: 'glow' }));
          dealBtn.disabled = false;
        }
        done(r);
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.war-felt{display:flex;justify-content:space-around;align-items:center;gap:20px}.war-vs{font-size:40px;font-weight:900;color:var(--gold)}`;
  document.head.appendChild(css);
})();
