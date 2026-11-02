/* Poker games: Casino Hold'em and Poker Dice. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const css = (t) => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); };

  /* ---------------- Casino Hold'em ---------------- */
  const CHE_NAMES = { 9: 'Royal flush', 8: 'Straight flush', 7: 'Four of a kind', 6: 'Full house', 5: 'Flush' };
  C.register({
    n: 48, id: 'casinoholdem', name: "Casino Hold'em", icon: '♠', cat: 'cards', edge: '≈2.2%',
    blurb: 'Heads-up Texas Hold’em against the dealer. See the flop, then call or fold.',
    rules: '<p>Place an ante. You and the dealer each get two cards and the flop is dealt. Fold (lose the ante) or Call for 2× the ante. The turn and river follow and the best five-card hands are compared. The dealer qualifies with a pair of 4s or better. If the dealer does not qualify, the ante pays by the table below and the call pushes. If you beat a qualifying dealer, the ante pays by the table and the call pays 1:1. Ties push.</p>',
    edges: [...Object.entries(L.CHE_ANTE).map(([c, p]) => ['Ante: ' + CHE_NAMES[c], p + ':1', '']), ['Ante: Straight or lower', '1:1', ''], ['Overall (basic strategy, per ante)', '', '≈2.2%']],
    round: 'casinoholdem',
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Ante' });
      const msg = C.msg();
      const dEl = h('div', { class: 'cards' }), bEl = h('div', { class: 'cards board' }), pEl = h('div', { class: 'cards' });
      const dLbl = h('div', { class: 'hand-label' }, 'DEALER'), pLbl = h('div', { class: 'hand-label' }, 'YOU');
      let busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const callBtn = h('button', { class: 'btn green big', onclick: () => resolve('call') }, 'CALL 2×');
      const foldBtn = h('button', { class: 'btn red big', onclick: () => resolve('fold') }, 'FOLD');
      const pt = h('div', { class: 'pays-list' }, Object.entries(L.CHE_ANTE).reverse().map(([c, p]) => h('div', { 'data-c': c }, h('span', null, CHE_NAMES[c]), h('b', null, p + ':1'))),
        h('div', null, h('span', null, 'Straight or lower'), h('b', null, '1:1')));
      const blank = () => { dEl.innerHTML = ''; bEl.innerHTML = ''; pEl.innerHTML = ''; [0, 1].forEach(() => { dEl.append(C.cardEl(null, { hidden: true })); pEl.append(C.cardEl(null, { hidden: true })); }); [0, 1, 2, 3, 4].forEach(() => bEl.append(h('div', { class: 'card slot' }))); };
      blank();
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, ante.el, h('h3', null, 'Ante pays'), pt, h('div', { class: 'muted', style: 'font-size:12px' }, 'Tip: call with any pair, any draw, or two cards 8 or higher. Folding too often costs more than calling.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt che' }, dLbl, dEl, h('div', { class: 'hand-label', style: 'margin-top:14px' }, 'BOARD'), bEl, h('div', { style: 'height:14px' }), pEl, pLbl), msg.el, h('div', { class: 'controls' }, dealBtn, callBtn, foldBtn))));
      ui(false);
      function ui(d) { dealBtn.style.display = d ? 'none' : ''; callBtn.style.display = foldBtn.style.display = d ? '' : 'none'; ante.disable(d); }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('casinoholdem', 'start', { ante: ante.value }));
        if (!r) { busy = false; return; }
        const v = r.view; blank(); dLbl.textContent = 'DEALER'; pLbl.textContent = 'YOU'; msg.set(' ');
        pt.querySelectorAll('div').forEach((x) => x.classList.remove('hit'));
        for (let i = 0; i < 2; i++) { await C.sleep(160); pEl.children[i].replaceWith(C.cardEl(v.P[i], { cls: 'deal' })); C.sfx && C.sfx('card'); }
        for (let i = 0; i < 3; i++) { await C.sleep(160); bEl.children[i].replaceWith(C.cardEl(v.flop[i], { cls: 'deal' })); C.sfx && C.sfx('card'); }
        pLbl.innerHTML = `YOU <span class="tag">${v.pName}</span>`;
        busy = false; ui(true); msg.set('Call 2× the ante or fold?');
      }
      async function resolve(a) {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('casinoholdem', a, {}));
        if (!r) { busy = false; return; }
        ui(false);
        const v = r.view;
        for (let i = 3; i < 5; i++) { await C.sleep(220); bEl.children[i].replaceWith(C.cardEl(v.B[i], { cls: 'deal' })); C.sfx && C.sfx('card'); }
        await C.sleep(250);
        dEl.innerHTML = ''; v.D.forEach((c) => dEl.appendChild(C.cardEl(c, { cls: 'deal' })));
        dLbl.innerHTML = `DEALER <span class="tag">${v.dName}${v.qual ? '' : ': does not qualify'}</span>`;
        pLbl.innerHTML = `YOU <span class="tag">${v.pName}</span>`;
        const cat = Object.entries(CHE_NAMES).find(([, n]) => n === v.pName);
        if (cat && r.payout > 0) { const row = pt.querySelector(`[data-c="${cat[0]}"]`); if (row) row.classList.add('hit'); }
        C.settle(r);
        const net = C.net(r);
        msg.set(`${v.note} (${C.netMsg(net)})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
        busy = false;
      }
    },
  });
  css(`.che .cards{justify-content:center}.che .board .card.slot{background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.18);box-shadow:none}
  .card.deal{animation:dealin .22s ease-out}@keyframes dealin{from{transform:translateY(-14px) scale(.92);opacity:0}}`);

  /* ---------------- Poker Dice ---------------- */
  C.register({
    n: 49, id: 'pokerdice', name: 'Poker Dice', icon: '⚄', cat: 'cards', edge: '11.27%',
    blurb: 'Five dice, one roll. Make a poker hand.',
    rules: '<p>Five dice are rolled once. Your payout depends on the best poker hand they make: five of a kind, four of a kind, full house, straight (1-2-3-4-5 or 2-3-4-5-6), three of a kind or two pair. Anything less loses.</p>',
    edges: [...L.POKERDICE.map(([n, m]) => [n, m + '× total', '']), ['Overall', '', '11.27%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const msg = C.msg(), hist = h('div', { class: 'history-strip' });
      const dice = h('div', { class: 'dice-row pd' }, [6, 6, 5, 5, 1].map((v) => C.dieEl(v)));
      const pt = h('div', { class: 'pays-list' }, L.POKERDICE.map(([n, m], i) => h('div', { 'data-k': i }, h('span', null, n), h('b', null, m + '×'))));
      let busy = false;
      const btn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('h3', null, 'Pays (total return)'), pt),
        h('div', { class: 'stage' }, h('div', { class: 'felt pd-felt' }, dice), msg.el, h('div', { class: 'controls' }, btn), hist)));
      async function roll() {
        if (busy) return; busy = true; btn.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('pokerdice', null, { bet: bet.value }));
        if (!r) { busy = false; btn.disabled = false; bet.disable(false); return; }
        pt.querySelectorAll('div').forEach((x) => x.classList.remove('hit'));
        await C.rollDice(dice, r.result.dice);
        const k = r.result.hand;
        if (k >= 0) { pt.querySelector(`[data-k="${k}"]`).classList.add('hit'); const c = {}; r.result.dice.forEach((x) => (c[x] = (c[x] || 0) + 1)); [...dice.children].forEach((d, i) => d.classList.toggle('lit', k === 3 || c[r.result.dice[i]] > 1)); }
        C.settle(r);
        hist.prepend(h('span', { class: 'pill' + (r.payout > r.wager ? ' g' : '') }, k >= 0 ? L.POKERDICE[k][0] : '—')); while (hist.children.length > 8) hist.lastChild.remove();
        msg.set(k >= 0 ? `${L.POKERDICE[k][0]}: ${r.payout > r.wager ? 'pays ' + C.fmt(r.payout) : r.payout ? 'returns ' + C.fmt(r.payout) : ''}` : 'No hand', r.payout > r.wager ? 'win' : 'lose');
        busy = false; btn.disabled = false; bet.disable(false);
      }
    },
  });
  css('.pd-felt{display:flex;justify-content:center;padding:40px 10px}.pd .die{width:62px;height:62px}.die.lit{box-shadow:0 0 0 3px var(--accent,#22e58b),0 6px 14px rgba(0,0,0,.45)}@media(max-width:600px){.pd .die{width:50px;height:50px}}');
})();
