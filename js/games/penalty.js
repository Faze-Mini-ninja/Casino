/* Penalty Shootout. A night-match broadcast shot from behind the ball: stadium, floodlights, LED boards, a goal with a
 * depth net, an animated goalkeeper and a ball that flies, spins and either ripples the net or is pushed away.
 * Game logic and payouts are on the server; this file only shows them. Scene coordinates are a fixed 800×460 frame. */
(function () {
  'use strict';
  const C = Casino, L = Lib, h = C.h;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 800, H = 460, GL = 320, X0 = 148, X1 = 652, TOP = 150, SPOT = [400, 440];
  const ladderRow = (n, multOf) => h('div', { class: 'ladder' }, Array.from({ length: n }, (_, i) => h('span', { class: 'lstep', 'data-i': i }, multOf(i + 1).toFixed(2) + '×')));
  const markLadder = (el, k, bust) => el.querySelectorAll('.lstep').forEach((s, i) => { s.classList.toggle('done', i < k); s.classList.toggle('next', i === k && !bust); s.classList.toggle('bust', bust && i === k); });
  const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // fixed crowd every time

  /* ---------- the stadium, drawn once ---------- */
  function stadium() {
    const c = document.createElement('canvas'), S = 2; c.width = W * S; c.height = H * S;
    const g = c.getContext('2d'); g.scale(S, S); const r = rnd(7);
    let grd = g.createLinearGradient(0, 0, 0, 200); grd.addColorStop(0, '#04080f'); grd.addColorStop(1, '#0d1a29');
    g.fillStyle = grd; g.fillRect(0, 0, W, 200);
    const tiers = [[30, 84, 3.0], [88, 136, 3.6], [140, 190, 4.2]]; // crowd: three tiers of heads and shirts
    const shirts = ['#c0392b', '#e8c547', '#2e6fd6', '#e9edf1', '#2c9a57', '#7d3fa8', '#d9772b', '#1b2633', '#b3243c'];
    for (const [y0, y1, sz] of tiers) {
      g.fillStyle = '#0f1b28'; g.fillRect(0, y0, W, y1 - y0);
      for (let y = y0 + sz; y < y1 - 1; y += sz * 1.55) for (let x = (y * 7) % (sz * 1.6); x < W; x += sz * (1.35 + r() * 0.5)) {
        g.fillStyle = shirts[(r() * shirts.length) | 0]; g.globalAlpha = 0.55 + r() * 0.35; g.fillRect(x, y + sz * 0.5, sz * 1.1, sz * 0.9);
        g.fillStyle = r() < 0.5 ? '#d9a77e' : '#8a5a3c'; g.beginPath(); g.arc(x + sz * 0.55, y + sz * 0.2, sz * 0.42, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1; g.fillStyle = 'rgba(4,8,15,.35)'; g.fillRect(0, y0, W, (y1 - y0) * 0.35);
      g.fillStyle = '#1d2c3c'; g.fillRect(0, y1, W, 3); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, y1, W, 1);
    }
    for (let k = 0; k < 26; k++) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(r() * W, 40 + r() * 145, 1.4, 1.4); } // phone lights
    grd = g.createLinearGradient(0, 30, 0, 190); grd.addColorStop(0, 'rgba(4,8,15,.55)'); grd.addColorStop(1, 'rgba(4,8,15,0)'); g.fillStyle = grd; g.fillRect(0, 30, W, 160);
    for (const fx of [70, 730]) { // floodlights
      grd = g.createRadialGradient(fx, 8, 2, fx, 8, 170); grd.addColorStop(0, 'rgba(255,255,240,.95)'); grd.addColorStop(0.08, 'rgba(255,252,225,.55)'); grd.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = grd; g.fillRect(fx - 180, 0, 360, 220);
      g.fillStyle = '#fffef4'; for (let i = -2; i <= 2; i++) for (let j = 0; j < 2; j++) g.fillRect(fx + i * 9 - 3, 4 + j * 8, 6, 5);
    }
    g.fillStyle = '#05080c'; g.fillRect(0, 190, W, 27); // LED advertising boards
    g.save(); g.beginPath(); g.rect(0, 191, W, 25); g.clip();
    const ads = [['KRUSH.CASINO', '#22e58b'], ['PLAY RESPONSIBLY · 18+', '#e8eef5'], ['PvP ARENA', '#ffd257'], ['LIVE BLACKJACK', '#e8eef5']];
    g.font = '800 15px system-ui,-apple-system,Segoe UI,Arial,sans-serif'; g.textBaseline = 'middle';
    let x = 8, k = 0; while (x < W) { const [t, col] = ads[k++ % ads.length]; g.shadowColor = col; g.shadowBlur = 8; g.fillStyle = col; g.fillText(t, x, 204); x += g.measureText(t).width + 46; g.shadowBlur = 0; g.fillStyle = '#26323e'; g.fillRect(x - 25, 193, 2, 21); }
    g.restore(); g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(0, 190, W, 1);
    grd = g.createLinearGradient(0, 217, 0, H); grd.addColorStop(0, '#2d7f39'); grd.addColorStop(1, '#1c5f29'); g.fillStyle = grd; g.fillRect(0, 217, W, H - 217); // pitch
    for (let i = 0; i < 9; i++) { const a = 217 + (H - 217) * Math.pow(i / 9, 1.55), b = 217 + (H - 217) * Math.pow((i + 1) / 9, 1.55); g.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)'; g.fillRect(0, a, W, b - a); }
    g.strokeStyle = 'rgba(244,248,240,.82)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(0, GL + 1); g.lineTo(W, GL + 1); g.stroke(); // goal line
    g.lineWidth = 3.6; g.beginPath(); g.moveTo(0, 378); g.lineTo(W, 378); g.stroke(); // six-yard line
    g.fillStyle = 'rgba(244,248,240,.85)'; g.beginPath(); g.ellipse(SPOT[0], SPOT[1] + 6, 9, 3.2, 0, 0, Math.PI * 2); g.fill(); // penalty spot
    // the goal: net first (behind), then posts
    const BX0 = X0 + 42, BX1 = X1 - 42, BT = TOP + 20, BB = GL - 16;
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.moveTo(X0, GL); g.lineTo(BX0, BB); g.lineTo(BX1, BB); g.lineTo(X1, GL); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(235,240,245,.42)'; g.lineWidth = 0.9;
    for (let xx = BX0; xx <= BX1; xx += 12) { g.beginPath(); g.moveTo(xx, BT); g.lineTo(xx, BB); g.stroke(); } // back panel mesh
    for (let yy = BT; yy <= BB; yy += 11) { g.beginPath(); g.moveTo(BX0, yy); g.lineTo(BX1, yy); g.stroke(); }
    for (let k2 = 0; k2 <= 10; k2++) { const t = k2 / 10; // side and roof panels
      g.beginPath(); g.moveTo(X0, TOP + (GL - TOP) * t); g.lineTo(BX0, BT + (BB - BT) * t); g.stroke();
      g.beginPath(); g.moveTo(X1, TOP + (GL - TOP) * t); g.lineTo(BX1, BT + (BB - BT) * t); g.stroke();
      g.beginPath(); g.moveTo(X0 + (X1 - X0) * t, TOP); g.lineTo(BX0 + (BX1 - BX0) * t, BT); g.stroke(); }
    for (let k3 = 1; k3 < 4; k3++) { const t = k3 / 4; g.beginPath(); g.moveTo(X0 + (BX0 - X0) * t, TOP + (BT - TOP) * t); g.lineTo(X0 + (BX0 - X0) * t, GL + (BB - GL) * t); g.stroke(); g.beginPath(); g.moveTo(X1 + (BX1 - X1) * t, TOP + (BT - TOP) * t); g.lineTo(X1 + (BX1 - X1) * t, GL + (BB - GL) * t); g.stroke(); }
    const post = (x, y, w, hh) => { const pg = g.createLinearGradient(x, 0, x + w, 0); pg.addColorStop(0, '#c9ced4'); pg.addColorStop(0.35, '#ffffff'); pg.addColorStop(1, '#aab1b9'); g.fillStyle = pg; g.fillRect(x, y, w, hh); };
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(X0 + 4, GL + 2, 14, 3, 0, 0, Math.PI * 2); g.ellipse(X1 + 4, GL + 2, 14, 3, 0, 0, Math.PI * 2); g.fill();
    post(X0 - 8, TOP - 8, 9, GL - TOP + 9); post(X1 - 1, TOP - 8, 9, GL - TOP + 9);
    const cb = g.createLinearGradient(0, TOP - 8, 0, TOP + 1); cb.addColorStop(0, '#ffffff'); cb.addColorStop(1, '#aab1b9'); g.fillStyle = cb; g.fillRect(X0 - 8, TOP - 8, X1 - X0 + 17, 9);
    grd = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 560); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.45)'); g.fillStyle = grd; g.fillRect(0, 0, W, H); // vignette
    return c;
  }

  /* ---------- the goalkeeper: limbs as rounded strokes, posed by joint positions (feet at 0,0) ---------- */
  const POSE = {
    ready: { head: [0, -129], sh: [[-15, -111], [15, -111]], el: [[-31, -100], [31, -100]], ha: [[-43, -113], [43, -113]], hip: [[-8, -64], [8, -64]], kn: [[-17, -35], [17, -35]], ft: [[-23, -4], [23, -4]] },
    reach: { head: [0, -129], sh: [[-14, -111], [14, -111]], el: [[-17, -139], [15, -141]], ha: [[-19, -163], [17, -165]], hip: [[-8, -64], [8, -64]], kn: [[-8, -34], [12, -33]], ft: [[-4, -3], [20, -1]] },
    jump: { head: [0, -129], sh: [[-15, -111], [15, -111]], el: [[-22, -140], [22, -140]], ha: [[-24, -164], [24, -164]], hip: [[-8, -64], [8, -64]], kn: [[-15, -44], [15, -44]], ft: [[-11, -22], [11, -22]] },
  };
  const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => mix(v, b[i], t)) : a + (b - a) * t);
  const lerpPose = (a, b, t) => Object.fromEntries(Object.keys(a).map((k) => [k, mix(a[k], b[k], t)]));
  function keeperSvg() {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pk-keeper');
    g.innerHTML = `<ellipse class="pk-kshadow" cx="0" cy="2" rx="34" ry="6" fill="rgba(0,0,0,.4)"/>
      <g class="pk-body">
        <line data-l="lt" stroke="#14181f" stroke-width="13" stroke-linecap="round"/><line data-l="rt" stroke="#14181f" stroke-width="13" stroke-linecap="round"/>
        <line data-l="ls" stroke="#c7ee2f" stroke-width="10" stroke-linecap="round"/><line data-l="rs" stroke="#c7ee2f" stroke-width="10" stroke-linecap="round"/>
        <circle data-f="0" r="6" fill="#f4f6f8" stroke="#14181f" stroke-width="2"/><circle data-f="1" r="6" fill="#f4f6f8" stroke="#14181f" stroke-width="2"/>
        <path data-torso fill="#c7ee2f" stroke="#617a0f" stroke-width="1.5"/>
        <rect data-shorts rx="5" fill="#14181f"/>
        <line data-l="lu" stroke="#c7ee2f" stroke-width="10" stroke-linecap="round"/><line data-l="ru" stroke="#c7ee2f" stroke-width="10" stroke-linecap="round"/>
        <line data-l="lf" stroke="#b6dc22" stroke-width="9" stroke-linecap="round"/><line data-l="rf" stroke="#b6dc22" stroke-width="9" stroke-linecap="round"/>
        <circle data-g="0" r="7.5" fill="#ffffff" stroke="#14181f" stroke-width="2.2"/><circle data-g="1" r="7.5" fill="#ffffff" stroke="#14181f" stroke-width="2.2"/>
        <text data-num font-family="system-ui,Arial,sans-serif" font-weight="900" font-size="15" text-anchor="middle" fill="#14181f">1</text>
        <circle data-head r="11.5" fill="#c58a62" stroke="#5b3a23" stroke-width="1.5"/>
        <path data-hair fill="#2a1b12"/>
      </g>`;
    return g;
  }
  function poseKeeper(g, p) {
    const set = (sel, a, b) => { const e = g.querySelector(sel); e.setAttribute('x1', a[0]); e.setAttribute('y1', a[1]); e.setAttribute('x2', b[0]); e.setAttribute('y2', b[1]); };
    set('[data-l=lt]', p.hip[0], p.kn[0]); set('[data-l=rt]', p.hip[1], p.kn[1]);
    set('[data-l=ls]', p.kn[0], p.ft[0]); set('[data-l=rs]', p.kn[1], p.ft[1]);
    set('[data-l=lu]', p.sh[0], p.el[0]); set('[data-l=ru]', p.sh[1], p.el[1]);
    set('[data-l=lf]', p.el[0], p.ha[0]); set('[data-l=rf]', p.el[1], p.ha[1]);
    ['0', '1'].forEach((i) => { const f = g.querySelector(`[data-f="${i}"]`); f.setAttribute('cx', p.ft[i][0]); f.setAttribute('cy', p.ft[i][1]); const gl = g.querySelector(`[data-g="${i}"]`); gl.setAttribute('cx', p.ha[i][0]); gl.setAttribute('cy', p.ha[i][1]); });
    const [s0, s1] = p.sh, [h0, h1] = p.hip;
    g.querySelector('[data-torso]').setAttribute('d', `M${s0[0] - 3},${s0[1] - 2} Q${(s0[0] + s1[0]) / 2},${s0[1] - 7} ${s1[0] + 3},${s1[1] - 2} L${h1[0] + 4},${h1[1] + 2} L${h0[0] - 4},${h0[1] + 2} Z`);
    const sh = g.querySelector('[data-shorts]'); sh.setAttribute('x', h0[0] - 7); sh.setAttribute('y', h0[1] - 6); sh.setAttribute('width', h1[0] - h0[0] + 14); sh.setAttribute('height', 18);
    const n = g.querySelector('[data-num]'); n.setAttribute('x', (s0[0] + s1[0]) / 2); n.setAttribute('y', (s0[1] + h0[1]) / 2 + 6);
    const hd = g.querySelector('[data-head]'); hd.setAttribute('cx', p.head[0]); hd.setAttribute('cy', p.head[1]);
    g.querySelector('[data-hair]').setAttribute('d', `M${p.head[0] - 12},${p.head[1] - 1} Q${p.head[0] - 11},${p.head[1] - 15} ${p.head[0]},${p.head[1] - 14} Q${p.head[0] + 12},${p.head[1] - 14} ${p.head[0] + 12},${p.head[1] - 2} Q${p.head[0]},${p.head[1] - 8} ${p.head[0] - 12},${p.head[1] - 1}Z`);
  }
  function ballSvg() {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pk-ball');
    g.innerHTML = `<ellipse class="pk-bshadow" rx="15" ry="4" fill="rgba(0,0,0,.4)"/>
      <g class="pk-bbody"><defs><radialGradient id="pkb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".65" stop-color="#e7eaee"/><stop offset="1" stop-color="#9aa3ad"/></radialGradient><clipPath id="pkc"><circle r="14"/></clipPath></defs>
        <circle r="14" fill="url(#pkb)" stroke="#5b636c" stroke-width="1"/>
        <g clip-path="url(#pkc)"><g class="pk-spin" fill="#20252b">
          <path d="M0,-5 L4.8,-1.5 L3,4 L-3,4 L-4.8,-1.5Z"/>
          ${[0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a})" d="M-3,-13 L3,-13 L5.5,-17 L0,-20 L-5.5,-17Z"/>`).join('')}
          ${[36, 108, 180, 252, 324].map((a) => `<path transform="rotate(${a})" d="M-1.2,-9.5 L1.2,-9.5 L0.6,-6.2 L-0.6,-6.2Z" opacity=".55"/>`).join('')}
        </g></g>
        <ellipse cx="-4.5" cy="-6" rx="5" ry="3" fill="rgba(255,255,255,.65)"/></g>`;
    return g;
  }

  /** Pieces for the lobby cover (tools/build-covers.js): stadium image, a diving keeper and a ball, in scene coordinates. */
  C.penaltyArt = () => {
    const k = keeperSvg(); poseKeeper(k, POSE.reach); k.querySelector('.pk-body').setAttribute('transform', 'translate(470,300) scale(1.08) rotate(64 0 -70)'); k.querySelector('.pk-kshadow').setAttribute('transform', 'translate(500,320) scale(1.7,1)');
    const b = ballSvg(); b.querySelector('.pk-bbody').setAttribute('transform', 'translate(560,196) scale(.7)'); b.querySelector('.pk-bshadow').setAttribute('transform', 'translate(560,320) scale(.3)');
    return { bg: stadium().toDataURL('image/jpeg', 0.92), keeper: k.outerHTML, ball: b.outerHTML };
  };
  C.register({
    n: 35, id: 'penalty', name: 'Penalty Shootout', icon: '⚽', cat: 'originals', edge: 'set by admin', round: 'penalty',
    blurb: 'Pick a corner, beat the keeper, five kicks to glory.',
    rules: '<p>Choose where to shoot. The keeper covers one of three zones (two of five on Hard). Every goal raises your multiplier; a save loses the bet. Cash out between kicks, or score all five.</p>',
    edges: [['Normal', 'keeper covers 1 of 3', ''], ['Hard', 'keeper covers 2 of 5', '']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let diff = 'normal', st = null, busy = false, alive = true, raf = 0;
      const dSel = C.select('Difficulty', [['normal', 'Normal (3 zones)'], ['hard', 'Hard (5 zones)']], diff, (v) => { diff = v; build(); });
      const msg = C.msg(), ladder = h('div', { class: 'pk-ladder' });
      const bg = stadium(); bg.className = 'pk-bg';
      const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'pk-fx');
      const ripple = document.createElementNS(NS, 'g'); ripple.setAttribute('class', 'pk-ripple'); ripple.setAttribute('opacity', '0');
      ripple.innerHTML = '<circle r="26" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/><circle r="16" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/><circle r="8" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1"/>';
      const keeper = keeperSvg(), ball = ballSvg();
      svg.append(ripple, keeper, ball);
      const zones = h('div', { class: 'pk-zones' });
      const banner = h('div', { class: 'pk-banner' });
      const scene = h('div', { class: 'pk-scene' }, bg, svg, zones, banner);
      const betBtn = h('button', { class: 'btn big', onclick: () => (st ? cash() : start()) }, 'BET');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, dSel.el, betBtn, h('p', { class: 'muted small' }, 'Place a bet, then tap a part of the goal to shoot.')),
        h('div', { class: 'stage pk-stage' }, scene, ladder, msg.el)));
      Object.assign(zones.style, { left: `${X0 / W * 100}%`, top: `${TOP / H * 100}%`, width: `${(X1 - X0) / W * 100}%`, height: `${(GL - TOP) / H * 100}%` });
      // keeper and ball state
      const K = { x: 400, y: GL, rot: 0, lift: 0, pose: POSE.ready, idle: 0 }, B = { x: SPOT[0], y: SPOT[1], s: 1, spin: 0, gy: SPOT[1] + 6, hide: false };
      function paint() {
        poseKeeper(keeper, K.pose);
        keeper.querySelector('.pk-body').setAttribute('transform', `translate(${K.x},${K.y - K.lift}) scale(1.08) rotate(${K.rot} 0 -70)`);
        keeper.querySelector('.pk-kshadow').setAttribute('transform', `translate(${K.x + (K.rot ? K.rot * 0.6 : 0)},${GL}) scale(${1 + Math.abs(K.rot) / 90},1)`);
        ball.querySelector('.pk-bbody').setAttribute('transform', `translate(${B.x},${B.y}) scale(${B.s})`);
        ball.querySelector('.pk-spin').setAttribute('transform', `rotate(${B.spin})`);
        ball.querySelector('.pk-bshadow').setAttribute('transform', `translate(${B.x},${B.gy}) scale(${B.s * Math.max(0.3, 1 - (B.gy - B.y) / 260)})`);
        ball.style.opacity = B.hide ? 0 : 1;
      }
      const idle = (t) => { if (!alive) return; if (!K.busy) { K.idle = t; K.pose = lerpPose(POSE.ready, { ...POSE.ready, kn: [[-18, -33], [18, -33]], ha: [[-44, -110], [44, -110]] }, (Math.sin(t / 380) + 1) / 2); K.lift = 0; paint(); } raf = requestAnimationFrame(idle); };
      raf = requestAnimationFrame(idle);
      const tween = (dur, fn) => new Promise((res) => { const t0 = performance.now(); const st2 = (t) => { if (!alive) return res(); const p = Math.min(1, (t - t0) / dur); fn(p); paint(); if (p < 1) requestAnimationFrame(st2); else res(); }; requestAnimationFrame(st2); });
      const ease = (p) => 1 - Math.pow(1 - p, 3);
      function build() {
        const z = L.PENALTY[diff].zones;
        zones.innerHTML = ''; zones.style.gridTemplateColumns = `repeat(${z},1fr)`;
        for (let i = 0; i < z; i++) zones.append(h('button', { class: 'pk-zone', 'aria-label': `Shoot at zone ${i + 1} of ${z}`, onclick: () => kick(i) }, h('i')));
        ladder.innerHTML = ''; ladder.append(ladderRow(L.PENALTY_MAX, (k) => L.penaltyMult(diff, k))); markLadder(ladder, st ? st.k : 0, false);
        reset();
      }
      function reset() { Object.assign(K, { x: 400, rot: 0, lift: 0, busy: false, pose: POSE.ready }); Object.assign(B, { x: SPOT[0], y: SPOT[1], s: 1, spin: 0, gy: SPOT[1] + 6, hide: false }); zones.querySelectorAll('.pk-zone').forEach((b) => b.classList.remove('kz', 'shot')); paint(); }
      function show(text, kind) { banner.className = 'pk-banner ' + kind; banner.textContent = text; void banner.offsetWidth; banner.classList.add('in'); }
      build();
      async function start() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('penalty', 'start', { bet: bet.value, diff }));
        busy = false; if (!r) return;
        st = { k: 0 }; build(); scene.classList.add('live'); banner.className = 'pk-banner'; msg.set('Pick your spot');
        bet.disable(true); dSel.sel.disabled = true; betBtn.textContent = 'CASH OUT'; betBtn.disabled = true;
      }
      async function kick(zone) {
        if (!st || busy) return; busy = true; banner.className = 'pk-banner';
        const r = await C.try(() => C.play('penalty', 'kick', { zone }));
        if (!r) { busy = false; return; }
        const z = L.PENALTY[diff].zones, zw = (X1 - X0) / z, cxOf = (i) => X0 + zw * (i + 0.5);
        const kz = r.view.keeper, mid = (z - 1) / 2, saved = r.view.saved;
        zones.children[zone].classList.add('shot');
        // where the ball goes: the zone's centre, high or low; where the keeper goes: his zone (or between two neighbours)
        const tx = cxOf(zone) + (L.random() - 0.5) * zw * 0.35, ty = TOP + (GL - TOP) * (0.22 + L.random() * 0.5);
        const adj = kz.length === 2 && Math.abs(kz[0] - kz[1]) === 1, kxZone = adj ? (kz[0] + kz[1]) / 2 : kz[0];
        if (kz.length === 2 && !adj) zones.children[kz[1]].classList.add('kz');
        const kx = X0 + zw * (kxZone + 0.5), side = Math.sign(kxZone - mid), dx = kx - 400;
        K.busy = true; C.sfx && C.sfx('pop');
        const from = { ...K }, pose0 = K.pose, dive = side === 0 ? POSE.jump : POSE.reach;
        const flight = tween(560, (p) => {
          const e = ease(p); B.x = SPOT[0] + (tx - SPOT[0]) * e; B.gy = SPOT[1] + 6 + (GL - (SPOT[1] + 6)) * e;
          B.y = SPOT[1] + (ty - SPOT[1]) * e - Math.sin(Math.PI * p) * 24; B.s = 1 - 0.56 * e; B.spin = p * 900;
        });
        await C.sleep(90);
        const reach = Math.min(1, Math.abs(dx) / 200);
        await tween(430, (p) => {
          const e = ease(p); K.pose = lerpPose(pose0, dive, e);
          if (side === 0) { K.lift = 36 * Math.sin(Math.PI * Math.min(1, p * 1.1)); K.x = from.x + dx * e; }
          else { K.x = from.x + dx * 0.82 * e; K.rot = side * (58 + 22 * reach) * e; K.lift = (14 + 30 * (ty < 200 ? 1 : 0)) * Math.sin(Math.PI * Math.min(1, p * 0.9)); }
        });
        await flight;
        if (saved) { // pushed away
          C.sfx && C.sfx('lose');
          const sx = B.x, sy = B.y, out = (B.x < 400 ? -1 : 1) * (60 + L.random() * 60);
          await tween(520, (p) => { const e = ease(p); B.x = sx + out * e; B.y = sy + (GL + 30 - sy) * e - Math.sin(Math.PI * p) * 30; B.gy = GL + 30 * e; B.s = 0.44 + 0.2 * e; B.spin = 900 - p * 400; });
          show('SAVED', 'saved'); C.settle(r); markLadder(ladder, st.k, true); msg.set('Saved! The keeper got there.', 'lose');
          busy = false; return end();
        }
        const gx = B.x, gy = B.y; // in the net: a short push back and a ripple
        ripple.setAttribute('transform', `translate(${gx},${gy})`);
        await tween(380, (p) => { B.y = gy + 10 * ease(p); B.s = 0.44 - 0.08 * ease(p); ripple.setAttribute('opacity', String(1 - p)); ripple.setAttribute('transform', `translate(${gx},${gy}) scale(${0.6 + p * 1.2})`); });
        st.k = r.view.k; markLadder(ladder, st.k, false); C.sfx && C.sfx('cash');
        busy = false;
        if (r.done) { C.settle(r); show('GOAL!', 'goal'); msg.set(`Perfect five! ${r.view.mult.toFixed(2)}× · ${C.fmt(r.payout)}`, 'win'); return end(); }
        show('GOAL!', 'goal'); msg.set(`GOAL! ${r.view.mult.toFixed(2)}× · next ${r.view.next.toFixed(2)}×`, 'win'); betBtn.disabled = false;
        setTimeout(() => { if (st && !busy) { reset(); banner.className = 'pk-banner'; } }, 1100);
      }
      async function cash() { if (!st || busy || !st.k) return; busy = true; const r = await C.try(() => C.play('penalty', 'cashout', {})); busy = false; if (r) { C.settle(r); show('CASHED OUT', 'goal'); msg.set(`Cashed out ${r.view.mult.toFixed(2)}× · ${C.fmt(r.payout)}`, 'win'); end(); } }
      function end() { st = null; scene.classList.remove('live'); bet.disable(false); dSel.sel.disabled = false; betBtn.textContent = 'BET'; betBtn.disabled = false; setTimeout(() => { if (!st && alive) reset(); }, 1600); }
      return () => { alive = false; cancelAnimationFrame(raf); };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.pk-stage{gap:12px}
  .pk-scene{position:relative;width:100%;max-width:820px;aspect-ratio:800/460;border-radius:12px;overflow:hidden;box-shadow:0 12px 32px rgba(0,0,0,.45);background:#0d1a29;user-select:none}
  .pk-bg,.pk-fx{position:absolute;inset:0;width:100%;height:100%;display:block}.pk-fx{pointer-events:none}
  .pk-zones{position:absolute;display:grid}
  .pk-zone{appearance:none;border:0;background:transparent;cursor:default;position:relative;padding:0}
  .pk-scene.live .pk-zone{cursor:pointer}
  .pk-zone i{position:absolute;left:50%;top:48%;width:clamp(26px,6vw,46px);aspect-ratio:1;transform:translate(-50%,-50%) scale(.8);border-radius:50%;border:2px dashed rgba(255,255,255,.0);transition:all .15s}
  .pk-scene.live .pk-zone i{border-color:rgba(255,255,255,.35)}
  .pk-scene.live .pk-zone:hover i{border-style:solid;border-color:#fff;background:rgba(255,255,255,.12);transform:translate(-50%,-50%) scale(1)}
  .pk-zone.kz{background:rgba(226,51,90,.18)}
  .pk-banner{position:absolute;left:50%;top:9%;transform:translate(-50%,-20px);opacity:0;padding:8px 26px;border-radius:6px;font:900 italic clamp(20px,4vw,34px)/1 system-ui,-apple-system,Segoe UI,Arial,sans-serif;letter-spacing:.04em;color:#fff;pointer-events:none;transition:all .25s cubic-bezier(.2,.8,.3,1.3);box-shadow:0 8px 20px rgba(0,0,0,.4)}
  .pk-banner.in{opacity:1;transform:translate(-50%,0)}
  .pk-banner.goal{background:linear-gradient(90deg,#14833f,#1fbf5c);border-left:6px solid #c7ee2f}.pk-banner.saved{background:linear-gradient(90deg,#8e1630,#d12d4f);border-left:6px solid #ff9db0}`;
  document.head.appendChild(css);
})();
