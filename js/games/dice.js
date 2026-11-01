(function () {
  const C = Casino, L = Lib, h = C.h;
  const E = L.EDGE.dice;
  C.register({
    n: 24, id: 'dice', name: 'Dice', icon: '🎲', cat: 'originals', edge: (E * 100) + '%',
    blurb: 'Roll 0–99.99 over or under your number.',
    rules: `<p>A number from 0.00 to 99.99 is rolled. Choose Roll Under or Roll Over and drag the slider to set your win chance (2%–95%). Payout = ${((1 - E) * 100).toFixed(0)} ÷ win chance %, giving a ${(E * 100).toFixed(0)}% house edge on every setting.</p>`,
    edges: [['Any setting', `${((1 - E) * 100).toFixed(0)} ÷ chance`, (E * 100).toFixed(2) + '%']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let over = false, target = 50, busy = false;
      const slider = h('input', { type: 'range', min: '2', max: '98', step: '1', value: '50', class: 'dice-range', oninput: () => { target = +slider.value; upd(); } });
      const info = h('div', { class: 'dice-info' });
      const modeBtn = h('button', { class: 'btn ghost', onclick: () => { over = !over; upd(); } }, '');
      const marker = h('div', { class: 'dice-marker' }, '');
      const track = h('div', { class: 'dice-track' }, slider, marker);
      const msg = C.msg();
      const hist = h('div', { class: 'history-strip' });
      const btn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, modeBtn, info),
        h('div', { class: 'stage' }, track, msg.el, btn, hist)));
      const chance = () => (over ? 100 - target : target);
      function upd() {
        if (chance() > 95) { target = over ? 5 : 95; slider.value = target; }
        modeBtn.textContent = over ? `Roll Over ${target}` : `Roll Under ${target}`;
        const m = L.diceMult(chance());
        info.innerHTML = (C.odds() ? `<div class="stat-line">Win chance <b>${chance().toFixed(2)}%</b></div>` : '') + `<div class="stat-line">Multiplier <b>${m.toFixed(4)}×</b></div><div class="stat-line">Profit on win <b>${C.fmt(bet.value * m - bet.value)}</b></div>`;
        const pct = target;
        track.style.setProperty('--split', pct + '%');
        track.classList.toggle('over', over);
      }
      bet.input.addEventListener('input', upd);
      upd();
      async function roll() {
        if (busy) return;
        const b = bet.value, ch = chance(), m = L.diceMult(ch);
        busy = true; btn.disabled = true;
        const res = await C.try(() => C.play('dice', null, { bet: b, target, over }));
        if (!res) { busy = false; btn.disabled = false; return; }
        const r = res.result.r;
        marker.style.left = r + '%'; marker.textContent = r.toFixed(2); marker.style.opacity = 1;
        await C.sleep(350);
        const win = res.result.win;
        marker.className = 'dice-marker ' + (win ? 'w' : 'l');
        const pay = res.payout;
        C.settle(res);
        msg.set(win ? `${r.toFixed(2)} — win ${C.fmt(pay)}` : `${r.toFixed(2)} — lose`, win ? 'win' : 'lose');
        hist.prepend(h('span', { class: 'pill ' + (win ? 'g' : 'r') }, r.toFixed(2)));
        while (hist.children.length > 16) hist.lastChild.remove();
        busy = false; btn.disabled = false;
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.dice-track{position:relative;width:100%;max-width:640px;padding:40px 0 10px;--split:50%}
  .dice-range{width:100%;-webkit-appearance:none;appearance:none;height:14px;border-radius:999px;background:linear-gradient(90deg,var(--green) 0 var(--split),var(--red) var(--split) 100%);border:0;padding:0}
  .dice-track.over .dice-range{background:linear-gradient(90deg,var(--red) 0 var(--split),var(--green) var(--split) 100%)}
  .dice-range::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;border-radius:8px;background:#fff;border:3px solid var(--gold);cursor:pointer}
  .dice-range::-moz-range-thumb{width:26px;height:26px;border-radius:8px;background:#fff;border:3px solid var(--gold);cursor:pointer}
  .dice-marker{position:absolute;top:0;transform:translateX(-50%);background:#fff;color:#111;font-weight:900;padding:4px 8px;border-radius:8px;opacity:0;transition:left .35s ease-out}
  .dice-marker.w{background:var(--green)}.dice-marker.l{background:var(--red);color:#fff}`;
  document.head.appendChild(css);
})();
