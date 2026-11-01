(function () {
  const C = Casino, L = Lib, h = C.h;
  const M = L.COIN_MULT;
  C.register({
    n: 29, id: 'coinflip', name: 'Coin Flip', icon: '🪙', cat: 'originals', edge: (L.EDGE.coinflip * 100) + '%',
    blurb: `Heads or tails — pays ${M.toFixed(2)}×.`,
    rules: `<p>Call heads or tails. A correct call pays ${M.toFixed(2)}× your bet (a fair coin would pay 2×), so the house keeps ${(L.EDGE.coinflip * 100).toFixed(0)}% of every flip.</p>`,
    edges: [['Heads or Tails', M.toFixed(2) + '× (0.8:1)', (L.EDGE.coinflip * 100).toFixed(2) + '%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const msg = C.msg();
      const coin = h('div', { class: 'coin' }, h('div', { class: 'face heads' }, 'H'), h('div', { class: 'face tails' }, 'T'));
      const hist = h('div', { class: 'history-strip' });
      let busy = false, rot = 0, streak = 0;
      const streakEl = h('div', { class: 'stat-line' });
      const paintStreak = () => { streakEl.innerHTML = `Win streak <b>${streak}</b>`; };
      paintStreak();
      const hb = h('button', { class: 'btn big', onclick: () => flip('H') }, 'HEADS'), tb = h('button', { class: 'btn big blue', onclick: () => flip('T') }, 'TAILS');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, streakEl),
        h('div', { class: 'stage' }, h('div', { class: 'coin-wrap' }, coin), msg.el, h('div', { class: 'controls' }, hb, tb), hist)));
      async function flip(call) {
        if (busy) return;
        const b = bet.value;
        busy = true; hb.disabled = tb.disabled = true; msg.set(' ');
        const r = await C.try(() => C.play('coinflip', null, { bet: b, call }));
        if (!r) { busy = false; hb.disabled = tb.disabled = false; return; }
        const res = r.result.res;
        rot += 1800 + ((res === 'H' ? 0 : 180) - (rot % 360) + 360) % 360;
        coin.style.transform = `rotateY(${rot}deg)`;
        await C.sleep(1500);
        const win = res === call;
        const pay = r.payout;
        C.settle(r);
        streak = win ? streak + 1 : 0; paintStreak();
        msg.set(`${res === 'H' ? 'Heads' : 'Tails'} — ` + (win ? `win ${C.fmt(pay)}` : 'lose'), win ? 'win' : 'lose');
        hist.prepend(h('span', { class: 'pill ' + (res === 'H' ? '' : 'bl') }, res));
        while (hist.children.length > 20) hist.lastChild.remove();
        busy = false; hb.disabled = tb.disabled = false;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.coin-wrap{perspective:800px}.coin{width:180px;height:180px;position:relative;transform-style:preserve-3d;transition:transform 1.5s cubic-bezier(.2,.8,.2,1)}
  .coin .face{position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:80px;font-weight:900;backface-visibility:hidden;border:8px solid #b8860b;box-shadow:inset 0 0 20px rgba(0,0,0,.4)}
  .coin .heads{background:radial-gradient(circle at 35% 35%,#ffe58a,#d4a017);color:#7a5500}.coin .tails{background:radial-gradient(circle at 35% 35%,#e6e6e6,#9a9a9a);color:#444;transform:rotateY(180deg);border-color:#777}
  .pill.bl{background:#1d4ed8;border-color:#1d4ed8}`;
  document.head.appendChild(css);
})();
