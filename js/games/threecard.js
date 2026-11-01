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
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Ante' });
      const pp = C.betInput({ value: 5, label: 'Pair Plus' });
      const six = C.betInput({ value: 0, label: '6-Card Bonus' });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), pEl = h('div', { class: 'cards' });
      const dLbl = h('div', { class: 'hand-label' }, 'DEALER'), pLbl = h('div', { class: 'hand-label' }, 'YOU');
      let st = null;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const playBtn = h('button', { class: 'btn green big', onclick: () => resolve(true) }, 'PLAY');
      const foldBtn = h('button', { class: 'btn red big', onclick: () => resolve(false) }, 'FOLD');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, pp.el, six.el, h('div', { class: 'muted', style: 'font-size:12px' }, 'Strategy tip: play Q-6-4 or better, fold worse.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, dLbl, dEl, h('div', { style: 'height:20px' }), pEl, pLbl), msg.el, h('div', { class: 'controls' }, dealBtn, playBtn, foldBtn))));
      ui(false);
      function ui(deciding) { dealBtn.style.display = deciding ? 'none' : ''; playBtn.style.display = foldBtn.style.display = deciding ? '' : 'none'; [ante, pp, six].forEach((b) => b.disable(deciding)); }
      function deal() {
        const a = ante.value, p = pp.value, s = six.value;
        if (!(a + p + s > 0)) return C.toast('Place at least one bet', 'err');
        if (s > 0 && !(a > 0)) return C.toast('6-Card Bonus requires an Ante', 'err');
        if (a > 0 && a * 2 + p + s > C.balance()) return C.toast('Keep enough balance to cover the Play bet', 'err');
        if (!C.bet('threecard', a + p + s)) return;
        const d = L.shuffle(L.newDeck(1));
        st = { a, p, s, P: d.slice(0, 3), D: d.slice(3, 6), wager: a + p + s, paid: 0 };
        pEl.innerHTML = ''; st.P.forEach((c) => pEl.appendChild(C.cardEl(c)));
        dEl.innerHTML = ''; st.D.forEach(() => dEl.appendChild(C.cardEl(null, { hidden: true })));
        dLbl.textContent = 'DEALER';
        pLbl.innerHTML = `YOU <span class="tag">${L.HAND3_NAMES[L.cat3(L.eval3(st.P))]}</span>`;
        if (a > 0) { ui(true); msg.set('Play or fold?'); } else resolve(false, true);
      }
      function resolve(play, ppOnly) {
        if (!st) return;
        ui(false);
        const notes = [];
        if (play) { if (!C.bet('threecard', st.a)) { ui(true); return; } st.wager += st.a; }
        dEl.innerHTML = ''; st.D.forEach((c) => dEl.appendChild(C.cardEl(c)));
        const ps = L.eval3(st.P), ds = L.eval3(st.D), pc = L.cat3(ps);
        dLbl.innerHTML = `DEALER <span class="tag">${L.HAND3_NAMES[L.cat3(ds)]}</span>`;
        if (play) {
          const qual = ds >= QH;
          if (!qual) { st.paid += st.a * 2 + st.a; notes.push('Dealer does not qualify: Ante wins, Play pushes'); }
          else if (ps > ds) { st.paid += st.a * 4; notes.push('You beat the dealer'); }
          else if (ps === ds) { st.paid += st.a * 2; notes.push('Tie — push'); }
          else notes.push('Dealer wins');
          const ab = L.TCP_ANTE_BONUS[pc]; if (ab) { st.paid += st.a * ab; notes.push(`Ante bonus ${ab}:1`); }
        } else if (!ppOnly) notes.push('Folded');
        if (st.p > 0) { const m = L.TCP_PAIRPLUS[pc]; if (m) { st.paid += st.p * (m + 1); notes.push(`Pair Plus ${L.HAND3_NAMES[pc]} ${m}:1`); } else notes.push('Pair Plus loses'); }
        if (st.s > 0) { const r = L.tcpSixCard([...st.P, ...st.D]); if (r.pays > 0) { st.paid += st.s * (r.pays + 1); notes.push(`6-Card ${r.name} ${r.pays}:1`); } else notes.push('6-Card loses'); }
        const pay = C.win('threecard', st.paid);
        C.record('threecard', st.wager, pay, notes.join('; '));
        const net = pay - st.wager;
        msg.set(notes.join(' • ') + ` (${net >= 0 ? '+' : '−'}${C.fmt(Math.abs(net))})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
        st = null;
      }
    },
  });
})();
