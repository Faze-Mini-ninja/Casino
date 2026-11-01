(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.hilo;
  const newCard = () => { const rank = L.range(1, 13); return { rank, r: rank === 1 ? 14 : rank, s: L.int(4) }; };
  C.register({
    n: 25, id: 'hilo', name: 'Hi-Lo', icon: '⬆️', cat: 'originals', edge: (E * 100) + '% per guess',
    blurb: 'Guess if the next card is higher or lower. Build a streak.',
    rules: `<p>Cards are drawn with replacement (Ace low, King high). Guess "Higher or Same" or "Lower or Same". Each correct guess multiplies your stake by ${(1 - E).toFixed(2)} ÷ probability. A wrong guess loses everything; cash out any time after one correct guess. You may skip a card for free. Because the ${(E * 100).toFixed(0)}% edge applies per guess, long streaks compound it (3 guesses ≈ ${((1 - Math.pow(1 - E, 3)) * 100).toFixed(1)}%).</p>`,
    edges: [['Each guess', `${(1 - E).toFixed(2)} ÷ probability`, (E * 100).toFixed(2) + '%'], ['3-guess streak', '', ((1 - Math.pow(1 - E, 3)) * 100).toFixed(2) + '%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const msg = C.msg();
      let card = newCard(), st = null;
      const cardWrap = h('div', { class: 'cards hilo-card' });
      const trail = h('div', { class: 'cards hilo-trail' });
      const multEl = h('div', { class: 'stat-line' });
      const hiBtn = h('button', { class: 'btn green big', onclick: () => guess('hi') });
      const loBtn = h('button', { class: 'btn red big', onclick: () => guess('lo') });
      const skipBtn = h('button', { class: 'btn ghost', onclick: () => skip() }, 'Skip card');
      const mainBtn = h('button', { class: 'btn big', onclick: () => (st ? cashOut() : start()) }, 'BET');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, multEl),
        h('div', { class: 'stage' }, cardWrap, h('div', { class: 'controls' }, loBtn, hiBtn), skipBtn, msg.el, mainBtn, trail)));
      function paint() {
        cardWrap.innerHTML = ''; cardWrap.appendChild(C.cardEl(card));
        const ph = L.hiloProb(card.rank, 'hi'), pl = L.hiloProb(card.rank, 'lo');
        hiBtn.innerHTML = `▲ ${card.rank === 13 ? 'Same' : 'Higher or Same'}<br><small>${(ph * 100).toFixed(1)}% • ${L.hiloStep(card.rank, 'hi').toFixed(2)}×</small>`;
        loBtn.innerHTML = `▼ ${card.rank === 1 ? 'Same' : 'Lower or Same'}<br><small>${(pl * 100).toFixed(1)}% • ${L.hiloStep(card.rank, 'lo').toFixed(2)}×</small>`;
        hiBtn.disabled = !st || ph >= 1; loBtn.disabled = !st || pl >= 1;
        multEl.innerHTML = `Multiplier <b>${st ? st.mult.toFixed(2) + '×' : '—'}</b>${st && st.n ? ` &nbsp; Cash-out <b>${C.fmt(st.b * st.mult)}</b>` : ''}`;
        mainBtn.disabled = !!st && !st.n;
      }
      paint();
      function start() {
        const b = bet.value;
        if (!C.bet('hilo', b)) return;
        st = { b, mult: 1, n: 0 };
        trail.innerHTML = ''; trail.appendChild(C.cardEl(card, { cls: 'dim' }));
        bet.disable(true); mainBtn.textContent = 'CASH OUT'; mainBtn.className = 'btn big gold';
        msg.set('Higher or lower?'); paint();
      }
      function skip() { card = newCard(); if (st) trail.appendChild(C.cardEl(card, { cls: 'dim' })); paint(); }
      function guess(dir) {
        if (!st) return;
        const prev = card.rank, step = L.hiloStep(prev, dir);
        card = newCard();
        trail.appendChild(C.cardEl(card, { cls: 'dim' }));
        const ok = dir === 'hi' ? card.rank >= prev : card.rank <= prev;
        if (ok) { st.mult = Math.floor(st.mult * step * 10000) / 10000; st.n++; msg.set(`Correct! ${st.mult.toFixed(2)}×`, 'win'); paint(); }
        else {
          msg.set(`Wrong — lost ${C.fmt(st.b)}`, 'lose');
          C.record('hilo', st.b, 0, `Lost after ${st.n} correct`);
          end();
        }
      }
      function cashOut() {
        if (!st || !st.n) return;
        const pay = C.win('hilo', st.b * st.mult);
        msg.set(`Cashed out ${st.mult.toFixed(2)}× — ${C.fmt(pay)}`, 'win');
        C.record('hilo', st.b, pay, `${st.n} correct, ${st.mult.toFixed(2)}×`);
        end();
      }
      function end() { st = null; bet.disable(false); mainBtn.textContent = 'BET'; mainBtn.className = 'btn big'; paint(); }
      return () => { if (st) { if (st.n) cashOut(); else { C.win('hilo', st.b); C.record('hilo', st.b, st.b, 'Refunded (no guesses)'); } } };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.hilo-card .card{width:120px;height:170px}.hilo-card .card .cbig{font-size:64px}.hilo-card .card .cr{font-size:26px}.hilo-card .card .cs{top:34px;font-size:22px}
  .hilo-trail .card{width:42px;height:60px}.hilo-trail .card .cbig{display:none}.hilo-trail .card .cr{font-size:13px}.hilo-trail .card .cs{top:18px;font-size:12px}`;
  document.head.appendChild(css);
})();
