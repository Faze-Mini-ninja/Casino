(function () {
  const C = Casino, L = Lib, h = C.h;
  const letter = (n) => 'BINGO'[Math.floor((n - 1) / 15)];
  C.register({
    n: 13, id: 'bingo', name: 'Speed Bingo', icon: '🅱️', cat: 'lottery', edge: '≈31%',
    blurb: '75-ball bingo, 30 calls. Paid by lines completed.',
    rules: `<p>Buy 1–4 cards (bet is per card). ${L.BINGO_DRAW} of 75 balls are called. Every completed row, column or diagonal is a line (centre square is free). Each card pays by its number of lines: ${Object.entries(L.BINGO_PAYS).map(([k, v]) => `${k}${k == 5 ? '+' : ''} line${k > 1 ? 's' : ''} ${v}×`).join(', ')}. RTP ≈69% (simulated).</p>`,
    edges: Object.entries(L.BINGO_PAYS).map(([k, v]) => [`${k}${k == 5 ? '+' : ''} line${k > 1 ? 's' : ''}`, v + '× per card', '']).concat([['Overall', '', '≈31%']]),
    mount(root) {
      const bet = C.betInput({ value: 5, label: 'Bet per card' });
      let nCards = 2, cards = [], busy = false, alive = true;
      const ncSel = C.select('Cards', [1, 2, 3, 4], nCards, (v) => { nCards = +v; newCards(); });
      const msg = C.msg();
      const cardsEl = h('div', { class: 'bingo-cards' });
      const ball = h('div', { class: 'bingo-ball' }, '—');
      const called = h('div', { class: 'bingo-called' });
      const playBtn = h('button', { class: 'btn big', onclick: () => play() }, 'PLAY');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, ncSel.el, h('button', { class: 'btn small ghost', onclick: () => !busy && newCards() }, 'New cards'),
          h('div', { class: 'pays-list' }, Object.entries(L.BINGO_PAYS).map(([k, v]) => h('div', null, h('span', null, `${k}${k == 5 ? '+' : ''} line${k > 1 ? 's' : ''}`), h('b', null, v + '×')))),
          h('div', { class: 'center' }, ball), called),
        h('div', { class: 'stage' }, cardsEl, msg.el, playBtn)));
      function newCards() { cards = Array.from({ length: nCards }, () => ({ grid: L.bingoCard() })); paint(new Set(), []); called.innerHTML = ''; ball.textContent = '—'; }
      function paint(drawn, linesPer) {
        cardsEl.innerHTML = '';
        cards.forEach((cd, ci) => {
          const lines = linesPer[ci] || [];
          const inLine = (r, c) => lines.some((l) => (l.t === 'r' && l.i === r) || (l.t === 'c' && l.i === c) || (l.t === 'd' && l.i === 0 && r === c) || (l.t === 'd' && l.i === 1 && r + c === 4));
          cardsEl.appendChild(h('div', { class: 'bingo-card' },
            h('div', { class: 'bc-head' }, [...'BINGO'].map((x) => h('div', null, x))),
            h('div', { class: 'bc-grid' }, cd.grid.flatMap((row, r) => row.map((n, c) =>
              h('div', { class: 'bc-cell' + (n === 0 || drawn.has(n) ? ' marked' : '') + (inLine(r, c) ? ' line' : '') }, n === 0 ? '★' : String(n))))),
            h('div', { class: 'bc-foot' }, lines.length ? `${lines.length} line${lines.length > 1 ? 's' : ''}: ${L.bingoPay(lines.length)}×` : '')));
        });
      }
      newCards();
      async function play() {
        if (busy) return;
        const b = bet.value, total = C.r2(b * nCards);
        busy = true; playBtn.disabled = true; bet.disable(true); ncSel.sel.disabled = true;
        const r = await C.try(() => C.play('bingo', null, { bet: b, cards: nCards }));
        if (!r) { busy = false; playBtn.disabled = false; bet.disable(false); ncSel.sel.disabled = false; return; }
        cards = r.result.cards.map((grid) => ({ grid }));
        called.innerHTML = ''; msg.set('Calling…');
        const draw = r.result.draw, drawn = new Set();
        for (const n of draw) {
          if (!alive) return;
          drawn.add(n); ball.textContent = letter(n) + '-' + n;
          called.appendChild(h('span', { class: 'cb' }, String(n)));
          paint(drawn, cards.map((cd) => L.bingoLines(cd.grid, drawn)));
          await C.sleep(110);
        }
        const per = r.result.lines, pay = r.payout;
        C.settle(r);
        msg.set(pay ? `BINGO! ${per.reduce((a, x) => a + x, 0)} line(s): win ${C.fmt(pay)}` : 'No lines this time', pay > total ? 'win' : pay ? 'push' : 'lose');
        busy = false; playBtn.disabled = false; bet.disable(false); ncSel.sel.disabled = false;
      }
      return () => { alive = false; };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.bingo-cards{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
  .bingo-card{background:#fff;color:#111;border-radius:12px;padding:8px;width:220px;box-shadow:0 6px 16px rgba(0,0,0,.4)}
  .bc-head,.bc-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}.bc-head div{background:#7b2cbf;color:#fff;font-weight:900;text-align:center;border-radius:4px;padding:2px}
  .bc-grid{margin-top:3px}.bc-cell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-weight:700;border-radius:4px;background:#eef0f7;font-size:14px}
  .bc-cell.marked{background:#ff4d6d;color:#fff;border-radius:50%}.bc-cell.line{background:#f5c542;color:#000;border-radius:4px}
  .bc-foot{text-align:center;font-weight:800;color:#7b2cbf;min-height:20px;margin-top:4px}
  .bingo-ball{display:inline-flex;width:86px;height:86px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#ddd 40%,#7b2cbf 41%);align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#111;box-shadow:0 6px 14px rgba(0,0,0,.5)}
  .bingo-called{display:flex;flex-wrap:wrap;gap:3px}.cb{font-size:11px;background:var(--panel2);border-radius:4px;padding:1px 4px}`;
  document.head.appendChild(css);
})();
