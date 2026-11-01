(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 3, id: 'blackjack', name: 'Blackjack + Side Bets', icon: '🃏', cat: 'cards', edge: '17–21% (sides)',
    blurb: '6-deck blackjack with Perfect Pairs and 21+3 side bets.',
    rules: `<p>6 decks, dealer stands on all 17s, dealer peeks for blackjack. Blackjack pays 3:2. Double on any first two cards, split once (split aces get one card), double after split allowed. No insurance or surrender.
      The main game edge is ≈0.5% with basic strategy — the house makes its money on the side bets:</p>
      <p><b>Perfect Pairs</b> — your first two cards: Perfect pair (same suit) ${L.PERFECT_PAIRS.perfect}:1, Colored pair ${L.PERFECT_PAIRS.colored}:1, Mixed pair ${L.PERFECT_PAIRS.mixed}:1.<br>
      <b>21+3</b> — your two cards + dealer up-card as a 3-card poker hand: Suited trips ${L.P21_3.suitedTrips}:1, Straight flush ${L.P21_3.straightFlush}:1, Three of a kind ${L.P21_3.trips}:1, Straight ${L.P21_3.straight}:1, Flush ${L.P21_3.flush}:1.</p>`,
    edges: [['Main bet (basic strategy)', '1:1, BJ 3:2', '≈0.5%'], ['Perfect Pairs', '20/10/5 : 1', '≈21%'], ['21+3', '100/40/25/9/4 : 1', '≈17%']],
    round: 'blackjack',
    mount(root) {
      const main = C.betInput({ value: 10, label: 'Main bet' });
      const pp = C.betInput({ value: 0, label: 'Perfect Pairs' });
      const t3 = C.betInput({ value: 0, label: '21+3' });
      const msg = C.msg();
      const dealerEl = h('div', { class: 'cards' }), dealerLbl = h('div', { class: 'hand-label' }, 'Dealer');
      const handsEl = h('div', { class: 'bj-hands' });
      const sideEl = h('div', { class: 'muted center' });
      const btn = (t, cls, f) => h('button', { class: 'btn ' + cls, onclick: f }, t);
      const dealBtn = btn('DEAL', 'big', () => deal());
      const hitB = btn('Hit', 'green', () => act('hit')), standB = btn('Stand', 'red', () => act('stand')),
        dblB = btn('Double', 'blue', () => act('double')), splitB = btn('Split', 'ghost', () => act('split'));
      const actions = h('div', { class: 'controls' }, hitB, standB, dblB, splitB);
      let busy = false, alive = true;
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, main.el, pp.el, t3.el, h('div', { class: 'muted', style: 'font-size:12px' }, 'Set a side bet to 0 to skip it. Every hand is dealt from a freshly shuffled 6-deck shoe.')),
        h('div', { class: 'stage' },
          h('div', { class: 'felt' }, dealerLbl, dealerEl, h('div', { style: 'height:20px' }), handsEl, sideEl),
          msg.el, h('div', { class: 'controls' }, dealBtn), actions)));
      showActions(false);
      function showActions(on) { actions.style.display = on ? '' : 'none'; dealBtn.style.display = on ? 'none' : ''; [main, pp, t3].forEach((b) => b.disable(on)); }
      function render(v) {
        dealerEl.innerHTML = '';
        v.dealer.forEach((c) => dealerEl.appendChild(C.cardEl(c, { hidden: !c })));
        dealerLbl.innerHTML = `Dealer <span class="tag">${v.dealerTotal}</span>`;
        handsEl.innerHTML = '';
        v.hands.forEach((hd, i) => handsEl.appendChild(h('div', { class: 'bj-hand' + (i === v.cur && !v.over ? ' active' : '') },
          h('div', { class: 'cards' }, hd.cards.map((c) => C.cardEl(c))),
          h('div', { class: 'hand-label' }, `Hand ${v.hands.length > 1 ? i + 1 : ''}`, h('span', { class: 'tag' }, (hd.soft && hd.total < 21 ? 'soft ' : '') + hd.total), h('span', { class: 'tag' }, 'Bet ' + C.fmt(hd.bet / 100)), hd.result ? h('span', { class: 'tag' }, hd.result) : null))));
        sideEl.textContent = (v.sideNotes || []).join(' • ');
        dblB.disabled = !v.canDouble; splitB.disabled = !v.canSplit;
      }
      async function finish(r) {
        render(r.view); showActions(false);
        C.settle(r);
        const net = C.net(r);
        msg.set(net > 0 ? `You win ${C.fmt(net)}` : net === 0 ? 'Push — even' : `You lose ${C.fmt(-net)}`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('blackjack', 'start', { bet: main.value, pp: pp.value, t3: t3.value }));
        busy = false; if (!r || !alive) return;
        msg.set(' ');
        if (r.done) { const v = r.view; render({ ...v, dealer: [v.dealer[0], null], dealerTotal: '?' }); await C.sleep(600); return finish(r); }
        render(r.view); showActions(true);
      }
      async function act(a) {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('blackjack', a, {}));
        busy = false; if (!r || !alive) return;
        if (r.done) { // reveal dealer cards one at a time
          const v = r.view, cards = v.dealer;
          for (let n = 2; n <= cards.length; n++) { render({ ...v, dealer: cards.slice(0, n), dealerTotal: L.bjValue(cards.slice(0, n)).total, hands: v.hands.map((x) => ({ ...x, result: '' })) }); showActions(false); await C.sleep(500); if (!alive) return; }
          return finish(r);
        }
        render(r.view);
      }
      return () => { alive = false; };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.bj-hands{display:flex;gap:24px;justify-content:center;flex-wrap:wrap}.bj-hand{padding:8px;border-radius:12px;border:2px solid transparent}.bj-hand.active{border-color:var(--gold);background:rgba(0,0,0,.15)}`;
  document.head.appendChild(css);
})();
