/* Big Six Wheel: a 54-segment money wheel. The wheel is drawn like the real thing: lacquered wooden rim, brass ring,
 * colour-coded bill panels with upright denominations, brass pegs and a leather clapper that ticks against them.
 * The face is rendered once to an offscreen canvas and rotated, so spinning stays smooth on phones. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const pattern = L.big6Wheel();
  const S = Object.fromEntries(L.BIG6.map((s) => [s.id, s]));
  const FACE = { // panel colour, ink colour, label
    1: ['#efe7d3', '#2d4a2b', '1'], 2: ['#4f86cf', '#ffffff', '2'], 5: ['#3f9461', '#ffffff', '5'], 10: ['#d8a332', '#3b2508', '10'],
    20: ['#c9572f', '#ffffff', '20'], joker: ['#a3223a', '#ffe9a8', 'JOKER'], logo: ['#4b2f91', '#ffe9a8', 'K'],
  };
  const SEG = (Math.PI * 2) / 54;
  const N = 600, CX = N / 2, CY = N / 2 + 6, R_RIM = 286, R_BRASS = 262, R_FACE = 252, R_HUB = 64;

  function wood(g, CX, CY, r0, r1) {
    const grd = g.createRadialGradient(CX - 60, CY - 80, r0 * 0.2, CX, CY, r1);
    grd.addColorStop(0, '#8a3b1b'); grd.addColorStop(0.6, '#5e2410'); grd.addColorStop(1, '#2e0f05');
    g.fillStyle = grd; g.beginPath(); g.arc(CX, CY, r1, 0, Math.PI * 2); g.arc(CX, CY, r0, 0, Math.PI * 2, true); g.fill();
    g.save(); g.beginPath(); g.arc(CX, CY, r1, 0, Math.PI * 2); g.arc(CX, CY, r0, 0, Math.PI * 2, true); g.clip(); // grain
    for (let k = 0; k < 70; k++) { const rr = r0 + (r1 - r0) * Math.random(), a = Math.random() * Math.PI * 2; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,200,150' : '20,5,0'},${0.04 + Math.random() * 0.06})`; g.lineWidth = 0.6 + Math.random() * 1.4; g.beginPath(); g.arc(CX, CY, rr, a, a + 0.4 + Math.random() * 1.6); g.stroke(); }
    g.restore();
  }
  function brassRing(g, CX, CY, r0, r1) {
    const grd = g.createLinearGradient(CX - r1, CY - r1, CX + r1, CY + r1);
    grd.addColorStop(0, '#f7dc8f'); grd.addColorStop(0.35, '#b88a2e'); grd.addColorStop(0.55, '#fbe7a6'); grd.addColorStop(0.8, '#8f6620'); grd.addColorStop(1, '#e2bf63');
    g.fillStyle = grd; g.beginPath(); g.arc(CX, CY, r1, 0, Math.PI * 2); g.arc(CX, CY, r0, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = 'rgba(60,35,5,.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(CX, CY, r1, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(CX, CY, r0, 0, Math.PI * 2); g.stroke();
  }
  /** Static parts: shadow, rim, brass ring. */
  function renderFrame() {
    const c = document.createElement('canvas'); c.width = N; c.height = N + 10; const g = c.getContext('2d');
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 28; g.shadowOffsetY = 12; g.fillStyle = '#2e0f05'; g.beginPath(); g.arc(CX, CY, R_RIM, 0, Math.PI * 2); g.fill(); g.restore();
    wood(g, CX, CY, R_BRASS, R_RIM);
    g.strokeStyle = 'rgba(255,210,160,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(CX, CY, R_RIM - 2, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    for (let k = 0; k < 18; k++) { const a = k * Math.PI * 2 / 18, x = CX + Math.cos(a) * (R_RIM - 12), y = CY + Math.sin(a) * (R_RIM - 12); // rim studs
      const s = g.createRadialGradient(x - 2, y - 2, 0.5, x, y, 5); s.addColorStop(0, '#fff3c8'); s.addColorStop(0.5, '#c99a3a'); s.addColorStop(1, '#5c3b0a'); g.fillStyle = s; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
    brassRing(g, CX, CY, R_FACE, R_BRASS);
    return c;
  }
  /** The rotating face: 54 panels, labels, pegs and the hub. Drawn with segment 0 centred at the top. */
  function renderFace() {
    const c = document.createElement('canvas'); c.width = N; c.height = N; const g = c.getContext('2d'), cx = N / 2, cy = N / 2;
    pattern.forEach((id, i) => {
      const [bg, ink, label] = FACE[id], a0 = -Math.PI / 2 + (i - 0.5) * SEG, a1 = a0 + SEG;
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R_FACE, a0, a1); g.closePath();
      const grd = g.createRadialGradient(cx, cy, R_HUB, cx, cy, R_FACE); grd.addColorStop(0, shade(bg, -0.25)); grd.addColorStop(0.55, bg); grd.addColorStop(1, shade(bg, 0.12));
      g.fillStyle = grd; g.fill();
      g.strokeStyle = 'rgba(30,15,5,.55)'; g.lineWidth = 1.2; g.stroke();
      g.save(); g.translate(cx, cy); g.rotate(a0 + SEG / 2 + Math.PI / 2); // now "up" points to the rim
      g.strokeStyle = shade(ink, ink === '#ffffff' ? -0.05 : 0.2); g.globalAlpha = 0.55; g.lineWidth = 1; // inner bill frame
      const fw = Math.tan(SEG / 2) * (R_FACE - 18) * 2 - 6, fwi = Math.tan(SEG / 2) * (R_HUB + 26) * 2 - 4;
      g.beginPath(); g.moveTo(-fw / 2, -(R_FACE - 18)); g.lineTo(fw / 2, -(R_FACE - 18)); g.lineTo(fwi / 2, -(R_HUB + 26)); g.lineTo(-fwi / 2, -(R_HUB + 26)); g.closePath(); g.stroke();
      g.globalAlpha = 1; g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (id === 'joker' || id === 'logo') {
        if (id === 'logo') { g.beginPath(); g.arc(0, -(R_FACE - 50), 14, 0, Math.PI * 2); g.strokeStyle = ink; g.lineWidth = 2; g.stroke(); g.font = '24px Anton, Impact, sans-serif'; g.fillText('K', 0, -(R_FACE - 49)); }
        else { star(g, 0, -(R_FACE - 48), 12, ink); }
        g.font = '15px Anton, Impact, sans-serif'; const word = id === 'joker' ? 'JOKER' : 'KRUSH';
        [...word].forEach((ch, k) => g.fillText(ch, 0, -(R_FACE - 82) + k * 16));
      } else {
        g.font = `${label.length > 1 ? 28 : 34}px Anton, Impact, sans-serif`; g.fillText(label, 0, -(R_FACE - 44));
        g.font = '15px Anton, Impact, sans-serif'; g.fillText('$', 0, -(R_FACE - 74));
        g.globalAlpha = 0.5; g.beginPath(); g.ellipse(0, -(R_HUB + 70), 6, 16, 0, 0, Math.PI * 2); g.strokeStyle = ink; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1; // the bill's portrait oval
      }
      g.restore();
    });
    for (let i = 0; i < 54; i++) { // brass pegs on the segment lines
      const a = -Math.PI / 2 + (i - 0.5) * SEG, x = cx + Math.cos(a) * (R_FACE - 8), y = cy + Math.sin(a) * (R_FACE - 8);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 1.5, y + 2, 4.2, 0, Math.PI * 2); g.fill();
      const s = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 4.5); s.addColorStop(0, '#fff6d4'); s.addColorStop(0.45, '#d7a845'); s.addColorStop(1, '#6b4510'); g.fillStyle = s; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    wood(g, cx, cy, R_HUB - 2, R_HUB + 18); // hub: wooden collar, brass cap
    g.save();
    const cap = g.createRadialGradient(cx - 18, cy - 20, 4, cx, cy, R_HUB); cap.addColorStop(0, '#fff1bf'); cap.addColorStop(0.45, '#d6a541'); cap.addColorStop(1, '#6e4710');
    g.fillStyle = cap; g.beginPath(); g.arc(cx, cy, R_HUB - 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(70,40,5,.7)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R_HUB - 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(70,40,5,.85)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '22px Anton, Impact, sans-serif'; g.fillText('BIG SIX', cx, cy - 4);
    g.font = '10px Anton, Impact, sans-serif'; g.fillText('KRUSH CASINO', cx, cy + 16);
    g.restore();
    return c;
    function star(gg, x, y, r, col) { gg.save(); gg.fillStyle = col; gg.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.45 : r, aa = -Math.PI / 2 + k * Math.PI / 5; gg.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); } gg.closePath(); gg.fill(); gg.restore(); }
  }
  function shade(hex, k) { // lighten (k>0) or darken (k<0) a #rrggbb colour
    const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k)));
    return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  C.register({
    n: 20, id: 'bigsix', name: 'Big Six Wheel', icon: '🎡', cat: 'dice', edge: '11.1–24.07%',
    blurb: 'Money wheel with 54 slots. Joker & logo pay 40:1.',
    rules: '<p>A 54-segment money wheel. Bet on the symbol you think the clapper will stop on; the payout equals the symbol value ($5 pays 5:1). Joker and the Krush logo pay 40:1.</p>',
    edges: L.BIG6.map((s) => [`${s.label} (${s.count} of 54)`, s.pays + ':1', ((1 - (s.count / 54) * (s.pays + 1)) * 100).toFixed(2) + '%']),
    mount(root) {
      const T = C.chipTable();
      const msg = C.msg();
      const hist = h('div', { class: 'history-strip b6-hist' });
      const cv = h('canvas', { width: N, height: N + 50, class: 'b6-cv' });
      const ctx = cv.getContext('2d');
      let frame = null, face = null, rot = 0, flap = 0, busy = false, alive = true, raf = 0, lastPeg = 0;
      const build = () => { frame = renderFrame(); face = renderFace(); draw(); };
      function draw() {
        if (!frame) return;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(frame, 0, 34);
        ctx.save(); ctx.translate(CX, CY + 34); ctx.rotate(rot); ctx.drawImage(face, -N / 2, -N / 2); ctx.restore();
        const gl = ctx.createRadialGradient(CX - 110, CY - 70, 10, CX - 60, CY - 40, R_FACE + 60); // lacquer gloss
        gl.addColorStop(0, 'rgba(255,255,255,.20)'); gl.addColorStop(0.45, 'rgba(255,255,255,.05)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(CX, CY + 34, R_FACE, 0, Math.PI * 2); ctx.fill();
        // clapper: brass mount and a leather flap that flicks against the pegs
        ctx.save(); ctx.translate(CX, 34 + CY - R_FACE - 30);
        const m = ctx.createLinearGradient(-26, 0, 26, 0); m.addColorStop(0, '#8f6620'); m.addColorStop(0.5, '#fbe7a6'); m.addColorStop(1, '#8f6620');
        ctx.fillStyle = m; ctx.strokeStyle = '#4a2f06'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-26, -22, 52, 26, 6); ctx.fill(); ctx.stroke();
        ctx.rotate(flap); ctx.fillStyle = '#5a1420'; ctx.strokeStyle = '#2a070d'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(3, 46); ctx.lineTo(-3, 46); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-5, 2, 3, 36);
        ctx.restore();
      }
      document.fonts && document.fonts.load('30px Anton').then(() => { if (alive) build(); }).catch(build);
      setTimeout(() => { if (!frame) build(); }, 600);
      const spinBtn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      root.appendChild(h('div', { class: 'roulette b6-wrap' },
        h('div', { class: 'rleft b6-left' }, cv),
        h('div', { class: 'rright' }, h('div', { class: 'felt b6' }, L.BIG6.map((s) => T.spot(s.id, [h('b', null, s.id === 'logo' ? 'KRUSH' : s.label), h('small', null, `pays ${s.pays} to 1`)], 'b6spot b6-' + s.id, ''))),
          h('div', { class: 'stage', style: 'min-height:0;margin-top:12px' }, msg.el, spinBtn, hist), T.bar)));
      root.querySelectorAll('.b6spot').forEach((e) => { const [bg, ink] = FACE[e.dataset.id]; e.style.setProperty('--b6bg', bg); e.style.setProperty('--b6ink', ink); });
      async function spin() {
        if (busy || !T.ready()) return;
        busy = true; T.lock(true); spinBtn.disabled = true;
        const r = await C.try(() => C.play('bigsix', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); spinBtn.disabled = false; return; }
        T.mark([]); msg.set('Spinning…');
        const k = r.result.index, TAU = Math.PI * 2;
        const target = ((-k * SEG) % TAU + TAU) % TAU, cur = ((rot % TAU) + TAU) % TAU;
        const start = rot, end = rot + TAU * 4 + ((target - cur + TAU) % TAU) + (L.random() - 0.5) * SEG * 0.6, t0 = performance.now(), dur = 6200;
        const stepf = (t) => {
          if (!alive) return;
          const p = Math.min(1, (t - t0) / dur); rot = start + (end - start) * (1 - Math.pow(1 - p, 3.4));
          const peg = Math.floor((rot + SEG / 2) / SEG);
          if (peg !== lastPeg) { lastPeg = peg; flap = -0.55; if (p < 0.985) C.sfx && C.sfx('tick'); }
          flap *= 0.82; draw();
          if (p < 1) raf = requestAnimationFrame(stepf); else { flap = 0; draw(); done(pattern[k], r); }
        };
        raf = requestAnimationFrame(stepf);
      }
      function done(id, r) {
        const pay = r.payout;
        C.settle(r);
        T.mark([id]);
        hist.prepend(h('span', { class: 'pill', style: `background:${FACE[id][0]};color:${FACE[id][1]}` }, id === 'logo' ? 'KRUSH' : S[id].label));
        while (hist.children.length > 14) hist.lastChild.remove();
        msg.set(`${id === 'logo' ? 'Krush logo' : S[id].label}: ` + (pay ? `win ${C.fmt(pay)}` : 'no win'), pay ? 'win' : 'lose');
        busy = false; T.lock(false); spinBtn.disabled = false;
      }
      return () => { alive = false; cancelAnimationFrame(raf); };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.b6-cv{display:block;width:100%;max-width:440px;margin:0 auto}
  .b6-left{display:flex;align-items:center;justify-content:center}
  .b6{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;padding:12px !important}
  .b6spot{min-height:86px;font-size:18px;background:var(--b6bg) !important;color:var(--b6ink) !important;border:2px solid rgba(0,0,0,.35) !important;border-radius:10px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.22),0 2px 0 rgba(0,0,0,.35)}
  .b6spot b{font:400 30px/1 Anton,Impact,sans-serif;letter-spacing:.02em}.b6spot small{opacity:.8;font-weight:700;letter-spacing:.02em}
  .b6spot.b6-joker b,.b6spot.b6-logo b{font-size:24px}
  .b6spot:hover{filter:brightness(1.08)}.b6spot.win{box-shadow:0 0 0 3px var(--brand),0 0 22px rgba(34,229,139,.55) !important}
  .b6-hist .pill{font-weight:800;border:1px solid rgba(0,0,0,.3)}`;
  document.head.appendChild(css);
})();
