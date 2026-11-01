(function () {
  const C = Casino, L = Lib, h = C.h;
  const SYMS = L.SLOT_SYMBOLS.map((s) => s.s);
  C.register({
    n: 1, id: 'slots', name: 'Slots', icon: '🎰', cat: 'lottery', edge: '20.2%',
    blurb: 'Classic 3-reel fruit machine with a 200× jackpot.',
    rules: '<p>Three reels, one payline (the middle row). Line up three matching symbols, or any two cherries. Reel strips are weighted: cherries are common, 7s are rare. RTP 79.78% (exact).</p>',
    edges: [['7️⃣ 7️⃣ 7️⃣', '200×', ''], ['⭐ ⭐ ⭐', '80×', ''], ['🔔 🔔 🔔', '40×', ''], ['🍊 🍊 🍊', '20×', ''], ['🍋 🍋 🍋', '12×', ''], ['🍒 🍒 🍒', '5×', ''], ['Any two 🍒', '1× (stake back)', ''], ['Overall', '', '20.22%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const msg = C.msg();
      let alive = true, spinning = false, auto = false;
      const reels = [0, 1, 2].map(() => {
        const cells = [0, 1, 2].map(() => h('div', { class: 'slot-cell' }, L.pick(SYMS)));
        return { el: h('div', { class: 'slot-reel' }, cells), cells };
      });
      const table = h('div', { class: 'pays-list' }, Object.entries(L.SLOT_PAYS).map(([s, p]) => h('div', { 'data-s': s }, h('span', null, s + ' ' + s + ' ' + s), h('b', null, p + '×'))),
        h('div', { 'data-s': 'two' }, h('span', null, '🍒 🍒 any'), h('b', null, '1×')));
      const spinBtn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      const autoBtn = h('button', { class: 'btn ghost', onclick: () => { auto = !auto; autoBtn.textContent = auto ? 'Stop Auto' : 'Auto Spin'; if (auto && !spinning) spin(); } }, 'Auto Spin');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('div', null, h('h3', null, 'Paytable'), table)),
        h('div', { class: 'stage' },
          h('div', { class: 'slot-machine' }, h('div', { class: 'slot-window' }, reels.map((r) => r.el), h('div', { class: 'payline' }))),
          msg.el, h('div', { class: 'controls' }, spinBtn, autoBtn))));
      async function spin() {
        if (spinning || !alive) return;
        const b = bet.value;
        spinning = true; spinBtn.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('slots', null, { bet: b }));
        if (!r) { spinning = false; spinBtn.disabled = false; bet.disable(false); auto = false; autoBtn.textContent = 'Auto Spin'; return; }
        msg.set('Spinning…');
        table.querySelectorAll('div').forEach((d) => d.classList.remove('hit'));
        const line = r.result.line;
        const timers = reels.map((r) => setInterval(() => r.cells.forEach((c) => (c.textContent = L.pick(SYMS))), 60));
        reels.forEach((r) => r.el.classList.add('blur'));
        for (let i = 0; i < 3; i++) {
          await C.sleep(450 + i * 300);
          clearInterval(timers[i]); reels[i].el.classList.remove('blur');
          reels[i].cells[0].textContent = L.pick(SYMS); reels[i].cells[1].textContent = line[i]; reels[i].cells[2].textContent = L.pick(SYMS);
        }
        const m = r.result.mult, pay = r.payout;
        C.settle(r);
        if (m > 0) {
          msg.set(m === 1 ? 'Two cherries — stake back' : `WIN ${C.fmt(pay)}  (${m}×)`, 'win');
          const key = m === 1 ? 'two' : line[0];
          const row = table.querySelector(`[data-s="${key}"]`); if (row) row.classList.add('hit');
        } else msg.set('No win', 'lose');
        spinning = false; spinBtn.disabled = false; bet.disable(false);
        if (auto && alive) setTimeout(spin, 600);
      }
      return () => { alive = false; auto = false; };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.slot-machine{background:linear-gradient(180deg,#b8860b,#6b4a05);padding:14px;border-radius:22px;box-shadow:0 10px 30px rgba(0,0,0,.6)}
  .slot-window{position:relative;display:flex;gap:8px;background:#111;padding:10px;border-radius:14px}
  .slot-reel{display:flex;flex-direction:column;background:linear-gradient(180deg,#ddd,#fff 30%,#fff 70%,#ccc);border-radius:10px;width:110px;overflow:hidden}
  .slot-reel.blur .slot-cell{filter:blur(2px)}
  .slot-cell{height:90px;font-size:56px;display:flex;align-items:center;justify-content:center}
  .slot-cell:nth-child(1),.slot-cell:nth-child(3){opacity:.45;transform:scale(.8)}
  .payline{position:absolute;left:4px;right:4px;top:50%;height:3px;background:rgba(255,40,60,.8);transform:translateY(-50%);pointer-events:none}`;
  document.head.appendChild(css);
})();
