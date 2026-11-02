/* Originals: Pump, Penalty, Darts, Horse Race, Cups, Rock Paper Scissors, Red or Black, Colors. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const css = (t) => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); };
  const ladderRow = (n, multOf) => h('div', { class: 'ladder' }, Array.from({ length: n }, (_, i) => h('span', { class: 'lstep', 'data-i': i }, multOf(i + 1).toFixed(2) + '×')));
  const markLadder = (el, k, bust) => el.querySelectorAll('.lstep').forEach((s, i) => { s.classList.toggle('done', i < k); s.classList.toggle('next', i === k && !bust); s.classList.toggle('bust', bust && i === k); });

  /* ---------------- Pump ---------------- */
  C.register({
    n: 34, id: 'pump', name: 'Pump', icon: '●', cat: 'originals', edge: 'set by admin', round: 'pump',
    blurb: 'Pump the balloon for a bigger multiplier. Don’t let it pop.',
    rules: '<p>Every pump raises your multiplier. Any pump can pop the balloon, which loses your bet. Cash out whenever you like. Harder difficulties pop more often and pay more per pump.</p>',
    edges: Object.keys(L.PUMP).map((d) => [d[0].toUpperCase() + d.slice(1), `${Math.round(L.PUMP[d] * 100)}% pop chance per pump`, '']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let diff = 'medium', st = null, busy = false;
      const dSel = C.select('Difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard'], ['expert', 'Expert']], diff, (v) => { diff = v; paint(); });
      const msg = C.msg(), multEl = h('div', { class: 'big-num pump-mult' }, '1.00×');
      const balloon = C.artEl('balloon', 'pump-balloon', '#e53935');
      const ladder = h('div');
      const betBtn = h('button', { class: 'btn big', onclick: () => (st ? cash() : start()) }, 'BET');
      const pumpBtn = h('button', { class: 'btn big blue', onclick: () => pump(), style: 'display:none' }, 'PUMP');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, dSel.el, betBtn),
        h('div', { class: 'stage pump-stage' }, multEl, h('div', { class: 'pump-wrap' }, balloon, h('div', { class: 'pump-string' })), ladder, msg.el, pumpBtn)));
      function paint() { ladder.innerHTML = ''; ladder.append(ladderRow(12, (k) => L.pumpMult(diff, k))); markLadder(ladder, st ? st.k : 0, false); }
      paint();
      const size = (k) => { balloon.style.transform = `scale(${0.55 + Math.min(k, 25) * 0.035})`; };
      size(0);
      async function start() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('pump', 'start', { bet: bet.value, diff }));
        busy = false; if (!r) return;
        st = { k: 0 }; balloon.classList.remove('popped'); size(0); multEl.textContent = '1.00×'; msg.set('Pump it up');
        bet.disable(true); dSel.sel.disabled = true; betBtn.textContent = 'CASH OUT'; betBtn.disabled = true; pumpBtn.style.display = ''; paint();
      }
      async function pump() {
        if (!st || busy) return; busy = true; balloon.classList.add('pumping');
        const r = await C.try(() => C.play('pump', 'pump', {}));
        setTimeout(() => balloon.classList.remove('pumping'), 200); busy = false; if (!r) return;
        if (r.view.popped) { balloon.classList.add('popped'); C.sfx && C.sfx('pop'); C.settle(r); markLadder(ladder, st.k, true); msg.set('POP! The balloon burst', 'lose'); return end(); }
        st.k = r.view.k; size(st.k); multEl.textContent = (r.view.mult || 1).toFixed(2) + '×'; markLadder(ladder, st.k, false); C.sfx && C.sfx('tick');
        if (r.done) return cashed(r);
        betBtn.disabled = false; msg.set(`Next pump: ${r.view.next.toFixed(2)}×`);
      }
      async function cash() { if (!st || busy || !st.k) return; busy = true; const r = await C.try(() => C.play('pump', 'cashout', {})); busy = false; if (r) cashed(r); }
      function cashed(r) { C.settle(r); msg.set(`Cashed out ${r.view.mult.toFixed(2)}× · ${C.fmt(r.payout)}`, 'win'); end(); }
      function end() { st = null; bet.disable(false); dSel.sel.disabled = false; betBtn.textContent = 'BET'; betBtn.disabled = false; pumpBtn.style.display = 'none'; }
    },
  });
  css(`.pump-stage{gap:12px}.pump-mult{font-size:56px}.pump-wrap{position:relative;height:250px;display:grid;place-items:end center}
  .pump-balloon{width:190px;height:190px;transition:transform .25s cubic-bezier(.3,1.6,.5,1);transform-origin:50% 90%}
  .pump-balloon.pumping{filter:brightness(1.15)}.pump-balloon.popped{animation:popb .35s forwards}
  @keyframes popb{60%{transform:scale(1.5);opacity:.6}100%{transform:scale(1.8);opacity:0}}
  .pump-string{width:2px;height:40px;background:#8193a8}
  .ladder{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:640px}
  .lstep{font-size:12px;font-weight:700;padding:5px 9px;border-radius:6px;background:var(--panel3);color:var(--muted)}
  .lstep.done{background:rgba(34,229,139,.18);color:var(--green)}.lstep.next{box-shadow:0 0 0 2px var(--brand);color:var(--text)}.lstep.bust{background:rgba(255,77,99,.25);color:var(--red)}`);

  /* ---------------- Penalty ---------------- */
  C.register({
    n: 35, id: 'penalty', name: 'Penalty Shootout', icon: '⚽', cat: 'originals', edge: 'set by admin', round: 'penalty',
    blurb: 'Pick a corner, beat the keeper, five kicks to glory.',
    rules: '<p>Choose where to shoot. The keeper covers one of three zones (two of five on Hard). Every goal raises your multiplier; a save loses the bet. Cash out between kicks, or score all five.</p>',
    edges: [['Normal', 'keeper covers 1 of 3', ''], ['Hard', 'keeper covers 2 of 5', '']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let diff = 'normal', st = null, busy = false;
      const dSel = C.select('Difficulty', [['normal', 'Normal (3 zones)'], ['hard', 'Hard (5 zones)']], diff, (v) => { diff = v; build(); });
      const msg = C.msg(), ladder = h('div');
      const goal = h('div', { class: 'goal' }), keeper = h('div', { class: 'keeper' }), ball = C.artEl('ball', 'pball');
      const pitch = h('div', { class: 'pitch' }, goal, ball);
      const betBtn = h('button', { class: 'btn big', onclick: () => (st ? cash() : start()) }, 'BET');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, dSel.el, betBtn, h('p', { class: 'muted small' }, 'Tap a zone in the goal to shoot.')),
        h('div', { class: 'stage' }, pitch, ladder, msg.el)));
      function build() {
        const z = L.PENALTY[diff].zones;
        goal.innerHTML = ''; goal.style.gridTemplateColumns = `repeat(${z},1fr)`;
        for (let i = 0; i < z; i++) goal.append(h('button', { class: 'zone', onclick: () => kick(i) }));
        goal.append(keeper); keeper.style.width = `${100 / z}%`; keeper.style.left = `${(100 / z) * Math.floor(z / 2)}%`;
        ladder.innerHTML = ''; ladder.append(ladderRow(L.PENALTY_MAX, (k) => L.penaltyMult(diff, k))); markLadder(ladder, st ? st.k : 0, false);
        ball.style.cssText = '';
      }
      build();
      async function start() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('penalty', 'start', { bet: bet.value, diff }));
        busy = false; if (!r) return;
        st = { k: 0 }; build(); goal.classList.add('live'); msg.set('Pick your corner');
        bet.disable(true); dSel.sel.disabled = true; betBtn.textContent = 'CASH OUT'; betBtn.disabled = true;
      }
      async function kick(zone) {
        if (!st || busy) return; busy = true;
        const r = await C.try(() => C.play('penalty', 'kick', { zone }));
        if (!r) { busy = false; return; }
        const z = L.PENALTY[diff].zones, zw = 100 / z;
        const kz = r.view.keeper; keeper.style.width = `${zw * (kz.length === 2 && Math.abs(kz[0] - kz[1]) === 1 ? 2 : 1)}%`; keeper.style.left = `${zw * Math.min(...kz)}%`;
        if (kz.length === 2 && Math.abs(kz[0] - kz[1]) !== 1) { keeper.style.width = `${zw}%`; keeper.style.left = `${zw * kz[0]}%`; keeper.dataset.second = kz[1]; }
        ball.style.left = `calc(${zw * zone + zw / 2}% - 22px)`; ball.style.bottom = '62%'; ball.style.transform = 'scale(.55) rotate(540deg)';
        goal.querySelectorAll('.zone').forEach((b, i) => b.classList.toggle('kz', kz.includes(i)));
        await C.sleep(650); busy = false;
        if (r.view.saved) { C.settle(r); markLadder(ladder, st.k, true); msg.set('Saved! The keeper got there.', 'lose'); return end(); }
        st.k = r.view.k; markLadder(ladder, st.k, false); C.sfx && C.sfx('cash');
        if (r.done) { C.settle(r); msg.set(`Perfect five! ${r.view.mult.toFixed(2)}× · ${C.fmt(r.payout)}`, 'win'); return end(); }
        msg.set(`GOAL! ${r.view.mult.toFixed(2)}× · next ${r.view.next.toFixed(2)}×`, 'win'); betBtn.disabled = false;
        setTimeout(() => { if (st) { ball.style.cssText = ''; goal.querySelectorAll('.zone').forEach((b) => b.classList.remove('kz')); } }, 900);
      }
      async function cash() { if (!st || busy || !st.k) return; busy = true; const r = await C.try(() => C.play('penalty', 'cashout', {})); busy = false; if (r) { C.settle(r); msg.set(`Cashed out ${r.view.mult.toFixed(2)}× · ${C.fmt(r.payout)}`, 'win'); end(); } }
      function end() { st = null; goal.classList.remove('live'); bet.disable(false); dSel.sel.disabled = false; betBtn.textContent = 'BET'; betBtn.disabled = false; }
    },
  });
  css(`.pitch{position:relative;width:min(560px,100%);height:330px;border-radius:14px;overflow:hidden;background:repeating-linear-gradient(90deg,#1f7a3d 0 40px,#1b6e37 40px 80px)}
  .goal{position:absolute;left:8%;right:8%;top:22px;height:58%;display:grid;border:6px solid #f5f7fa;border-bottom:0;border-radius:6px 6px 0 0;background:repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 2px,transparent 2px 14px),repeating-linear-gradient(-45deg,rgba(255,255,255,.14) 0 2px,transparent 2px 14px)}
  .zone{appearance:none;border:0;border-right:1px dashed rgba(255,255,255,.25);background:transparent;cursor:pointer}.zone:last-of-type{border-right:0}
  .goal.live .zone:hover{background:rgba(255,255,255,.12)}.zone.kz{background:rgba(255,77,99,.25)}
  .keeper{position:absolute;bottom:0;height:70%;transition:left .35s ease,width .35s ease;background:linear-gradient(180deg,#ffb300 0 30%,#263238 30%);border-radius:40% 40% 8px 8px;opacity:.9;pointer-events:none}
  .pball{position:absolute;width:44px;height:44px;left:calc(50% - 22px);bottom:14px;transition:all .55s cubic-bezier(.2,.7,.3,1)}`);

  /* ---------------- Darts ---------------- */
  const RING_COL = { miss: '#2b3f55', single: '#3d8bff', treble: '#22c55e', double: '#eab308', 'outer bull': '#f97316', bullseye: '#e11d48' };
  C.register({
    n: 36, id: 'darts', name: 'Darts', icon: '◎', cat: 'originals', edge: 'set by admin',
    blurb: 'Throw a dart. Bullseye pays up to 29×.',
    rules: '<p>Choose a risk level and throw. Where the dart lands decides your multiplier: bullseye pays the most, a miss pays nothing. Higher risk means more misses and bigger bullseyes.</p>',
    edges: ['low', 'medium', 'high'].map((r) => [r[0].toUpperCase() + r.slice(1) + ' risk', L.dartsTable(r).items.map((i) => `${i.x} ${i.m}×`).join(', '), '']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let risk = 'medium', busy = false, dart = null;
      const rSel = C.select('Risk', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], risk, (v) => { risk = v; legend(); });
      const leg = h('div', { class: 'pays-list' }), msg = C.msg();
      const cv = h('canvas', { width: 420, height: 420, class: 'dart-cv' }), g = cv.getContext('2d');
      const btn = h('button', { class: 'btn big', onclick: () => throwIt() }, 'THROW');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, rSel.el, btn, h('h3', null, 'Board'), leg), h('div', { class: 'stage' }, cv, msg.el)));
      function legend() { leg.innerHTML = ''; L.dartsTable(risk).items.slice().reverse().forEach((it) => leg.append(h('div', null, h('span', { style: `color:${RING_COL[it.x]}` }, '● ' + it.x), h('b', null, it.m + '×')))); }
      legend();
      // ring geometry (fraction of board radius)
      const R = 190, cx = 210, cy = 210, RINGS = { bullseye: [0, 0.06], 'outer bull': [0.06, 0.13], treble: [0.5, 0.58], double: [0.92, 1], single: [[0.13, 0.5], [0.58, 0.92]], miss: [1.03, 1.1] };
      function board() {
        g.clearRect(0, 0, 420, 420);
        g.beginPath(); g.arc(cx, cy, R * 1.1, 0, 7); g.fillStyle = '#0a121b'; g.fill();
        for (let i = 0; i < 20; i++) {
          const a0 = (i / 20) * Math.PI * 2 - Math.PI / 2 - Math.PI / 20, a1 = a0 + Math.PI / 10, even = i % 2 === 0;
          const seg = (r0, r1, col) => { g.beginPath(); g.arc(cx, cy, R * r1, a0, a1); g.arc(cx, cy, R * r0, a1, a0, true); g.closePath(); g.fillStyle = col; g.fill(); };
          seg(0.13, 0.5, even ? '#1b1f24' : '#efe6d0'); seg(0.58, 0.92, even ? '#1b1f24' : '#efe6d0');
          seg(0.5, 0.58, even ? '#d32f2f' : '#2e7d32'); seg(0.92, 1, even ? '#d32f2f' : '#2e7d32');
        }
        g.beginPath(); g.arc(cx, cy, R * 0.13, 0, 7); g.fillStyle = '#2e7d32'; g.fill();
        g.beginPath(); g.arc(cx, cy, R * 0.06, 0, 7); g.fillStyle = '#d32f2f'; g.fill();
        g.strokeStyle = 'rgba(200,200,200,.35)'; g.lineWidth = 1; for (const r of [0.06, 0.13, 0.5, 0.58, 0.92, 1]) { g.beginPath(); g.arc(cx, cy, R * r, 0, 7); g.stroke(); }
        g.fillStyle = '#cfd8e3'; g.font = 'bold 13px -apple-system,Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].forEach((n, i) => { const a = (i / 20) * Math.PI * 2 - Math.PI / 2; g.fillText(n, cx + Math.cos(a) * R * 1.055, cy + Math.sin(a) * R * 1.055); });
        if (dart) { g.save(); g.translate(dart.x, dart.y); g.fillStyle = '#ffc24b'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(18, -18); g.stroke(); g.fillStyle = '#e11d48'; g.beginPath(); g.moveTo(18, -18); g.lineTo(28, -20); g.lineTo(20, -26); g.fill(); g.restore(); }
      }
      board();
      async function throwIt() {
        if (busy) return; busy = true; btn.disabled = true; dart = null; board();
        const r = await C.try(() => C.play('darts', null, { bet: bet.value, risk }));
        if (!r) { busy = false; btn.disabled = false; return; }
        let band = RINGS[r.result.ring]; if (Array.isArray(band[0])) band = band[Math.random() < 0.45 ? 0 : 1];
        const rr = R * (band[0] + Math.random() * (band[1] - band[0]) * 0.9 + (band[1] - band[0]) * 0.05), a = Math.random() * Math.PI * 2;
        const tx = cx + Math.cos(a) * rr, ty = cy + Math.sin(a) * rr, t0 = performance.now();
        await new Promise((done) => { (function f(t) { const p = Math.min(1, (t - t0) / 420); dart = { x: 420 + (tx - 420) * p, y: 420 + (ty - 420) * p - Math.sin(p * Math.PI) * 60 }; board(); if (p < 1) requestAnimationFrame(f); else done(); })(t0); });
        C.sfx && C.sfx('card'); C.settle(r);
        msg.set(`${r.result.ring[0].toUpperCase() + r.result.ring.slice(1)} · ${r.result.mult}×${r.payout ? ' · ' + C.fmt(r.payout) : ''}`, r.result.mult >= 1 ? 'win' : 'lose');
        busy = false; btn.disabled = false;
      }
    },
  });
  css('.dart-cv{width:min(420px,86vw)}');

  /* ---------------- Horse Race ---------------- */
  C.register({
    n: 37, id: 'race', name: 'Horse Race', icon: '♞', cat: 'originals', edge: 'set by admin',
    blurb: 'Six runners. Back a winner at fixed odds.',
    rules: '<p>Pick a runner and bet at the odds shown. If your runner crosses the line first, you win your bet × the odds. Favourites win more often and pay less.</p>',
    edges: L.HORSES.map((hh, i) => [hh.name, L.horseOdds(i).toFixed(2) + '×', '']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let pick = 0, busy = false;
      const list = h('div', { class: 'horse-list' }), msg = C.msg();
      const lanes = L.HORSES.map((hh, i) => { const runner = h('div', { class: 'runner', style: `--c:${hh.color}` }, h('span', null, i + 1)); return { el: h('div', { class: 'lane' }, h('span', { class: 'lane-n' }, hh.name), runner), runner }; });
      const track = h('div', { class: 'track' }, lanes.map((l) => l.el), h('div', { class: 'finish' }));
      const btn = h('button', { class: 'btn big', onclick: () => race() }, 'START RACE');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, h('h3', null, 'Pick a runner'), list, btn), h('div', { class: 'stage' }, track, msg.el)));
      function paint() {
        list.innerHTML = '';
        L.HORSES.forEach((hh, i) => list.append(h('button', { class: 'horse' + (i === pick ? ' sel' : ''), style: `--c:${hh.color}`, onclick: () => { if (!busy) { pick = i; paint(); } } },
          h('span', { class: 'silk' }, i + 1), h('span', { class: 'hn' }, hh.name), h('b', null, L.horseOdds(i).toFixed(2)))));
      }
      paint();
      async function race() {
        if (busy) return; busy = true; btn.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('race', null, { bet: bet.value, horse: pick }));
        if (!r) { busy = false; btn.disabled = false; bet.disable(false); return; }
        msg.set('And they’re off!');
        const order = r.result.order, finish = {}; order.forEach((hIdx, rank) => (finish[hIdx] = 5200 + rank * 380 + Math.random() * 120));
        const wob = L.HORSES.map(() => Math.random() * 6);
        const t0 = performance.now();
        await new Promise((done) => { (function f(t) {
          const el = t - t0;
          lanes.forEach((l, i) => { const p = Math.min(1, el / finish[i]); const e = p < 1 ? p - 0.04 * Math.sin(p * Math.PI * 3 + wob[i]) * (1 - p) : 1; l.runner.style.left = `calc(${Math.max(0, e) * 100}% * .9)`; });
          if (el < finish[order[order.length - 1]] + 100) requestAnimationFrame(f); else done();
        })(t0); });
        C.settle(r);
        const w = L.HORSES[r.result.winner];
        msg.set(r.payout ? `${w.name} wins! You collect ${C.fmt(r.payout)}` : `${w.name} wins. Your runner came ${order.indexOf(pick) + 1}${['st', 'nd', 'rd'][order.indexOf(pick)] || 'th'}.`, r.payout ? 'win' : 'lose');
        busy = false; btn.disabled = false; bet.disable(false);
      }
    },
  });
  css(`.horse-list{display:flex;flex-direction:column;gap:6px}.horse{appearance:none;border:2px solid transparent;background:var(--bg2);color:var(--text);font:inherit;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left}
  .horse.sel{border-color:var(--c)}.horse .hn{flex:1;font-weight:600;font-size:13px}.silk{width:24px;height:24px;border-radius:6px;background:var(--c);display:grid;place-items:center;font-weight:900;font-size:12px}
  .track{position:relative;width:100%;max-width:720px;background:linear-gradient(180deg,#6d4c2f,#5a3d25);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
  .lane{position:relative;height:40px;border-bottom:2px dashed rgba(255,255,255,.18)}.lane-n{position:absolute;right:10%;top:50%;transform:translateY(-50%);font-size:11px;color:rgba(255,255,255,.4);font-weight:700}
  .runner{position:absolute;left:0;top:4px;width:44px;height:32px;border-radius:16px 22px 10px 10px;background:linear-gradient(180deg,var(--c),#111 140%);display:grid;place-items:center;font-weight:900;box-shadow:0 3px 6px rgba(0,0,0,.4)}
  .finish{position:absolute;top:0;bottom:0;right:7%;width:8px;background:repeating-linear-gradient(0deg,#fff 0 8px,#111 8px 16px)}`);

  /* ---------------- Cups ---------------- */
  C.register({
    n: 38, id: 'cups', name: 'Cups', icon: '◡', cat: 'originals', edge: 'set by admin',
    blurb: 'Find the ball under the cups. 3 or 5 cups.',
    rules: '<p>The cups are shuffled. Pick the cup hiding the ball to win your bet × the multiplier shown. Five cups pay more than three.</p>',
    edges: [[3, ''], [5, '']].map(([n]) => [`${n} cups`, L.cupsMult(n) + '×', '']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let n = 3, phase = 'idle';
      const nSel = C.select('Cups', [[3, '3 cups'], [5, '5 cups']], n, (v) => { n = +v; layout(); });
      const info = h('div', { class: 'stat-line' }), msg = C.msg(), row = h('div', { class: 'cups' });
      const btn = h('button', { class: 'btn big', onclick: () => shuffle() }, 'SHUFFLE');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, nSel.el, info, btn), h('div', { class: 'stage' }, row, msg.el)));
      let cups = [];
      function layout() {
        row.innerHTML = ''; info.innerHTML = `Pays <b>${L.cupsMult(n)}×</b>`;
        cups = Array.from({ length: n }, (_, i) => { const c = h('button', { class: 'cupb', onclick: () => choose(i) }, C.artEl('cup', 'cup'), h('span', { class: 'cball' })); row.append(c); return c; });
      }
      layout();
      async function shuffle() {
        if (phase === 'shuffling' || phase === 'pick') return;
        phase = 'shuffling'; btn.disabled = true; nSel.sel.disabled = true; msg.set('Watch closely…');
        cups.forEach((c) => c.classList.remove('lift', 'has', 'picked'));
        for (let k = 0; k < 10; k++) {
          const a = Math.floor(Math.random() * n); let b = Math.floor(Math.random() * n); if (b === a) b = (a + 1) % n;
          const w = cups[0].offsetWidth + 14;
          cups[a].style.transform = `translateX(${(b - a) * w}px)`; cups[b].style.transform = `translateX(${(a - b) * w}px)`;
          await C.sleep(170); cups[a].style.transform = cups[b].style.transform = '';
          C.sfx && C.sfx('tick');
        }
        phase = 'pick'; msg.set('Which cup has the ball?'); row.classList.add('pickable');
      }
      async function choose(i) {
        if (phase !== 'pick') return; phase = 'reveal'; row.classList.remove('pickable');
        const r = await C.try(() => C.play('cups', null, { bet: bet.value, cups: n, pick: i }));
        if (!r) { phase = 'pick'; row.classList.add('pickable'); return; }
        cups[i].classList.add('picked', 'lift'); cups[r.result.ball].classList.add('has', 'lift');
        await C.sleep(500); C.settle(r);
        msg.set(r.result.win ? `Found it! ${C.fmt(r.payout)}` : `It was under cup ${r.result.ball + 1}`, r.result.win ? 'win' : 'lose');
        phase = 'idle'; btn.disabled = false; nSel.sel.disabled = false;
      }
    },
  });
  css(`.cups{display:flex;gap:14px;justify-content:center;padding:30px 0}.cupb{position:relative;appearance:none;border:0;background:none;width:96px;height:120px;cursor:default;transition:transform .16s ease}
  .cups.pickable .cupb{cursor:pointer}.cups.pickable .cupb:hover .cup{transform:translateY(-6px)}
  .cupb .cup{width:96px;height:110px;position:relative;z-index:2;transition:transform .3s ease}.cupb.lift .cup{transform:translateY(-54px) rotate(-8deg)}
  .cball{position:absolute;left:50%;bottom:6px;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#ffc24b 60%,#b77900);opacity:0;z-index:1}
  .cupb.has .cball{opacity:1}.cupb.picked .cup svg{filter:drop-shadow(0 0 10px var(--brand))}
  @media(max-width:900px){.cupb,.cupb .cup{width:60px}.cupb{height:90px}.cupb .cup{height:76px}}`);

  /* ---------------- Rock Paper Scissors ---------------- */
  C.register({
    n: 39, id: 'rps', name: 'Rock Paper Scissors', icon: '✊', cat: 'originals', edge: 'set by admin',
    blurb: 'Beat the house. Ties give your bet back.',
    rules: '<p>Pick rock, paper or scissors. Beat the house to win your bet × the multiplier shown; a tie returns your bet.</p>',
    edges: [['Win', L.rpsMult() + '×', ''], ['Tie', 'bet returned', '']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let busy = false;
      const msg = C.msg(), info = h('div', { class: 'stat-line' }, 'Win pays ', h('b', null, L.rpsMult() + '×'));
      const you = h('div', { class: 'rps-hand' }), house = h('div', { class: 'rps-hand' });
      const pick = (hand) => h('button', { class: 'rps-btn', onclick: () => go(hand) }, C.artEl(hand), hand[0].toUpperCase() + hand.slice(1));
      const choices = h('div', { class: 'rps-choices' }, pick('rock'), pick('paper'), pick('scissors'));
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, info),
        h('div', { class: 'stage' }, h('div', { class: 'rps-arena' }, h('div', null, h('div', { class: 'muted center' }, 'You'), you), h('div', { class: 'rps-vs' }, 'VS'), h('div', null, h('div', { class: 'muted center' }, 'House'), house)), msg.el, choices)));
      async function go(hand) {
        if (busy) return; busy = true; choices.classList.add('disabled');
        you.innerHTML = ''; you.append(C.artEl(hand));
        const r = await C.try(() => C.play('rps', null, { bet: bet.value, hand }));
        if (!r) { busy = false; choices.classList.remove('disabled'); return; }
        for (let i = 0; i < 9; i++) { house.innerHTML = ''; house.append(C.artEl(['rock', 'paper', 'scissors'][i % 3])); await C.sleep(70); }
        house.innerHTML = ''; house.append(C.artEl(r.result.house)); C.settle(r);
        msg.set(r.result.res === 'win' ? `You win ${C.fmt(r.payout)}` : r.result.res === 'tie' ? 'Tie: bet returned' : 'House wins', r.result.res === 'win' ? 'win' : r.result.res === 'tie' ? 'push' : 'lose');
        busy = false; choices.classList.remove('disabled');
      }
    },
  });
  css(`.rps-arena{display:flex;align-items:center;gap:36px}.rps-hand{width:140px;height:140px;border-radius:20px;background:var(--panel);display:grid;place-items:center;padding:20px}.rps-hand .artw{width:100%;height:100%}
  .rps-vs{font-weight:900;font-size:24px;color:var(--muted)}.rps-choices{display:flex;gap:12px}.rps-choices.disabled{opacity:.5;pointer-events:none}
  .rps-btn{appearance:none;border:2px solid var(--line);background:var(--panel2);color:var(--text);font:inherit;font-weight:700;border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;width:110px}
  .rps-btn .artw{width:56px;height:56px}.rps-btn:hover{border-color:var(--brand)}
  @media(max-width:900px){.rps-hand{width:100px;height:100px;padding:14px}.rps-btn{width:90px}}`);

  /* ---------------- Red or Black ---------------- */
  C.register({
    n: 40, id: 'redblack', name: 'Red or Black', icon: '♦', cat: 'originals', edge: 'set by admin', round: 'redblack',
    blurb: 'Guess the colour or the suit of the next card. Double up.',
    rules: '<p>Guess the colour of the next card (pays about 1.9× each time) or its exact suit (about 3.8×). Keep going to multiply your win, or cash out. One wrong guess loses the stake. Cards are drawn from a fresh deck each time.</p>',
    edges: [['Colour', '≈1.9× per guess', ''], ['Suit', '≈3.8× per guess', '']],
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let st = null, busy = false;
      const msg = C.msg(), cardWrap = h('div', { class: 'cards hilo-card' }, C.cardEl(null, { hidden: true })), trail = h('div', { class: 'cards hilo-trail' });
      const multEl = h('div', { class: 'stat-line' });
      const g = (label, guess, cls) => h('button', { class: 'btn ' + cls, onclick: () => go(guess) }, label);
      const colorBtns = h('div', { class: 'controls' }, g('RED', 'red', 'red big'), g('BLACK', 'black', 'ghost big'));
      const suitBtns = h('div', { class: 'controls' }, ['♠', '♥', '♦', '♣'].map((s, i) => g(s, 'suit:' + i, 'ghost suitb' + (i === 1 || i === 2 ? ' redsuit' : ''))));
      const betBtn = h('button', { class: 'btn big', onclick: () => (st ? cash() : start()) }, 'BET');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, multEl, betBtn), h('div', { class: 'stage' }, cardWrap, colorBtns, suitBtns, msg.el, trail)));
      const paint = () => {
        const e = L.EDGE.redblack;
        colorBtns.querySelectorAll('.btn').forEach((b) => { b.disabled = !st; b.textContent = b.textContent.split(' ')[0] + ` ${L.redblackStep('color', e).toFixed(2)}×`; });
        suitBtns.querySelectorAll('.btn').forEach((b) => { b.disabled = !st; });
        multEl.innerHTML = `Multiplier <b>${st ? st.mult.toFixed(2) + '×' : '—'}</b>${st && st.n ? ` · cash out <b>${C.fmt(st.b * st.mult)}</b>` : ''}`;
        betBtn.disabled = !!st && !st.n;
      };
      paint();
      async function start() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('redblack', 'start', { bet: bet.value })); busy = false; if (!r) return;
        st = { b: bet.value, mult: 1, n: 0 }; trail.innerHTML = ''; cardWrap.innerHTML = ''; cardWrap.append(C.cardEl(null, { hidden: true }));
        bet.disable(true); betBtn.textContent = 'CASH OUT'; msg.set('Red or black?'); paint();
      }
      async function go(guess) {
        if (!st || busy) return; busy = true;
        const r = await C.try(() => C.play('redblack', 'guess', { guess })); busy = false; if (!r) return;
        cardWrap.innerHTML = ''; cardWrap.append(C.cardEl(r.view.card)); trail.append(C.cardEl(r.view.card, { cls: 'dim' }));
        if (!r.view.ok) { C.settle(r); msg.set('Wrong: stake lost', 'lose'); return end(); }
        st.mult = r.view.mult; st.n = r.view.n; C.sfx && C.sfx('cash');
        if (r.done) { C.settle(r); msg.set(`Ten in a row! ${C.fmt(r.payout)}`, 'win'); return end(); }
        msg.set(`Correct! ${st.mult.toFixed(2)}×`, 'win'); paint();
      }
      async function cash() { if (!st || busy || !st.n) return; busy = true; const r = await C.try(() => C.play('redblack', 'cashout', {})); busy = false; if (r) { C.settle(r); msg.set(`Cashed out ${r.view.mult.toFixed(2)}× · ${C.fmt(r.payout)}`, 'win'); end(); } }
      function end() { st = null; bet.disable(false); betBtn.textContent = 'BET'; paint(); }
    },
  });
  css('.suitb{font-size:22px;width:56px;padding:8px 0}.suitb.redsuit{color:#ff6b7f}');

  /* ---------------- Colors ---------------- */
  C.register({
    n: 41, id: 'colors', name: 'Colors', icon: '■', cat: 'originals', edge: '6.67%',
    blurb: 'Red, black or the green zero. Green pays 14×.',
    rules: '<p>Fifteen pockets: seven red, seven black and one green. Red and black pay 2×, green pays 14×. Place chips on one or more colours and spin.</p>',
    edges: [['Red / Black', '2×', '6.67%'], ['Green', '14×', '6.67%']],
    mount(root) {
      const T = C.chipTable(); let busy = false;
      const msg = C.msg(), hist = h('div', { class: 'history-strip' });
      const strip = h('div', { class: 'cs-strip' }), win = h('div', { class: 'cs-window' }, strip, h('div', { class: 'cs-mark' }));
      const order = [0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7];
      const cell = (n) => h('div', { class: 'cs-cell ' + L.colorOf15(n) }, String(n));
      for (let r = 0; r < 8; r++) order.forEach((n) => strip.append(cell(n)));
      const sp = (id, label, pays) => T.spot(id, [label, h('small', null, pays)], 'colspot ' + id);
      const btn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      root.appendChild(h('div', null, h('div', { class: 'stage', style: 'min-height:0' }, win, h('div', { class: 'colspots' }, sp('red', 'RED', '2×'), sp('green', 'GREEN', '14×'), sp('black', 'BLACK', '2×')), msg.el, btn, hist), T.bar));
      let pos = 0;
      async function spin() {
        if (busy || !T.ready()) return; busy = true; T.lock(true); btn.disabled = true;
        const r = await C.try(() => C.play('colors', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
        T.mark([]); msg.set(' ');
        const w = strip.children[0].offsetWidth + 6, center = win.clientWidth / 2;
        const idx = order.indexOf(r.result.n) + order.length * 6, x = idx * w + w / 2 - center + (Math.random() - 0.5) * w * 0.6;
        strip.style.transition = 'none'; strip.style.transform = `translateX(${-(order.indexOf(r.result.n) + order.length) * w + center - w / 2}px)`; void strip.offsetWidth;
        strip.style.transition = 'transform 3.6s cubic-bezier(.12,.8,.18,1)'; strip.style.transform = `translateX(${-x}px)`;
        await C.sleep(3700); C.settle(r); T.mark([r.result.color]);
        const c = r.result.color;
        hist.prepend(h('span', { class: 'pill ' + (c === 'red' ? 'r' : c === 'green' ? 'g' : 'b') }, String(r.result.n))); while (hist.children.length > 16) hist.lastChild.remove();
        msg.set(`${c.toUpperCase()} ${r.result.n}: ` + (r.payout ? `pays ${C.fmt(r.payout)}` : 'no win'), r.payout > r.wager ? 'win' : 'lose');
        busy = false; T.lock(false); btn.disabled = false; void pos;
      }
    },
  });
  css(`.cs-window{position:relative;width:100%;max-width:760px;overflow:hidden;border-radius:12px;background:var(--bg);padding:12px 0;mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent)}
  .cs-strip{display:flex;gap:6px;will-change:transform}.cs-cell{flex:none;width:76px;height:76px;border-radius:10px;display:grid;place-items:center;font-weight:900;font-size:22px}
  .cs-cell.red{background:linear-gradient(160deg,#ff5a6e,#b3122b)}.cs-cell.black{background:linear-gradient(160deg,#3a4250,#15191f)}.cs-cell.green{background:linear-gradient(160deg,#3ddc84,#0f8a4a)}
  .cs-mark{position:absolute;left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px;background:#fff;box-shadow:0 0 10px #fff}
  .colspots{display:grid;grid-template-columns:1fr .8fr 1fr;gap:10px;width:100%;max-width:560px}.colspot{min-height:64px;font-size:18px}
  .colspot.red{background:rgba(224,67,90,.25)}.colspot.black{background:rgba(255,255,255,.06)}.colspot.green{background:rgba(24,168,101,.25)}`);
})();
