(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.hilo;
  const newCard = () => { const rank = L.range(1, 13); return { rank, r: rank === 1 ? 14 : rank, s: L.int(4) }; };
  C.register({
    n: 25, id: 'hilo', name: 'Hi-Lo', icon: '⬆️', cat: 'originals', edge: (E * 100) + '% per guess',
    blurb: 'Guess if the next card is higher or lower. Build a streak.',
    rules: `<p>Cards are drawn with replacement (Ace low, King high). Guess "Higher or Same" or "Lower or Same". Each correct guess multiplies your stake by ${(1 - E).toFixed(2)} ÷ probability. A wrong guess loses everything; cash out any time after one correct guess. You may skip a card for free. Because the ${(E * 100).toFixed(0)}% edge applies per guess, long streaks compound it (3 guesses ≈ ${((1 - Math.pow(1 - E, 3)) * 100).toFixed(1)}%).</p>`,
    edges: [['Each guess', `${(1 - E).toFixed(2)} ÷ probability`, (E * 100).toFixed(2) + '%'], ['3-guess streak', '', ((1 - Math.pow(1 - E, 3)) * 100).toFixed(2) + '%']],
    round: 'hilo',
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const msg = C.msg();
      let card = { rank: 7, r: 7, s: 0 }, st = null, busy = false;
      const cardWrap = h('div', { class: 'cards hilo-card' });
      const trail = h('div', { class: 'cards hilo-trail' });
      const multEl = h('div', { class: 'stat-line' });
      const hiBtn = h('button', { class: 'btn green big', onclick: () => go('hi') });
      const loBtn = h('button', { class: 'btn red big', onclick: () => go('lo') });
      const skipBtn = h('button', { class: 'btn ghost', onclick: () => go('skip') }, 'Skip card');
      const mainBtn = h('button', { class: 'btn big', onclick: () => (st ? go('cashout') : start()) }, 'BET');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, multEl, h('div', { class: 'muted small' }, 'The first card is dealt when you bet. Skipping is free.')),
        h('div', { class: 'stage' }, cardWrap, h('div', { class: 'controls' }, loBtn, hiBtn), skipBtn, msg.el, mainBtn, trail)));
      function paint() {
        cardWrap.innerHTML = ''; cardWrap.appendChild(C.cardEl(st || card.s != null ? card : null, { hidden: !st && !trail.children.length }));
        const ph = L.hiloProb(card.rank, 'hi'), pl = L.hiloProb(card.rank, 'lo');
        hiBtn.innerHTML = `▲ ${card.rank === 13 ? 'Same' : 'Higher or Same'}<br><small>${C.odds() ? (ph * 100).toFixed(1) + '% • ' : ''}${L.hiloStep(card.rank, 'hi').toFixed(2)}×</small>`;
        loBtn.innerHTML = `▼ ${card.rank === 1 ? 'Same' : 'Lower or Same'}<br><small>${C.odds() ? (pl * 100).toFixed(1) + '% • ' : ''}${L.hiloStep(card.rank, 'lo').toFixed(2)}×</small>`;
        hiBtn.disabled = !st || ph >= 1; loBtn.disabled = !st || pl >= 1; skipBtn.disabled = !st;
        multEl.innerHTML = `Multiplier <b>${st ? st.mult.toFixed(2) + '×' : '—'}</b>${st && st.n ? ` &nbsp; Cash-out <b>${C.fmt(st.b * st.mult)}</b>` : ''}`;
        mainBtn.disabled = !!st && !st.n;
      }
      paint();
      async function start() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('hilo', 'start', { bet: bet.value }));
        busy = false; if (!r) return;
        st = { b: bet.value, mult: 1, n: 0 }; card = r.view.card;
        trail.innerHTML = ''; trail.appendChild(C.cardEl(card, { cls: 'dim' }));
        bet.disable(true); mainBtn.textContent = 'CASH OUT'; mainBtn.className = 'btn big gold';
        msg.set('Higher or lower?'); paint();
      }
      async function go(a) {
        if (!st || busy) return; busy = true;
        const r = await C.try(() => C.play('hilo', a, {}));
        busy = false; if (!r) return;
        if (a === 'cashout') { C.settle(r); msg.set(`Cashed out ${r.view.mult.toFixed(2)}× — ${C.fmt(r.payout)}`, 'win'); return end(); }
        card = r.view.card; trail.appendChild(C.cardEl(card, { cls: 'dim' }));
        if (a === 'skip') return paint();
        if (r.done) { C.settle(r); msg.set(`Wrong — lost ${C.fmt(st.b)}`, 'lose'); return end(); }
        st.mult = r.view.mult; st.n = r.view.n; msg.set(`Correct! ${st.mult.toFixed(2)}×`, 'win'); paint();
      }
      function end() { st = null; bet.disable(false); mainBtn.textContent = 'BET'; mainBtn.className = 'btn big'; paint(); }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.hilo-card .card{width:120px;height:170px}.hilo-card .card .cbig{font-size:64px}.hilo-card .card .cr{font-size:26px}.hilo-card .card .cs{top:34px;font-size:22px}
  .hilo-trail .card{width:42px;height:60px}.hilo-trail .card .cbig{display:none}.hilo-trail .card .cr{font-size:13px}.hilo-trail .card .cs{top:18px;font-size:12px}`;
  document.head.appendChild(css);
})();
