(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.limbo;
  C.register({
    n: 23, id: 'limbo', name: 'Limbo', icon: '🎯', cat: 'originals', edge: (E * 100) + '%',
    blurb: 'Pick a target multiplier. Beat it to win.',
    rules: `<p>Set a target multiplier (1.01× to 1,000,000×). A random result is generated with P(result ≥ x) = ${(1 - E).toFixed(2)} / x. If the result is at or above your target, you win bet × target. House edge ${(E * 100).toFixed(0)}% on every target.</p>`,
    edges: [['Any target', 'target ×', (E * 100).toFixed(2) + '%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const tgt = h('input', { type: 'number', min: '1.01', step: '0.01', value: '2.00', class: 'bet-amt', oninput: () => upd() });
      const chance = h('div', { class: 'stat-line' });
      const msg = C.msg();
      const big = h('div', { class: 'big-num' }, '1.00×');
      const hist = h('div', { class: 'history-strip' });
      let busy = false, alive = true;
      const btn = h('button', { class: 'btn big', onclick: () => play() }, 'BET');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('div', { class: 'field' }, h('label', null, 'Target multiplier'), tgt), chance,
          h('div', { class: 'row' }, [1.5, 2, 5, 10, 100].map((v) => h('button', { class: 'btn small ghost', onclick: () => { tgt.value = v.toFixed(2); upd(); } }, v + '×')))),
        h('div', { class: 'stage' }, big, msg.el, btn, hist)));
      const target = () => Math.min(1e6, Math.max(1.01, Math.floor(+tgt.value * 100) / 100 || 1.01));
      function upd() { chance.innerHTML = `Win chance <b>${((1 - E) / target() * 100).toFixed(4)}%</b>`; }
      upd();
      async function play() {
        if (busy) return;
        const b = bet.value, t = target();
        busy = true; btn.disabled = true; big.style.color = '';
        const res = await C.try(() => C.play('limbo', null, { bet: b, target: t }));
        if (!res) { busy = false; btn.disabled = false; return; }
        const r = res.result.r;
        const steps = 18;
        for (let i = 1; i <= steps; i++) { if (!alive) return; big.textContent = (1 + (r - 1) * Math.pow(i / steps, 3)).toFixed(2) + '×'; await C.sleep(22); }
        big.textContent = r.toFixed(2) + '×';
        const win = res.result.win;
        big.style.color = win ? 'var(--green)' : 'var(--red)';
        const pay = res.payout;
        C.settle(res);
        msg.set(win ? `Win! ${C.fmt(pay)}` : `Needed ${t.toFixed(2)}×`, win ? 'win' : 'lose');
        hist.prepend(h('span', { class: 'pill ' + (win ? 'g' : 'r') }, r.toFixed(2) + '×'));
        while (hist.children.length > 16) hist.lastChild.remove();
        busy = false; btn.disabled = false;
      }
      return () => { alive = false; };
    },
  });
})();
