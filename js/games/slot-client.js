/* Slot game client shared by every slot: a full-width game screen in the style of a provider slot
 * (scene, logo, reel cabinet, game HUD), rendered symbol sprites from img/slots/<theme>/, real reel strips with quick-stop and
 * anticipation, win presentation, free spins, big-win celebration and an in-game paytable.
 * The server decides every outcome; this file only presents the result it returns. */
(function () {
  const C = Casino, h = C.h;
  const NS = 'http://www.w3.org/2000/svg';
  const LINE_COLORS = ['#ffd54f', '#69f0ae', '#40c4ff', '#ff5252', '#e040fb', '#18ffff', '#ffab40', '#f48fb1', '#b2ff59', '#ffffff'];
  const BET_STEPS = [0.1, 0.2, 0.4, 0.5, 1, 2, 3, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const r2 = (x) => Math.floor(x * 100 + 1e-9) / 100;
  const ICON = {
    spin: '<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.6 3.6v4.5h-4.5"/></svg>',
    auto: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6"/><path d="M18 2.5v4.2h-4.2M6 21.5v-4.2h4.2"/></svg>',
    turbo: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>', plus: '<svg viewBox="0 0 24 24"><path d="M12 6v12M6 12h12"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 0 1 0 8"/></svg>', mute: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  };
  const btn = (cls, icon, onclick, label) => h('button', { class: 'sg-b ' + cls, type: 'button', onclick, 'aria-label': label, title: label, html: ICON[icon] || '' });

  /**
   * cfg: { game, theme, name, font, reels, rows, symbols:[[id, weight]], lines (null for ways), ways, free,
   *        adapt(r) → { grid, wins:[{line?, sym, n, cells, pay}], scatter, scatterPay, baseMult, free:[…], freeMult, mult },
   *        paytable() → [{ sym, pays:[[label, multOfBet]] }], scatterRow(), rulesHtml, defaultBet }
   */
  C.slotGame = (root, cfg) => {
    const { reels: R, rows: ROWS } = cfg, sprite = (s) => `img/slots/${cfg.theme}/${s}.webp`;
    let alive = true, spinning = false, turbo = false, autoLeft = 0, stopRequested = false, cycle = null, pending = null, anims = [];
    let betIdx = Math.max(0, BET_STEPS.indexOf(cfg.defaultBet || 1));
    const syms = cfg.symbols.map((x) => x[0]), weights = cfg.symbols.map((x) => x[1]), WT = weights.reduce((a, b) => a + b, 0);
    const rnd = () => { let x = Math.random() * WT; for (let i = 0; i < syms.length; i++) { x -= weights[i]; if (x < 0) return syms[i]; } return syms[0]; };
    const fallback = (s) => (cfg.theme === 'classic' ? C.art(s) : C.slotSymArt(cfg.theme, s));
    const cellEl = (s) => {
      const c = h('div', { class: 'sg-cell', 'data-s': s });
      const img = h('img', { src: sprite(s), alt: '', draggable: 'false', onerror: () => { c.innerHTML = fallback(s); } });
      c.append(img); return c;
    };
    // preload sprites so strips never flash empty
    syms.forEach((s) => { const i = new Image(); i.src = sprite(s); });

    /* ---------- DOM ---------- */
    const reels = Array.from({ length: R }, () => { const el = h('div', { class: 'sg-reel' }); const cells = Array.from({ length: ROWS }, () => cellEl(rnd())); el.append(...cells); return { el, cells }; });
    const lines = document.createElementNS(NS, 'svg'); lines.setAttribute('class', 'sg-lines'); lines.setAttribute('viewBox', '0 0 100 100'); lines.setAttribute('preserveAspectRatio', 'none');
    const pop = h('div', { class: 'sg-pop' }), banner = h('div', { class: 'sg-banner' }), fsBadge = h('div', { class: 'sg-fsbadge' });
    const windowEl = h('div', { class: 'sg-window' }, reels.map((r) => r.el), lines, pop);
    const creditV = h('b', null, '0.00'), betV = h('b', null, ''), winV = h('b', null, '0.00'), winS = h('div', { class: 'sg-stat sg-win' }, h('span', null, 'WIN'), winV);
    const spinB = h('button', { class: 'sg-spin', type: 'button', 'aria-label': 'Spin', html: ICON.spin, onclick: () => onSpin() });
    const autoB = btn('sg-round', 'auto', () => toggleAutoMenu(), 'Autoplay'), autoN = h('span', { class: 'sg-autoN' });
    autoB.append(autoN);
    const turboB = btn('sg-round', 'turbo', () => { turbo = !turbo; turboB.classList.toggle('on', turbo); }, 'Turbo spin');
    const infoB = btn('sg-flat', 'info', () => openInfo(), 'Paytable & rules');
    const soundB = btn('sg-flat', C.isMuted && C.isMuted() ? 'mute' : 'sound', () => { C.setMuted(!C.isMuted()); soundB.innerHTML = ICON[C.isMuted() ? 'mute' : 'sound']; }, 'Sound');
    const minusB = btn('sg-pm', 'minus', () => setBet(betIdx - 1), 'Lower bet'), plusB = btn('sg-pm', 'plus', () => setBet(betIdx + 1), 'Raise bet');
    const autoMenu = h('div', { class: 'sg-automenu' }, h('div', { class: 'sg-am-t' }, 'AUTOPLAY'),
      h('div', { class: 'sg-am-g' }, [10, 25, 50, 100, 500].map((n) => h('button', { type: 'button', onclick: () => startAuto(n) }, String(n)))));
    const hud = h('div', { class: 'sg-hud' },
      h('div', { class: 'sg-hl' }, infoB, soundB, h('div', { class: 'sg-stat' }, h('span', null, 'CREDIT'), creditV),
        h('div', { class: 'sg-stat sg-bet' }, h('span', null, 'BET'), h('div', { class: 'sg-betrow' }, minusB, betV, plusB))),
      h('div', { class: 'sg-hc' }, autoB, spinB, turboB, autoMenu),
      h('div', { class: 'sg-hr' }, winS));
    const info = h('div', { class: 'sg-info' });
    const big = h('div', { class: 'sg-big' });
    const sg = h('div', { class: 'sg th-' + cfg.theme },
      h('img', { class: 'sg-scene', src: `img/slots/${cfg.theme}/bg.webp`, alt: '', draggable: 'false' }),
      h('div', { class: 'sg-main' },
        h('div', { class: 'sg-logo' }, h('img', { src: `img/slots/${cfg.theme}/logo.webp`, alt: cfg.name, draggable: 'false', onerror: (e) => { e.target.replaceWith(h('div', { class: 'sg-logo-txt' }, cfg.name)); } })),
        h('div', { class: 'sg-cab' }, h('div', { class: 'sg-frame' }, windowEl, fsBadge, banner))),
      hud, info, big);
    sg.style.setProperty('--font', `'${cfg.font}'`);
    root.appendChild(sg);

    /* ---------- sizing ---------- */
    function layout() {
      const cw = sg.clientWidth || 800, mob = cw < 720;
      sg.classList.toggle('mob', mob);
      const logoH = mob ? Math.min(84, cw * 0.2) : Math.min(118, Math.max(70, cw * 0.085));
      const availW = cw * (mob ? 0.95 : 0.66) - 28;
      const maxH = mob ? cw * (ROWS > 3 ? 1.05 : 0.86) : Math.min(window.innerHeight * 0.9, Math.max(520, cw * 0.6)) - logoH - 92 - 64;
      const cell = Math.max(44, Math.floor(Math.min((availW - 4 * (R - 1)) / R, (maxH - 28 - 4 * (ROWS - 1)) / ROWS)));
      sg.style.setProperty('--cell', cell + 'px'); sg.style.setProperty('--logo-h', logoH + 'px'); sg.style.setProperty('--reels', R); sg.style.setProperty('--rows', ROWS);
    }
    const ro = new ResizeObserver(layout); ro.observe(sg); layout();

    /* ---------- HUD state ---------- */
    const maxBet = () => Math.min((C.config && C.config().maxBet) || Infinity, 1e9);
    function setBet(i) { if (spinning) return; betIdx = Math.max(0, Math.min(BET_STEPS.length - 1, i)); while (betIdx > 0 && BET_STEPS[betIdx] > maxBet()) betIdx--; paintHud(); }
    const bet = () => BET_STEPS[betIdx];
    function paintHud() {
      creditV.textContent = C.fmt(C.balance()); betV.textContent = C.fmt(bet());
      minusB.disabled = spinning || betIdx === 0; plusB.disabled = spinning || betIdx === BET_STEPS.length - 1;
      autoN.textContent = autoLeft ? (autoLeft > 999 ? '∞' : String(autoLeft)) : '';
      autoB.classList.toggle('on', autoLeft > 0); spinB.classList.toggle('busy', spinning);
    }
    C.onPage(() => { if (alive) paintHud(); });
    paintHud();
    function toggleAutoMenu() { if (autoLeft) { autoLeft = 0; paintHud(); return; } autoMenu.classList.toggle('on'); }
    function startAuto(n) { autoMenu.classList.remove('on'); autoLeft = n; paintHud(); if (!spinning) spin(); }
    const onDoc = (e) => { if (!autoMenu.contains(e.target) && e.target !== autoB && !autoB.contains(e.target)) autoMenu.classList.remove('on'); };
    document.addEventListener('pointerdown', onDoc);
    const onKey = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.body.contains(sg)) { e.preventDefault(); onSpin(); } };
    document.addEventListener('keydown', onKey);

    /* ---------- paytable ---------- */
    function openInfo() {
      const b = bet(), rows = cfg.paytable();
      info.innerHTML = '';
      info.append(h('div', { class: 'sg-info-in' },
        h('div', { class: 'sg-info-h' }, h('b', null, 'PAYTABLE'), h('span', null, `values for a ${C.fmt(b)} bet`), btn('sg-flat', 'close', () => info.classList.remove('on'), 'Close')),
        h('div', { class: 'sg-pt' }, rows.map((r) => h('div', { class: 'sg-pt-i' + (r.wide ? ' wide' : '') }, h('img', { src: sprite(r.sym), alt: '' }),
          h('div', { class: 'sg-pt-v' }, r.title ? h('i', null, r.title) : null, r.pays.map(([lab, m]) => h('div', null, h('span', null, lab), h('b', null, C.fmt(r2(m * b))))))))),
        cfg.lines && cfg.lines.length > 1 ? h('div', { class: 'sg-lines-ex' }, h('b', null, `${cfg.lines.length} PAYLINES`), h('div', { class: 'sg-lg' }, cfg.lines.map((ln, i) => h('div', { class: 'sg-lmini', style: `--c:${LINE_COLORS[i % LINE_COLORS.length]}` },
          Array.from({ length: ROWS }, (_, row) => ln.map((lr) => h('i', { class: lr === row ? 'on' : '' }))).flat())))) : null,
        h('div', { class: 'sg-rules', html: cfg.rulesHtml })));
      info.classList.add('on');
    }
    info.addEventListener('click', (e) => { if (e.target === info) info.classList.remove('on'); });

    /* ---------- reels ---------- */
    function clearWins() { if (cycle) { clearInterval(cycle); cycle = null; } lines.innerHTML = ''; sg.classList.remove('has-win'); reels.forEach((r) => r.cells.forEach((c) => c.classList.remove('hit', 'dim'))); }
    function drawLine(li) {
      const pts = cfg.lines[li].map((row, r) => `${((r + 0.5) / R) * 100},${((row + 0.5) / ROWS) * 100}`).join(' ');
      const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('stroke', LINE_COLORS[li % LINE_COLORS.length]); pl.setAttribute('vector-effect', 'non-scaling-stroke'); lines.append(pl);
    }
    function light(ws, scat) {
      lines.innerHTML = ''; sg.classList.add('has-win');
      reels.forEach((r) => r.cells.forEach((c) => { c.classList.remove('hit'); c.classList.add('dim'); }));
      ws.forEach((w) => { if (w.line != null && cfg.lines && cfg.lines.length > 1) drawLine(w.line); w.cells.forEach(([r, row]) => { const c = reels[r].cells[row]; c.classList.add('hit'); c.classList.remove('dim'); }); });
      if (scat) reels.forEach((r) => r.cells.forEach((c) => { if (c.dataset.s === 'scatter') { c.classList.add('hit'); c.classList.remove('dim'); } }));
    }
    function showWins(res) {
      const all = res.wins, scat = res.scatterPay > 0;
      if (!all.length && !scat) return;
      light(all, scat);
      if (all.length > 1) { let k = -1; cycle = setInterval(() => { k = (k + 1) % (all.length + 1); light(k === all.length ? all : [all[k]], k === all.length && scat); }, 1100); }
    }
    /** Scroll every reel as a strip and stop it on the result; reels after two Bonus symbols spin longer. */
    async function roll(grid, fast) {
      const quick = fast || turbo, dur = quick ? 380 : 700, step = quick ? 80 : 170, cell = parseFloat(getComputedStyle(sg).getPropertyValue('--cell')) || 100;
      let seen = 0, extraT = 0; const stops = [];
      for (let i = 0; i < R; i++) {
        const antic = cfg.free && seen >= 2 && !quick;
        if (antic) extraT += 900;
        stops.push({ t: dur + i * step + extraT, antic });
        seen += grid[i].filter((s) => s === 'scatter').length;
      }
      stopRequested = false; anims = [];
      C.sfx && C.sfx('spin');
      await Promise.all(reels.map((rl, i) => new Promise((done) => {
        const finalS = grid[i], cur = rl.cells.map((c) => c.dataset.s), n = Math.max(8, Math.round(stops[i].t / 45));
        const strip = h('div', { class: 'sg-strip blur' }, [...finalS, ...Array.from({ length: n }, rnd), ...cur].map(cellEl));
        rl.el.innerHTML = ''; rl.el.append(strip);
        const total = (n + ROWS) * (cell + 4);
        const anim = strip.animate([{ transform: `translateY(${-total}px)` }, { transform: `translateY(${cell * 0.1}px)`, offset: 0.93 }, { transform: 'translateY(0)' }], { duration: stops[i].t, easing: 'cubic-bezier(.35,.05,.3,1)' });
        anims.push(anim);
        if (stops[i].antic) setTimeout(() => { if (alive && !anim.playState.startsWith('fin')) { rl.el.classList.add('antic'); C.sfx && C.sfx('antic'); } }, stops[i].t - 1000);
        const unblur = setInterval(() => { if (anim.currentTime > stops[i].t * 0.8 || anim.playState === 'finished') { strip.classList.remove('blur'); clearInterval(unblur); } }, 60);
        anim.onfinish = () => {
          clearInterval(unblur); rl.el.classList.remove('antic');
          rl.el.innerHTML = ''; rl.cells = finalS.map(cellEl); rl.el.append(...rl.cells);
          rl.el.classList.add('land'); setTimeout(() => rl.el.classList.remove('land'), 260);
          if (finalS.includes('scatter') && cfg.free) C.sfx && C.sfx('scat'); else C.sfx && C.sfx('reel');
          done();
        };
      })));
      anims = [];
    }
    function quickStop() { if (stopRequested || !anims.length) return; stopRequested = true; anims.forEach((a) => { const d = a.effect.getTiming().duration; if (a.currentTime < d - 140) a.currentTime = d - 140; }); }

    const countUp = (el, from, to, ms) => new Promise((done) => { const t0 = performance.now(); let lastTick = 0; (function f(now) { const p = Math.min(1, (now - t0) / ms), v = from + (to - from) * (1 - Math.pow(1 - p, 3)); el.textContent = C.fmt(v); if (now - lastTick > 90 && p < 1) { lastTick = now; C.sfx && C.sfx('coin'); } if (p < 1 && alive) requestAnimationFrame(f); else done(); })(t0); });
    function popWin(amount) { pop.innerHTML = ''; pop.append(h('b', null, C.fmt(amount))); pop.classList.remove('on'); void pop.offsetWidth; pop.classList.add('on'); }
    const showBanner = async (html, ms) => { banner.innerHTML = html; banner.classList.add('on'); C.sfx && C.sfx('bigwin'); await new Promise((r) => { const t = setTimeout(r, ms); banner.onclick = () => { clearTimeout(t); r(); }; }); banner.classList.remove('on'); };

    /** Big / mega / epic win celebration with a coin shower; tap to skip. */
    function celebrate(amount, mult) {
      return new Promise((resolve) => {
        const tier = mult >= 50 ? 'EPIC WIN' : mult >= 25 ? 'MEGA WIN' : 'BIG WIN';
        const cv = h('canvas'), val = h('div', { class: 'sg-big-v' }, '0.00');
        big.innerHTML = ''; big.append(cv, h('div', { class: 'sg-big-in' }, h('div', { class: 'sg-big-t' }, tier), val)); big.className = 'sg-big on t' + (mult >= 50 ? 3 : mult >= 25 ? 2 : 1);
        C.sfx && C.sfx('bigwin');
        const W = (cv.width = sg.clientWidth), H = (cv.height = sg.clientHeight), g = cv.getContext('2d'), coin = C.artImg ? C.artImg('coinHeads') : null;
        const ps = []; let done = false;
        const add = () => ps.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H + 20, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 14, s: Math.random() * 18 + 22, a: Math.random() * 6, va: Math.random() * 0.3 + 0.1 });
        const t0 = performance.now(), ms = 2600 + Math.min(2400, mult * 30);
        const finish = () => { if (done) return; done = true; big.classList.remove('on'); setTimeout(() => { big.innerHTML = ''; }, 300); resolve(); };
        big.onclick = finish;
        countUp(val, 0, amount, ms - 600);
        (function frame(now) {
          if (done || !alive) return;
          if (now - t0 < ms - 400) for (let k = 0; k < 3; k++) add();
          g.clearRect(0, 0, W, H);
          ps.forEach((p) => { p.vy += 0.45; p.x += p.vx; p.y += p.vy; p.a += p.va; const sx = Math.abs(Math.cos(p.a)); g.save(); g.translate(p.x, p.y); g.scale(Math.max(0.15, sx), 1); if (coin && coin.complete) g.drawImage(coin, -p.s / 2, -p.s / 2, p.s, p.s); else { g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(0, 0, p.s / 2, 0, 7); g.fill(); } g.restore(); });
          if (now - t0 < ms) requestAnimationFrame(frame); else finish();
        })(t0);
      });
    }

    /* ---------- spin ---------- */
    function onSpin() { if (info.classList.contains('on')) return; if (spinning) { quickStop(); return; } if (autoLeft) { autoLeft = 0; paintHud(); return; } spin(); }
    async function spin() {
      if (spinning || !alive) return;
      const b = bet();
      if (b > C.balance() + 1e-9) { C.toast('Not enough balance for this bet', 'err'); autoLeft = 0; paintHud(); return; }
      spinning = true; clearWins(); winV.textContent = '0.00'; winS.classList.remove('on'); paintHud();
      const r = await C.try(() => C.play(cfg.game, null, { bet: b }));
      if (!r) { spinning = false; autoLeft = 0; paintHud(); return; }
      r._fx = true; // this client plays its own sounds and big-win
      const res = cfg.adapt(r);
      if (res.free.length) { clearTimeout(r._t); pending = r; }
      paintHud();
      await roll(res.grid);
      if (!alive) return;
      let shown = r2(b * res.baseMult);
      if (shown > 0) { showWins(res); popWin(shown); C.sfx && C.sfx('win'); winS.classList.add('on'); await countUp(winV, 0, shown, turbo ? 250 : 600); }
      if (res.free.length) {
        await C.sleep(turbo ? 400 : 900); clearWins();
        await showBanner(`<div class="sg-bn-k">${res.scatter} BONUS SYMBOLS</div><div class="sg-bn-m">${res.free.length} FREE SPINS</div><div class="sg-bn-s">every win ×${res.freeMult}</div>`, 2200);
        sg.classList.add('fs');
        for (let i = 0; i < res.free.length && alive; i++) {
          fsBadge.innerHTML = `<span>FREE SPINS</span><b>${i + 1} / ${res.free.length}</b>`; clearWins();
          const s = res.free[i];
          await roll(s.grid, true);
          const add = r2(b * s.mult * res.freeMult);
          if (add > 0) { showWins(s); popWin(add); C.sfx && C.sfx('win'); winS.classList.add('on'); await countUp(winV, shown, shown + add, 380); shown = r2(shown + add); await C.sleep(600); } else await C.sleep(240);
          if (cycle) { clearInterval(cycle); cycle = null; }
        }
        sg.classList.remove('fs'); fsBadge.innerHTML = '';
        if (alive) await showBanner(`<div class="sg-bn-k">FREE SPINS COMPLETE</div><div class="sg-bn-m">${C.fmt(r.payout)}</div><div class="sg-bn-s">total win</div>`, 2200);
        pending = null;
      }
      if (!alive) return;
      winV.textContent = C.fmt(r.payout);
      C.settle(r);
      const mult = r.wager ? r.payout / r.wager : 0;
      if (mult >= 10) await celebrate(r.payout, mult); else if (!r.payout) C.sfx && C.sfx('lose');
      spinning = false; paintHud();
      if (autoLeft > 0 && alive) { autoLeft = autoLeft > 999 ? autoLeft : autoLeft - 1; paintHud(); if (autoLeft > 0) setTimeout(spin, r.payout ? (turbo ? 700 : 1300) : (turbo ? 200 : 450)); }
    }
    return () => { alive = false; autoLeft = 0; ro.disconnect(); if (cycle) clearInterval(cycle); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDoc); if (pending) C.settle(pending); };
  };

  const css = document.createElement('style');
  css.textContent = `
  .game-root:has(> .sg){padding:0;overflow:hidden;background:#000}
  .sg{position:relative;isolation:isolate;display:flex;flex-direction:column;min-height:560px;overflow:hidden;color:#fff;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
  .sg-scene{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1}
  .sg::after{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.15),transparent 30%,transparent 70%,rgba(0,0,0,.55))}
  .sg-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 12px 26px;gap:6px}
  .sg-logo{height:var(--logo-h);display:flex;align-items:center;justify-content:center;max-width:94%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))}
  .sg-logo img{height:100%;width:auto;max-width:100%;object-fit:contain}.sg-logo-txt{font:400 44px/1 var(--font),sans-serif;text-shadow:0 4px 0 #000}
  .sg-cab{position:relative}
  .sg-frame{position:relative;padding:12px;border-radius:22px;background:linear-gradient(180deg,#f9e08b,#c99a06 30%,#7a5200 70%,#c99a06);box-shadow:0 18px 40px rgba(0,0,0,.6),inset 0 2px 0 rgba(255,255,255,.6),inset 0 -2px 0 rgba(0,0,0,.4)}
  .sg-frame::before{content:'';position:absolute;inset:5px;border-radius:18px;border:2px solid rgba(255,255,255,.35);pointer-events:none}
  .sg-window{position:relative;display:grid;grid-template-columns:repeat(var(--reels),var(--cell));gap:4px;padding:6px;border-radius:12px;background:linear-gradient(180deg,rgba(6,10,18,.9),rgba(14,20,32,.86));box-shadow:inset 0 6px 20px rgba(0,0,0,.9),inset 0 0 0 2px rgba(0,0,0,.6)}
  .sg-reel{position:relative;height:calc(var(--rows) * var(--cell) + (var(--rows) - 1) * 4px);overflow:hidden;border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015) 22%,rgba(255,255,255,.015) 78%,rgba(255,255,255,.06))}
  .sg-reel::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.5),transparent 16%,transparent 84%,rgba(0,0,0,.5));z-index:2}
  .sg-reel.antic{box-shadow:0 0 0 3px #ffd54f,0 0 26px #ffb300;animation:sgantic .35s ease-in-out infinite alternate}@keyframes sgantic{to{box-shadow:0 0 0 3px #fff3c4,0 0 40px #ffd54f}}
  .sg-reel.land{animation:sgland .26s ease-out}@keyframes sgland{40%{transform:translateY(5px)}}
  .sg-strip{display:flex;flex-direction:column;gap:4px;will-change:transform}.sg-strip.blur .sg-cell img{filter:blur(2.5px) brightness(.92)}
  .sg-cell{width:var(--cell);height:var(--cell);display:grid;place-items:center;position:relative;transition:opacity .25s,filter .25s}
  .sg-cell img,.sg-cell svg{width:96%;height:96%;object-fit:contain;pointer-events:none}
  .sg-cell.dim{opacity:.32;filter:saturate(.5)}
  .sg-cell.hit{z-index:3;animation:sghit .7s ease-in-out infinite alternate}
  .sg-cell.hit::before{content:'';position:absolute;inset:3%;border-radius:14px;background:radial-gradient(circle,rgba(255,236,150,.4),transparent 68%);box-shadow:inset 0 0 0 3px rgba(255,215,64,.95),0 0 20px rgba(255,200,40,.75);z-index:-1}
  .sg-cell.hit::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);background-size:250% 100%;mix-blend-mode:overlay;animation:sgshine 1.4s linear infinite;border-radius:14px;pointer-events:none}
  @keyframes sghit{to{transform:scale(1.08)}}@keyframes sgshine{from{background-position:150% 0}to{background-position:-100% 0}}
  .sg-lines{position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px);pointer-events:none;z-index:4}.sg-lines polyline{fill:none;stroke-width:5;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(0,0,0,.95))}
  .sg-pop{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:6}
  .sg-pop b{font:400 clamp(34px,calc(var(--cell) * .62),78px)/1 var(--font),'Lilita One',sans-serif;color:#fff;-webkit-text-stroke:2px #3a2200;text-shadow:0 4px 0 #b45309,0 8px 18px rgba(0,0,0,.6),0 0 24px rgba(255,213,79,.8);opacity:0}
  .sg-pop.on b{animation:sgpop 1.5s ease-out forwards}@keyframes sgpop{0%{opacity:0;transform:scale(.3)}18%{opacity:1;transform:scale(1.12)}30%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:translateY(-24px)}}
  .sg-fsbadge{position:absolute;left:50%;top:-14px;transform:translateX(-50%);display:flex;gap:8px;align-items:baseline;padding:5px 16px;border-radius:999px;background:linear-gradient(180deg,#b71c1c,#5d0000);box-shadow:0 0 0 2px #ffd54f,0 6px 14px rgba(0,0,0,.5);font-weight:900;white-space:nowrap;z-index:7}
  .sg-fsbadge:empty{display:none}.sg-fsbadge span{font-size:11px;letter-spacing:.14em;color:#ffd54f}.sg-fsbadge b{font:400 18px/1 var(--font),sans-serif}
  .sg.fs .sg-frame{box-shadow:0 0 0 3px #ffd54f,0 0 50px rgba(255,200,40,.6),0 18px 40px rgba(0,0,0,.6)}
  .sg-banner{position:absolute;inset:12px;z-index:8;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;background:radial-gradient(circle,rgba(30,10,0,.72),rgba(0,0,0,.9));opacity:0;pointer-events:none;transition:opacity .25s}
  .sg-banner.on{opacity:1;pointer-events:auto;cursor:pointer}
  .sg-bn-k{font:900 14px/1 'Russo One',sans-serif;letter-spacing:.24em;color:#ffd54f}.sg-bn-m{font:400 clamp(34px,7vw,68px)/1 var(--font),'Lilita One',sans-serif;color:#fff;-webkit-text-stroke:2px #3a2200;text-shadow:0 5px 0 #b45309,0 0 30px rgba(255,213,79,.7)}
  .sg-banner.on .sg-bn-m{animation:sgbn .55s cubic-bezier(.3,1.6,.5,1)}@keyframes sgbn{from{transform:scale(.3)}}.sg-bn-s{font-weight:800;opacity:.9}
  /* HUD */
  .sg-hud{position:relative;z-index:5;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:10px 18px 12px;background:linear-gradient(180deg,rgba(8,10,16,.55),rgba(8,10,16,.92));border-top:1px solid rgba(255,255,255,.12);backdrop-filter:blur(6px)}
  .sg-hl{display:flex;align-items:center;gap:14px}.sg-hr{display:flex;justify-content:flex-end}.sg-hc{position:relative;display:flex;align-items:center;gap:14px}
  .sg-stat{display:flex;flex-direction:column;gap:2px;min-width:0}.sg-stat span{font-size:10px;font-weight:800;letter-spacing:.16em;color:rgba(255,255,255,.6)}
  .sg-stat>b,.sg-betrow>b{font-size:17px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
  .sg-betrow{display:flex;align-items:center;gap:8px}
  .sg-win{align-items:flex-end;min-width:120px}.sg-win b{font-size:22px;color:#fff}.sg-win.on b{color:#ffd54f;text-shadow:0 0 14px rgba(255,213,79,.7)}
  .sg-b{display:grid;place-items:center;border:0;cursor:pointer;color:#fff;padding:0}.sg-b svg{width:55%;height:55%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .sg-b.sg-flat{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.08)}.sg-b.sg-flat:hover{background:rgba(255,255,255,.16)}
  .sg-b.sg-pm{width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}.sg-b.sg-pm:disabled{opacity:.35;cursor:default}
  .sg-b.sg-round{position:relative;width:48px;height:48px;border-radius:50%;background:radial-gradient(circle at 50% 35%,#4a5566,#1d232c);box-shadow:inset 0 0 0 2px rgba(255,255,255,.25),0 4px 10px rgba(0,0,0,.5)}
  .sg-b.sg-round.on{background:radial-gradient(circle at 50% 35%,#ffe082,#c99a06);color:#2a1800}
  .sg-autoN{position:absolute;right:-6px;top:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#e53935;font-size:11px;font-weight:900;display:grid;place-items:center}.sg-autoN:empty{display:none}
  .sg-spin{width:84px;height:84px;margin-top:-34px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;color:#fff;
    background:radial-gradient(circle at 50% 30%,#7dffb6,#16c76c 45%,#0a7a41);box-shadow:0 0 0 5px rgba(0,0,0,.55),0 0 0 8px rgba(255,255,255,.18),0 10px 26px rgba(0,0,0,.6),inset 0 -6px 12px rgba(0,0,0,.25),inset 0 4px 8px rgba(255,255,255,.45);transition:transform .1s}
  .sg-spin:active{transform:scale(.94)}.sg-spin svg{width:46px;height:46px;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}
  .sg-spin.busy svg{animation:sgrot .6s linear infinite}@keyframes sgrot{to{transform:rotate(360deg)}}
  .sg-automenu{position:absolute;bottom:72px;left:-40px;width:220px;padding:12px;border-radius:14px;background:rgba(12,16,24,.97);box-shadow:0 12px 30px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.12);display:none;z-index:20}
  .sg-automenu.on{display:block}.sg-am-t{font-size:11px;font-weight:900;letter-spacing:.16em;color:rgba(255,255,255,.6);margin-bottom:8px}
  .sg-am-g{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.sg-am-g button{border:0;border-radius:8px;padding:10px 0;font-weight:900;color:#fff;background:rgba(255,255,255,.1);cursor:pointer}.sg-am-g button:hover{background:#16c76c}
  /* paytable */
  .sg-info{position:absolute;inset:0;z-index:30;background:rgba(0,0,0,.6);display:none;padding:18px;overflow:auto}.sg-info.on{display:block}
  .sg-info-in{max-width:900px;margin:0 auto;padding:18px;border-radius:16px;background:rgba(12,16,24,.96);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
  .sg-info-h{display:flex;align-items:center;gap:12px;margin-bottom:14px}.sg-info-h b{font:400 24px/1 var(--font),sans-serif;letter-spacing:.04em}.sg-info-h span{flex:1;color:rgba(255,255,255,.55);font-size:13px}
  .sg-pt{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
  .sg-pt-i{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;background:rgba(255,255,255,.05)}.sg-pt-i.wide{grid-column:1/-1}
  .sg-pt-i img{width:64px;height:64px;flex:none}.sg-pt-v{flex:1;font-size:13px}.sg-pt-v i{display:block;font-style:normal;color:#ffd54f;font-weight:800;font-size:12px;margin-bottom:3px}
  .sg-pt-v>div{display:flex;justify-content:space-between;gap:8px}.sg-pt-v span{color:rgba(255,255,255,.6);font-weight:700}.sg-pt-v b{font-variant-numeric:tabular-nums}
  .sg-lines-ex{margin-top:16px}.sg-lines-ex>b{font-size:12px;letter-spacing:.14em;color:rgba(255,255,255,.6)}
  .sg-lg{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.sg-lmini{display:grid;grid-template-columns:repeat(var(--reels),7px);gap:2px;padding:5px;border-radius:6px;background:rgba(255,255,255,.06)}
  .sg-lmini i{width:7px;height:7px;border-radius:2px;background:rgba(255,255,255,.12)}.sg-lmini i.on{background:var(--c)}
  .sg-rules{margin-top:14px;font-size:13px;color:rgba(255,255,255,.75);line-height:1.5}
  /* big win */
  .sg-big{position:absolute;inset:0;z-index:40;display:none;place-items:center;background:radial-gradient(circle,rgba(40,20,0,.55),rgba(0,0,0,.85));cursor:pointer}.sg-big.on{display:grid}
  .sg-big canvas{position:absolute;inset:0;width:100%;height:100%}.sg-big-in{position:relative;text-align:center}
  .sg-big-t{font:400 clamp(48px,10vw,110px)/1 var(--font),'Luckiest Guy',sans-serif;color:#fff3c4;-webkit-text-stroke:3px #5a2a00;text-shadow:0 6px 0 #c2410c,0 12px 0 #7c2d12,0 0 40px rgba(255,200,40,.8);animation:sgbig .7s cubic-bezier(.3,1.6,.5,1)}
  .sg-big.t2 .sg-big-t{color:#e9d5ff;text-shadow:0 6px 0 #7e22ce,0 12px 0 #4c1d95,0 0 40px rgba(200,120,255,.8)}.sg-big.t3 .sg-big-t{color:#cffafe;text-shadow:0 6px 0 #0e7490,0 12px 0 #164e63,0 0 40px rgba(80,220,255,.9)}
  .sg-big-v{margin-top:14px;font:900 clamp(30px,5vw,54px)/1 'Russo One',sans-serif;color:#fff;text-shadow:0 4px 12px rgba(0,0,0,.7);font-variant-numeric:tabular-nums}
  @keyframes sgbig{from{transform:scale(.2) rotate(-6deg);opacity:0}}
  /* phones */
  .sg.mob{min-height:0}.sg.mob .sg-main{padding:10px 6px 6px}.sg.mob .sg-frame{padding:7px;border-radius:16px}.sg.mob .sg-window{gap:3px;padding:4px}
  .sg.mob .sg-hud{grid-template-columns:1fr 1fr;grid-template-areas:"l r" "c c";gap:8px 10px;padding:8px 12px 14px}
  .sg.mob .sg-hl{grid-area:l;gap:8px}.sg.mob .sg-hr{grid-area:r}.sg.mob .sg-hc{grid-area:c;justify-content:center;gap:22px}
  .sg.mob .sg-hl .sg-flat:nth-child(2){display:none}.sg.mob .sg-spin{margin-top:0;width:76px;height:76px}.sg.mob .sg-stat>b,.sg.mob .sg-betrow>b{font-size:15px}.sg.mob .sg-win b{font-size:18px}
  .sg.mob .sg-hl{flex-wrap:wrap}.sg.mob .sg-hl .sg-stat:not(.sg-bet){display:none}
  .sg.mob .sg-automenu{left:50%;transform:translateX(-50%);bottom:86px}
  /* per-theme cabinet trim */
  .th-ocean .sg-frame{background:linear-gradient(180deg,#b2ebf2,#00acc1 30%,#00576b 70%,#00acc1)}
  .th-goldrush .sg-frame{background:linear-gradient(180deg,#cfd8dc,#78909c 30%,#37474f 70%,#78909c)}
  .th-dragon .sg-frame{background:linear-gradient(180deg,#ffe082,#c62828 25%,#7f0000 75%,#c99a06)}
  .th-candy .sg-frame{background:repeating-linear-gradient(45deg,#fff 0 14px,#ff4081 14px 28px)}
  .th-neon .sg-frame{background:#0b0910;box-shadow:0 0 0 3px #ff2d6f,0 0 34px rgba(255,45,111,.7),inset 0 0 18px rgba(255,45,111,.4)}
  .th-clover .sg-frame{background:linear-gradient(180deg,#f9e08b,#43a047 30%,#1b5e20 70%,#c99a06)}
  .th-cosmic .sg-frame{background:linear-gradient(180deg,#e1bee7,#7c4dff 30%,#311b92 70%,#7c4dff)}
  .th-classic .sg-frame{background:linear-gradient(180deg,#ffcdd2,#e53935 30%,#7f0000 70%,#e53935)}
  .th-gems .sg-frame{background:linear-gradient(180deg,#e1bee7,#8e24aa 30%,#4a148c 70%,#8e24aa)}
  .th-sevens .sg-frame{background:linear-gradient(180deg,#ffe082,#ff6d00 30%,#8e0000 70%,#ff6d00)}
  .th-neon .sg-window{background:rgba(5,4,8,.9)}
  .th-classic .sg-window::before{content:'';position:absolute;left:2px;right:2px;top:50%;height:3px;margin-top:-1.5px;background:linear-gradient(90deg,transparent,#ff1744 6%,#ff1744 94%,transparent);box-shadow:0 0 8px #ff1744;z-index:4;opacity:.85}
  `;
  document.head.appendChild(css);
  /* ---------- cabinets: each machine's frame is its own material; classic machines get ivory reel strips ---------- */
  const cab = document.createElement('style');
  cab.textContent = `
  .sg .sg-frame{padding:14px;border-radius:18px;box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -3px 0 rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.5),0 18px 40px rgba(0,0,0,.55)}
  .sg .sg-frame::before{inset:7px;border-radius:12px;border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
  .th-classic .sg-frame,.th-sevens .sg-frame{background:linear-gradient(180deg,#f7f9fb 0%,#c5cdd5 16%,#8b97a3 44%,#eef1f4 54%,#9aa6b2 82%,#dfe4e9 100%)}
  .th-classic .sg-window{background:#15181d;box-shadow:inset 0 0 0 3px #8f0613,inset 0 10px 18px rgba(0,0,0,.65)}
  .th-sevens .sg-window{background:#15181d;box-shadow:inset 0 0 0 3px #1d3fbf,inset 0 10px 18px rgba(0,0,0,.65)}
  .th-fruits .sg-frame{background:linear-gradient(180deg,#f0a25a,#d4561f 38%,#9c3410 84%,#c9531e);box-shadow:inset 0 0 0 3px #f4d27a,inset 0 2px 0 rgba(255,255,255,.4),0 18px 40px rgba(0,0,0,.5)}
  .th-fruits .sg-window{background:#1b1410;box-shadow:inset 0 0 0 2px #f4d27a,inset 0 10px 18px rgba(0,0,0,.6)}
  .th-classic .sg-reel,.th-sevens .sg-reel,.th-fruits .sg-reel{background:linear-gradient(180deg,#a8a294 0%,#e6e0d3 13%,#fbf9f4 50%,#e6e0d3 87%,#a8a294 100%)}
  .th-classic .sg-reel::after,.th-sevens .sg-reel::after,.th-fruits .sg-reel::after{background:linear-gradient(180deg,rgba(40,30,20,.38),transparent 18%,transparent 82%,rgba(40,30,20,.38))}
  .th-classic .sg-cell.dim,.th-sevens .sg-cell.dim,.th-fruits .sg-cell.dim{opacity:.4;filter:grayscale(.6)}
  .th-pharaoh .sg-frame{background:repeating-linear-gradient(0deg,rgba(90,60,20,.07) 0 3px,transparent 3px 7px),linear-gradient(180deg,#e2c48a,#c49a58 40%,#8f6a35 85%,#b98d4f);box-shadow:inset 0 0 0 3px #f2d27a,inset 0 0 0 5px #6e4a1a,0 18px 40px rgba(0,0,0,.55)}
  .th-ocean .sg-frame{background:linear-gradient(180deg,#d9b27a,#a06f3a 40%,#5e3d1d 85%,#8a5c2e);box-shadow:inset 0 0 0 3px #4fb8a3,inset 0 0 24px rgba(63,181,164,.35),0 18px 40px rgba(0,0,0,.55)}
  .th-goldrush .sg-frame{background:radial-gradient(circle at 14px 14px,#c9c2b6 0 3px,#3a332b 3.5px 5px,transparent 5.5px),radial-gradient(circle at calc(100% - 14px) 14px,#c9c2b6 0 3px,#3a332b 3.5px 5px,transparent 5.5px),radial-gradient(circle at 14px calc(100% - 14px),#c9c2b6 0 3px,#3a332b 3.5px 5px,transparent 5.5px),radial-gradient(circle at calc(100% - 14px) calc(100% - 14px),#c9c2b6 0 3px,#3a332b 3.5px 5px,transparent 5.5px),repeating-linear-gradient(90deg,#74492a 0 26px,#653f22 26px 27px,#6c4425 27px 52px);box-shadow:inset 0 0 0 3px #2b2620,inset 0 2px 0 rgba(255,255,255,.18),0 18px 40px rgba(0,0,0,.6)}
  .th-dragon .sg-frame{background:linear-gradient(180deg,#c0283a,#8a1220 45%,#5a0a14);box-shadow:inset 0 0 0 3px #e0b02c,inset 0 0 0 6px #5a0a14,inset 0 0 0 7px #e0b02c,0 18px 40px rgba(0,0,0,.6)}
  .th-gems .sg-frame{background:linear-gradient(180deg,#5d3591,#321a57 55%,#1d0e36);box-shadow:inset 0 0 0 2px #d6dde5,inset 0 0 0 4px #321a57,inset 0 0 0 5px #9aa6b2,0 18px 40px rgba(0,0,0,.6)}
  .th-clover .sg-frame{background:linear-gradient(180deg,#24a35c,#137a40 50%,#0b5129);box-shadow:inset 0 0 0 3px #e0b02c,inset 0 2px 0 rgba(255,255,255,.3),0 18px 40px rgba(0,0,0,.55)}
  .th-cosmic .sg-frame{background:linear-gradient(180deg,#56626f,#2a323b 50%,#171c22);box-shadow:inset 0 0 0 2px #25c6da,inset 0 0 18px rgba(37,198,218,.25),0 18px 40px rgba(0,0,0,.6)}
  .th-candy .sg-frame{background:repeating-linear-gradient(45deg,#fff7fb 0 14px,#f06292 14px 28px);box-shadow:inset 0 0 0 3px #fff,0 18px 40px rgba(0,0,0,.45)}
  /* control bar */
  .sg .sg-hud{background:linear-gradient(180deg,rgba(9,12,17,.86),rgba(9,12,17,.97));border-top:1px solid rgba(255,255,255,.08)}
  .sg .sg-stat span{font-size:10px;letter-spacing:.14em;color:rgba(230,238,246,.55)}
  .sg .sg-spin{box-shadow:0 0 0 5px #1b2129,0 0 0 6px rgba(255,255,255,.14),0 10px 22px rgba(0,0,0,.55),inset 0 2px 0 rgba(255,255,255,.3)}
  .sg .sg-b.sg-round{background:#1b2129;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 4px 10px rgba(0,0,0,.45)}
  .sg .sg-b.sg-round:hover{background:#232b35}
  .sg .sg-b.sg-pm{background:#1b2129;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}
  `;
  document.head.appendChild(cab);
})();