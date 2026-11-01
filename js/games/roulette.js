(function () {
  const C = Casino, L = Lib, h = C.h;
  const colorOf = (n) => (n === 0 || n === '00' ? 'g' : L.REDS.has(n) ? 'r' : 'b');
  const COL = { g: '#15803d', r: '#c1121f', b: '#1a1a1a' };

  function make(american) {
    const id = american ? 'roulette-us' : 'roulette-eu';
    const wheel = american ? L.WHEEL_US : L.WHEEL_EU;
    const edge = american ? '5.26%' : '2.70%';
    C.register({
      n: american ? 4 : 5, id, name: american ? 'American Roulette' : 'European Roulette', icon: american ? '🇺🇸' : '🇪🇺', cat: 'table', edge,
      blurb: american ? 'Double-zero wheel (0 and 00), 38 pockets.' : 'Single-zero wheel, 37 pockets.',
      rules: `<p>${wheel.length} pockets. Place chips on numbers or outside bets, then spin. Bets stay on the layout between spins until you clear them.${american ? ' The 0-00-1-2-3 "Top Line" bet pays 6:1 and carries a 7.89% edge — the worst bet on the table.' : ''}</p>`,
      edges: [['Straight up', '35:1', edge], ['Dozen / Column', '2:1', edge], ['Red/Black, Odd/Even, 1-18/19-36', '1:1', edge], ...(american ? [['Top Line (0,00,1,2,3)', '6:1', '7.89%']] : [])],
      mount(root) {
        const T = C.chipTable();
        const msg = C.msg();
        const hist = h('div', { class: 'history-strip' });
        let busy = false, alive = true, rot = 0, raf = 0;
        const cv = h('canvas', { width: 340, height: 340, class: 'rwheel' });
        const ctx = cv.getContext('2d');
        const seg = (Math.PI * 2) / wheel.length;
        let resultIdx = -1;
        function draw() {
          const R = 165, cx = 170, cy = 170;
          ctx.clearRect(0, 0, 340, 340);
          ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); ctx.fillStyle = '#5a3a1a'; ctx.fill();
          wheel.forEach((n, i) => {
            const a0 = rot + i * seg - Math.PI / 2, a1 = a0 + seg;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1); ctx.closePath();
            ctx.fillStyle = COL[colorOf(n)]; ctx.fill(); ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 1; ctx.stroke();
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + seg / 2); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
            ctx.translate(R - 16, 0); ctx.rotate(Math.PI / 2); ctx.fillText(String(n), 0, 4); ctx.restore();
          });
          ctx.beginPath(); ctx.arc(cx, cy, R - 34, 0, Math.PI * 2); ctx.fillStyle = '#3b2410'; ctx.fill();
          ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fillStyle = '#d4af37'; ctx.fill();
          // ball / pointer at top
          ctx.beginPath(); ctx.moveTo(cx - 10, 2); ctx.lineTo(cx + 10, 2); ctx.lineTo(cx, 18); ctx.fillStyle = '#f5c542'; ctx.fill();
          if (resultIdx >= 0 && !busy) { ctx.beginPath(); ctx.arc(cx, 30, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
        }
        draw();
        // layout
        const num = (n) => T.spot('n:' + n, h('span', null, String(n)), 'rnum ' + colorOf(n));
        const grid = h('div', { class: 'rgrid' });
        const zeros = h('div', { class: 'rzeros' }, american ? [num('00'), num(0)] : [num(0)]);
        const nums = h('div', { class: 'rnums' });
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 12; col++) nums.appendChild(num(col * 3 + (3 - row)));
          nums.appendChild(T.spot('c' + (3 - row), h('span', null, '2:1'), 'rout'));
        }
        grid.append(zeros, nums);
        const out = (id, label, cls = '') => T.spot(id, h('span', null, label), 'rout ' + cls);
        const dozens = h('div', { class: 'rdozens' }, out('d1', '1st 12'), out('d2', '2nd 12'), out('d3', '3rd 12'));
        const evens = h('div', { class: 'revens' }, out('low', '1–18'), out('even', 'EVEN'), out('red', '◆', 'redspot'), out('black', '◆', 'blackspot'), out('odd', 'ODD'), out('high', '19–36'));
        const spinBtn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
        root.appendChild(h('div', { class: 'roulette' },
          h('div', { class: 'rleft' }, cv, msg.el, spinBtn, h('div', { class: 'muted center', style: 'font-size:12px' }, 'Recent results'), hist),
          h('div', { class: 'rright' }, h('div', { class: 'felt rtable' }, grid, dozens, evens,
            american ? h('div', { class: 'revens' }, out('top5', 'Top Line 0·00·1·2·3 (6:1)')) : null), T.bar)));
        function spin() {
          if (busy) return;
          if (!T.commit(id)) return;
          busy = true; T.lock(true); spinBtn.disabled = true; msg.set('No more bets…'); T.mark([]);
          const k = L.int(wheel.length);
          const target = ((-(k + 0.5) * seg) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const curMod = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const delta = ((target - curMod) + Math.PI * 2) % (Math.PI * 2);
          const start = rot, end = rot + Math.PI * 2 * 5 + delta, t0 = performance.now(), dur = 4200;
          const step = (t) => {
            if (!alive) return;
            const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
            rot = start + (end - start) * e; draw();
            if (p < 1) raf = requestAnimationFrame(step); else done(k);
          };
          raf = requestAnimationFrame(step);
        }
        function done(k) {
          const n = wheel[k]; resultIdx = k; busy = false; draw();
          let pay = 0; const winners = [];
          for (const bid in T.bets) {
            if (L.rouletteCovers(bid).some((x) => String(x) === String(n))) { pay += T.bets[bid] * (L.roulettePays(bid) + 1); winners.push(bid); }
          }
          const wager = T.total();
          pay = C.win(id, pay);
          T.mark(['n:' + n, ...winners]);
          C.record(id, wager, pay, 'Result ' + n);
          const c = colorOf(n);
          hist.prepend(h('span', { class: 'pill ' + c }, String(n)));
          while (hist.children.length > 14) hist.lastChild.remove();
          msg.set(`${n} ${c === 'r' ? 'Red' : c === 'b' ? 'Black' : 'Green'} — ` + (pay ? `you win ${C.fmt(pay)}` : 'no win'), pay ? 'win' : 'lose');
          T.lock(false); spinBtn.disabled = false;
        }
        return () => { alive = false; cancelAnimationFrame(raf); };
      },
    });
  }
  make(true); make(false);
  const css = document.createElement('style');
  css.textContent = `.roulette{display:grid;grid-template-columns:360px 1fr;gap:20px;align-items:start}
  .rleft{display:flex;flex-direction:column;align-items:center;gap:10px}
  .rtable{display:flex;flex-direction:column;gap:6px;padding:14px}
  .rgrid{display:flex;gap:4px}.rzeros{display:flex;flex-direction:column;gap:4px;width:52px}.rzeros .spot{flex:1}
  .rnums{flex:1;display:grid;grid-template-columns:repeat(12,1fr) 52px;gap:4px}
  .rnum{min-height:42px}.rnum.r{background:#c1121f}.rnum.b{background:#1a1a1a}.rnum.g{background:#15803d}
  .rdozens{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-left:56px;margin-right:56px}
  .revens{display:grid;grid-template-columns:repeat(auto-fit,minmax(60px,1fr));gap:4px;margin-left:56px;margin-right:56px}
  .redspot{color:#ff3046;font-size:22px}.blackspot{color:#000;font-size:22px}
  @media(max-width:1000px){.roulette{grid-template-columns:1fr}.rdozens,.revens{margin:0}.rnum{min-height:34px;font-size:12px}}`;
  document.head.appendChild(css);
})();
