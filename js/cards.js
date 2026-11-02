/* Playing cards: a classic printed deck (SVG-cards by David Bellot, LGPL-2.1, see img/cards/README.md) shown as
 * images. Very small cards (e.g. seats at a full table on a phone) switch to a large, plain rank + suit so they stay
 * readable. Replaces Casino.cardEl, which every card game uses. */
(function () {
  'use strict';
  const C = Casino, h = C.h, L = window.Lib;
  const SUIT_FILE = ['spade', 'heart', 'diamond', 'club'];
  const RANK_FILE = { 11: 'jack', 12: 'queen', 13: 'king', 14: '1' };
  const src = (c) => `img/cards/${SUIT_FILE[c.s]}_${RANK_FILE[c.r] || c.r}.webp`;
  const BACK = 'img/cards/back-red.webp';

  // fetch the whole deck in the background once, so a freshly dealt card never appears blank
  let preloaded = false;
  const preload = () => {
    if (preloaded) return; preloaded = true;
    const all = [BACK]; for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) all.push(src({ r, s }));
    const go = () => all.forEach((u) => { const i = new Image(); i.decoding = 'async'; i.src = u; });
    (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(go);
  };

  const img = (u, alt) => h('img', { class: 'card-img', src: u, alt, draggable: 'false', decoding: 'async' });
  C.cardEl = (c, opts = {}) => {
    preload();
    if (!c || opts.hidden) return h('div', { class: 'card back' + (opts.cls ? ' ' + opts.cls : '') }, img(BACK, 'Face-down card'));
    const red = c.s === 1 || c.s === 2, name = L.cardStr ? L.cardStr(c) : '';
    return h('div', { class: 'card' + (red ? ' red' : '') + (c.r >= 11 && c.r <= 13 ? ' face' : '') + (c.r === 14 ? ' ace' : '') + (opts.cls ? ' ' + opts.cls : '') },
      img(src(c), name),
      h('span', { class: 'card-mini', 'aria-hidden': 'true' }, h('b', null, L.RANK_STR[c.r]), h('i', null, L.SUITS[c.s] + '︎')));
  };
})();
