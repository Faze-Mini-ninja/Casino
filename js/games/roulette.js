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
      rules: `<p>${wheel.length} pockets. Place chips on numbers or outside bets, then spin. Bets stay on the layout between spins until you clear them.${american ? ' The 0-00-1-2-3 "Top Line" bet pays 6:1 and carries a 7.89% edge: the worst bet on the table.' : ''}</p>`,
      edges: [['Straight up', '35:1', edge], ['Dozen / Column', '2:1', edge], ['Red/Black, Odd/Even, 1-18/19-36', '1:1', edge], ...(american ? [['Top Line (0,00,1,2,3)', '6:1', '7.89%']] : [])],
      mount(root) {
        const T = C.chipTable();
        const msg = C.msg();
        const hist = h('div', { class: 'history-strip' });
        let busy = false, alive = true, rot = 0, raf = 0;
        const cv = h('canvas', { width: 520, height: 520, class: 'rwheel' });
        const ctx = cv.getContext('2d');
        const seg = (Math.PI * 2) / wheel.length;
        let resultIdx = -1;
        // A real wheel: mahogany bowl and ball track (static), rotor with pockets, frets, numbers, cone and turret
        // (pre-rendered, rotated each frame) and an ivory ball that runs against the spin and drops into the pocket.
        const N = 520, CX = 260, CY = 260, R_RIM = 254, R_TRACK = 214, R_POCK = 186, R_NUM = 166, R_CONE = 112;
        const ball = { show: false, a: -Math.PI / 2, r: R_NUM - 26 };
        const mk = () => { const c = document.createElement('canvas'); c.width = N; c.height = N; return c; };
        const bowl = mk(), rotor = mk();
        (function paintBowl() {
          const g = bowl.getContext('2d');
          let gr = g.createRadialGradient(CX - 60, CY - 70, 40, CX, CY, R_RIM); gr.addColorStop(0, '#8a3b1b'); gr.addColorStop(0.7, '#5a210e'); gr.addColorStop(1, '#2a0c04');
          g.fillStyle = gr; g.beginPath(); g.arc(CX, CY, R_RIM, 0, Math.PI * 2); g.fill();
          for (let k = 0; k < 60; k++) { const rr = R_TRACK + 4 + Math.random() * (R_RIM - R_TRACK - 8), a = Math.random() * Math.PI * 2; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,190,140' : '0,0,0'},${0.04 + Math.random() * 0.06})`; g.lineWidth = 0.6 + Math.random(); g.beginPath(); g.arc(CX, CY, rr, a, a + 0.5 + Math.random()); g.stroke(); }
          gr = g.createRadialGradient(CX, CY, R_POCK, CX, CY, R_TRACK + 6); gr.addColorStop(0, '#120804'); gr.addColorStop(0.6, '#3b1a0b'); gr.addColorStop(1, '#6b3218'); // polished ball track
          g.fillStyle = gr; g.beginPath(); g.arc(CX, CY, R_TRACK + 6, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(255,220,180,.18)'; g.lineWidth = 1.5; g.beginPath(); g.arc(CX, CY, R_TRACK + 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
          for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + Math.PI / 8, x = CX + Math.cos(a) * (R_TRACK - 10), y = CY + Math.sin(a) * (R_TRACK - 10); // diamond deflectors
            g.save(); g.translate(x, y); g.rotate(a); const dg = g.createLinearGradient(-8, 0, 8, 0); dg.addColorStop(0, '#8f6620'); dg.addColorStop(0.5, '#fbe7a6'); dg.addColorStop(1, '#8f6620'); g.fillStyle = dg; g.beginPath(); g.moveTo(-9, 0); g.lineTo(0, -4); g.lineTo(9, 0); g.lineTo(0, 4); g.closePath(); g.fill(); g.restore(); }
          g.strokeStyle = '#c99a3a'; g.lineWidth = 3; g.beginPath(); g.arc(CX, CY, R_RIM - 3, 0, Math.PI * 2); g.stroke();
        })();
        (function paintRotor() {
          const g = rotor.getContext('2d'), n = wheel.length;
          g.fillStyle = '#1a0d06'; g.beginPath(); g.arc(CX, CY, R_POCK + 2, 0, Math.PI * 2); g.fill();
          wheel.forEach((num, i) => {
            const a0 = i * seg - Math.PI / 2, a1 = a0 + seg, c = colorOf(num), base = c === 'g' ? '#0f7a3c' : c === 'r' ? '#b4111c' : '#16181c';
            g.beginPath(); g.arc(CX, CY, R_POCK, a0, a1); g.arc(CX, CY, R_CONE + 18, a1, a0, true); g.closePath();
            const pg = g.createRadialGradient(CX, CY, R_CONE, CX, CY, R_POCK); pg.addColorStop(0, base); pg.addColorStop(1, c === 'b' ? '#2c3036' : c === 'r' ? '#d9343c' : '#1aa556'); g.fillStyle = pg; g.fill();
            g.save(); g.translate(CX, CY); g.rotate(a0 + seg / 2 + Math.PI / 2); g.fillStyle = '#f4efe2'; g.font = '700 17px Georgia,"Times New Roman",serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 0, -R_NUM); g.restore();
            g.beginPath(); g.arc(CX, CY, R_NUM - 16, a0 + 0.004, a1 - 0.004); g.arc(CX, CY, R_CONE + 18, a1 - 0.004, a0 + 0.004, true); g.closePath(); g.fillStyle = 'rgba(0,0,0,.28)'; g.fill(); // pocket floor
          });
          for (let i = 0; i < n; i++) { const a = i * seg - Math.PI / 2; g.strokeStyle = '#d6aa4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(CX + Math.cos(a) * (R_CONE + 18), CY + Math.sin(a) * (R_CONE + 18)); g.lineTo(CX + Math.cos(a) * R_POCK, CY + Math.sin(a) * R_POCK); g.stroke(); }
          g.strokeStyle = '#d6aa4a'; g.lineWidth = 2.5; [R_POCK, R_NUM - 16, R_CONE + 18].forEach((r) => { g.beginPath(); g.arc(CX, CY, r, 0, Math.PI * 2); g.stroke(); });
          let cg = g.createRadialGradient(CX - 30, CY - 34, 10, CX, CY, R_CONE + 18); cg.addColorStop(0, '#9c4a22'); cg.addColorStop(0.75, '#5b230d'); cg.addColorStop(1, '#2e0f04'); // wooden cone
          g.fillStyle = cg; g.beginPath(); g.arc(CX, CY, R_CONE + 16, 0, Math.PI * 2); g.fill();
          for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; g.save(); g.translate(CX, CY); g.rotate(a); // brass turret
            const tg = g.createLinearGradient(0, -6, 0, 6); tg.addColorStop(0, '#fbe7a6'); tg.addColorStop(0.5, '#c4932f'); tg.addColorStop(1, '#6e4710'); g.fillStyle = tg; g.fillRect(0, -5, 58, 10);
            const kg = g.createRadialGradient(56, -3, 1, 58, 0, 11); kg.addColorStop(0, '#fff3c8'); kg.addColorStop(0.5, '#d7a845'); kg.addColorStop(1, '#6b4510'); g.fillStyle = kg; g.beginPath(); g.arc(60, 0, 10, 0, Math.PI * 2); g.fill(); g.restore(); }
          cg = g.createRadialGradient(CX - 8, CY - 10, 2, CX, CY, 26); cg.addColorStop(0, '#fff3c8'); cg.addColorStop(0.5, '#d7a845'); cg.addColorStop(1, '#6b4510'); g.fillStyle = cg; g.beginPath(); g.arc(CX, CY, 24, 0, Math.PI * 2); g.fill();
        })();
        function draw() {
          ctx.clearRect(0, 0, N, N);
          ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10; ctx.drawImage(bowl, 0, 0); ctx.restore();
          ctx.save(); ctx.translate(CX, CY); ctx.rotate(rot); ctx.drawImage(rotor, -CX, -CY); ctx.restore();
          const gl = ctx.createRadialGradient(CX - 90, CY - 90, 10, CX - 50, CY - 50, R_TRACK); gl.addColorStop(0, 'rgba(255,255,255,.14)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(CX, CY, R_TRACK, 0, Math.PI * 2); ctx.fill();
          if (ball.show) {
            const x = CX + Math.cos(ball.a) * ball.r, y = CY + Math.sin(ball.a) * ball.r;
            ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x + 2, y + 3, 8, 0, Math.PI * 2); ctx.fill();
            const bg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 9); bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.6, '#ece7da'); bg.addColorStop(1, '#a8a294');
            ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
          }
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
        async function spin() {
          if (busy || !T.ready()) return;
          busy = true; T.lock(true); spinBtn.disabled = true;
          const r = await C.try(() => C.play(id, null, { bets: T.bets }));
          if (!r) { busy = false; T.lock(false); spinBtn.disabled = false; return; }
          msg.set('No more bets…'); T.mark([]);
          const k = r.result.index;
          const target = ((-(k + 0.5) * seg) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const curMod = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const delta = ((target - curMod) + Math.PI * 2) % (Math.PI * 2);
          const start = rot, end = rot + Math.PI * 2 * 5 + delta, t0 = performance.now(), dur = 5200, bounces = 2 + Math.floor(L.random() * 3);
          ball.show = true;
          const step = (t) => {
            if (!alive) return;
            const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
            rot = start + (end - start) * e;
            const pocketA = -Math.PI / 2 + (rot - end); // the winning pocket's angle right now (it reaches the top at the end)
            if (p < 0.62) { const q = p / 0.62; ball.r = R_TRACK - 8; ball.a = -Math.PI / 2 - (1 - Math.pow(1 - q, 2)) * Math.PI * 2 * 4 - (1 - q) * 3; }
            else { const q = (p - 0.62) / 0.38, drop = Math.min(1, q * 1.6), bounce = Math.abs(Math.sin(q * Math.PI * bounces)) * (1 - q) * 22;
              ball.r = R_TRACK - 8 - (R_TRACK - 8 - (R_NUM - 26)) * drop + bounce; ball.a = pocketA - (1 - Math.min(1, q * 1.25)) * 0.9; if (q > 0.8) ball.a = pocketA; }
            draw();
            if (p < 1) raf = requestAnimationFrame(step); else done(k, r);
          };
          raf = requestAnimationFrame(step);
        }
        function done(k, r) {
          const n = wheel[k]; resultIdx = k; busy = false; draw();
          const pay = r.payout;
          C.settle(r);
          T.mark(['n:' + n, ...r.result.winners]);
          const c = colorOf(n);
          hist.prepend(h('span', { class: 'pill ' + c }, String(n)));
          while (hist.children.length > 14) hist.lastChild.remove();
          msg.set(`${n} ${c === 'r' ? 'Red' : c === 'b' ? 'Black' : 'Green'}: ` + (pay ? `you win ${C.fmt(pay)}` : 'no win'), pay ? 'win' : 'lose');
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
