(function () {
  const C = Casino, L = Lib, h = C.h;
  const lowName = (cs) => (cs[0].r === cs[1].r ? `Pair of ${L.RANK_STR[cs[0].r]}s` : `${L.RANK_STR[Math.max(cs[0].r, cs[1].r)]} high`);
  C.register({
    n: 11, id: 'paigow', name: 'Pai Gow Poker + Fortune', icon: '🀄', cat: 'cards', edge: '≈26% (Fortune)',
    blurb: 'Split 7 cards into a 5-card and 2-card hand. Fortune side bet.',
    rules: `<p>52-card deck, no joker. You and the dealer each get 7 cards and split them into a 5-card high hand and a 2-card low hand; the high hand must outrank the low hand. Win both hands to win (paid 1:1 less 5% commission), lose both to lose, otherwise push. The dealer wins all exact ties ("copies") and sets by house way. Main game edge ≈2.7–3.3%.</p>
      <p><b>Fortune side bet</b> pays on the best 5-card hand in your 7 cards regardless of the dealer: ${L.PG_FORTUNE.map(([c, p]) => L.HAND_NAMES[c] + ' ' + p + ':1').join(', ')}.</p>`,
    edges: [['Main bet', '0.95:1', '≈3%'], ...L.PG_FORTUNE.map(([c, p]) => ['Fortune: ' + L.HAND_NAMES[c], p + ':1', '']), ['Fortune overall', '', '≈26.6%']],
    round: 'paigow',
    mount(root) {
      const bet = C.betInput({ value: 10, label: 'Main bet' });
      const fb = C.betInput({ value: 5, label: 'Fortune side bet' });
      const msg = C.msg();
      const dEl = h('div', { class: 'pg-split' }), pEl = h('div', { class: 'pg-player' });
      const info = h('div', { class: 'hand-label' });
      let st = null, busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const hwBtn = h('button', { class: 'btn ghost', onclick: () => { if (st) { const hw = L.pgHouseWay(st.p); st.low = new Set(hw.low.map((c) => st.p.indexOf(c))); render(); } } }, 'House Way');
      const playBtn = h('button', { class: 'btn green big', onclick: () => play() }, 'PLAY HAND');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, fb.el, h('div', { class: 'muted', style: 'font-size:12px' }, 'Tap two cards to place them in your low (2-card) hand, or press House Way.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, h('div', { class: 'hand-label' }, 'DEALER'), dEl, h('div', { style: 'height:16px' }), h('div', { class: 'hand-label' }, 'YOU'), pEl, info),
          msg.el, h('div', { class: 'controls' }, dealBtn, hwBtn, playBtn))));
      ui(false);
      function ui(setting) { dealBtn.style.display = setting ? 'none' : ''; hwBtn.style.display = playBtn.style.display = setting ? '' : 'none'; bet.disable(setting); fb.disable(setting); }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('paigow', 'start', { bet: bet.value, fortune: fb.value }));
        busy = false; if (!r) return;
        st = { p: r.view.cards, low: new Set() };
        dEl.innerHTML = ''; for (let i = 0; i < 7; i++) dEl.appendChild(C.cardEl(null, { hidden: true }));
        msg.set('Set your hand'); ui(true); render();
      }
      const split = () => ({ low: [...st.low].map((i) => st.p[i]), high: st.p.filter((_, i) => !st.low.has(i)) });
      function render() {
        pEl.innerHTML = '';
        const { low, high } = split();
        const mk = (c) => { const i = st.p.indexOf(c); const e = C.cardEl(c, { cls: 'clickable' + (st.low.has(i) ? ' sel' : '') }); e.onclick = () => toggle(i); return e; };
        pEl.append(h('div', null, h('div', { class: 'muted center' }, 'High hand (5)'), h('div', { class: 'cards' }, high.map(mk))),
          h('div', null, h('div', { class: 'muted center' }, 'Low hand (2)'), h('div', { class: 'cards' }, low.map(mk))));
        if (low.length === 2) {
          const ok = L.pgValid(high, low);
          info.innerHTML = `High: <span class="tag">${L.handName(L.eval5(high))}</span> Low: <span class="tag">${lowName(low)}</span> ${ok ? '' : '<span class="tag" style="color:#ff8fa3">FOUL: high must beat low</span>'}`;
        } else info.textContent = `Select ${2 - low.length} more card${low.length === 1 ? '' : 's'} for the low hand`;
      }
      function toggle(i) { if (!st || busy) return; if (st.low.has(i)) st.low.delete(i); else if (st.low.size < 2) st.low.add(i); else return; render(); }
      async function play() {
        if (!st || busy) return;
        const { low, high } = split();
        if (low.length !== 2) return C.toast('Pick exactly 2 cards for the low hand', 'err');
        if (!L.pgValid(high, low)) return C.toast('Foul: your 5-card hand must beat the 2-card hand', 'err');
        busy = true;
        const r = await C.try(() => C.play('paigow', 'play', { low: [...st.low] }));
        busy = false; if (!r) return;
        st = null; ui(false);
        const v = r.view;
        dEl.innerHTML = '';
        dEl.append(h('div', null, h('div', { class: 'muted center' }, 'High: ' + v.dealerHighName), h('div', { class: 'cards' }, v.dealer.high.map((c) => C.cardEl(c)))),
          h('div', null, h('div', { class: 'muted center' }, 'Low: ' + lowName(v.dealer.low)), h('div', { class: 'cards' }, v.dealer.low.map((c) => C.cardEl(c)))));
        C.settle(r);
        const net = C.net(r);
        msg.set(v.notes.join(' • ') + ` (${C.netMsg(net)})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.pg-split,.pg-player{display:flex;gap:30px;justify-content:center;flex-wrap:wrap;min-height:110px}`;
  document.head.appendChild(css);
})();
