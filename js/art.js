/* Hand-drawn SVG artwork used across games (replaces emoji). C.art(name) → SVG markup string. */
(function () {
  'use strict';
  const C = window.Casino;
  let uid = 0;
  const id = () => 'a' + (++uid).toString(36);
  const lg = (gid, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const rg = (gid, a, b) => `<radialGradient id="${gid}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;
  const svg = (inner, vb = '0 0 100 100') => `<svg viewBox="${vb}" class="art" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const shine = '<ellipse cx="38" cy="32" rx="9" ry="5" fill="#fff" opacity=".45" transform="rotate(-30 38 32)"/>';

  function gem(c1, c2, c3) {
    const a = id(), b = id();
    return svg(`<defs>${lg(a, c1, c2)}${lg(b, c2, c3)}</defs>
      <polygon points="50,8 86,34 50,92 14,34" fill="url(#${a})"/>
      <polygon points="14,34 86,34 50,92" fill="url(#${b})" opacity=".85"/>
      <polygon points="30,34 50,8 70,34 50,48" fill="#fff" opacity=".22"/>
      <polygon points="14,34 30,34 50,92" fill="#000" opacity=".12"/>
      <polygon points="50,8 86,34 70,34" fill="#fff" opacity=".3"/>
      <polyline points="14,34 86,34" stroke="#fff" stroke-opacity=".5" stroke-width="1.5" fill="none"/>`);
  }
  const A = {
    cherry() { const a = id(); return svg(`<defs>${rg(a, '#ff6b6b', '#a3001b')}</defs>
      <path d="M38 62 C40 40 52 22 70 12 M62 64 C60 44 62 28 70 12" stroke="#2f7d32" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M70 12 C78 8 90 12 92 20 C82 22 74 18 70 12z" fill="#43a047"/>
      <circle cx="34" cy="70" r="20" fill="url(#${a})"/><circle cx="66" cy="72" r="20" fill="url(#${a})"/>
      <ellipse cx="27" cy="62" rx="5" ry="3" fill="#fff" opacity=".6"/><ellipse cx="59" cy="64" rx="5" ry="3" fill="#fff" opacity=".6"/>`); },
    lemon() { const a = id(); return svg(`<defs>${rg(a, '#fff59d', '#f9a825')}</defs>
      <path d="M12 52 C12 30 34 16 54 18 C70 19 84 30 88 48 C92 62 80 80 58 84 C36 88 12 76 12 52z" fill="url(#${a})"/>
      <path d="M86 46 L96 42 L92 52z" fill="#f9a825"/><path d="M14 54 L4 58 L10 48z" fill="#f9a825"/>${shine}`); },
    orange() { const a = id(); return svg(`<defs>${rg(a, '#ffcc80', '#e65100')}</defs>
      <circle cx="50" cy="56" r="34" fill="url(#${a})"/>
      <path d="M50 22 C56 10 70 8 78 14 C70 22 60 24 50 22z" fill="#43a047"/><circle cx="50" cy="23" r="3" fill="#6d4c41"/>${shine}`); },
    plum() { const a = id(); return svg(`<defs>${rg(a, '#ce93d8', '#4a148c')}</defs>
      <ellipse cx="50" cy="56" rx="30" ry="34" fill="url(#${a})"/><path d="M50 26 C48 40 50 70 54 88" stroke="#000" stroke-opacity=".18" stroke-width="3" fill="none"/>
      <path d="M50 24 C52 14 60 8 68 8" stroke="#5d4037" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M58 14 C66 4 82 8 84 14 C74 18 64 18 58 14z" fill="#66bb6a"/>${shine}`); },
    grape() { const a = id(); const pts = [[38, 34], [58, 34], [28, 50], [48, 50], [68, 50], [38, 66], [58, 66], [48, 82]];
      return svg(`<defs>${rg(a, '#b388ff', '#311b92')}</defs><path d="M48 24 C46 14 52 8 60 6" stroke="#5d4037" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M52 16 C62 6 80 10 82 18 C70 22 60 22 52 16z" fill="#66bb6a"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="url(#${a})"/><circle cx="${x - 4}" cy="${y - 4}" r="3" fill="#fff" opacity=".5"/>`).join('')}`); },
    melon() { return svg(`<path d="M8 40 A42 42 0 0 0 92 40 z" fill="#2e7d32"/><path d="M14 40 A36 36 0 0 0 86 40 z" fill="#c8e6c9"/><path d="M18 40 A32 32 0 0 0 82 40 z" fill="#ef5350"/>
      ${[[34, 50], [50, 56], [66, 50], [42, 64], [58, 64]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.6" ry="4" fill="#212121"/>`).join('')}`, '0 10 100 80'); },
    bell() { const a = id(); return svg(`<defs>${lg(a, '#ffe082', '#ff8f00', 1, 1)}</defs>
      <path d="M50 12 C30 12 24 32 24 50 C24 62 18 68 12 74 L88 74 C82 68 76 62 76 50 C76 32 70 12 50 12z" fill="url(#${a})" stroke="#b26a00" stroke-width="2"/>
      <rect x="10" y="72" width="80" height="8" rx="4" fill="#ffb300" stroke="#b26a00" stroke-width="2"/><circle cx="50" cy="86" r="7" fill="#b26a00"/><circle cx="50" cy="10" r="5" fill="#b26a00"/>
      <path d="M36 26 C32 34 31 44 31 54" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45" fill="none"/>`); },
    seven() { const a = id(); return svg(`<defs>${lg(a, '#ff5252', '#b71c1c')}</defs>
      <path d="M18 14 H84 V28 C68 44 56 64 52 90 H30 C34 64 46 44 60 30 H18z" fill="url(#${a})" stroke="#4a0000" stroke-width="4" stroke-linejoin="round"/>
      <path d="M24 19 H74" stroke="#fff" stroke-width="3" opacity=".5"/>`); },
    bar(n = 1) { const h = n === 1 ? 26 : n === 2 ? 18 : 14, g = 4, tot = n * h + (n - 1) * g, y0 = 50 - tot / 2;
      return svg(Array.from({ length: n }, (_, i) => `<rect x="10" y="${y0 + i * (h + g)}" width="80" height="${h}" rx="5" fill="#1b2430" stroke="#ffca28" stroke-width="2.5"/>
        <text x="50" y="${y0 + i * (h + g) + h / 2 + (n === 1 ? 7 : 5)}" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="${n === 1 ? 20 : 13}" fill="#ffca28">BAR</text>`).join('')); },
    bar2() { return A.bar(2); }, bar3() { return A.bar(3); },
    star() { const a = id(); return svg(`<defs>${lg(a, '#fff59d', '#ff8f00', 1, 1)}</defs><path d="M50 6 L62 36 L94 38 L69 58 L78 90 L50 72 L22 90 L31 58 L6 38 L38 36z" fill="url(#${a})" stroke="#e65100" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M50 18 L57 38" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>`); },
    crown() { const a = id(); return svg(`<defs>${lg(a, '#ffe082', '#f57f17', 1, 1)}</defs>
      <path d="M12 78 L8 30 L30 50 L50 18 L70 50 L92 30 L88 78z" fill="url(#${a})" stroke="#a15c00" stroke-width="3" stroke-linejoin="round"/>
      <rect x="12" y="76" width="76" height="12" rx="3" fill="#ffb300" stroke="#a15c00" stroke-width="3"/>
      <circle cx="50" cy="60" r="7" fill="#e53935"/><circle cx="28" cy="64" r="5" fill="#1e88e5"/><circle cx="72" cy="64" r="5" fill="#43a047"/>
      <circle cx="8" cy="30" r="5" fill="#ffca28"/><circle cx="50" cy="16" r="5" fill="#ffca28"/><circle cx="92" cy="30" r="5" fill="#ffca28"/>`); },
    anchor() { return svg(`<g stroke="#90a4ae" stroke-width="8" fill="none" stroke-linecap="round"><circle cx="50" cy="18" r="8"/><path d="M50 26 V86"/><path d="M30 42 H70"/><path d="M14 62 C18 80 34 88 50 88 C66 88 82 80 86 62"/></g>
      <path d="M8 60 L20 56 L18 70z M92 60 L80 56 L82 70z" fill="#90a4ae"/>`); },
    heart() { return svg('<path d="M50 88 C20 66 8 50 8 32 C8 18 20 8 32 8 C40 8 46 12 50 20 C54 12 60 8 68 8 C80 8 92 18 92 32 C92 50 80 66 50 88z" fill="#e53935"/>'); },
    spade() { return svg('<path d="M50 6 C34 28 10 40 10 60 C10 74 22 82 34 80 C40 79 44 76 46 72 C44 82 40 88 32 92 H68 C60 88 56 82 54 72 C56 76 60 79 66 80 C78 82 90 74 90 60 C90 40 66 28 50 6z" fill="#263238"/>'); },
    diamond() { return gem('#ffffff', '#cfe8f3', '#7b97a8'); },
    suitDiamond() { return svg('<path d="M50 4 L84 50 L50 96 L16 50z" fill="#e53935"/>'); },
    club() { return svg('<circle cx="50" cy="30" r="20" fill="#263238"/><circle cx="28" cy="58" r="20" fill="#263238"/><circle cx="72" cy="58" r="20" fill="#263238"/><path d="M46 60 C46 76 40 86 32 92 H68 C60 86 54 76 54 60z" fill="#263238"/>'); },
    'g-blue': () => gem('#90caf9', '#1e88e5', '#0d47a1'), 'g-green': () => gem('#a5d6a7', '#43a047', '#1b5e20'), 'g-purple': () => gem('#ce93d8', '#8e24aa', '#4a148c'),
    'g-orange': () => gem('#ffcc80', '#fb8c00', '#e65100'), 'g-red': () => gem('#ef9a9a', '#e53935', '#8e0000'), 'g-pink': () => gem('#f8bbd0', '#ec407a', '#880e4f'),
    gem() { return gem('#a7ffeb', '#1de9b6', '#00695c'); },
    wild() { const a = id(); return svg(`<defs>${lg(a, '#7c4dff', '#f50057', 1, 1)}</defs><rect x="6" y="20" width="88" height="60" rx="14" fill="url(#${a})" stroke="#fff" stroke-width="3"/>
      <text x="50" y="61" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="27" fill="#fff" stroke="#3a0066" stroke-width="1.5">WILD</text>`); },
    scatter() { const a = id(); return svg(`<defs>${rg(a, '#fff9c4', '#ff6f00')}</defs>
      <path d="M50 4 L58 30 L84 16 L70 42 L96 50 L70 58 L84 84 L58 70 L50 96 L42 70 L16 84 L30 58 L4 50 L30 42 L16 16 L42 30z" fill="url(#${a})" stroke="#e65100" stroke-width="2"/>
      <text x="50" y="57" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="15" fill="#7a2e00">BONUS</text>`); },
    bomb() { const a = id(); return svg(`<defs>${rg(a, '#78909c', '#101418')}</defs><circle cx="44" cy="58" r="32" fill="url(#${a})"/>
      <rect x="54" y="18" width="16" height="14" rx="3" transform="rotate(35 62 25)" fill="#455a64"/><path d="M68 18 C74 8 84 8 88 14" stroke="#8d6e63" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M88 14 l6 -6 M88 14 l8 2 M88 14 l2 8 M88 14 l-2 -9" stroke="#ffca28" stroke-width="3" stroke-linecap="round"/><ellipse cx="32" cy="44" rx="8" ry="5" fill="#fff" opacity=".35" transform="rotate(-35 32 44)"/>`); },
    coinHeads() { const a = id(); return svg(`<defs>${rg(a, '#ffe082', '#c77800')}</defs><circle cx="50" cy="50" r="46" fill="url(#${a})" stroke="#8d5a00" stroke-width="3"/>
      <circle cx="50" cy="50" r="36" fill="none" stroke="#8d5a00" stroke-width="2" stroke-dasharray="3 4"/>
      <path d="M30 64 L27 38 L39 49 L50 30 L61 49 L73 38 L70 64z" fill="#8d5a00"/><rect x="30" y="64" width="40" height="6" rx="2" fill="#8d5a00"/>`); },
    coinTails() { const a = id(); return svg(`<defs>${rg(a, '#eceff1', '#78909c')}</defs><circle cx="50" cy="50" r="46" fill="url(#${a})" stroke="#455a64" stroke-width="3"/>
      <circle cx="50" cy="50" r="36" fill="none" stroke="#455a64" stroke-width="2" stroke-dasharray="3 4"/>
      <text x="50" y="66" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="44" fill="#455a64">K</text>`); },
    rocket() { return svg(`<path d="M50 6 C66 18 72 40 70 64 H30 C28 40 34 18 50 6z" fill="#eceff1" stroke="#90a4ae" stroke-width="2"/>
      <circle cx="50" cy="36" r="9" fill="#29b6f6" stroke="#455a64" stroke-width="3"/><path d="M30 50 L16 70 L30 66z M70 50 L84 70 L70 66z" fill="#e53935"/>
      <path d="M38 64 H62 L58 74 H42z" fill="#607d8b"/><path d="M42 74 C44 86 50 96 50 96 C50 96 56 86 58 74z" fill="#ff9100"/><path d="M46 74 C47 82 50 88 50 88 C50 88 53 82 54 74z" fill="#ffee58"/>`); },
    boom() { return svg(`<path d="M50 4 L60 32 L88 18 L72 46 L98 56 L68 62 L80 92 L52 72 L34 96 L32 66 L4 70 L24 48 L6 24 L36 30z" fill="#ff7043" stroke="#bf360c" stroke-width="2"/>
      <path d="M50 22 L56 40 L74 34 L64 50 L80 58 L60 60 L66 78 L50 66 L38 80 L38 62 L20 62 L34 50 L24 34 L42 40z" fill="#ffee58"/>`); },
    balloon(color = '#e53935') { const a = id(); return svg(`<defs>${rg(a, '#fff', color)}</defs><path d="M50 6 C74 6 88 26 88 46 C88 68 66 84 50 86 C34 84 12 68 12 46 C12 26 26 6 50 6z" fill="url(#${a})"/>
      <path d="M45 86 L55 86 L52 92 L48 92z" fill="${color}"/><ellipse cx="34" cy="30" rx="8" ry="13" fill="#fff" opacity=".45" transform="rotate(25 34 30)"/>`, '0 0 100 100'); },
    cup() { const a = id(); return svg(`<defs>${lg(a, '#ef5350', '#7f0000', 1, 0)}</defs><path d="M26 10 H74 L86 86 H14z" fill="url(#${a})" stroke="#4a0000" stroke-width="3" stroke-linejoin="round"/>
      <rect x="10" y="82" width="80" height="10" rx="4" fill="#b71c1c" stroke="#4a0000" stroke-width="3"/><path d="M34 18 L28 76" stroke="#fff" stroke-width="5" opacity=".3" stroke-linecap="round"/>`); },
    ball() { return svg(`<circle cx="50" cy="50" r="44" fill="#fafafa" stroke="#263238" stroke-width="3"/>
      <polygon points="50,30 66,42 60,62 40,62 34,42" fill="#263238"/>
      <path d="M50 30 V8 M66 42 L88 36 M60 62 L72 82 M40 62 L28 82 M34 42 L12 36" stroke="#263238" stroke-width="3"/>`); },
    rock() { return svg('<path d="M18 64 C12 50 22 32 36 28 C44 18 62 18 70 28 C84 30 92 46 86 62 C82 76 64 84 48 82 C32 84 22 76 18 64z" fill="#78909c" stroke="#37474f" stroke-width="3"/><path d="M36 40 C44 36 52 38 58 44" stroke="#cfd8dc" stroke-width="4" fill="none" stroke-linecap="round"/>'); },
    paper() { return svg('<path d="M24 8 H64 L80 24 V92 H24z" fill="#fafafa" stroke="#90a4ae" stroke-width="3" stroke-linejoin="round"/><path d="M64 8 V24 H80" fill="#e0e0e0" stroke="#90a4ae" stroke-width="3"/><path d="M34 40 H70 M34 52 H70 M34 64 H62 M34 76 H66" stroke="#b0bec5" stroke-width="3"/>'); },
    scissors() { return svg('<circle cx="28" cy="74" r="14" fill="none" stroke="#e53935" stroke-width="7"/><circle cx="72" cy="74" r="14" fill="none" stroke="#e53935" stroke-width="7"/><path d="M36 64 L76 8 M64 64 L24 8" stroke="#90a4ae" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="40" r="4" fill="#455a64"/>'); },
  };
  C.art = (name, ...args) => (A[name] ? A[name](...args) : '');
  C.artEl = (name, cls = '', ...args) => { const s = document.createElement('span'); s.className = 'artw ' + cls; s.innerHTML = C.art(name, ...args); return s; };
  /** Rasterised copy for canvas drawing (cached). */
  const imgs = {};
  C.artImg = (name) => { if (imgs[name]) return imgs[name]; const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(C.art(name).replace('<svg ', '<svg width="128" height="128" ')); return (imgs[name] = im); };
})();
