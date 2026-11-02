/* Game loading screen: a full-screen splash with the game's cover art, title and a progress bar that tracks the
 * game's real images and fonts loading. It stays at least a moment so it feels deliberate (longer the first time a
 * game is opened in a session) and can be skipped with a tap once half-way. */
(function () {
  'use strict';
  const C = Casino, h = C.h;
  const TIPS = [
    'Every result is decided on our server. The animation only shows it.',
    'Set deposit limits or take a break any time on the Responsible Gambling page.',
    'Switch between demo credits and real money from the balance menu.',
    'In the PvP Arena, the winner takes the pot.',
    'Live Blackjack: up to five players against one dealer.',
    'Your bet history and stats are under Account.',
    'Gamble for fun. Never bet more than you can afford to lose.',
  ];
  const seen = new Set();
  try { JSON.parse(sessionStorage.getItem('casino.loaded') || '[]').forEach((x) => seen.add(x)); } catch (e) { /* ignore */ }

  /** Create and show a loader. Returns { ready(root), close() }. */
  C.loader = ({ id, title, sub, img, icon = 'dice', accent }) => {
    const first = !seen.has(id);
    seen.add(id); try { sessionStorage.setItem('casino.loaded', JSON.stringify([...seen].slice(-80))); } catch (e) { /* ignore */ }
    const minMs = first ? 1500 : 550, t0 = performance.now();
    const fill = h('i'), pct = h('span', { class: 'ld-pct' }, '0%');
    const art = img ? h('img', { class: 'ld-cover', src: img, alt: '', onerror: (e) => e.target.replaceWith(h('div', { class: 'ld-icon' }, C.icon(icon))) }) : h('div', { class: 'ld-icon' }, C.icon(icon));
    const el = h('div', { class: 'game-loader' + (first ? '' : ' quick'), role: 'status', 'aria-label': `Loading ${title}`, style: accent ? `--ld-accent:${accent}` : null },
      h('div', { class: 'ld-bg', style: img ? `background-image:url('${img}')` : null }),
      h('div', { class: 'ld-glow' }),
      h('div', { class: 'ld-box' },
        h('div', { class: 'ld-art' }, h('div', { class: 'ld-ring' }), art),
        h('div', { class: 'ld-kicker' }, sub || 'Krush Casino'),
        h('div', { class: 'ld-title' }, title),
        h('div', { class: 'ld-bar' }, fill),
        h('div', { class: 'ld-row' }, h('span', { class: 'ld-tip' }, TIPS[Math.floor(Math.random() * TIPS.length)]), pct)));
    document.body.append(el);
    document.body.classList.add('is-loading');
    // progress: eases toward a target that rises with real loading, never jumps backwards
    let shown = 0, target = 0.12, done = false, closed = false;
    const loop = () => {
      if (closed) return;
      const elapsed = performance.now() - t0, timeFloor = Math.min(0.9, elapsed / minMs * 0.9);
      const goal = done ? 1 : Math.max(target, timeFloor);
      shown += (goal - shown) * (done ? 0.25 : 0.08);
      fill.style.width = (shown * 100).toFixed(1) + '%'; pct.textContent = Math.round(shown * 100) + '%';
      if (done && shown > 0.995) return finish();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const close = () => {
      if (closed) return; closed = true;
      el.classList.add('out'); document.body.classList.remove('is-loading');
      setTimeout(() => el.remove(), 450);
    };
    const finish = () => { fill.style.width = '100%'; pct.textContent = '100%'; setTimeout(close, 120); };
    el.addEventListener('click', () => { if (shown > 0.5) { done = true; shown = 1; finish(); } });
    return {
      close,
      /** Wait for the images inside root and the fonts, then complete (at least minMs after opening). */
      async ready(root) {
        const imgs = root ? [...root.querySelectorAll('img')].filter((i) => !i.complete) : [];
        let left = imgs.length + 1;
        const step = () => { left--; target = Math.max(target, 0.15 + 0.75 * (1 - left / (imgs.length + 1))); };
        const loaded = Promise.all([
          ...imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }).then(step)),
          (document.fonts ? document.fonts.ready : Promise.resolve()).then(step),
        ]);
        await Promise.race([loaded, new Promise((r) => setTimeout(r, 4000))]); // never hang on a slow image
        const wait = minMs - (performance.now() - t0);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        done = true;
      },
    };
  };
})();
