/* Video slots: one engine, eleven themed cabinets. Reels scroll as real strips, wins are presented line by line
 * (or by ways), and free spins play out as a sequence after the paid spin. All outcomes come from the server. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const NS = 'http://www.w3.org/2000/svg';
  const LINE_COLORS = ['#ffc24b', '#22e58b', '#3d8bff', '#ff4d63', '#a855f7', '#00d1d1', '#ff8a3d', '#f472b6', '#a3e635', '#e5e7eb'];
  const r2 = (x) => Math.floor(x * 100) / 100;
  const fmtX = (x) => (x >= 100 ? Math.floor(x) : x >= 10 ? Math.floor(x * 10) / 10 : x >= 1 ? r2(x) : (Math.floor(x * 1000) / 1000).toString().replace(/^0/, '0')) + '×';

  const SYM_NAME = { cherry: 'Cherry', lemon: 'Lemon', orange: 'Orange', plum: 'Plum', grape: 'Grapes', melon: 'Melon', bell: 'Bell', seven: 'Seven', wild: 'Wild', scatter: 'Bonus', bar: 'Bar', bar2: 'Double bar', bar3: 'Triple bar',
    'g-blue': 'Sapphire', 'g-green': 'Emerald', 'g-purple': 'Amethyst', 'g-orange': 'Topaz', 'g-red': 'Ruby', 'g-pink': 'Pink gem', crown: 'Crown', diamond: 'Diamond',
    T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace', ankh: 'Ankh', eye: 'Eye of Horus', scarab: 'Scarab', cat: 'Sacred cat', starfish: 'Starfish', octopus: 'Octopus', shell: 'Shell', chest: 'Treasure chest',
    horseshoe: 'Horseshoe', lantern: 'Lantern', pickaxe: 'Pickaxe', nugget: 'Gold nugget', fan: 'Fan', coin: 'Lucky coin', lantern2: 'Lantern', koi: 'Koi', ingot: 'Gold ingot',
    'c-wrap': 'Blue candy', 'c-drop': 'Gumdrop', 'c-heart': 'Candy heart', 'c-bear': 'Gummy bear', 'c-lolly': 'Lollipop', 'c-donut': 'Donut', 'c-cupcake': 'Cupcake',
    'n-cherry': 'Cherry', 'n-lemon': 'Lemon', 'n-bell': 'Bell', 'n-bar': 'Bar', 'n-diamond': 'Diamond', 'n-star': 'Star', 'n-seven': 'Seven',
    clover: 'Four-leaf clover', horseshoe2: 'Golden horseshoe', hat: 'Top hat', pot: 'Pot of gold', planet: 'Planet', comet: 'Comet', ufo: 'UFO', astronaut: 'Astronaut' };

  /* Cabinet look per theme: logo face, logo colours, cabinet class. */
  const THEMES = {
    fruits: { n: 50, font: 'Lilita One', logo: ['#fff59d', '#ff9800', '#e65100'], blurb: 'Five reels of fruit, ten lines, wilds and scatters.' },
    gems: { n: 51, font: 'Titan One', logo: ['#ffffff', '#e1bee7', '#8e24aa'], blurb: 'Cut gems and crowns across ten lines. Diamonds pay big.' },
    sevens: { n: 52, font: 'Bungee', logo: ['#fff', '#ff5252', '#b71c1c'], blurb: 'Three reels, five lines, bars and flaming sevens.' },
    pharaoh: { n: 54, font: 'Cinzel Decorative', logo: ['#fff6c8', '#ffd54f', '#a37400'], blurb: 'Twenty lines along the Nile. Three pyramids open ten free spins at 2×.' },
    ocean: { n: 55, font: 'Lilita One', logo: ['#e0f7fa', '#4dd0e1', '#00838f'], blurb: '243 ways to win on the sea floor. Free spins pay triple.' },
    goldrush: { n: 56, font: 'Rye', logo: ['#fff6c8', '#ffca28', '#8d5b00'], blurb: 'Stake a claim across 25 lines. Mine carts bring up to 20 free spins.' },
    dragon: { n: 57, font: 'Cinzel Decorative', logo: ['#fff3c4', '#ffd54f', '#c62828'], blurb: '1024 ways on four rows. The flaming pearl is wild.' },
    candy: { n: 58, font: 'Luckiest Guy', logo: ['#fff', '#ff80ab', '#d500f9'], blurb: '243 sugary ways. Gumball machines unlock free spins at 3×.' },
    neon: { n: 59, font: 'Monoton', logo: ['#e0fbff', '#00e5ff', '#00e5ff'], blurb: 'A late-night classic in glowing tubes. Ten lines, free spins at 2×.' },
    clover: { n: 60, font: 'Lilita One', logo: ['#fffde7', '#c6ff00', '#2e7d32'], blurb: 'Twenty lines of Irish luck. Gold coins award up to 20 free spins.' },
    cosmic: { n: 61, font: 'Russo One', logo: ['#ffffff', '#b388ff', '#6200ea'], blurb: 'Five by four, forty lines, out of this world.' },
  };

  function logoSvg(name, th) {
    const g = 'lg' + Math.random().toString(36).slice(2, 8), long = name.length > 12;
    const neon = th.font === 'Monoton';
    const fit = long ? ' textLength="560" lengthAdjust="spacingAndGlyphs"' : '';
    return `<svg viewBox="0 0 600 96" class="vs-logo" aria-label="${name}"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${th.logo[0]}"/><stop offset=".55" stop-color="${th.logo[1]}"/><stop offset="1" stop-color="${th.logo[2]}"/></linearGradient>
      <filter id="${g}f" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="${neon ? 6 : 0.1}"/></filter></defs>
      ${neon ? `<text x="300" y="68" text-anchor="middle" font-family="${th.font}" font-size="58"${fit} fill="${th.logo[1]}" filter="url(#${g}f)">${name}</text>` : `<text x="300" y="74" text-anchor="middle" font-family="${th.font}, Impact, sans-serif" font-size="62" font-weight="900"${fit} fill="#000" opacity=".55">${name}</text>`}
      <text x="300" y="68" text-anchor="middle" font-family="${th.font}, Impact, sans-serif" font-size="${neon ? 58 : 62}" font-weight="900"${fit} fill="url(#${g})" ${neon ? '' : 'stroke="#1a0d00" stroke-width="7" paint-order="stroke" stroke-linejoin="round"'}>${name}</text></svg>`;
  }

  function videoSlot(id) {
    const T0 = L.SLOT_THEMES[id], th = THEMES[id], ways = T0.mode === 'ways';
    const layoutTxt = ways ? `${T0.rows === 4 ? 1024 : 243} ways` : `${T0.lines.length} line${T0.lines.length > 1 ? 's' : ''}`;
    const edgeTxt = () => (L.EDGE[id] * 100).toFixed(0) + '%';
    C.register({
      n: th.n, id, name: T0.name, icon: '7', cat: 'slots', blurb: th.blurb, get edge() { return edgeTxt(); },
      rules: `<p>${T0.reels} reels × ${T0.rows} rows, ${layoutTxt}. ${ways ? 'A symbol wins when it lands on adjacent reels starting from the left, in any position. Each extra matching symbol on a reel multiplies the win.' : 'Your bet is spread evenly across every line. A line wins with three or more matching symbols from the leftmost reel.'}
        Wild substitutes for every paying symbol.${T0.scatter ? ' Bonus symbols pay anywhere on the screen.' : ''}${T0.free ? ` Three or more Bonus symbols award ${Object.values(T0.free.spins).join(' / ')} free spins (for 3 / 4 / 5), and every free-spin win is multiplied by ${T0.free.mult}.` : ''}</p>`,
      get edges() {
        const t = L.slotTable(id);
        return [...Object.entries(t.pays).map(([s, p]) => [SYM_NAME[s] || s, p.map((x) => fmtX(ways ? x : x / t.lines.length)).join(' / '), '']),
          ...(t.scatter ? Object.entries(t.scatter).map(([k, v]) => [k + ' Bonus symbols', fmtX(v), '']) : []), ['Overall', '', edgeTxt()]];
      },
      mount(root) {
        const bet = C.betInput({ value: 1, label: 'Total bet' });
        const msg = C.msg();
        let alive = true, spinning = false, auto = false, turbo = false, cycle = null, pending = null;
        const t = () => L.slotTable(id);
        const syms = T0.symbols.map((x) => x[0]), weights = T0.symbols.map((x) => x[1]), W = weights.reduce((a, b) => a + b, 0);
        const rnd = () => { let x = Math.random() * W; for (let i = 0; i < syms.length; i++) { x -= weights[i]; if (x < 0) return syms[i]; } return syms[0]; };
        const cellEl = (s) => { const c = h('div', { class: 'vs-cell', 'data-s': s }); c.innerHTML = C.slotSymArt(id, s); return c; };
        const reels = Array.from({ length: T0.reels }, () => { const el = h('div', { class: 'vs-reel' }); for (let k = 0; k < T0.rows; k++) el.append(cellEl(rnd())); return { el, cells: [...el.children] }; });
        const lines = document.createElementNS(NS, 'svg'); lines.setAttribute('class', 'vs-lines'); lines.setAttribute('viewBox', '0 0 100 100'); lines.setAttribute('preserveAspectRatio', 'none');
        const winAmt = h('b', null, '0.00'), winLbl = h('span', null, 'WIN'), fsEl = h('div', { class: 'vs-fs' });
        const banner = h('div', { class: 'vs-banner' });
        const pt = h('div', { class: 'pays-list vs-pays' });
        function paintTable() {
          const tb = t(); pt.innerHTML = '';
          const head = ways ? ['3', '4', '5'] : T0.reels === 3 ? ['3'] : ['3', '4', '5'];
          pt.append(h('div', { class: 'vs-ph' }, h('span', null, ''), ...head.map((x) => h('i', null, x + '×'))));
          Object.entries(tb.pays).reverse().forEach(([s, p]) => pt.append(h('div', { 'data-s': s }, h('span', { class: 'pt-art', html: C.slotSymArt(id, s) }), ...p.map((x) => h('b', null, fmtX(ways ? x : x / tb.lines.length))))));
          if (tb.scatter) pt.append(h('div', { 'data-s': 'scatter' }, h('span', { class: 'pt-art', html: C.slotSymArt(id, 'scatter') }), ...Object.entries(tb.scatter).map(([, v]) => h('b', null, fmtX(v)))));
        }
        paintTable();
        const feature = T0.free ? h('div', { class: 'vs-feature' }, h('span', { class: 'pt-art', html: C.slotSymArt(id, 'scatter') }), h('div', null, h('b', null, 'FREE SPINS'),
          h('div', null, `3 / 4 / 5 Bonus = ${Object.values(T0.free.spins).join(' / ')} spins. All free-spin wins ×${T0.free.mult}.`))) : null;
        const spinBtn = h('button', { class: 'btn big vs-spin', onclick: () => spin(), 'aria-label': 'Spin' }, 'SPIN');
        const autoBtn = h('button', { class: 'btn ghost', onclick: () => { auto = !auto; autoBtn.classList.toggle('on', auto); autoBtn.textContent = auto ? 'Stop' : 'Auto'; if (auto && !spinning) spin(); } }, 'Auto');
        const turboBtn = h('button', { class: 'btn ghost', title: 'Faster reels', onclick: () => { turbo = !turbo; turboBtn.classList.toggle('on', turbo); } }, 'Turbo');
        const windowEl = h('div', { class: 'vs-window r' + T0.reels + ' rows' + T0.rows }, reels.map((r) => r.el), lines, banner);
        root.appendChild(h('div', { class: 'layout' },
          h('div', { class: 'side' }, bet.el, h('div', { class: 'controls vs-ctl' }, spinBtn), h('div', { class: 'controls vs-ctl2' }, autoBtn, turboBtn),
            feature, h('h3', null, 'Paytable'), pt, h('div', { class: 'muted', style: 'font-size:12px' }, `${layoutTxt} · pays shown as multiples of your total bet${ways ? ' (per way)' : ''} · Wild substitutes`)),
          h('div', { class: 'stage vs-stage th-' + id },
            h('div', { class: 'vslot th-' + id },
              h('div', { class: 'vs-top', html: logoSvg(T0.name, th) }),
              h('div', { class: 'vs-frame' }, windowEl),
              h('div', { class: 'vs-bar' }, h('span', { class: 'vs-chip' }, layoutTxt), h('div', { class: 'vs-win' }, winLbl, winAmt), fsEl)),
            msg.el)));
        const onKey = (e) => { if (e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); spin(); } };
        document.addEventListener('keydown', onKey);

        function clearWins() { if (cycle) { clearInterval(cycle); cycle = null; } lines.innerHTML = ''; reels.forEach((r) => r.cells.forEach((c) => c.classList.remove('hit', 'dim'))); pt.querySelectorAll('div').forEach((d) => d.classList.remove('hit')); }
        function drawLine(li) {
          const pts = T0.lines[li].map((row, r) => `${((r + 0.5) / T0.reels) * 100},${((row + 0.5) / T0.rows) * 100}`).join(' ');
          const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('stroke', LINE_COLORS[li % LINE_COLORS.length]); pl.setAttribute('vector-effect', 'non-scaling-stroke'); lines.append(pl);
        }
        function light(ws, scat) {
          lines.innerHTML = '';
          reels.forEach((r) => r.cells.forEach((c) => { c.classList.remove('hit'); c.classList.add('dim'); }));
          ws.forEach((w) => { if (w.line != null) drawLine(w.line); w.cells.forEach(([r, row]) => { const c = reels[r].cells[row]; c.classList.add('hit'); c.classList.remove('dim'); }); });
          if (scat) reels.forEach((r) => r.cells.forEach((c) => { if (c.dataset.s === 'scatter') { c.classList.add('hit'); c.classList.remove('dim'); } }));
        }
        function showWins(res) {
          const all = res.wins, scat = res.scatterPay > 0;
          if (!all.length && !scat) return;
          light(all, scat);
          all.forEach((w) => { const row = pt.querySelector(`[data-s="${w.sym}"]`); if (row) row.classList.add('hit'); });
          if (scat) { const row = pt.querySelector('[data-s="scatter"]'); if (row) row.classList.add('hit'); }
          if (all.length > 1) { let k = -1; cycle = setInterval(() => { k = (k + 1) % (all.length + 1); light(k === all.length ? all : [all[k]], k === all.length && scat); }, 1000); }
        }
        /** Scroll each reel as a strip and stop it on the result. */
        async function roll(grid, fast) {
          const dur = fast || turbo ? 420 : 760, step = fast || turbo ? 90 : 190;
          const ch = reels[0].el.clientHeight / T0.rows;
          await Promise.all(reels.map((rl, i) => new Promise((done) => {
            const extra = 10 + i * 3, finalS = grid[i], cur = rl.cells.map((c) => c.dataset.s);
            const strip = h('div', { class: 'vs-strip blur' }, [...finalS, ...Array.from({ length: extra }, rnd), ...cur].map((s) => { const c = cellEl(s); c.style.height = ch + 'px'; return c; }));
            rl.el.style.height = rl.el.clientHeight + 'px'; rl.el.innerHTML = ''; rl.el.append(strip);
            const total = (extra + T0.rows) * ch, d = dur + i * step;
            const anim = strip.animate([{ transform: `translateY(${-total}px)` }, { transform: `translateY(${ch * 0.12}px)`, offset: 0.9 }, { transform: 'translateY(0)' }], { duration: d, easing: 'cubic-bezier(.3,.1,.3,1)' });
            setTimeout(() => strip.classList.remove('blur'), d * 0.72);
            anim.onfinish = () => {
              rl.el.innerHTML = ''; rl.el.style.height = ''; rl.cells = finalS.map(cellEl); rl.el.append(...rl.cells);
              C.sfx && C.sfx('tick'); done();
            };
          })));
        }
        const countUp = (from, to, ms = 600) => new Promise((done) => { const t0 = performance.now(); (function f(now) { const p = Math.min(1, (now - t0) / ms); winAmt.textContent = C.fmt(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1 && alive) requestAnimationFrame(f); else done(); })(t0); });
        const showBanner = async (html, ms) => { banner.innerHTML = html; banner.classList.add('on'); await C.sleep(ms); banner.classList.remove('on'); };
        async function spin() {
          if (spinning || !alive) return;
          spinning = true; spinBtn.disabled = true; bet.disable(true); clearWins();
          const b = bet.value;
          const r = await C.try(() => C.play(id, null, { bet: b }));
          if (!r) { spinning = false; spinBtn.disabled = false; bet.disable(false); auto = false; autoBtn.classList.remove('on'); autoBtn.textContent = 'Auto'; return; }
          const res = r.result;
          if (res.free && res.free.length) { clearTimeout(r._t); pending = r; }
          paintTable(); msg.set(' '); winAmt.parentNode.classList.remove('on'); winAmt.textContent = '0.00'; winLbl.textContent = 'WIN'; fsEl.textContent = '';
          await roll(res.grid);
          if (!alive) return;
          let shown = r2(b * res.baseMult);
          if (shown > 0) { showWins(res); winAmt.parentNode.classList.add('on'); await countUp(0, shown, 500); }
          if (res.free && res.free.length) {
            await C.sleep(900); clearWins();
            C.sfx && C.sfx('bigwin');
            await showBanner(`<div class="vb-k">${res.scatter} BONUS</div><div class="vb-m">${res.free.length} FREE SPINS</div><div class="vb-s">every win ×${res.freeMult}</div>`, 1900);
            document.querySelector('.vslot.th-' + id)?.classList.add('fs');
            for (let i = 0; i < res.free.length && alive; i++) {
              fsEl.textContent = `FREE SPIN ${i + 1} / ${res.free.length}`; clearWins();
              const s = res.free[i];
              await roll(s.grid, true);
              const add = r2(b * s.mult * res.freeMult);
              if (add > 0) { showWins(s); await countUp(shown, shown + add, 380); shown = r2(shown + add); winAmt.parentNode.classList.add('on'); await C.sleep(650); } else await C.sleep(260);
              if (cycle) { clearInterval(cycle); cycle = null; }
            }
            document.querySelector('.vslot.th-' + id)?.classList.remove('fs');
            if (alive) await showBanner(`<div class="vb-k">FREE SPINS WIN</div><div class="vb-m">${C.fmt(r.payout)}</div>`, 1700);
            pending = null; fsEl.textContent = '';
          }
          if (!alive) return;
          winAmt.textContent = C.fmt(r.payout);
          C.settle(r);
          if (r.payout > 0) {
            const parts = []; if (res.wins.length) parts.push(res.wins.length + (ways ? res.wins.length === 1 ? ' symbol' : ' symbols' : res.wins.length === 1 ? ' line' : ' lines')); if (res.scatterPay) parts.push(res.scatter + ' Bonus'); if (res.free && res.free.length) parts.push(res.free.length + ' free spins');
            msg.set(`WIN ${C.fmt(r.payout)} · ${parts.join(' + ')} · ${res.mult}×`, r.payout >= r.wager ? 'win' : '');
          } else msg.set('No win', 'lose');
          spinning = false; spinBtn.disabled = false; bet.disable(false);
          if (auto && alive) setTimeout(spin, r.payout ? 1300 : turbo ? 250 : 500);
        }
        return () => { alive = false; auto = false; if (cycle) clearInterval(cycle); document.removeEventListener('keydown', onKey); if (pending) C.settle(pending); };
      },
    });
  }
  L.SLOT_IDS.forEach(videoSlot);

  const css = document.createElement('style');
  css.textContent = `
  .vs-stage{padding:18px 16px;justify-content:flex-start}
  .vslot{position:relative;width:100%;max-width:720px;border-radius:24px;padding:10px 16px 14px;box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12),inset 0 0 0 1px rgba(255,255,255,.06);overflow:hidden;isolation:isolate}
  .vslot::before{content:'';position:absolute;inset:0;z-index:-1;opacity:.55;pointer-events:none}
  .vslot.th-sevens{max-width:470px}
  .vs-top{display:flex;justify-content:center;margin:0 auto 6px;max-width:94%}.vs-logo{width:100%;height:auto;max-height:78px;overflow:visible}
  .vs-frame{position:relative;padding:8px;border-radius:16px;background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(0,0,0,.35));box-shadow:0 6px 18px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,255,255,.25)}
  .vs-window{position:relative;display:grid;gap:4px;background:rgba(4,8,14,.82);padding:6px;border-radius:12px;box-shadow:inset 0 4px 16px rgba(0,0,0,.8)}
  .vs-window.r5{grid-template-columns:repeat(5,1fr)}.vs-window.r3{grid-template-columns:repeat(3,1fr)}
  .vs-reel{position:relative;display:flex;flex-direction:column;overflow:hidden;border-radius:8px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02) 20%,rgba(255,255,255,.02) 80%,rgba(255,255,255,.07))}
  .vs-reel::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 18%,transparent 82%,rgba(0,0,0,.45))}
  .vs-strip{display:flex;flex-direction:column;will-change:transform}.vs-strip.blur .vs-cell{filter:blur(2px) brightness(.9)}
  .vs-cell{aspect-ratio:1;display:grid;place-items:center;flex:none;transition:opacity .2s,transform .2s}.vs-strip .vs-cell{aspect-ratio:auto}
  .vs-cell .art{width:84%;height:84%}
  .vs-cell.dim{opacity:.3}.vs-cell.hit{position:relative;z-index:1;animation:vhit .8s ease-in-out infinite alternate}
  .vs-cell.hit::before{content:'';position:absolute;inset:2px;border-radius:10px;box-shadow:inset 0 0 0 2px #ffd54f,0 0 18px rgba(255,213,79,.55);background:radial-gradient(circle,rgba(255,213,79,.18),transparent 70%)}
  @keyframes vhit{to{transform:scale(1.07)}}
  .vs-lines{position:absolute;inset:6px;width:calc(100% - 12px);height:calc(100% - 12px);pointer-events:none;z-index:2}.vs-lines polyline{fill:none;stroke-width:4;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 3px rgba(0,0,0,.9))}
  .vs-bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-top:10px}
  .vs-chip{justify-self:start;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(0,0,0,.4);color:rgba(255,255,255,.85)}
  .vs-win{display:flex;gap:8px;align-items:baseline;padding:6px 18px;border-radius:12px;background:rgba(0,0,0,.45);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
  .vs-win span{font-size:12px;font-weight:800;letter-spacing:.12em;color:rgba(255,255,255,.7)}.vs-win b{font-size:22px;font-variant-numeric:tabular-nums;color:#fff}.vs-win.on b{color:#ffd54f;text-shadow:0 0 12px rgba(255,213,79,.6)}
  .vs-fs{justify-self:end;font-size:12px;font-weight:900;letter-spacing:.06em;color:#ffd54f}
  .vs-banner{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:radial-gradient(circle,rgba(0,0,0,.55),rgba(0,0,0,.82));opacity:0;pointer-events:none;transition:opacity .25s;border-radius:12px;text-align:center}
  .vs-banner.on{opacity:1}.vb-k{font:900 14px/1 'Lilita One',sans-serif;letter-spacing:.2em;color:#ffd54f}.vb-m{font:400 clamp(30px,6vw,52px)/1.05 'Luckiest Guy','Lilita One',sans-serif;color:#fff;text-shadow:0 4px 0 #b45309,0 0 24px rgba(255,213,79,.6)}.vb-s{font-weight:800;color:#fff;opacity:.9}
  .vs-banner.on .vb-m{animation:vbpop .5s cubic-bezier(.3,1.6,.5,1)}@keyframes vbpop{from{transform:scale(.4)}}
  .vslot.fs .vs-frame{box-shadow:0 0 0 3px #ffd54f,0 0 30px rgba(255,213,79,.55)}
  .vs-reel>.vs-cell[data-s=scatter]{filter:drop-shadow(0 0 8px rgba(255,213,79,.7))}
  .vs-ctl .vs-spin{width:100%}.vs-ctl2 .btn{flex:1}.vs-ctl2 .btn.on{background:var(--brand);color:var(--brand-ink)}
  .vs-feature{display:flex;gap:10px;align-items:center;padding:10px;border-radius:10px;background:linear-gradient(90deg,rgba(255,213,79,.14),rgba(255,213,79,.04));box-shadow:inset 0 0 0 1px rgba(255,213,79,.25);font-size:12px;color:var(--muted)}
  .vs-feature b{color:#ffd54f;font-size:13px;letter-spacing:.06em}.vs-feature .pt-art{width:44px;height:44px;flex:none}.vs-feature .pt-art svg{width:100%;height:100%}
  .vs-pays{font-size:12px}.vs-pays>div{display:grid;grid-template-columns:34px repeat(3,1fr);align-items:center;gap:4px}.vs-pays>div>b{text-align:right;font-variant-numeric:tabular-nums}
  .vs-pays .vs-ph i{font-style:normal;text-align:right;color:var(--muted);font-size:11px;font-weight:700}.vs-pays .pt-art{width:30px;height:30px}.vs-pays .pt-art svg{width:100%;height:100%}
  .th-sevens .vs-pays>div,.vs-pays:has(.vs-ph i:only-of-type)>div{grid-template-columns:34px 1fr}
  @media(max-width:700px){.vslot{padding:8px 8px 10px;border-radius:16px}.vs-frame{padding:5px}.vs-window{gap:3px;padding:4px}.vs-win b{font-size:18px}.vs-bar{grid-template-columns:auto 1fr auto}.vs-chip{font-size:10px}}

  /* ---- cabinets ---- */
  .vslot.th-fruits{background:radial-gradient(120% 80% at 50% 0%,#ffb74d,#e65100 55%,#7f2700)}
  .vslot.th-fruits::before{background:repeating-conic-gradient(from 0deg at 50% 0%,rgba(255,255,255,.12) 0 6deg,transparent 6deg 12deg)}
  .vslot.th-gems{background:radial-gradient(120% 80% at 50% 0%,#7e57c2,#311b92 55%,#12082e)}
  .vslot.th-gems::before{background:radial-gradient(circle at 15% 30%,rgba(255,255,255,.35) 0 1.5px,transparent 2px),radial-gradient(circle at 80% 20%,rgba(255,255,255,.3) 0 1px,transparent 2px),radial-gradient(circle at 60% 80%,rgba(255,255,255,.25) 0 1.5px,transparent 2px);background-size:90px 90px,70px 70px,110px 110px}
  .vslot.th-sevens{background:linear-gradient(180deg,#b71c1c,#4a0000)}
  .vslot.th-sevens::before{background:repeating-linear-gradient(90deg,rgba(255,215,64,.18) 0 2px,transparent 2px 22px)}
  .vslot.th-pharaoh{background:linear-gradient(180deg,#d9a441,#9c6516 55%,#4a2c06)}
  .vslot.th-pharaoh::before{opacity:.22;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' fill='none' stroke='%233b2200' stroke-width='3'%3E%3Cpath d='M10 70 L25 40 L40 70z M50 20 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M58 28 v20 M50 36 h16 M8 14 h24 M14 8 v12 M26 8 v12'/%3E%3C/svg%3E")}
  .vslot.th-pharaoh .vs-frame{background:linear-gradient(180deg,#ffe082,#b8860b 40%,#6d4c00);box-shadow:0 6px 18px rgba(0,0,0,.5),inset 0 0 0 3px #1e3a8a}
  .vslot.th-ocean{background:linear-gradient(180deg,#0277bd,#01386b 55%,#001a33)}
  .vslot.th-ocean::before{opacity:.35;background:repeating-linear-gradient(115deg,rgba(255,255,255,.18) 0 18px,transparent 18px 70px),radial-gradient(circle at 20% 70%,rgba(255,255,255,.5) 0 3px,transparent 4px),radial-gradient(circle at 85% 40%,rgba(255,255,255,.5) 0 2px,transparent 3px);background-size:auto,120px 120px,90px 90px}
  .vslot.th-ocean .vs-frame{background:linear-gradient(180deg,#80deea,#00838f 50%,#004d40)}
  .vslot.th-goldrush{background:repeating-linear-gradient(180deg,#7a4a22 0 26px,#6a3e1a 26px 28px,#83532a 28px 54px,#5e3615 54px 56px)}
  .vslot.th-goldrush::before{opacity:.4;background:radial-gradient(circle at 8px 8px,#2a1505 2px,transparent 3px);background-size:56px 28px}
  .vslot.th-goldrush .vs-frame{background:linear-gradient(180deg,#9aa5ad,#4a545b 50%,#22282c);box-shadow:0 6px 18px rgba(0,0,0,.6),inset 0 0 0 2px #c0c8cd}
  .vslot.th-dragon{background:radial-gradient(120% 80% at 50% 0%,#e53935,#8e0000 55%,#3a0000)}
  .vslot.th-dragon::before{opacity:.28;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='40' fill='none' stroke='%23ffd54f' stroke-width='2'%3E%3Cpath d='M4 30 q8 -14 16 0 q8 -14 16 0 M34 14 q8 -14 16 0 q8 -14 16 0'/%3E%3C/svg%3E")}
  .vslot.th-dragon .vs-frame{background:linear-gradient(180deg,#ffe082,#c99a06 45%,#6d4c00)}
  .vslot.th-candy{background:radial-gradient(120% 80% at 50% 0%,#ff80ab,#ec407a 50%,#880e4f)}
  .vslot.th-candy::before{opacity:.5;background:radial-gradient(circle,rgba(255,255,255,.35) 0 5px,transparent 6px);background-size:34px 34px}
  .vslot.th-candy .vs-frame{background:repeating-linear-gradient(45deg,#fff 0 10px,#ff4081 10px 20px)}
  .vslot.th-neon{background:#16121c}
  .vslot.th-neon::before{opacity:.35;background:repeating-linear-gradient(0deg,#2a1f2e 0 2px,transparent 2px 22px),repeating-linear-gradient(90deg,#2a1f2e 0 2px,transparent 2px 46px)}
  .vslot.th-neon .vs-frame{background:#0b0910;box-shadow:0 0 0 2px #ff2d6f,0 0 22px rgba(255,45,111,.6),inset 0 0 14px rgba(255,45,111,.35)}
  .vslot.th-clover{background:radial-gradient(120% 80% at 50% 0%,#66bb6a,#1b5e20 55%,#0b2a0b)}
  .vslot.th-clover::before{opacity:.18;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50' fill='%23ffffff'%3E%3Ccircle cx='20' cy='20' r='5'/%3E%3Ccircle cx='30' cy='20' r='5'/%3E%3Ccircle cx='20' cy='30' r='5'/%3E%3Ccircle cx='30' cy='30' r='5'/%3E%3C/svg%3E")}
  .vslot.th-clover .vs-frame{background:linear-gradient(180deg,#ffe082,#c99a06 45%,#6d4c00)}
  .vslot.th-cosmic{background:radial-gradient(120% 80% at 70% 0%,#4527a0,#1a0b3d 55%,#07031a)}
  .vslot.th-cosmic::before{opacity:.9;background:radial-gradient(circle at 10% 20%,#fff 0 1px,transparent 1.5px),radial-gradient(circle at 70% 60%,#fff 0 1px,transparent 1.5px),radial-gradient(circle at 40% 85%,#d1c4e9 0 1.5px,transparent 2px);background-size:60px 60px,90px 90px,120px 120px}
  .vslot.th-cosmic .vs-frame{background:linear-gradient(180deg,#eceff1,#78909c 50%,#37474f)}
  `;
  document.head.appendChild(css);
})();
