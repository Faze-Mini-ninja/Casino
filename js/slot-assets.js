/* Build-time art for the slot games (rendered to img/slots/<theme>/ by tools/build-slot-art.js; not loaded by the site):
 *  - symbolSvg(theme, sym): the symbol with outline, bevel lighting, inner shading and a drop shadow
 *  - sceneSvg(theme):       a 1600×1000 background scene behind the reels
 *  - logoSvg(theme):        the game logo, extruded and lit */
(function () {
  'use strict';
  const C = window.Casino, L = window.Lib, K = window.Covers.kit;
  const { id, rng, lin, rad, blurF, glow, rays, A, S, coinArt, fish, chip } = K;
  const W = 1600, H = 1000;

  /* ---------------- symbols ---------------- */
  const THEME_INK = { classic: '#2a0b00', fruits: '#3a1600', gems: '#1a0b33', sevens: '#2a0000', pharaoh: '#2a1500', ocean: '#021c33', goldrush: '#2a1205', dragon: '#2a0000', candy: '#4a0030', clover: '#0b2a0b', cosmic: '#0d0630' };
  const CLASSIC = ['cherry', 'lemon', 'orange', 'bell', 'star', 'seven'];
  const symbolsOf = (theme) => (theme === 'classic' ? CLASSIC : L.SLOT_THEMES[theme].symbols.map((x) => x[0]));
  const rawSymbol = (theme, s) => (theme === 'classic' ? C.art(s) : C.slotSymArt(theme, s));
  function symbolSvg(theme, s) {
    let inner = rawSymbol(theme, s);
    if (theme === 'neon') return inner.replace('<svg ', '<svg width="240" height="240" ');
    inner = inner.replace(/ filter="url\(#[^)]+\)"/g, ''); // the polish adds its own shadow
    const f = id('pol'), ink = THEME_INK[theme] || '#1b0f05', big = s === 'wild' || s === 'scatter', royal = s.length === 1 && 'TJQKA'.includes(s);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 124 124" width="240" height="240"><defs>
      <filter id="${f}" x="-15%" y="-15%" width="130%" height="135%" color-interpolation-filters="sRGB">
        <feComponentTransfer in="SourceAlpha" result="a"><feFuncA type="discrete" tableValues="0 0 1 1"/></feComponentTransfer>
        <feMorphology in="a" operator="dilate" radius="${big ? 2 : 2.6}" result="dil"/>
        <feFlood flood-color="${ink}" result="ink"/><feComposite in="ink" in2="dil" operator="in" result="outline"/>
        <feGaussianBlur in="a" stdDeviation="2.4" result="bump"/>
        <feSpecularLighting in="bump" surfaceScale="4.5" specularConstant=".95" specularExponent="20" lighting-color="#ffffff" result="spec"><feDistantLight azimuth="235" elevation="50"/></feSpecularLighting>
        <feComposite in="spec" in2="a" operator="in" result="specIn"/>
        <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3=".6" k4="0" result="lit"/>
        <feOffset in="a" dx="-2.2" dy="-3.2" result="off"/><feGaussianBlur in="off" stdDeviation="2.6" result="offb"/>
        <feComposite in="a" in2="offb" operator="out" result="rim"/><feFlood flood-color="#000" flood-opacity=".38"/><feComposite in2="rim" operator="in" result="shade"/>
        <feComposite in="shade" in2="SourceGraphic" operator="in" result="shadeIn"/>
        <feGaussianBlur in="dil" stdDeviation="2.4" result="db"/><feOffset in="db" dy="3.5" result="dbo"/><feFlood flood-color="#000" flood-opacity=".6"/><feComposite in2="dbo" operator="in" result="drop"/>
        <feMerge><feMergeNode in="drop"/><feMergeNode in="outline"/><feMergeNode in="lit"/><feMergeNode in="shadeIn"/></feMerge>
      </filter></defs><g filter="url(#${f})">${inner.replace('<svg ', royal ? '<svg x="-14" y="-16" width="128" height="128" ' : '<svg x="0" y="0" width="100" height="100" ')}</g></svg>`;
  }

  /* ---------------- scenes ---------------- */
  const fill = (cols, x2 = 0, y2 = 1) => { const g = id('sk'); return `<defs>${lin(g, cols, 0, 0, x2, y2)}</defs><rect width="${W}" height="${H}" fill="url(#${g})"/>`; };
  const blur = (inner, sd) => { const f = id('bf'); return `<defs>${blurF(f, sd)}</defs><g filter="url(#${f})">${inner}</g>`; };
  const starsW = (n, seed, maxY = H, col = '#fff') => { const r = rng(seed); return Array.from({ length: n }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * maxY).toFixed(0)}" r="${(r() * 1.8 + 0.4).toFixed(2)}" fill="${col}" opacity="${(r() * 0.7 + 0.3).toFixed(2)}"/>`).join(''); };
  const finish = () => { const v = id('vg'), n = id('gn'); return `<defs>${rad(v, [['#000', 0], ['#000', 0.05], ['#000', 0.62]], 0.5, 0.48, 0.78)}
    <filter id="${n}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="2" seed="5" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .07"/></feComponentTransfer></filter></defs>
    <rect width="${W}" height="${H}" fill="url(#${v})"/><rect width="${W}" height="${H}" filter="url(#${n})"/>`; };
  const spark = (n, seed, col, area, size = 22) => { const r = rng(seed); return Array.from({ length: n }, () => { const x = area[0] + r() * (area[2] - area[0]), y = area[1] + r() * (area[3] - area[1]), q = (r() * 0.7 + 0.3) * size; return `<path d="M${x} ${y - q} Q${x} ${y} ${x + q} ${y} Q${x} ${y} ${x} ${y + q} Q${x} ${y} ${x - q} ${y} Q${x} ${y} ${x} ${y - q}z" fill="${col}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`; }).join(''); };
  const big = (svgStr, x, y, size, rot = 0, sd = 0) => { const s = K.art(svgStr, x, y, size, rot); return sd ? blur(s, sd) : s; };
  const symAt = (theme, sym, x, y, size, rot, sd) => big(rawSymbol(theme, sym), x, y, size, rot, sd);
  const curtain = (x0, w, flip) => { const g = id('ct'); let s = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0" spreadMethod="repeat" gradientUnits="userSpaceOnUse" gradientTransform="scale(54 1)"><stop offset="0" stop-color="#4a0008"/><stop offset=".45" stop-color="#c2182b"/><stop offset=".6" stop-color="#e53950"/><stop offset="1" stop-color="#4a0008"/></linearGradient></defs>`;
    s += `<path d="M${x0} 0 H${x0 + w} C${x0 + w * 0.7} 420 ${x0 + w * 0.85} 700 ${x0 + w * (flip ? 0.2 : 0.8)} 1000 H${x0}z" fill="url(#${g})"/>`;
    return s; };
  const pillar = (x, w, col1, col2) => { const g = id('pl'); return `<defs>${lin(g, [col2, col1, col2], 0, 0, 1, 0)}</defs><rect x="${x}" y="80" width="${w}" height="920" fill="url(#${g})"/><rect x="${x - 16}" y="60" width="${w + 32}" height="44" rx="6" fill="url(#${g})"/><path d="M${x - 24} 60 Q${x + w / 2} 0 ${x + w + 24} 60z" fill="url(#${g})"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${x + 12}" y="${180 + i * 90}" width="${w - 24}" height="4" fill="#3b2200" opacity=".35"/><g fill="#3b2200" opacity=".45"><circle cx="${x + w * 0.3}" cy="${220 + i * 90}" r="7"/><path d="M${x + w * 0.55} ${206 + i * 90} l14 28 h-28z"/><rect x="${x + w * 0.75}" y="${208 + i * 90}" width="6" height="26"/></g>`).join('')}`; };
  const torch = (x, y) => glow(x, y - 30, 120, '#ffb300', 0.55) + `<rect x="${x - 7}" y="${y}" width="14" height="70" fill="#4e2a12"/><path d="M${x} ${y - 70} C${x + 26} ${y - 30} ${x + 14} ${y - 4} ${x} ${y} C${x - 14} ${y - 4} ${x - 26} ${y - 30} ${x} ${y - 70}z" fill="#ff9800"/><path d="M${x} ${y - 44} C${x + 12} ${y - 22} ${x + 6} ${y - 6} ${x} ${y - 2} C${x - 6} ${y - 6} ${x - 12} ${y - 22} ${x} ${y - 44}z" fill="#fff59d"/>`;
  const pagoda = (x, y, w, col) => `<g fill="${col}"><path d="M${x - w * 0.62} ${y} Q${x - w * 0.3} ${y - 22} ${x - w * 0.42} ${y - 34} L${x + w * 0.42} ${y - 34} Q${x + w * 0.3} ${y - 22} ${x + w * 0.62} ${y}z"/><rect x="${x - w * 0.36}" y="${y}" width="${w * 0.72}" height="90"/><path d="M${x - w * 0.5} ${y + 90} Q${x - w * 0.25} ${y + 70} ${x - w * 0.34} ${y + 58} L${x + w * 0.34} ${y + 58} Q${x + w * 0.25} ${y + 70} ${x + w * 0.5} ${y + 90}z"/><rect x="${x - w * 0.3}" y="${y + 90}" width="${w * 0.6}" height="400"/></g>`;
  const lanternRow = (y, n, seed) => { const r = rng(seed); let s = `<path d="M0 ${y} Q${W / 2} ${y + 70} ${W} ${y}" stroke="#2a0000" stroke-width="4" fill="none"/>`; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = t * W, yy = y + 70 * 4 * t * (1 - t) + 6, s2 = 34 + r() * 14; s += glow(x, yy + s2, s2 * 2.2, '#ff5252', 0.45) + A('dragon-lantern2', x, yy + s2 * 0.9, s2 * 2); } return s; };
  const hills = (cols, base, amp, seed) => cols.map((c, i) => { const r = rng(seed + i), y = base + i * 60; let d = `M0 ${H} L0 ${y}`; for (let x = 0; x <= W; x += 200) d += ` Q${x + 100} ${y - amp * (0.6 + r() * 0.8)} ${x + 200} ${y + (r() - 0.5) * 30}`; return `<path d="${d} L${W} ${H}z" fill="${c}"/>`; }).join('');
  const neonShape = (d, col, x, y, sc = 1, rot = 0) => { const f = id('nn'); return `<defs>${blurF(f, 6)}</defs><g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc})" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="${col}" stroke-width="14" filter="url(#${f})" opacity=".85">${d}</g><g stroke="${col}" stroke-width="6">${d}</g><g stroke="#fff" stroke-width="2" opacity=".85">${d}</g></g>`; };
  const crystal = (x, y, s, c1, c2, rot = 0) => { const g = id('cy'); return `<defs>${lin(g, [c1, c2], 0, 0, 1, 1)}</defs><g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})"><path d="M0 0 L-18 -60 L0 -110 L18 -60z" fill="url(#${g})"/><path d="M0 0 L0 -110 L18 -60z" fill="#fff" opacity=".18"/><path d="M0 0 L-18 -60 L0 -110z" fill="#000" opacity=".12"/></g>`; };

  const SCENES = {
    classic: () => [fill(['#3a0008', '#1a0004', '#050000']), glow(800, 520, 700, '#ff3d00', 0.35), rays(800, 520, '#ffd54f', 0.06, 28, 1400),
      curtain(0, 300, false), `<g transform="translate(${W} 0) scale(-1 1)">${curtain(0, 300, false)}</g>`,
      `<rect x="0" y="0" width="${W}" height="70" fill="#5a0010"/><rect x="0" y="62" width="${W}" height="10" fill="#c99a06"/>`,
      Array.from({ length: 32 }, (_, i) => glow(25 + i * 50, 32, 26, '#ffeb3b', 0.6) + `<circle cx="${25 + i * 50}" cy="32" r="9" fill="#fffde7"/>`).join(''),
      `<rect y="900" width="${W}" height="100" fill="#120002"/>`, spark(40, 3, '#ffe082', [300, 100, 1300, 900], 20)],
    fruits: () => [fill(['#ffe259', '#ffa751', '#f2701d']), rays(800, 380, '#fff', 0.13, 26, 1400), glow(800, 380, 520, '#fff8d0', 0.6),
      hills(['#7cb342', '#558b2f', '#33691e'], 760, 90, 4),
      symAt('fruits', 'cherry', 150, 260, 220, -14, 2), symAt('fruits', 'melon', 1440, 300, 240, 12, 2), symAt('fruits', 'lemon', 230, 780, 200, 20, 5), symAt('fruits', 'grape', 1380, 760, 230, -10, 5), symAt('fruits', 'orange', 1500, 90, 140, 0, 7), symAt('fruits', 'plum', 90, 80, 120, 0, 7)],
    gems: () => [fill(['#2a0f5c', '#140733', '#05020f']), glow(800, 460, 650, '#7c4dff', 0.35), starsW(120, 6, H, '#d1c4e9'),
      Array.from({ length: 14 }, (_, i) => crystal(40 + i * 22, 1000, 1.4 + (i % 3) * 0.5, '#b388ff', '#4a148c', -24 + i * 4)).join(''),
      Array.from({ length: 14 }, (_, i) => crystal(1290 + i * 22, 1000, 1.4 + ((i + 1) % 3) * 0.5, '#80d8ff', '#01579b', -20 + i * 3)).join(''),
      Array.from({ length: 18 }, (_, i) => `<g transform="translate(${i * 95 + 20} 0) scale(1 -1)">${crystal(0, 0, 0.6 + (i % 4) * 0.25, '#7e57c2', '#311b92', (i % 5) * 4 - 8)}</g>`).join(''),
      symAt('gems', 'diamond', 160, 520, 180, -12, 3), symAt('gems', 'g-red', 1450, 480, 170, 10, 3), spark(30, 8, '#fff', [100, 100, 1500, 900], 22)],
    sevens: () => [fill(['#000', '#2a0000', '#5a0000']), rays(800, 1000, '#ff6d00', 0.12, 24, 1400),
      blur(Array.from({ length: 12 }, (_, i) => { const x = i * 145 + 30, hh = 260 + (i % 3) * 120; return `<path d="M${x - 110} 1000 C${x - 120} ${1000 - hh * 0.6} ${x - 20} ${1000 - hh * 0.8} ${x} ${1000 - hh} C${x + 20} ${1000 - hh * 0.8} ${x + 120} ${1000 - hh * 0.6} ${x + 110} 1000z" fill="${['#ff6d00', '#ffab00', '#d50000'][i % 3]}" opacity=".8"/>`; }).join(''), 14),
      (() => { const r = rng(9); return Array.from({ length: 90 }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(r() * 3 + 1).toFixed(1)}" fill="${r() > 0.5 ? '#ffd54f' : '#ff6d00'}" opacity="${(r() * 0.8 + 0.2).toFixed(2)}"/>`).join(''); })(),
      symAt('sevens', 'seven', 170, 360, 260, -16, 2), symAt('sevens', 'seven', 1430, 360, 260, 16, 2)],
    pharaoh: () => [fill(['#140f3c', '#5b2a6e', '#e26d3d', '#ffc56b'], 0, 0.78), starsW(90, 11, 420), glow(800, 640, 420, '#fff3c4', 0.85), `<circle cx="800" cy="640" r="150" fill="#fff6d8"/>`,
      `<path d="M120 760 L420 430 L720 760z" fill="#a8641e"/><path d="M420 430 L720 760 L560 760z" fill="#7a4512"/><path d="M880 760 L1180 400 L1480 760z" fill="#b8722a"/><path d="M1180 400 L1480 760 L1320 760z" fill="#83501a"/>`,
      hills(['#d79a45', '#c4832f', '#a96a1f'], 760, 50, 2), pillar(0, 150, '#e8b86a', '#8a5a1c'), pillar(1450, 150, '#e8b86a', '#8a5a1c'), torch(200, 560), torch(1400, 560)],
    ocean: () => [fill(['#4fd1e8', '#0a6fb0', '#023369', '#011433']), rays(800, -200, '#fff', 0.07, 20, 1500), blur(starsW(0, 1), 1),
      (() => { const r = rng(14); return Array.from({ length: 40 }, () => { const x = r() * W, y = r() * H, rr = r() * 10 + 3; return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rr.toFixed(1)}" fill="none" stroke="#e0fbff" stroke-width="2" opacity="${(r() * 0.5 + 0.3).toFixed(2)}"/>`; }).join(''); })(),
      `<path d="M0 860 C300 820 500 880 800 850 C1100 820 1300 880 1600 840 V1000 H0z" fill="#d9b06b"/><path d="M0 900 C400 880 900 930 1600 890 V1000 H0z" fill="#c09252"/>`,
      (() => { const coral = (x, col, sc) => `<g transform="translate(${x} 900) scale(${sc})" stroke="${col}" stroke-width="22" stroke-linecap="round" fill="none"><path d="M0 0 C0 -80 -40 -120 -60 -200 M0 -60 C30 -110 60 -130 70 -210 M-20 -110 C-60 -150 -90 -160 -110 -230 M40 -120 C20 -170 30 -220 10 -270"/></g>`;
        return coral(120, '#ff6f91', 1.2) + coral(260, '#ffb86b', 0.9) + coral(1360, '#c77dff', 1.1) + coral(1500, '#ff6f91', 1.3); })(),
      Array.from({ length: 10 }, (_, i) => { const x = i < 5 ? 40 + i * 60 : 1300 + (i - 5) * 60; return `<path d="M${x} 1000 C${x - 30} 860 ${x + 30} 760 ${x} 600 C${x - 20} 520 ${x + 20} 480 ${x} 420" stroke="#2e7d32" stroke-width="12" fill="none" opacity=".8"/>`; }).join(''),
      blur(fish(1420, 220, 140, '#ffd166', '#ef8354', -1, 0) + fish(170, 330, 120, '#83d483', '#2a9d8f', 1, 6), 2), fish(1500, 560, 90, '#f78c6b', '#e63946', -1, -6)],
    goldrush: () => [fill(['#2d1b4e', '#a0392a', '#f08c3a', '#ffd27a'], 0, 0.62), glow(800, 600, 380, '#ffe0a3', 0.7),
      `<path d="M0 620 L120 470 L260 470 L330 560 L480 380 L620 380 L700 520 L820 450 L940 560 L1060 400 L1200 400 L1290 540 L1420 440 L1600 520 V1000 H0z" fill="#7a3a1c"/>`,
      `<path d="M0 720 L200 600 L360 640 L520 560 L700 660 L900 600 L1080 680 L1260 590 L1420 650 L1600 600 V1000 H0z" fill="#4e2512"/>`,
      `<path d="M0 820 C400 790 1200 800 1600 780 V1000 H0z" fill="#2e1709"/>`,
      `<g stroke="#5d3a1a" stroke-width="10"><path d="M560 1000 L760 820 M1040 1000 L840 820"/></g><g stroke="#8d6e63" stroke-width="8">${Array.from({ length: 8 }, (_, i) => { const t = i / 7, y = 830 + t * t * 170, w = 90 + t * 260; return `<path d="M${800 - w} ${y} H${800 + w}"/>`; }).join('')}</g>`,
      (() => { const timber = (x, flip) => `<g transform="translate(${x} 0) scale(${flip} 1)"><rect x="0" y="0" width="70" height="1000" fill="#4e2a12"/><rect x="0" y="0" width="70" height="1000" fill="url(#none)" stroke="#2a1205" stroke-width="4"/><rect x="0" y="120" width="320" height="60" fill="#5d3415" stroke="#2a1205" stroke-width="4"/>${[150, 230, 310].map((xx) => `<rect x="${xx}" y="180" width="8" height="${40 + xx / 6}" fill="#2a1205"/>`).join('')}</g>`; return timber(0, 1) + timber(W, -1); })(),
      torch(250, 330).replace(/#ff9800/g, '#ffb74d'), torch(1350, 330).replace(/#ff9800/g, '#ffb74d'), symAt('goldrush', 'nugget', 220, 900, 150, -6, 0), symAt('goldrush', 'pickaxe', 1380, 860, 200, 18, 0)],
    dragon: () => [fill(['#1a0000', '#5a0000', '#a51818', '#3a0000'], 0, 1), glow(800, 300, 460, '#ffcc80', 0.45), `<circle cx="800" cy="300" r="170" fill="#ffe0b2" opacity=".85"/>`,
      `<g fill="none" stroke="#ffd54f" stroke-opacity=".25" stroke-width="5">${Array.from({ length: 10 }, (_, i) => `<path d="M${(i % 5) * 360 - 40} ${520 + Math.floor(i / 5) * 160} q60 -70 120 0 q60 -70 120 0"/>`).join('')}</g>`,
      pagoda(130, 380, 380, '#1a0000'), pagoda(1470, 380, 380, '#1a0000'), pagoda(330, 560, 260, '#2a0505'), pagoda(1270, 560, 260, '#2a0505'),
      lanternRow(40, 9, 3), (() => { const r = rng(21); return Array.from({ length: 50 }, () => { const x = r() * W, y = r() * H; return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="7" ry="4" fill="#ffb3c6" opacity="${(r() * 0.6 + 0.3).toFixed(2)}" transform="rotate(${(r() * 180).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`; }).join(''); })()],
    candy: () => [fill(['#ffd1ec', '#ff9ccf', '#c77dff'], 0, 1), glow(800, 420, 600, '#fff', 0.45),
      (() => { const cloud = (x, y, s, c) => `<g fill="${c}" transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="60"/><circle cx="70" cy="-20" r="75"/><circle cx="150" cy="0" r="60"/><circle cx="75" cy="30" r="60"/></g>`; return cloud(60, 160, 1.2, '#fff0fa') + cloud(1300, 120, 1.3, '#f3e8ff') + cloud(650, 70, 0.9, '#ffe4f3'); })(),
      hills(['#ff7eb6', '#ff4f9a', '#d81b60'], 780, 110, 7), (() => { const r = rng(4); return Array.from({ length: 70 }, () => `<rect x="${(r() * W).toFixed(0)}" y="${(780 + r() * 220).toFixed(0)}" width="10" height="4" rx="2" fill="${['#fff', '#ffeb3b', '#69f0ae', '#40c4ff'][Math.floor(r() * 4)]}" transform="rotate(${(r() * 180).toFixed(0)})"/>`).join(''); })(),
      (() => { const tree = (x, y, s, c) => `<rect x="${x - 8}" y="${y}" width="16" height="${1000 - y}" fill="#fff" stroke="#d81b60" stroke-width="3"/>${A('candy-c-lolly', x, y - 10, s)}`; return tree(150, 500, 230) + tree(1450, 470, 250) + tree(330, 690, 150) + tree(1270, 680, 160); })(),
      (() => { const cane = (x) => { const g = id('cn'); return `<defs><pattern id="${g}" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="40" height="40" fill="#fff"/><rect width="18" height="40" fill="#e53935"/></pattern></defs><rect x="${x}" y="0" width="46" height="1000" fill="url(#${g})"/>`; }; return cane(0) + cane(W - 46); })()],
    neon: () => [`<rect width="${W}" height="${H}" fill="#140f1c"/>`, `<g opacity=".55">${Array.from({ length: 34 }, (_, r) => Array.from({ length: 22 }, (_, c) => `<rect x="${c * 78 - (r % 2) * 39}" y="${r * 30}" width="74" height="26" fill="#241a2e"/>`).join('')).join('')}</g>`,
      glow(800, 500, 700, '#ff2d6f', 0.18),
      neonShape('<path d="M0 -60 L18 -18 L62 -18 L26 8 L40 52 L0 26 L-40 52 L-26 8 L-62 -18 L-18 -18z"/>', '#ffd600', 170, 220, 1.4, -10),
      neonShape('<path d="M-50 -60 H50 L0 10z M0 10 V70 M-30 70 H30"/><circle cx="20" cy="-40" r="6"/>', '#00e5ff', 1430, 230, 1.5, 8),
      neonShape('<circle cx="-25" cy="30" r="26"/><circle cx="28" cy="34" r="26"/><path d="M-20 4 C-14 -30 4 -50 30 -66 M24 8 C22 -24 26 -44 30 -66"/>', '#ff2d6f', 190, 650, 1.6, -6),
      neonShape('<path d="M-70 -30 H70 V30 H-70z M-48 -12 V12 M-48 -12 H-36 C-26 -12 -26 0 -36 0 H-48 M-36 0 C-24 0 -24 12 -36 12 H-48 M-10 12 L0 -12 L10 12 M-6 4 H6 M26 12 V-12 H40 C50 -12 50 2 40 2 H26 M38 2 L50 12"/>', '#76ff03', 1420, 660, 1.6, 6),
      (() => { const g = id('wet'); return `<defs>${lin(g, [['#000'], ['#000']].map((x) => x[0]))}</defs><rect y="880" width="${W}" height="120" fill="#07050b" opacity=".85"/>` + blur(`<rect x="120" y="900" width="140" height="80" fill="#ffd600" opacity=".25"/><rect x="1380" y="900" width="140" height="80" fill="#00e5ff" opacity=".25"/><rect x="160" y="930" width="120" height="60" fill="#ff2d6f" opacity=".3"/><rect x="1360" y="930" width="140" height="60" fill="#76ff03" opacity=".25"/>`, 18); })()],
    clover: () => [fill(['#4fc3f7', '#b3e5fc', '#e8f5e9'], 0, 0.7), rays(150, 0, '#fff', 0.15, 16, 1600),
      (() => { const cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa']; return cols.map((c, i) => `<path d="M${120 + i * 32} 820 A${680 - i * 32} ${600 - i * 32} 0 0 1 ${1480 - i * 32} 820" fill="none" stroke="${c}" stroke-width="32" opacity=".85"/>`).join(''); })(),
      (() => { const cloud = (x, y, s) => `<g fill="#fff" transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="0" r="60"/><circle cx="70" cy="-26" r="78"/><circle cx="150" cy="0" r="62"/><circle cx="75" cy="30" r="60"/></g>`; return cloud(30, 780, 1.4) + cloud(1340, 780, 1.4) + cloud(600, 120, 0.8); })(),
      hills(['#7cc96a', '#4caf50', '#2e7d32'], 800, 80, 3),
      (() => { const r = rng(7); return Array.from({ length: 26 }, () => A('clover-clover', r() * W, 880 + r() * 120, 40 + r() * 40, r() * 60 - 30)).join(''); })(),
      symAt('clover', 'pot', 180, 760, 220, -6, 0), symAt('clover', 'hat', 1430, 740, 200, 8, 0)],
    cosmic: () => [fill(['#0b0425', '#1a0b3d', '#05020f']), blur(`<circle cx="300" cy="300" r="260" fill="#7c4dff" opacity=".35"/><circle cx="1300" cy="700" r="300" fill="#00b0ff" opacity=".22"/><circle cx="1100" cy="200" r="200" fill="#ff4081" opacity=".2"/><circle cx="500" cy="800" r="220" fill="#d500f9" opacity=".18"/>`, 70),
      starsW(260, 13), symAt('cosmic', 'planet', 170, 830, 380, -14, 0), symAt('cosmic', 'scatter', 1440, 170, 230, 0, 2), symAt('cosmic', 'comet', 1450, 760, 200, 10, 0), symAt('cosmic', 'ufo', 190, 190, 170, -10, 1)],
  };
  const sceneSvg = (theme) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${SCENES[theme]().join('')}${finish()}</svg>`;

  /* ---------------- logos ---------------- */
  const LOGO = {
    classic: { text: 'CLASSIC SLOTS', font: 'Bungee', cols: ['#ffffff', '#ffe082', '#ff6d00'], ink: '#2a0000', ex: '#7f0000', glow: '#ff3d00' },
    fruits: { text: 'Fruit Frenzy', font: 'Lilita One', cols: ['#fffde7', '#ffeb3b', '#ff6d00'], ink: '#3a1600', ex: '#b23c00', glow: '#ffe082' },
    gems: { text: 'GEM RUSH', font: 'Titan One', cols: ['#ffffff', '#e1bee7', '#8e24aa'], ink: '#1a0b33', ex: '#4a148c', glow: '#ea80fc' },
    sevens: { text: 'LUCKY 7s', font: 'Bungee', cols: ['#fffde7', '#ffd54f', '#ff3d00'], ink: '#2a0000', ex: '#8e0000', glow: '#ff6d00' },
    pharaoh: { text: "PHARAOH'S FORTUNE", font: 'Cinzel Decorative', cols: ['#fff8e1', '#ffd54f', '#a37400'], ink: '#2a1500', ex: '#6d4400', glow: '#ffe082' },
    ocean: { text: 'Deep Sea Treasure', font: 'Lilita One', cols: ['#ffffff', '#80deea', '#00838f'], ink: '#021c33', ex: '#004d60', glow: '#4dd0e1' },
    goldrush: { text: 'Gold Rush', font: 'Rye', cols: ['#fffde7', '#ffca28', '#8d5b00'], ink: '#2a1205', ex: '#5d3415', glow: '#ffb300' },
    dragon: { text: 'DRAGON PEARL', font: 'Cinzel Decorative', cols: ['#fff8e1', '#ffd54f', '#b8860b'], ink: '#2a0000', ex: '#7f0000', glow: '#ff6d00' },
    candy: { text: 'CANDY POP', font: 'Luckiest Guy', cols: ['#ffffff', '#fff59d', '#ff80ab'], ink: '#4a0030', ex: '#ad1457', glow: '#ffffff' },
    neon: { text: 'NEON NIGHTS', font: 'Monoton', neon: ['#e0fbff', '#00e5ff', '#ff2d6f'] },
    clover: { text: 'Lucky Clover', font: 'Lilita One', cols: ['#ffffff', '#c6ff00', '#2e7d32'], ink: '#0b2a0b', ex: '#1b5e20', glow: '#fff59d' },
    cosmic: { text: 'COSMIC CASH', font: 'Russo One', cols: ['#ffffff', '#b388ff', '#6200ea'], ink: '#0d0630', ex: '#311b92', glow: '#b388ff' },
  };
  function logoSvg(theme) {
    const o = LOGO[theme], g = id('lg'), f = id('lf'), gl = id('lgl');
    const base = (extra) => `x="600" y="200" text-anchor="middle" font-family="${o.font}, Impact, sans-serif" font-size="150" font-weight="900" data-fit="1120" ${extra}`;
    if (o.neon) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" width="1200" height="300"><defs>${blurF(gl, 16)}${blurF(gl + 'b', 4)}</defs>
      <text ${base(`fill="${o.neon[2]}" filter="url(#${gl})" opacity=".75"`)}>${o.text}</text><text ${base(`fill="${o.neon[1]}" filter="url(#${gl}b)"`)}>${o.text}</text>
      <text ${base(`fill="${o.neon[0]}"`)}>${o.text}</text></svg>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 300" width="1200" height="300"><defs>${lin(g, o.cols)}${blurF(gl, 22)}
      <filter id="${f}" x="-5%" y="-20%" width="110%" height="140%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="b"/>
        <feSpecularLighting in="b" surfaceScale="6" specularConstant="1" specularExponent="24" lighting-color="#fff" result="s"><feDistantLight azimuth="240" elevation="55"/></feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="si"/><feComposite in="SourceGraphic" in2="si" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0"/></filter></defs>
      <text ${base(`fill="${o.glow}" opacity=".55" filter="url(#${gl})"`)}>${o.text}</text>
      ${Array.from({ length: 12 }, (_, k) => `<text ${base(`fill="${o.ex}" stroke="${o.ink}" stroke-width="22" stroke-linejoin="round" transform="translate(0 ${12 - k})"`)}>${o.text}</text>`).join('')}
      <text ${base(`fill="url(#${g})" stroke="${o.ink}" stroke-width="14" stroke-linejoin="round" paint-order="stroke" filter="url(#${f})"`)}>${o.text}</text>
      <text ${base('fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2.5" transform="translate(0 -3)"')}>${o.text}</text>
      ${spark(5, theme.length * 7, '#fff', [80, 50, 1120, 110], 26)}</svg>`;
  }

  window.SlotAssets = { themes: () => ['classic', ...L.SLOT_IDS], symbolsOf, symbolSvg, sceneSvg, logoSvg };
})();
