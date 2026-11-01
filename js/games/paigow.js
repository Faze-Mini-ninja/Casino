(function () {
  const C = Casino, L = Lib, h = C.h;
  const lowName = (cs) => (cs[0].r === cs[1].r ? `Pair of ${L.RANK_STR[cs[0].r]}s` : `${L.RANK_STR[Math.max(cs[0].r, cs[1].r)]} high`);
  C.register({
    n: 11, id: 'paigow', name: 'Pai Gow Poker + Fortune', icon: '🀄', cat: 'cards', edge: '≈26% (Fortune)',
    blurb: 'Split 7 cards into a 5-card and 2-card hand. Fortune side bet.',
    rules: `<p>52-card deck, no joker. You and the dealer each get 7 cards and split them into a 5-card high hand and a 2-card low hand; the high hand must outrank the low hand. Win both hands to win (paid 1:1 less 5% commission), lose both to lose, otherwise push. The dealer wins all exact ties ("copies") and sets by house way. Main game edge ≈2.7–3.3%.</p>
      <p><b>Fortune side bet</b> pays on the best 5-card hand in your 7 cards regardless of the dealer: ${L.PG_FORTUNE.map(([c, p]) => L.HAND_NAMES[c] + ' ' + p + ':1').join(', ')}.</p>`,
    edges: [['Main bet', '0.95:1', '≈3%'], ...L.PG_FORTUNE.map(([c, p]) => ['Fortune: ' + L.HAND_NAMES[c], p + ':1', '']), ['Fortune overall', '', '≈26.6%']],
    mount(root) {
      const bet = C.betInput({ value: 10, label: 'Main bet' });
      const fb = C.betInput({ value: 5, label: 'Fortune side bet' });
      const msg = C.msg();
      const dEl = h('div', { class: 'pg-split' }), pEl = h('div', { class: 'pg-player' });
      const info = h('div', { class: 'hand-label' });
      let st = null;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const hwBtn = h('button', { class: 'btn ghost', onclick: () => { if (st && st.phase === 'set') { const hw = L.pgHouseWay(st.p); st.low = new Set(hw.low); render(); } } }, 'House Way');
      const playBtn = h('button', { class: 'btn green big', onclick: () => play() }, 'PLAY HAND');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, fb.el, h('div', { class: 'muted', style: 'font-size:12px' }, 'Click two cards to place them in your low (2-card) hand.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt' }, h('div', { class: 'hand-label' }, 'DEALER'), dEl, h('div', { style: 'height:16px' }), h('div', { class: 'hand-label' }, 'YOU'), pEl, info),
          msg.el, h('div', { class: 'controls' }, dealBtn, hwBtn, playBtn))));
      ui('idle');
      function ui(phase) { dealBtn.style.display = phase === 'set' ? 'none' : ''; hwBtn.style.display = playBtn.style.display = phase === 'set' ? '' : 'none'; bet.disable(phase === 'set'); fb.disable(phase === 'set'); }
      function deal() {
        const b = bet.value, f = fb.value;
        if (!(b > 0)) return C.toast('Main bet required', 'err');
        if (!C.bet('paigow', b + f)) return;
        const d = L.shuffle(L.newDeck(1));
        st = { b, f, p: d.slice(0, 7).sort((x, y) => y.r - x.r), d: d.slice(7, 14), low: new Set(), phase: 'set', paid: 0 };
        dEl.innerHTML = ''; for (let i = 0; i < 7; i++) dEl.appendChild(C.cardEl(null, { hidden: true }));
        msg.set('Set your hand');
        ui('set'); render();
      }
      function split() { const low = st.p.filter((c) => st.low.has(c)), high = st.p.filter((c) => !st.low.has(c)); return { low, high }; }
      function render() {
        pEl.innerHTML = '';
        const { low, high } = split();
        const mk = (c) => { const e = C.cardEl(c, { cls: 'clickable' + (st.low.has(c) ? ' sel' : '') }); e.onclick = () => toggle(c); return e; };
        pEl.append(h('div', null, h('div', { class: 'muted center' }, 'High hand (5)'), h('div', { class: 'cards' }, high.map(mk))),
          h('div', null, h('div', { class: 'muted center' }, 'Low hand (2)'), h('div', { class: 'cards' }, low.map(mk))));
        if (low.length === 2) {
          const ok = L.pgValid(high, low);
          info.innerHTML = `High: <span class="tag">${L.handName(L.eval5(high))}</span> Low: <span class="tag">${lowName(low)}</span> ${ok ? '' : '<span class="tag" style="color:#ff8fa3">FOUL — high must beat low</span>'}`;
        } else info.textContent = `Select ${2 - low.length} more card${low.length === 1 ? '' : 's'} for the low hand`;
      }
      function toggle(c) {
        if (!st || st.phase !== 'set') return;
        if (st.low.has(c)) st.low.delete(c); else if (st.low.size < 2) st.low.add(c); else return;
        render();
      }
      async function play() {
        const { low, high } = split();
        if (low.length !== 2) return C.toast('Pick exactly 2 cards for the low hand', 'err');
        if (!L.pgValid(high, low)) return C.toast('Foul: your 5-card hand must beat the 2-card hand', 'err');
        st.phase = 'done'; ui('idle');
        const dw = L.pgHouseWay(st.d);
        dEl.innerHTML = '';
        dEl.append(h('div', null, h('div', { class: 'muted center' }, 'High: ' + L.handName(L.eval5(dw.high))), h('div', { class: 'cards' }, dw.high.map((c) => C.cardEl(c)))),
          h('div', null, h('div', { class: 'muted center' }, 'Low: ' + lowName(dw.low)), h('div', { class: 'cards' }, dw.low.map((c) => C.cardEl(c)))));
        const res = L.pgCompare({ high, low }, dw);
        let pay = res === 1 ? st.b * 1.95 : res === 0 ? st.b : 0;
        const notes = [res === 1 ? 'You win both hands' : res === 0 ? 'Push (split)' : 'Dealer wins'];
        if (st.f > 0) { const fr = L.pgFortune(st.p); if (fr.pays > 0) { pay += st.f * (fr.pays + 1); notes.push(`Fortune: ${fr.name} ${fr.pays}:1`); } else notes.push('Fortune loses'); }
        pay = C.win('paigow', pay);
        C.record('paigow', st.b + st.f, pay, notes.join('; '));
        const net = pay - st.b - st.f;
        msg.set(notes.join(' • ') + ` (${net >= 0 ? '+' : '−'}${C.fmt(Math.abs(net))})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.pg-split,.pg-player{display:flex;gap:30px;justify-content:center;flex-wrap:wrap;min-height:110px}`;
  document.head.appendChild(css);
})();
