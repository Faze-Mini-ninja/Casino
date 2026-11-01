(function () {
  const C = Casino, L = Lib, h = C.h;
  const rtps = Object.keys(L.KENO_PAYS).map((s) => L.kenoRTP(+s));
  const lo = ((1 - Math.max(...rtps)) * 100).toFixed(1), hi = ((1 - Math.min(...rtps)) * 100).toFixed(1);
  C.register({
    n: 2, id: 'keno', name: 'Keno', icon: '🔢', cat: 'lottery', edge: `${lo}–${hi}%`,
    blurb: 'Pick 1–10 numbers from 80; 20 balls are drawn.',
    rules: '<p>Choose 1 to 10 numbers (spots). The house draws 20 of 80 balls. Your payout depends on how many spots you hit. Payouts below are total return per 1 credit bet.</p>',
    edges: Object.entries(L.KENO_PAYS).map(([s, t]) => [`${s} spot${s > 1 ? 's' : ''}`, Object.entries(t).map(([k, v]) => `${k} hit: ${v}×`).join(', '), ((1 - L.kenoRTP(+s)) * 100).toFixed(2) + '%']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      const msg = C.msg();
      const picks = new Set();
      let busy = false, alive = true;
      const cells = {};
      const board = h('div', { class: 'keno-board' }, Array.from({ length: 80 }, (_, i) => {
        const n = i + 1;
        return (cells[n] = h('div', { class: 'kcell', onclick: () => toggle(n) }, String(n)));
      }));
      const pt = h('div', { class: 'pays-list' });
      const info = h('div', { class: 'muted' });
      function toggle(n) {
        if (busy) return;
        resetDraw();
        if (picks.has(n)) picks.delete(n); else if (picks.size < 10) picks.add(n); else return C.toast('Maximum 10 spots', 'err');
        paint();
      }
      function resetDraw() { for (const n in cells) cells[n].classList.remove('drawn', 'hit'); }
      function paint(hits = -1) {
        for (const n in cells) cells[n].classList.toggle('pick', picks.has(+n));
        pt.innerHTML = '';
        const t = L.KENO_PAYS[picks.size];
        info.textContent = picks.size ? `${picks.size} spot${picks.size > 1 ? 's' : ''} • RTP ${(L.kenoRTP(picks.size) * 100).toFixed(2)}%` : 'Pick 1–10 numbers';
        if (t) Object.entries(t).reverse().forEach(([k, v]) => pt.appendChild(h('div', { class: +k === hits ? 'hit' : '' }, h('span', null, `${k} hits`), h('b', null, v + '×'))));
      }
      const quick = () => { if (busy) return; const n = picks.size || 5; resetDraw(); picks.clear(); L.shuffle(Array.from({ length: 80 }, (_, i) => i + 1)).slice(0, n).forEach((x) => picks.add(x)); paint(); };
      const playBtn = h('button', { class: 'btn big', onclick: () => play() }, 'PLAY');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, info,
          h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: quick }, 'Quick Pick'), h('button', { class: 'btn small ghost', onclick: () => { if (!busy) { picks.clear(); resetDraw(); paint(); } } }, 'Clear')),
          h('h3', null, 'Paytable'), pt),
        h('div', { class: 'stage' }, board, msg.el, playBtn)));
      paint();
      async function play() {
        if (busy) return;
        if (!picks.size) return C.toast('Pick at least one number', 'err');
        const b = bet.value;
        if (!C.bet('keno', b)) return;
        busy = true; playBtn.disabled = true; bet.disable(true); resetDraw(); msg.set('Drawing…');
        const draw = L.kenoDraw();
        let hits = 0;
        for (const n of draw) {
          if (!alive) return;
          cells[n].classList.add('drawn');
          if (picks.has(n)) { cells[n].classList.add('hit'); hits++; }
          await C.sleep(70);
        }
        const m = (L.KENO_PAYS[picks.size] || {})[hits] || 0;
        const pay = C.win('keno', b * m);
        C.record('keno', b, pay, `${hits}/${picks.size} hits`);
        paint(hits);
        msg.set(m ? `${hits} hits — WIN ${C.fmt(pay)} (${m}×)` : `${hits} hit${hits === 1 ? '' : 's'} — no win`, m ? 'win' : 'lose');
        busy = false; playBtn.disabled = false; bet.disable(false);
      }
      return () => { alive = false; };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.keno-board{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;width:100%;max-width:560px}
  .kcell{aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#1d2752;border:1px solid #33427e;cursor:pointer;font-weight:700;transition:all .15s}
  .kcell:hover{border-color:var(--gold)} .kcell.pick{background:#3b2f7a;border-color:#9d8cff}
  .kcell.drawn{background:#38415e;color:#fff;border-color:#8e9ac0} .kcell.hit{background:linear-gradient(180deg,#ffd166,#e0a100);color:#231800;border-color:#fff;transform:scale(1.08)}`;
  document.head.appendChild(css);
})();
