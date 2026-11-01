(function () {
  const C = Casino, L = Lib, h = C.h;
  const QH = L.eval3([{ r: 12, s: 0 }, { r: 3, s: 1 }, { r: 2, s: 2 }]); // lowest Queen-high
  C.register({
    n: 16, id: 'threecard', name: 'Three Card Poker', icon: '♣️', cat: 'cards', edge: '≈15% / 17% (sides)',
    blurb: 'Ante/Play plus Pair Plus and 6-Card Bonus side bets.',
    rules: `<p>Single deck. Place an Ante and/or side bets. After seeing your 3 cards, Play (match the Ante) or Fold. Dealer needs Queen-high to qualify: if not, Ante pays 1:1 and Play pushes. Otherwise higher hand wins 1:1 on both. Ante bonus: straight flush 5:1, trips 4:1, straight 1:1. Hand ranks: Straight Flush > Three of a Kind > Straight > Flush > Pair > High card.</p>
      <p><b>Pair Plus</b> (your 3 cards only): SF ${L.TCP_PAIRPLUS[5]}:1, Trips ${L.TCP_PAIRPLUS[4]}:1, Straight ${L.TCP_PAIRPLUS[3]}:1, Flush ${L.TCP_PAIRPLUS[2]}:1, Pair ${L.TCP_PAIRPLUS[1]}:1.<br>
      <b>6-Card Bonus</b> (best 5 of your 3 + dealer's 3): ${L.TCP_SIX.map(([c, p]) => L.HAND_NAMES[c] + ' ' + p + ':1').join(', ')}.</p>`,
    edges: [['Ante/Play (Q-6-4 strategy)', '1:1', '≈3.4% of ante'], ['Pair Plus', '30/20/5/3/1', '15.06% (exact)'], ['6-Card Bonus', '1000/200/50/20/15/10/6', '≈13–17%']],
    round: 'threecard',
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Ante' });
      const pp = C.betInput({ value: 5, label: 'Pair Plus' });
      const six = C.betInput({ value: 0, label: '6-Card Bonus' });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), pEl = h('div', { class: 'cards' });
      const dLbl = h('div', { class: 'hand-label' }, 'DEALER'), pLbl = h('div', { class: 'hand-label' }, 'YOU');
      let busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const playBtn = h('button', { class: 'btn green big', onclick: () => resolve('play') }, 'PLAY');
      const foldBtn = h('button', { class: 'btn red big', onclick: () => resolve('fold') }, 'FOLD');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, pp.el, six.el, h('div', { class: 'muted', style: 'font-size:12px' }, 'Strategy tip: play Q-6-4 or better, fold worse.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, dLbl, dEl, h('div', { style: 'height:20px' }), pEl, pLbl), msg.el, h('div', { class: 'controls' }, dealBtn, playBtn, foldBtn))));
      ui(false);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; playBtn.style.display = foldBtn.style.display = d ? '' : 'none'; [ante, pp, six].forEach((b) => b.disable(d)); }
      function show(v, done) {
        pEl.innerHTML = ''; v.P.forEach((c) => pEl.appendChild(C.cardEl(c)));
        dEl.innerHTML = ''; (done ? v.D : [null, null, null]).forEach((c) => dEl.appendChild(C.cardEl(c, { hidden: !c })));
        pLbl.innerHTML = `YOU <span class="tag">${v.pName}</span>`;
        dLbl.innerHTML = done ? `DEALER <span class="tag">${v.dName}</span>` : 'DEALER';
      }
      function finish(r) {
        show(r.view, true); ui(false); C.settle(r);
        const net = C.net(r);
        msg.set(r.view.notes.join(' • ') + ` (${C.netMsg(net)})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('threecard', 'start', { ante: ante.value, pp: pp.value, six: six.value }));
        busy = false; if (!r) return;
        if (r.done) return finish(r);
        show(r.view, false); ui(true); msg.set('Play or fold?');
      }
      async function resolve(a) {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('threecard', a, {}));
        busy = false; if (r) finish(r);
      }
    },
  });
})();
