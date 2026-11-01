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
    mount(root) {
      const shoe = new L.Shoe(6, 0.75);
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
      let st = null; // round state
      let alive = true;
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, main.el, pp.el, t3.el, h('div', { class: 'muted', style: 'font-size:12px' }, 'Set a side bet to 0 to skip it.'), h('div', { class: 'stat-line' }, 'Cards left in shoe', h('b', { id: 'bj-left' }, ''))),
        h('div', { class: 'stage' },
          h('div', { class: 'felt' }, dealerLbl, dealerEl, h('div', { style: 'height:20px' }), handsEl, sideEl),
          msg.el, h('div', { class: 'controls' }, dealBtn), actions)));
      const leftEl = root.querySelector('#bj-left');
      showActions(false);
      updLeft();
      function updLeft() { leftEl.textContent = shoe.left; }
      function showActions(on) { actions.style.display = on ? '' : 'none'; dealBtn.style.display = on ? 'none' : ''; [main, pp, t3].forEach((b) => b.disable(on)); }
      function render(revealHole) {
        dealerEl.innerHTML = '';
        st.dealer.forEach((c, i) => dealerEl.appendChild(C.cardEl(c, { hidden: i === 1 && !revealHole })));
        const dv = revealHole ? L.bjValue(st.dealer).total : L.bjValue([st.dealer[0]]).total;
        dealerLbl.innerHTML = `Dealer <span class="tag">${dv}</span>`;
        handsEl.innerHTML = '';
        st.hands.forEach((hd, i) => {
          const v = L.bjValue(hd.cards);
          handsEl.appendChild(h('div', { class: 'bj-hand' + (i === st.cur && !st.over ? ' active' : '') },
            h('div', { class: 'cards' }, hd.cards.map((c) => C.cardEl(c))),
            h('div', { class: 'hand-label' }, `Hand ${st.hands.length > 1 ? i + 1 : ''}`, h('span', { class: 'tag' }, (v.soft && v.total < 21 ? 'soft ' : '') + v.total), h('span', { class: 'tag' }, 'Bet ' + C.fmt(hd.bet)), hd.result ? h('span', { class: 'tag' }, hd.result) : null)));
        });
        updLeft();
      }
      async function deal() {
        const b = main.value, pb = pp.value, tb = t3.value;
        if (!(b > 0)) return C.toast('Main bet required', 'err');
        if (b + pb + tb > C.balance()) return C.toast('Insufficient balance', 'err');
        if (!C.bet('blackjack', b + pb + tb)) return;
        if (shoe.checkShuffle()) C.toast('Shuffling a fresh 6-deck shoe');
        st = { dealer: [], hands: [{ cards: [], bet: b }], cur: 0, over: false, wager: b + pb + tb, paid: 0, notes: [] };
        msg.set(' '); sideEl.textContent = '';
        const P = st.hands[0].cards;
        P.push(shoe.draw()); st.dealer.push(shoe.draw()); P.push(shoe.draw()); st.dealer.push(shoe.draw());
        render(false);
        // side bets
        const sides = [];
        if (pb > 0) { const r = L.perfectPairs(P[0], P[1]); if (r.pays > 0) { st.paid += C.win('blackjack', pb * (r.pays + 1)); sides.push(`Perfect Pairs: ${r.name} (${r.pays}:1)`); } else sides.push('Perfect Pairs: lose'); }
        if (tb > 0) { const r = L.twentyOnePlus3([P[0], P[1], st.dealer[0]]); if (r.pays > 0) { st.paid += C.win('blackjack', tb * (r.pays + 1)); sides.push(`21+3: ${r.name} (${r.pays}:1)`); } else sides.push('21+3: lose'); }
        sideEl.textContent = sides.join(' • ');
        const dBJ = L.isBJ(st.dealer), pBJ = L.isBJ(P);
        const up = st.dealer[0].r;
        if ((up === 14 || (up >= 10 && up <= 13)) && dBJ) { await C.sleep(400); return finish(pBJ ? 'push' : 'Dealer blackjack'); }
        if (pBJ) { await C.sleep(300); return finish('bj'); }
        showActions(true); updButtons();
      }
      function updButtons() {
        const hd = st.hands[st.cur];
        const two = hd.cards.length === 2;
        dblB.disabled = !two || C.balance() < hd.bet || hd.splitAces;
        splitB.disabled = !(two && st.hands.length === 1 && hd.cards[0].r === hd.cards[1].r) || C.balance() < hd.bet;
        // treat 10-value cards as splittable only if same rank (standard casino rule variant)
      }
      async function act(a) {
        if (!st || st.over) return;
        const hd = st.hands[st.cur];
        if (a === 'hit') {
          hd.cards.push(shoe.draw()); render(false);
          const v = L.bjValue(hd.cards).total;
          if (v > 21) { hd.result = 'Bust'; return next(); }
          if (v === 21) return next();
          updButtons();
        } else if (a === 'stand') next();
        else if (a === 'double') {
          if (!C.bet('blackjack', hd.bet)) return;
          st.wager += hd.bet; hd.bet *= 2; hd.cards.push(shoe.draw()); render(false);
          if (L.bjValue(hd.cards).total > 21) hd.result = 'Bust';
          next();
        } else if (a === 'split') {
          if (!C.bet('blackjack', hd.bet)) return;
          st.wager += hd.bet;
          const c2 = hd.cards.pop();
          const nh = { cards: [c2], bet: hd.bet };
          const aces = c2.r === 14;
          hd.cards.push(shoe.draw()); nh.cards.push(shoe.draw());
          st.hands.push(nh);
          if (aces) { hd.splitAces = nh.splitAces = true; render(false); st.cur = 1; return next(); }
          render(false); updButtons();
          if (L.bjValue(hd.cards).total === 21) next();
        }
      }
      function next() {
        st.cur++;
        if (st.cur >= st.hands.length) return dealerPlay();
        render(false); updButtons();
        if (L.bjValue(st.hands[st.cur].cards).total === 21) next();
      }
      async function dealerPlay() {
        showActions(false); dealBtn.disabled = true;
        st.cur = st.hands.length;
        render(true);
        const live = st.hands.some((hd) => L.bjValue(hd.cards).total <= 21);
        while (live && L.bjValue(st.dealer).total < 17) {
          await C.sleep(550); if (!alive) return;
          st.dealer.push(shoe.draw()); render(true);
        }
        await C.sleep(250);
        finish();
      }
      function finish(special) {
        st.over = true; showActions(false); dealBtn.disabled = false;
        const dv = L.bjValue(st.dealer).total;
        let mainPay = 0;
        if (special === 'bj') { mainPay = st.hands[0].bet * 2.5; st.hands[0].result = 'Blackjack! 3:2'; }
        else if (special === 'push') { mainPay = st.hands[0].bet; st.hands[0].result = 'Push (both BJ)'; }
        else if (special) { st.hands[0].result = special; }
        else st.hands.forEach((hd) => {
          const v = L.bjValue(hd.cards).total;
          if (v > 21) hd.result = 'Bust';
          else if (dv > 21 || v > dv) { hd.result = 'Win'; mainPay += hd.bet * 2; }
          else if (v === dv) { hd.result = 'Push'; mainPay += hd.bet; }
          else hd.result = 'Lose';
        });
        st.paid += C.win('blackjack', mainPay);
        render(true);
        const net = st.paid - st.wager;
        msg.set(net > 0 ? `You win ${C.fmt(net)}` : net === 0 ? 'Push — even' : `You lose ${C.fmt(-net)}`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
        C.record('blackjack', st.wager, st.paid, st.hands.map((x) => x.result).join(', ') + ` vs dealer ${dv}`);
      }
      return () => { alive = false; };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.bj-hands{display:flex;gap:24px;justify-content:center;flex-wrap:wrap}.bj-hand{padding:8px;border-radius:12px;border:2px solid transparent}.bj-hand.active{border-color:var(--gold);background:rgba(0,0,0,.15)}`;
  document.head.appendChild(css);
})();
