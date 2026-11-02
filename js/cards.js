/* Playing cards, drawn like a real printed deck: vector suit shapes (no emoji/text glyphs), classic pip layouts with
 * the lower half printed upside down, two-headed court cards (J, Q, K) and a lattice card back. Every card is one SVG
 * on a 250×350 canvas, so it is crisp at any size; very small cards switch to big readable indices (CSS container
 * query). Replaces Casino.cardEl, which every card game uses. */
(function () {
  'use strict';
  const C = Casino, h = C.h, L = window.Lib;
  const RED = '#c8102e', BLACK = '#16181d', GOLD = '#d9a43a', BLUE = '#1f4f9e', SKIN = '#f4d3ae', INK = '#1d1d22';
  const SUIT = [ // spade, heart, diamond, club — on a 100×100 box
    'M50 3C61 22 95 39 95 62c0 15-10 24-23 24-9 0-15-4-19-10 1 10 5 17 13 22H34c8-5 12-12 13-22-4 6-10 10-19 10C15 86 5 77 5 62 5 39 39 22 50 3z',
    'M50 92C21 70 4 53 4 32 4 16 15 6 29 6c10 0 17 6 21 15 4-9 11-15 21-15 14 0 25 10 25 26 0 21-17 38-46 60z',
    'M50 2C60 20 74 37 90 50 74 63 60 80 50 98 40 80 26 63 10 50 26 37 40 20 50 2z',
    'M50 6a19 19 0 0 1 17 28 19 19 0 1 1 1 33c-6 0-11-3-14-7 1 13 6 22 14 28H32c8-6 13-15 14-28-3 4-8 7-14 7a19 19 0 1 1 1-33A19 19 0 0 1 50 6z',
  ];
  // the shared definitions live in one hidden SVG: suit symbols, card-back lattice, court-card fabrics
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('aria-hidden', 'true');
  defs.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  defs.innerHTML = `<defs>
    ${SUIT.map((d, i) => `<symbol id="kc-s${i}" viewBox="0 0 100 100"><path d="${d}"/></symbol>`).join('')}
    <pattern id="kc-lattice" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="18" height="18" fill="#8f1d2c"/><path d="M0 9h18M9 0v18" stroke="#c94a54" stroke-width="2.2"/><circle cx="9" cy="9" r="2.6" fill="#f2d48a"/></pattern>
    <pattern id="kc-cloth-a" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${RED}"/><path d="M0 7h14M7 0v14" stroke="#e8505f" stroke-width="1.2"/></pattern>
    <pattern id="kc-cloth-b" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${BLUE}"/><circle cx="6" cy="6" r="2" fill="#f2d48a"/></pattern>
    <pattern id="kc-cloth-c" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${GOLD}"/><path d="M0 10L10 0" stroke="#a87a1e" stroke-width="1.4"/></pattern>
    <linearGradient id="kc-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffefb"/><stop offset="1" stop-color="#f4f1ea"/></linearGradient>
  </defs>`;
  const mount = () => { if (!defs.isConnected) document.body.prepend(defs); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  const pip = (s, x, y, w, flip) => `<use href="#kc-s${s}" x="${x - w / 2}" y="${y - w / 2}" width="${w}" height="${w}"${flip ? ` transform="rotate(180 ${x} ${y})"` : ''}/>`;
  const L1 = 80, L2 = 170, MID = 125; // pip columns
  const LAYOUT = {
    2: [[MID, 78], [MID, 272]], 3: [[MID, 78], [MID, 175], [MID, 272]],
    4: [[L1, 78], [L2, 78], [L1, 272], [L2, 272]], 5: [[L1, 78], [L2, 78], [MID, 175], [L1, 272], [L2, 272]],
    6: [[L1, 78], [L2, 78], [L1, 175], [L2, 175], [L1, 272], [L2, 272]],
    7: [[L1, 78], [L2, 78], [MID, 126], [L1, 175], [L2, 175], [L1, 272], [L2, 272]],
    8: [[L1, 78], [L2, 78], [MID, 126], [L1, 175], [L2, 175], [MID, 224], [L1, 272], [L2, 272]],
    9: [[L1, 78], [L2, 78], [L1, 143], [L2, 143], [MID, 175], [L1, 207], [L2, 207], [L1, 272], [L2, 272]],
    10: [[L1, 78], [L2, 78], [MID, 111], [L1, 143], [L2, 143], [L1, 207], [L2, 207], [MID, 239], [L1, 272], [L2, 272]],
  };
  const index = (rank, s, col) => {
    const ten = rank === '10';
    const one = `<text x="${ten ? 25 : 26}" y="48" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-weight="700" font-size="${ten ? 36 : 42}" ${ten ? 'letter-spacing="-4"' : ''} fill="${col}">${rank}</text>${pip(s, 26, 70, 25)}`;
    return `<g class="kc-idx" fill="${col}">${one}<g transform="rotate(180 125 175)">${one}</g></g>`;
  };

  /* ---------- court cards: one half-portrait, mirrored like a real deck ---------- */
  function courtHalf(r, s) {
    const red = s === 1 || s === 2, robe = red ? 'url(#kc-cloth-a)' : 'url(#kc-cloth-b)', robe2 = red ? 'url(#kc-cloth-b)' : 'url(#kc-cloth-a)';
    const hair = r === 12 ? '#7a4a1f' : r === 13 ? '#c9c4bb' : '#d9a43a';
    let head = '', hold = '', back = '';
    if (r === 13) { // king: tall crown, beard, sword
      head = `<path d="M100 92 L96 62 L108 74 L116 56 L125 72 L134 56 L142 74 L154 62 L150 92 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
        <circle cx="125" cy="66" r="4" fill="${RED}" stroke="${INK}"/><circle cx="108" cy="78" r="3" fill="${BLUE}"/><circle cx="142" cy="78" r="3" fill="${BLUE}"/>
        <rect x="98" y="88" width="54" height="9" fill="url(#kc-cloth-c)" stroke="${INK}" stroke-width="2"/>`;
      hold = `<path d="M176 175 L176 98" stroke="${INK}" stroke-width="5"/><path d="M176 175 L176 98" stroke="#cfd6de" stroke-width="3"/><path d="M164 112h24" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/><circle cx="176" cy="96" r="5" fill="${GOLD}" stroke="${INK}"/>`;
    } else if (r === 12) { // queen: rounded crown with veil, flower
      back = `<path d="M92 132 C86 104 94 84 104 80 L146 80 C156 84 164 104 158 132 C150 126 146 116 144 104 L106 104 C104 116 100 126 92 132 Z" fill="${hair}" stroke="${INK}" stroke-width="2"/>`;
      head = `<path d="M102 90 Q104 70 112 76 Q118 62 125 74 Q132 62 138 76 Q146 70 148 90 Z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>
        <circle cx="125" cy="76" r="4" fill="${RED}" stroke="${INK}"/><path d="M102 90 Q125 84 148 90" stroke="${INK}" stroke-width="2" fill="none"/>`;
      hold = `<path d="M72 175 C74 150 70 132 74 118" stroke="#2f7d32" stroke-width="4" fill="none"/><circle cx="74" cy="112" r="9" fill="${RED}" stroke="${INK}" stroke-width="2"/><circle cx="74" cy="112" r="3.5" fill="${GOLD}"/><path d="M74 140 q-12-2-14-12 q12 0 14 12" fill="#2f7d32"/>`;
    } else { // jack: cap with feather, halberd
      head = `<path d="M100 92 C98 74 112 66 125 66 C140 66 152 74 150 92 Z" fill="${red ? BLUE : RED}" stroke="${INK}" stroke-width="2"/>
        <path d="M96 92 h58" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/><path d="M146 74 C158 56 172 52 182 54 C170 60 160 70 150 82" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/>`;
      hold = `<path d="M72 175 L72 92" stroke="#7a4a1f" stroke-width="5"/><path d="M72 92 L62 104 L72 100 L82 104 Z M72 92 L72 82" fill="#cfd6de" stroke="${INK}" stroke-width="2"/>`;
    }
    return `
      <path d="M58 175 C60 150 78 138 102 134 L148 134 C172 138 190 150 192 175 Z" fill="${robe}" stroke="${INK}" stroke-width="2.4"/>
      <path d="M114 134 L125 175 L136 134" fill="${robe2}" stroke="${INK}" stroke-width="2"/>
      <path d="M100 134 Q125 150 150 134" fill="none" stroke="${GOLD}" stroke-width="6"/>
      <path d="M100 134 Q125 150 150 134" fill="none" stroke="${INK}" stroke-width="1.2"/>
      ${back}
      ${r !== 12 ? `<path d="M103 100 C101 116 106 128 112 132 L138 132 C144 128 149 116 147 100 Z" fill="${hair}" stroke="${INK}" stroke-width="2"/>` : ''}
      <ellipse cx="125" cy="110" rx="17" ry="21" fill="${SKIN}" stroke="${INK}" stroke-width="2"/>
      <path d="M116 106 q3-3 6 0 M128 106 q3-3 6 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M125 108 q-3 7 1 9" stroke="${INK}" stroke-width="1.5" fill="none"/>
      ${r === 13 ? `<path d="M110 118 C112 134 120 140 125 140 C130 140 138 134 140 118 C134 124 116 124 110 118 Z" fill="${hair}" stroke="${INK}" stroke-width="1.6"/>` : `<path d="M119 121 q6 4 12 0" stroke="${RED}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`}
      ${head}${hold}`;
  }
  function courtFace(r, s, col) {
    const half = courtHalf(r, s);
    return `<rect x="50" y="50" width="150" height="250" rx="6" fill="#fbf4e2" stroke="${col}" stroke-width="2.5"/>
      <clipPath id="kc-clip"><rect x="51" y="51" width="148" height="248" rx="5"/></clipPath>
      <g clip-path="url(#kc-clip)">${half}<g transform="rotate(180 125 175)">${half}</g></g>
      <path d="M52 175h146" stroke="${INK}" stroke-width="1.5"/>
      <g fill="${col}">${pip(s, 66, 66, 20)}${pip(s, 184, 284, 20, true)}</g>`;
  }

  function face(c) {
    const s = c.s, col = s === 1 || s === 2 ? RED : BLACK, rank = L.RANK_STR[c.r];
    let body;
    if (c.r >= 11 && c.r <= 13) body = courtFace(c.r, s, col);
    else if (c.r === 14) {
      body = s === 0
        ? `<circle cx="125" cy="175" r="62" fill="none" stroke="${BLACK}" stroke-width="1.5" stroke-dasharray="2 5"/><g fill="${BLACK}">${pip(0, 125, 172, 104)}</g><path d="M95 232 q30 14 60 0" stroke="${GOLD}" stroke-width="3" fill="none"/>`
        : `<g fill="${col}">${pip(s, 125, 175, 84)}</g>`;
    } else body = `<g fill="${col}">${LAYOUT[c.r].map(([x, y]) => pip(s, x, y, c.r >= 9 ? 42 : 46, y > 176)).join('')}</g>`;
    return `<svg class="kc" viewBox="0 0 250 350" aria-hidden="true">
      <rect x="1" y="1" width="248" height="348" rx="16" fill="url(#kc-paper)"/>
      <g class="kc-full">${body}${index(rank, s, col)}</g>
      <g class="kc-mini" fill="${col}"><text x="125" y="170" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="${rank === '10' ? 120 : 150}" ${rank === '10' ? 'letter-spacing="-12"' : ''}>${rank}</text>${pip(s, 125, 262, 110)}</g>
    </svg>`;
  }
  const BACK = `<svg class="kc" viewBox="0 0 250 350" aria-hidden="true">
      <rect x="1" y="1" width="248" height="348" rx="16" fill="#fffefb"/>
      <rect x="14" y="14" width="222" height="322" rx="10" fill="url(#kc-lattice)" stroke="#6d1220" stroke-width="3"/>
      <rect x="22" y="22" width="206" height="306" rx="7" fill="none" stroke="#f2d48a" stroke-width="2" opacity=".8"/>
      <circle cx="125" cy="175" r="44" fill="#6d1220" stroke="#f2d48a" stroke-width="4"/>
      <circle cx="125" cy="175" r="36" fill="none" stroke="#f2d48a" stroke-width="1.5" opacity=".7"/>
      <text x="125" y="196" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="58" fill="#f2d48a">K</text>
    </svg>`;

  const red = (c) => c.s === 1 || c.s === 2;
  C.cardEl = (c, opts = {}) => {
    mount();
    if (!c || opts.hidden) return h('div', { class: 'card back' + (opts.cls ? ' ' + opts.cls : ''), html: BACK });
    return h('div', { class: 'card' + (red(c) ? ' red' : '') + (c.r >= 11 && c.r <= 13 ? ' face' : '') + (c.r === 14 ? ' ace' : '') + (opts.cls ? ' ' + opts.cls : ''),
      role: 'img', 'aria-label': L.cardStr ? L.cardStr(c) : '', html: face(c) });
  };
})();
