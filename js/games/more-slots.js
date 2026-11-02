/* Pick 3 lottery. (Video slots live in video-slots.js.) */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const css = (t) => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); };

  /* ---------------- Pick 3 ---------------- */
  C.register({
    n: 53, id: 'pick3', name: 'Pick 3', icon: '3', cat: 'lottery', edge: '30%',
    blurb: 'Choose three digits. Straight pays 700×.',
    rules: '<p>Pick three digits from 0 to 9, then three balls are drawn. <b>Straight</b> wins if the draw matches your digits in exact order. <b>Box</b> wins if the draw contains your digits in any order (needs at least two different digits).</p>',
    edges: [['Straight (exact order)', '700×', '30%'], ['Box: 3 different digits (6 ways)', '115×', '30.8%'], ['Box: one pair (3 ways)', '230×', '30.8%']],
    mount(root) {
      const bet = C.betInput({ value: 1 });
      let mode = 'straight', digits = [1, 2, 3], busy = false;
      const msg = C.msg(), hist = h('div', { class: 'history-strip' });
      const dEls = digits.map((_, i) => {
        const v = h('div', { class: 'p3-d' }, String(digits[i]));
        const set = (x) => { if (busy) return; digits[i] = (x + 10) % 10; v.textContent = digits[i]; paintMode(); };
        return h('div', { class: 'p3-col' }, h('button', { class: 'btn small ghost', onclick: () => set(digits[i] + 1) }, '▲'), v, h('button', { class: 'btn small ghost', onclick: () => set(digits[i] - 1) }, '▼'));
      });
      const modeSel = C.select('Bet type', [['straight', 'Straight: exact order'], ['box', 'Box: any order']], mode, (v) => { mode = v; paintMode(); });
      const payInfo = h('div', { class: 'p3-pay' });
      const quick = h('button', { class: 'btn ghost small', onclick: () => { if (busy) return; digits = digits.map(() => Math.floor(Math.random() * 10)); dEls.forEach((c, i) => (c.children[1].textContent = digits[i])); paintMode(); } }, 'Quick pick');
      function paintMode() {
        const k = L.pick3Kind(digits);
        payInfo.textContent = mode === 'straight' ? 'Pays 700× your bet' : k === 'triple' ? 'Box needs two different digits' : `Pays ${L.PICK3[k]}× your bet (${k === 'box6' ? '6' : '3'} winning orders)`;
        payInfo.className = 'p3-pay' + (mode === 'box' && k === 'triple' ? ' bad' : '');
      }
      paintMode();
      const balls = h('div', { class: 'p3-balls' }, [0, 1, 2].map(() => h('div', { class: 'p3-ball' }, '?')));
      const btn = h('button', { class: 'btn big', onclick: () => draw() }, 'DRAW');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, modeSel.el, h('div', { class: 'field' }, h('label', null, 'Your numbers'), h('div', { class: 'p3-pick' }, dEls), quick), payInfo),
        h('div', { class: 'stage' }, h('div', { class: 'felt p3-felt' }, h('div', { class: 'hand-label' }, 'DRAW'), balls), msg.el, h('div', { class: 'controls' }, btn), hist)));
      async function draw() {
        if (busy) return; busy = true; btn.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('pick3', null, { bet: bet.value, mode, digits }));
        if (!r) { busy = false; btn.disabled = false; bet.disable(false); return; }
        const bs = [...balls.children]; bs.forEach((b) => { b.textContent = '?'; b.className = 'p3-ball'; });
        for (let i = 0; i < 3; i++) {
          const b = bs[i]; b.classList.add('roll');
          for (let k = 0; k < 10; k++) { b.textContent = Math.floor(Math.random() * 10); await C.sleep(55); }
          b.classList.remove('roll'); b.textContent = r.result.draw[i]; C.sfx && C.sfx('tick');
          const hit = mode === 'straight' ? r.result.draw[i] === digits[i] : digits.includes(r.result.draw[i]);
          b.classList.add(hit ? 'hit' : 'miss');
        }
        C.settle(r);
        hist.prepend(h('span', { class: 'pill' + (r.payout ? ' g' : '') }, r.result.draw.join(''))); while (hist.children.length > 12) hist.lastChild.remove();
        msg.set(r.payout ? `Winner! Pays ${C.fmt(r.payout)} (${r.result.mult}×)` : `Drew ${r.result.draw.join(' ')}: no win`, r.payout ? 'win' : 'lose');
        busy = false; btn.disabled = false; bet.disable(false);
      }
    },
  });
  css(`.p3-pick{display:flex;gap:10px;justify-content:center;margin:6px 0}.p3-col{display:flex;flex-direction:column;align-items:center;gap:4px}
  .p3-d{width:54px;height:62px;border-radius:12px;background:var(--panel2,#1a2c3d);display:grid;place-items:center;font-size:32px;font-weight:800;font-variant-numeric:tabular-nums}
  .p3-pay{font-size:13px;color:var(--muted);margin-top:4px}.p3-pay.bad{color:var(--red,#ff4d63)}
  .p3-felt{display:flex;flex-direction:column;align-items:center;gap:14px;padding:34px 10px}.p3-balls{display:flex;gap:18px}
  .p3-ball{width:84px;height:84px;border-radius:50%;display:grid;place-items:center;font-size:38px;font-weight:800;color:#1b1b1b;background:radial-gradient(circle at 35% 30%,#fff,#e8e8e8 45%,#a9b0b8);box-shadow:0 8px 18px rgba(0,0,0,.5)}
  .p3-ball.roll{animation:p3r .12s linear infinite}@keyframes p3r{50%{transform:translateY(-4px) rotate(8deg)}}
  .p3-ball.hit{background:radial-gradient(circle at 35% 30%,#d9ffe9,#22e58b 55%,#0e8a52)}.p3-ball.miss{opacity:.75}
  @media(max-width:600px){.p3-ball{width:66px;height:66px;font-size:30px}}`);
})();
