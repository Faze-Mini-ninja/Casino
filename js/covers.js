/* Game cover art. Covers.svg(id) returns a 300×400 illustrated cover (scene, hero, logo, finish).
 * tools/build-covers.js renders these to img/covers/<id>.webp; the lobby uses the images and falls back to this. */
(function () {
  'use strict';
  const C = window.Casino, L = window.Lib;
  let uid = 0;
  const id = (p = 'c') => p + (++uid).toString(36);
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lin = (gid, cols, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => `<linearGradient id="${gid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${cols.map((c, i) => `<stop offset="${(i / (cols.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const rad = (gid, cols, cx = 0.5, cy = 0.5, r = 0.6) => `<radialGradient id="${gid}" cx="${cx}" cy="${cy}" r="${r}">${cols.map((c, i) => { const [col, op] = Array.isArray(c) ? c : [c, 1]; return `<stop offset="${(i / (cols.length - 1)).toFixed(3)}" stop-color="${col}" stop-opacity="${op}"/>`; }).join('')}</radialGradient>`;
  const shadowF = (fid, dy = 6, sd = 6, op = 0.55) => `<filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${sd}" flood-color="#000" flood-opacity="${op}"/></filter>`;
  const blurF = (fid, sd) => `<filter id="${fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
  const shadow = (inner, dy = 6, sd = 6, op = 0.55) => { const f = id('sh'); return `<defs>${shadowF(f, dy, sd, op)}</defs><g filter="url(#${f})">${inner}</g>`; };

  /* ---------------- scene pieces ---------------- */
  const bg = (cols, x2 = 0.35, y2 = 1) => { const g = id('bg'); return `<defs>${lin(g, cols, 0, 0, x2, y2)}</defs><rect width="300" height="400" fill="url(#${g})"/>`; };
  const glow = (cx, cy, r, col, op = 0.8) => { const g = id('gl'); return `<defs>${rad(g, [[col, op], [col, 0]])}</defs><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${g})"/>`; };
  const rays = (cx, cy, col, op = 0.18, n = 18, len = 420) => `<g fill="${col}" opacity="${op}">${Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2, b = a + Math.PI / n; return `<path d="M${cx} ${cy} L${cx + Math.cos(a) * len} ${cy + Math.sin(a) * len} L${cx + Math.cos(b) * len} ${cy + Math.sin(b) * len}z"/>`; }).join('')}</g>`;
  const stars = (n, seed, col = '#fff', maxY = 400) => { const r = rng(seed); return Array.from({ length: n }, () => `<circle cx="${(r() * 300).toFixed(1)}" cy="${(r() * maxY).toFixed(1)}" r="${(r() * 1.3 + 0.3).toFixed(2)}" fill="${col}" opacity="${(r() * 0.7 + 0.3).toFixed(2)}"/>`).join(''); };
  const bokeh = (n, seed, cols, op = 0.35) => { const r = rng(seed), f = id('bk'); return `<defs>${blurF(f, 3)}</defs><g filter="url(#${f})">${Array.from({ length: n }, () => `<circle cx="${(r() * 300).toFixed(0)}" cy="${(r() * 300).toFixed(0)}" r="${(r() * 16 + 4).toFixed(1)}" fill="${cols[Math.floor(r() * cols.length)]}" opacity="${(r() * op + 0.08).toFixed(2)}"/>`).join('')}</g>`; };
  const sparkles = (n, seed, col = '#fff', area = [20, 20, 280, 280]) => { const r = rng(seed); return Array.from({ length: n }, () => { const x = area[0] + r() * (area[2] - area[0]), y = area[1] + r() * (area[3] - area[1]), s = r() * 6 + 3; return `<path d="M${x} ${y - s} L${x + s * 0.25} ${y - s * 0.25} L${x + s} ${y} L${x + s * 0.25} ${y + s * 0.25} L${x} ${y + s} L${x - s * 0.25} ${y + s * 0.25} L${x - s} ${y} L${x - s * 0.25} ${y - s * 0.25}z" fill="${col}" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`; }).join(''); };
  const felt = (c1, c2) => { const g = id('ft'), t = id('tx'); return `<defs>${rad(g, [c1, c2], 0.5, 0.42, 0.75)}<filter id="${t}"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>
    <rect width="300" height="400" fill="url(#${g})"/><rect width="300" height="400" fill="#000" filter="url(#${t})"/>`; };
  const floorGrid = (col, y0 = 250, op = 0.5) => `<g stroke="${col}" stroke-width="1.2" opacity="${op}">${Array.from({ length: 15 }, (_, i) => `<line x1="${150 + (i - 7) * 14}" y1="${y0}" x2="${150 + (i - 7) * 70}" y2="400"/>`).join('')}${Array.from({ length: 7 }, (_, i) => { const y = y0 + Math.pow(i / 6, 1.8) * (400 - y0); return `<line x1="0" y1="${y.toFixed(1)}" x2="300" y2="${y.toFixed(1)}"/>`; }).join('')}</g>`;
  const clouds = (seed, col = '#fff', op = 0.9, y = 300) => { const r = rng(seed); return `<g fill="${col}" opacity="${op}">${Array.from({ length: 9 }, (_, i) => `<circle cx="${i * 38 - 10 + r() * 10}" cy="${y + r() * 20}" r="${26 + r() * 18}"/>`).join('')}</g>`; };

  /* ---------------- objects ---------------- */
  const SUIT = {
    s: 'M50 6 C34 28 10 40 10 60 C10 74 22 82 34 80 C40 79 44 76 46 72 C44 82 40 88 32 92 H68 C60 88 56 82 54 72 C56 76 60 79 66 80 C78 82 90 74 90 60 C90 40 66 28 50 6z',
    h: 'M50 90 C20 68 8 52 8 34 C8 20 20 10 32 10 C40 10 46 14 50 22 C54 14 60 10 68 10 C80 10 92 20 92 34 C92 52 80 68 50 90z',
    d: 'M50 4 L86 50 L50 96 L14 50z',
    c: 'M50 8 a20 20 0 0 1 17 30 a20 20 0 1 1 -11 34 C57 82 62 88 68 92 H32 C38 88 43 82 44 72 a20 20 0 1 1 -11 -34 A20 20 0 0 1 50 8z',
  };
  const suitPath = (s, x, y, sz, col) => `<path d="${SUIT[s]}" fill="${col}" transform="translate(${x - sz / 2} ${y - sz / 2}) scale(${sz / 100})"/>`;
  /** Playing card centred at (x,y), width w, drawn from the real deck in img/cards. rank: 'A','K','Q','J','10'…, suit: s h d c. */
  const SUIT_FILE = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' }, RANK_FILE = { A: '1', K: 'king', Q: 'queen', J: 'jack' };
  function card(x, y, w, rank, suit, rot = 0, back = false) {
    const hgt = w * 1.45, src = back ? 'img/cards/back-red.webp' : `img/cards/${SUIT_FILE[suit]}_${RANK_FILE[rank] || rank}.webp`;
    return shadow(`<g transform="translate(${x} ${y}) rotate(${rot})"><image href="${src}" x="${-w / 2}" y="${-hgt / 2}" width="${w}" height="${hgt}" preserveAspectRatio="none"/></g>`, 6, 6, 0.5);
  }
  const CHIP = { red: ['#e53935', '#8e0000'], blue: ['#1e88e5', '#0d3c7a'], green: ['#2e9d57', '#0b4d27'], black: ['#3a3f47', '#0c0e11'], purple: ['#8e24aa', '#3d0a52'], gold: ['#ffcf3f', '#a86b00'], white: ['#f5f5f5', '#9e9e9e'], orange: ['#fb8c00', '#8a3d00'] };
  /** Top-down chip. */
  function chip(x, y, r, color = 'red', rot = 0, label = '') {
    const [a, b] = CHIP[color], g = id('ch');
    return shadow(`<g transform="translate(${x} ${y}) rotate(${rot})"><defs>${rad(g, [a, b], 0.4, 0.35, 0.8)}</defs>
      <circle r="${r}" fill="url(#${g})"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${-r * 0.13}" y="${-r}" width="${r * 0.26}" height="${r * 0.24}" rx="${r * 0.04}" fill="#fff" transform="rotate(${i * 60})"/>`).join('')}
      <circle r="${r * 0.66}" fill="none" stroke="#fff" stroke-width="${r * 0.05}" stroke-dasharray="${r * 0.18} ${r * 0.12}" opacity=".85"/><circle r="${r * 0.52}" fill="url(#${g})" stroke="#000" stroke-opacity=".25"/>
      ${label ? `<text y="${r * 0.17}" text-anchor="middle" font-family="Lilita One" font-size="${r * 0.48}" fill="#fff">${label}</text>` : ''}</g>`, 4, 3, 0.5);
  }
  /** Stack of chips seen from the side. */
  function chipStack(x, y, n, color = 'red', r = 26) {
    const [a, b] = CHIP[color], g = id('cs'), ry = r * 0.36, th = r * 0.22;
    let s = '';
    for (let i = 0; i < n; i++) {
      const cy = y - i * th;
      s += `<path d="M${x - r} ${cy} v${-th} a${r} ${ry} 0 0 0 ${r * 2} 0 v${th} a${r} ${ry} 0 0 1 ${-r * 2} 0z" fill="${b}"/>`;
      s += Array.from({ length: 5 }, (_, k) => { const t = -0.8 + k * 0.4, px = x + t * r; return `<rect x="${px - r * 0.07}" y="${cy - th + ry * Math.sqrt(1 - t * t) - 0.5}" width="${r * 0.14}" height="${th}" fill="#fff" opacity=".9"/>`; }).join('');
    }
    const top = y - n * th;
    s += `<ellipse cx="${x}" cy="${top}" rx="${r}" ry="${ry}" fill="url(#${g})"/><ellipse cx="${x}" cy="${top}" rx="${r * 0.62}" ry="${ry * 0.62}" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>`;
    return shadow(`<defs>${lin(g, [a, b], 0, 0, 1, 1)}</defs>${s}`, 5, 4, 0.5);
  }
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  /** A die with a visible top and side face. */
  function die(x, y, s, v, rot = 0, color = 'white', top = 5, side = 3) {
    const P = color === 'red' ? ['#ff6b6b', '#d32f2f', '#8e0000', '#fff'] : color === 'black' ? ['#4a4f57', '#24272c', '#0b0c0e', '#fff'] : color === 'gold' ? ['#fff3b0', '#f4c430', '#9a6b00', '#5a3a00'] : ['#ffffff', '#e9ecef', '#b9c0c7', '#c62828'];
    const g = id('dc'), d = s * 0.22, pip = (vv, ox, oy, sc, sk = '') => PIPS[vv].map(([px, py]) => `<circle cx="${ox + px * s * 0.27 * sc}" cy="${oy + py * s * 0.27}" r="${s * 0.085}" fill="${P[3]}"${sk}/>`).join('');
    return shadow(`<g transform="translate(${x} ${y}) rotate(${rot})"><defs>${lin(g, [P[0], P[1]], 0, 0, 1, 1)}</defs>
      <path d="M${-s / 2} ${-s / 2} l${d} ${-d} h${s} l${-d} ${d}z" fill="${P[0]}" stroke="${P[2]}" stroke-width="1"/>
      <path d="M${s / 2} ${-s / 2} l${d} ${-d} v${s} l${-d} ${d}z" fill="${P[2]}" stroke="${P[2]}" stroke-width="1"/>
      <rect x="${-s / 2}" y="${-s / 2}" width="${s}" height="${s}" rx="${s * 0.14}" fill="url(#${g})" stroke="${P[2]}" stroke-width="1"/>
      ${pip(v, 0, 0, 1)}
      <g transform="translate(${d / 2} ${-s / 2 - d / 2}) scale(1 ${0.32}) skewX(-45)" opacity=".85">${PIPS[top].map(([px, py]) => `<circle cx="${px * s * 0.25}" cy="${py * s * 0.6}" r="${s * 0.07}" fill="${P[3]}"/>`).join('')}</g>
      <g transform="translate(${s / 2 + d / 2} ${-d / 2}) scale(.32 1) skewY(-45)" opacity=".7">${PIPS[side].map(([px, py]) => `<circle cx="${px * s * 0.6}" cy="${py * s * 0.25}" r="${s * 0.07}" fill="${P[3]}"/>`).join('')}</g></g>`, 7, 6, 0.55);
  }
  /** Embed a symbol from the shared art set. */
  const art = (svgStr, x, y, size, rot = 0, extra = '') => `<g transform="translate(${x} ${y}) rotate(${rot})"${extra}>${svgStr.replace('<svg ', `<svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `)}</g>`;
  const A = (name, x, y, size, rot = 0, ...args) => art(C.art(name, ...args), x, y, size, rot);
  // slot symbols use the polished sprite treatment when the build-time slot assets are loaded
  const S = (theme, sym, x, y, size, rot = 0) => (window.SlotAssets ? art(window.SlotAssets.symbolSvg(theme, sym), x, y, size * 1.24, rot) : art(C.slotSymArt(theme, sym), x, y, size, rot));
  function wheel(cx, cy, r, cols, labels = [], opts = {}) {
    const n = cols.length, g = id('wh'), seg = (Math.PI * 2) / n, off = opts.off || -Math.PI / 2 - seg / 2;
    let s = `<defs>${rad(g, ['#fff6c8', '#d4a017', '#7a5200'], 0.4, 0.35, 0.7)}</defs><circle cx="${cx}" cy="${cy}" r="${r + r * 0.08}" fill="url(#${g})"/>`;
    cols.forEach((c, i) => { const a0 = off + i * seg, a1 = a0 + seg; s += `<path d="M${cx} ${cy} L${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r} A${r} ${r} 0 0 1 ${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r}z" fill="${c}" stroke="#ffd54f" stroke-width="${r * 0.012}"/>`;
      if (labels[i] != null) { const am = (a0 + a1) / 2, lr = r * (opts.lr || 0.82); s += `<text x="${cx + Math.cos(am) * lr}" y="${cy + Math.sin(am) * lr}" text-anchor="middle" dominant-baseline="central" font-family="${opts.font || 'Lilita One'}" font-size="${opts.fs || r * 0.12}" fill="#fff" transform="rotate(${(am * 180) / Math.PI + 90} ${cx + Math.cos(am) * lr} ${cy + Math.sin(am) * lr})">${labels[i]}</text>`; } });
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="${r * 0.02}"/>`;
    if (opts.hub !== false) s += `<circle cx="${cx}" cy="${cy}" r="${r * 0.2}" fill="url(#${g})" stroke="#5d3a00" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r * 0.07}" fill="#5d3a00"/>`;
    return shadow(s, 8, 8, 0.55);
  }
  function rouletteWheel(cx, cy, r, zeroes = 1) {
    const nums = zeroes === 2 ? [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2] : [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    const cols = nums.map((n) => (n === 0 || n === '00' ? '#0f8a3a' : reds.has(n) ? '#c1121f' : '#151515'));
    const wood = id('wd'), cone = id('cn');
    return `<defs>${rad(wood, ['#8d5a2b', '#4a2a10', '#2a1505'], 0.5, 0.45, 0.6)}${rad(cone, ['#f9e08b', '#b8860b', '#5d3a00'], 0.45, 0.4, 0.6)}</defs>
      ${shadow(`<circle cx="${cx}" cy="${cy}" r="${r * 1.18}" fill="url(#${wood})"/><circle cx="${cx}" cy="${cy}" r="${r * 1.04}" fill="#1a0f06"/>`, 10, 10, 0.6)}
      ${wheel(cx, cy, r, cols, nums, { lr: 0.88, fs: r * 0.075, font: 'Russo One', hub: false })}
      <circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="url(#${wood})" stroke="#d4a017" stroke-width="2"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.34}" fill="url(#${cone})"/>
      ${[0, 1, 2, 3].map((i) => `<rect x="${cx - 3}" y="${cy - r * 0.62}" width="6" height="${r * 0.36}" rx="3" fill="url(#${cone})" transform="rotate(${i * 90 + 45} ${cx} ${cy})"/>`).join('')}
      <circle cx="${cx}" cy="${cy}" r="${r * 0.1}" fill="#fff6c8"/>`;
  }
  const ball = (x, y, r, c1 = '#ffffff', c2 = '#9aa3ad') => { const g = id('bl'); return shadow(`<defs>${rad(g, [c1, c2], 0.35, 0.3, 0.75)}</defs><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/>`, 3, 3, 0.45); };
  const lottoBall = (x, y, r, num, col, font = 'Lilita One') => { const g = id('lb'); return shadow(`<defs>${rad(g, ['#ffffff', col, col], 0.35, 0.3, 0.85)}</defs><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/>
    <circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="#fff"/><text x="${x}" y="${y + r * 0.2}" text-anchor="middle" font-family="${font}" font-size="${r * 0.6}" fill="#1b1b1b">${num}</text>
    <ellipse cx="${x - r * 0.38}" cy="${y - r * 0.45}" rx="${r * 0.25}" ry="${r * 0.14}" fill="#fff" opacity=".6" transform="rotate(-35 ${x - r * 0.38} ${y - r * 0.45})"/>`, 5, 4, 0.5); };
  const coinArt = (x, y, r, rot = 0, squash = 1) => { const g = id('co'); return shadow(`<g transform="translate(${x} ${y}) rotate(${rot}) scale(1 ${squash})"><defs>${rad(g, ['#fff6c8', '#ffd54f', '#b8860b'], 0.38, 0.32, 0.75)}</defs>
    <circle r="${r}" fill="#a87400"/><circle r="${r * 0.94}" fill="url(#${g})" transform="translate(0 ${-r * 0.06})"/><circle r="${r * 0.72}" fill="none" stroke="#b8860b" stroke-width="${r * 0.06}" transform="translate(0 ${-r * 0.06})"/>
    <text y="${r * 0.22}" text-anchor="middle" font-family="Cinzel Decorative, Georgia, serif" font-weight="900" font-size="${r * 0.8}" fill="#a87400" transform="translate(0 ${-r * 0.06})">K</text></g>`, 5, 4, 0.5); };
  const burst = (cx, cy, r, cols, n = 12, inner = 0.6) => `<polygon points="${Array.from({ length: n * 2 }, (_, i) => { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? r * inner : r; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }).join(' ')}" fill="${cols[0]}" stroke="${cols[1] || 'none'}" stroke-width="3" stroke-linejoin="round"/>`;
  const fish = (x, y, s, c1, c2, flip = 1, rot = 0) => { const g = id('fs'); return shadow(`<g transform="translate(${x} ${y}) rotate(${rot}) scale(${flip * s / 100} ${s / 100})"><defs>${lin(g, [c1, c2])}</defs>
    <path d="M-50 0 C-30 -34 30 -36 46 0 C30 36 -30 34 -50 0z" fill="url(#${g})"/><path d="M40 0 L70 -26 L64 0 L70 26z" fill="${c2}"/><path d="M-6 -30 L10 -48 L18 -26z" fill="${c2}"/>
    <path d="M-20 -26 C-12 -8 -12 8 -20 26 M6 -32 C14 -10 14 10 6 32" stroke="#fff" stroke-width="7" fill="none" opacity=".85"/>
    <circle cx="-32" cy="-6" r="7" fill="#fff"/><circle cx="-33" cy="-6" r="4" fill="#111"/></g>`, 4, 3, 0.4); };

  /* ---------------- logo & finish ---------------- */
  /** Logo lines, bottom-aligned. o: font, size, colors [top, mid, bottom], stroke, ex (extrusion colour), y (baseline of last line). */
  function title(lines, o = {}) {
    const font = o.font || 'Lilita One', size = o.size || 56, g = id('tt'), cols = o.colors || ['#ffffff', '#ffe082', '#ffb300'], stroke = o.stroke || '#1a0d00', y0 = o.y || 352, lh = o.lh || size * 0.92;
    const neon = o.neon, depth = o.depth ?? 4, f = id('tf');
    return `<defs>${lin(g, cols)}${shadowF(f, 6, 6, 0.6)}${neon ? blurF(f + 'n', 5) : ''}</defs><g filter="url(#${f})">${lines.map((t, i) => {
      const y = y0 - (lines.length - 1 - i) * lh, sz = Array.isArray(t) ? t[1] : size, tx = Array.isArray(t) ? t[0] : t;
      const base = `x="150" y="${y}" text-anchor="middle" font-family="${font}, Impact, sans-serif" font-size="${sz}" font-weight="900" data-fit="276" letter-spacing="${o.ls || 0}"`;
      if (neon) return `<text ${base} fill="${cols[1]}" filter="url(#${f}n)">${tx}</text><text ${base} fill="none" stroke="${cols[1]}" stroke-width="3">${tx}</text><text ${base} fill="${cols[0]}">${tx}</text>`;
      return Array.from({ length: depth }, (_, k) => `<text ${base} fill="${o.ex || stroke}" stroke="${o.ex || stroke}" stroke-width="${o.sw || 8}" stroke-linejoin="round" transform="translate(0 ${depth - k})">${tx}</text>`).join('') +
        `<text ${base} fill="url(#${g})" stroke="${stroke}" stroke-width="${o.sw || 8}" paint-order="stroke" stroke-linejoin="round">${tx}</text>` +
        `<text ${base} fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" transform="translate(0 -1)">${tx}</text>`;
    }).join('')}</g>`;
  }
  const MAKER = { originals: 'KRUSH ORIGINALS', slots: 'KRUSH SLOTS', table: 'KRUSH TABLES', poker: 'KRUSH POKER', lottery: 'KRUSH INSTANT' };
  function finish(cat) {
    const v = id('vg'), n = id('gr'), b = id('bt');
    return `<defs>${rad(v, [['#000', 0], ['#000', 0], ['#000', 0.55]], 0.5, 0.42, 0.78)}${lin(b, [['#000'], ['#000']].map((x) => x[0]))}
      <filter id="${n}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .09"/></feComponentTransfer></filter>
      <linearGradient id="${b}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient></defs>
      <rect width="300" height="400" fill="url(#${v})"/><rect y="250" width="300" height="150" fill="url(#${b}f)"/>
      <rect width="300" height="400" filter="url(#${n})"/>
      <text x="150" y="386" text-anchor="middle" font-family="Russo One, sans-serif" font-size="10.5" letter-spacing="3.2" fill="#fff" opacity=".78">${MAKER[cat] || 'KRUSH'}</text>
      <rect x="1" y="1" width="298" height="398" rx="14" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="2"/>`;
  }

  /* ---------------- recipes ---------------- */
  const T = (lines, o) => ({ lines, o });
  const R = {
    /* ===== Originals ===== */
    plinko: () => [bg(['#ff3d9a', '#7b1fa2', '#22073d']), glow(150, 120, 170, '#ff80cb', 0.55),
      (() => { let s = ''; const f = id('pg'); s += `<defs>${blurF(f, 2.2)}</defs>`; for (let row = 0; row < 9; row++) for (let k = 0; k <= row + 2; k++) { const x = 150 + (k - (row + 2) / 2) * 24, y = 40 + row * 24; s += `<circle cx="${x}" cy="${y}" r="5" fill="#fff" filter="url(#${f})" opacity=".8"/><circle cx="${x}" cy="${y}" r="3.2" fill="#fff"/>`; } return s; })(),
      ['#ff1744', '#ff5722', '#ff9100', '#ffc400', '#ffea00', '#ffc400', '#ff9100', '#ff5722', '#ff1744'].map((c, i) => `<rect x="${42 + i * 24}" y="262" width="21" height="17" rx="4" fill="${c}"/><text x="${52.5 + i * 24}" y="274.5" text-anchor="middle" font-family="Russo One" font-size="${i === 0 || i === 8 ? 7 : 8}" fill="#3a0a00">${['1K', '130', '26', '9', '4', '9', '26', '130', '1K'][i]}</text>`).join(''),
      `<path d="M150 18 C140 60 176 90 162 128" stroke="#fff" stroke-opacity=".35" stroke-width="10" fill="none" stroke-linecap="round"/>`, ball(162, 132, 11, '#ffe1f0', '#ff2d8f'), ball(126, 196, 9, '#e8fff7', '#00c896'), ball(186, 222, 8, '#fff7d6', '#ffb300'),
      T(['PLINKO'], { font: 'Bungee', size: 58, colors: ['#ffffff', '#ffd1ea', '#ff4fa3'], stroke: '#3a0331' })],
    crash: () => [bg(['#1a1446', '#0b0a24', '#05030f']), stars(70, 3), glow(230, 70, 120, '#7c4dff', 0.4), floorGrid('#7c4dff', 255, 0.35),
      (() => { const g = id('cr'), a = id('ca'); return `<defs>${lin(g, ['#ff1744', '#ff9100', '#ffea00'], 0, 1, 1, 0)}${lin(a, [['#ff9100'], ['#ff9100']].map((x) => x[0]), 0, 0, 0, 1)}</defs>
        <path d="M10 280 C90 276 160 240 228 120 L228 290 L10 290z" fill="#ff9100" opacity=".18"/><path d="M10 280 C90 276 160 240 228 120" stroke="url(#${g})" stroke-width="7" fill="none" stroke-linecap="round"/>`; })(),
      glow(232, 112, 46, '#ffea00', 0.7), A('rocket', 236, 98, 92, 52), `<text x="70" y="120" font-family="Russo One" font-size="40" fill="#fff" opacity=".95">12.48×</text>`,
      T(['CRASH'], { font: 'Russo One', size: 64, colors: ['#ffffff', '#ffcc80', '#ff6d00'], stroke: '#2a0a00' })],
    mines: () => [bg(['#0e3a46', '#071d26', '#030b10']), glow(150, 150, 160, '#00e5a8', 0.3),
      (() => { let s = ''; const g = id('mt'); s += `<defs>${lin(g, ['#3b5566', '#1d2c36'])}</defs>`; const open = { 1: 'gem', 6: 'gem', 8: 'gem', 13: 'gem', 10: 'bomb' };
        for (let i = 0; i < 16; i++) { const cx = 66 + (i % 4) * 56, cy = 60 + Math.floor(i / 4) * 56, o = open[i]; s += `<rect x="${cx - 25}" y="${cy - 25}" width="50" height="50" rx="9" fill="${o ? '#0b1a22' : `url(#${g})`}" stroke="${o === 'bomb' ? '#ff5252' : o ? '#00e5a8' : '#4b6576'}" stroke-width="2"/>${o ? '' : `<rect x="${cx - 25}" y="${cy + 18}" width="50" height="7" rx="3" fill="#0b141a" opacity=".6"/>`}`; }
        s += glow(234, 172, 40, '#ff5252', 0.6) + Object.entries(open).map(([i, n]) => A(n, 66 + (i % 4) * 56, 60 + Math.floor(i / 4) * 56, n === 'bomb' ? 50 : 40)).join(''); return s; })(),
      sparkles(10, 4, '#b9fff0', [40, 40, 260, 260]),
      T(['MINES'], { font: 'Lilita One', size: 66, colors: ['#ffffff', '#b9fff0', '#00c896'], stroke: '#00281e' })],
    limbo: () => [bg(['#2b0000', '#120000', '#000']), (() => { let s = ''; const f = id('lm'); s += `<defs>${blurF(f, 3)}</defs>`; for (let i = 0; i < 8; i++) { const k = Math.pow(0.78, i), w = 270 * k, hh = 230 * k; s += `<rect x="${150 - w / 2}" y="${150 - hh / 2}" width="${w}" height="${hh}" rx="${22 * k}" fill="none" stroke="#ff6d00" stroke-width="${5 * k + 1}" opacity="${0.9 - i * 0.08}" filter="url(#${f})"/><rect x="${150 - w / 2}" y="${150 - hh / 2}" width="${w}" height="${hh}" rx="${22 * k}" fill="none" stroke="#ffd180" stroke-width="${1.6 * k + 0.4}" opacity="${0.9 - i * 0.08}"/>`; } return s; })(),
      glow(150, 150, 60, '#ff9100', 0.5), title([['100×', 46]], { font: 'Russo One', colors: ['#ffffff', '#ffe0b2', '#ffab40'], stroke: '#3a1200', y: 166, depth: 2, sw: 6 }),
      T(['LIMBO'], { font: 'Monoton', size: 60, colors: ['#fff3e0', '#ff6d00'], neon: true })],
    dice: () => [bg(['#00b37a', '#006b53', '#002a26']), glow(150, 130, 150, '#64ffda', 0.35),
      `<rect x="40" y="250" width="220" height="12" rx="6" fill="#0a1f1a"/><rect x="40" y="250" width="132" height="12" rx="6" fill="#ff4d63"/><rect x="172" y="250" width="88" height="12" rx="6" fill="#22e58b"/><circle cx="172" cy="256" r="13" fill="#fff" stroke="#0a1f1a" stroke-width="3"/>`,
      die(112, 150, 88, 5, -14, 'white', 1, 3), die(198, 118, 70, 3, 18, 'red', 6, 2),
      T(['DICE'], { font: 'Lilita One', size: 74, colors: ['#ffffff', '#c8ffe9', '#22e58b'], stroke: '#002a1d' })],
    hilo: () => [`<rect width="300" height="400" fill="#101a3a"/><path d="M0 0 H300 V170 L0 260z" fill="#b71c1c"/>`, glow(150, 150, 150, '#fff', 0.15),
      card(108, 150, 96, 'K', 'h', -10), card(196, 156, 96, '4', 's', 10),
      `<path d="M150 22 l26 30 h-15 v26 h-22 v-26 h-15z" fill="#22e58b" stroke="#04331d" stroke-width="3"/><path d="M150 278 l26 -30 h-15 v-26 h-22 v26 h-15z" fill="#ff4d63" stroke="#4a0010" stroke-width="3"/>`,
      T(['HI-LO'], { font: 'Titan One', size: 70, colors: ['#ffffff', '#ffe0e0', '#ff8a80'], stroke: '#1a0505', y: 356 })],
    tower: () => [bg(['#2d1b69', '#140a35', '#05020f']), stars(60, 9, '#fff', 260), glow(232, 60, 40, '#fff9c4', 0.9), `<circle cx="232" cy="60" r="20" fill="#fffde7"/><circle cx="240" cy="54" r="18" fill="#140a35" opacity=".95"/>`,
      (() => { let s = ''; for (let r = 0; r < 8; r++) { const y = 280 - r * 28, w = 120 - r * 6; for (let k = 0; k < 3; k++) s += `<rect x="${150 - w / 2 + k * (w / 3) + 1}" y="${y}" width="${w / 3 - 2}" height="25" rx="3" fill="${['#5b4a7a', '#4a3b66', '#6a5888'][(r + k) % 3]}" stroke="#2a1f40" stroke-width="1.5"/>`; } return shadow(s, 6, 6, 0.6); })(),
      `<path d="M98 56 L150 12 L202 56z" fill="#7e57c2" stroke="#2a1f40" stroke-width="2"/>`, glow(150, 10, 30, '#ffd54f', 0.9), A('star', 150, 12, 40),
      clouds(5, '#3d2c7a', 0.9, 300), sparkles(8, 5, '#fff59d', [40, 20, 260, 200]),
      T(['TOWER'], { font: 'Cinzel Decorative', size: 52, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#1a0d33' })],
    coinflip: () => [bg(['#6d4c00', '#3a2400', '#120a00']), rays(150, 140, '#ffd54f', 0.16, 20), glow(150, 140, 140, '#ffd54f', 0.45),
      `<path d="M70 230 C60 170 90 110 140 80" stroke="#fff" stroke-opacity=".25" stroke-width="5" fill="none"/><path d="M230 230 C240 170 210 110 160 80" stroke="#fff" stroke-opacity=".18" stroke-width="5" fill="none"/>`,
      A('coinHeads', 150, 140, 150, -12), coinArt(232, 236, 26, 30, 0.4), sparkles(10, 11, '#fff8d0', [40, 40, 260, 240]),
      T(['COIN', 'FLIP'], { font: 'Titan One', size: 58, colors: ['#fffde7', '#ffd54f', '#c99a06'], stroke: '#2a1800' })],
    fish: () => [bg(['#62c9df', '#2e98c3', '#1b6f9c']), `<g opacity=".12" fill="#fff">${[40, 120, 200, 260].map((x, k) => `<path d="M${x} 0 h${26 + (k % 2) * 14} l70 300 h-${26 + (k % 2) * 14}z"/>`).join('')}</g>`,
      (() => { const im = (n, x, y, w, hh, flip) => `<image href="img/fish/${n}.webp" x="${flip ? -x - w : x}" y="${y}" width="${w}" height="${hh}" preserveAspectRatio="xMidYMid meet"${flip ? ' transform="scale(-1 1)"' : ''}/>`;
        return [im('deco-028', 8, 196, 58, 74), im('deco-010', 236, 200, 54, 70), im('deco-047', 120, 238, 44, 38), im('deco-064', 180, 212, 46, 58),
          ...[0, 1, 2, 3].map((k) => im('sand-top', k * 78 - 4, 262, 80, 76)),
          im('eel-gold', 30, 46, 170, 40, false), im('puffer', 176, 86, 92, 88, true), im('red', 22, 120, 92, 74, false), im('blue', 200, 182, 74, 44, true), im('orange', 112, 196, 64, 38, false)].join(''); })(),
      T(['FISH', 'TABLE'], { font: 'Luckiest Guy', size: 56, colors: ['#ffffff', '#fff3c4', '#ffc93c'], stroke: '#0b3b5a' })],
    wheel: () => [bg(['#5e17eb', '#2b0a6e', '#0d0326']), glow(150, 230, 170, '#b388ff', 0.45),
      wheel(150, 260, 150, Array.from({ length: 24 }, (_, i) => ['#ff1744', '#2979ff', '#ffc400', '#00c853', '#d500f9', '#ff6d00'][i % 6]), Array.from({ length: 24 }, (_, i) => ['2×', '0', '3×', '1.5×', '0', '5×'][i % 6]), { fs: 13 }),
      `<path d="M150 98 l-15 -26 h30z" fill="#fff" stroke="#3a1a6e" stroke-width="3" stroke-linejoin="round"/>`, sparkles(8, 3, '#fff', [20, 20, 280, 90]),
      T(['WHEEL'], { font: 'Bungee', size: 58, colors: ['#ffffff', '#e1d4ff', '#b388ff'], stroke: '#16063d', y: 74, depth: 3 })],
    cases: () => [bg(['#3a1f00', '#1a0e00', '#050300']), rays(150, 150, '#ffb300', 0.2, 22), glow(150, 140, 120, '#ffc400', 0.7),
      (() => { const g = id('cs'), m = id('cm'); return shadow(`<defs>${lin(g, ['#ffb74d', '#e65100', '#7a2600'])}${lin(m, ['#5d6d7a', '#2b343c'])}</defs>
        <path d="M60 170 L240 170 L228 262 L72 262z" fill="url(#${g})" stroke="#2a0e00" stroke-width="3"/><path d="M60 170 L82 110 L262 112 L240 170z" fill="url(#${m})" stroke="#11171a" stroke-width="3"/>
        <rect x="132" y="190" width="36" height="22" rx="4" fill="#2a0e00"/><path d="M60 196 H240 M66 236 H234" stroke="#2a0e00" stroke-width="3" opacity=".6"/>`, 8, 8, 0.6); })(),
      A('gem', 118, 120, 58, -12), A('coinHeads', 190, 112, 50, 14), A('star', 150, 86, 46), sparkles(12, 8, '#fff3c4', [40, 40, 260, 200]),
      T(['CASES'], { font: 'Russo One', size: 66, colors: ['#ffffff', '#ffe082', '#ff9100'], stroke: '#2a0e00' })],
    scratch: () => [bg(['#00897b', '#00564d', '#00201c']), rays(150, 150, '#fff', 0.1),
      (() => { const g = id('tk'), s2 = id('sv'); return shadow(`<g transform="translate(150 150) rotate(-8)"><defs>${lin(g, ['#ffe082', '#ffb300'])}${lin(s2, ['#e0e0e0', '#9e9e9e'], 0, 0, 1, 1)}</defs>
        <rect x="-108" y="-92" width="216" height="184" rx="12" fill="url(#${g})" stroke="#7a5200" stroke-width="3"/>
        <text x="0" y="-62" text-anchor="middle" font-family="Luckiest Guy" font-size="22" fill="#b71c1c">TRIPLE TREASURE</text>
        ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${-90 + c * 62}" y="${-48 + r * 44}" width="56" height="38" rx="6" fill="${r === 2 && c > 0 ? `url(#${s2})` : '#fff8e1'}" stroke="#7a5200"/>`).join('')).join('')}
        <path d="M-30 52 C-10 40 10 70 30 54 C40 46 50 60 60 52" stroke="#fff8e1" stroke-width="10" fill="none" stroke-linecap="round"/></g>`, 8, 8, 0.55); })(),
      A('coinHeads', 92, 112, 34, -8), A('coinHeads', 152, 104, 34, -8), A('coinHeads', 212, 96, 34, -8), A('star', 88, 158, 30), A('cherry', 150, 150, 30), A('gem', 208, 142, 30),
      coinArt(230, 236, 28, -20, 0.92),
      T(['SCRATCH'], { font: 'Luckiest Guy', size: 58, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#00201c' })],
    pump: () => [bg(['#4fc3f7', '#0288d1', '#01325a']), clouds(3, '#ffffff', 0.35, 240), glow(150, 120, 120, '#fff', 0.35),
      `<path d="M150 214 C146 240 156 256 150 276" stroke="#eceff1" stroke-width="2.5" fill="none"/>`, A('balloon', 150, 128, 190, 0, '#e53935'),
      `<rect x="120" y="270" width="60" height="16" rx="4" fill="#37474f"/><rect x="142" y="248" width="16" height="26" fill="#546e7a"/><rect x="128" y="240" width="44" height="10" rx="5" fill="#263238"/>`,
      T(['PUMP'], { font: 'Luckiest Guy', size: 76, colors: ['#ffffff', '#ffe0e0', '#ff5252'], stroke: '#3a0000' })],
    penalty: () => { const P = C.penaltyArt(); return [bg(['#0d1a29', '#0a1420', '#050a10']),
      `<svg x="0" y="0" width="300" height="270" viewBox="132 10 536 470" preserveAspectRatio="xMidYMid slice"><image href="${P.bg}" width="800" height="460"/>${P.keeper}${P.ball}</svg>`,
      T(['PENALTY'], { font: 'Russo One', size: 54, colors: ['#ffffff', '#e8f5e9', '#c7ee2f'], stroke: '#022008' })]; },
    darts: () => [bg(['#5d2a12', '#2e1407', '#100602']), `<g opacity=".25">${Array.from({ length: 8 }, (_, i) => `<rect x="0" y="${i * 52}" width="300" height="2" fill="#000"/>`).join('')}</g>`, glow(150, 150, 150, '#ffcc80', 0.25),
      (() => { const cx = 150, cy = 150, R = 118; let s = `<circle cx="${cx}" cy="${cy}" r="${R + 14}" fill="#111"/>`; const seg = (Math.PI * 2) / 20, ring = (r0, r1, c1, c2) => Array.from({ length: 20 }, (_, i) => { const a0 = i * seg - Math.PI / 2 - seg / 2, a1 = a0 + seg, c = i % 2 ? c1 : c2; return `<path d="M${cx + Math.cos(a0) * r0} ${cy + Math.sin(a0) * r0} L${cx + Math.cos(a0) * r1} ${cy + Math.sin(a0) * r1} A${r1} ${r1} 0 0 1 ${cx + Math.cos(a1) * r1} ${cy + Math.sin(a1) * r1} L${cx + Math.cos(a1) * r0} ${cy + Math.sin(a1) * r0} A${r0} ${r0} 0 0 0 ${cx + Math.cos(a0) * r0} ${cy + Math.sin(a0) * r0}z" fill="${c}"/>`; }).join('');
        s += ring(R * 0.95, R, '#c62828', '#2e7d32') + ring(R * 0.62, R * 0.95, '#f3e5c0', '#141414') + ring(R * 0.56, R * 0.62, '#c62828', '#2e7d32') + ring(R * 0.12, R * 0.56, '#f3e5c0', '#141414');
        s += `<circle cx="${cx}" cy="${cy}" r="${R * 0.12}" fill="#2e7d32"/><circle cx="${cx}" cy="${cy}" r="${R * 0.055}" fill="#c62828"/>`;
        s += [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].map((n, i) => { const a = i * seg - Math.PI / 2; return `<text x="${cx + Math.cos(a) * (R + 7)}" y="${cy + Math.sin(a) * (R + 7) + 3.5}" text-anchor="middle" font-family="Russo One" font-size="9" fill="#fff">${n}</text>`; }).join('');
        return shadow(s, 10, 10, 0.6); })(),
      `<g transform="translate(150 150) rotate(-35)"><rect x="0" y="-3" width="70" height="6" rx="3" fill="#cfd8dc"/><rect x="18" y="-5" width="30" height="10" rx="4" fill="#455a64"/><path d="M68 0 L98 -18 L104 -14 L84 0 L104 14 L98 18z" fill="#ff1744"/></g>`,
      T(['DARTS'], { font: 'Anton', size: 70, colors: ['#ffffff', '#ffecb3', '#ffb300'], stroke: '#1a0a00', ls: 2 })],
    race: () => [bg(['#87ceeb', '#ffd8a8', '#ff9e5e'], 0, 0.7), `<rect y="190" width="300" height="210" fill="#2e7d32"/>${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${200 + i * 26} H300" stroke="#1b5e20" stroke-width="10" opacity=".5"/>`).join('')}`,
      `<g fill="#fff">${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 20}" y="186" width="4" height="22"/>`).join('')}<rect y="190" width="300" height="4"/><rect y="200" width="300" height="3"/></g>`,
      glow(150, 150, 120, '#fff3c4', 0.55), A('clover-horseshoe2', 150, 140, 170, 0),
      (() => { const g = id('ro'); return shadow(`<defs>${rad(g, ['#64b5f6', '#1565c0'], 0.4, 0.35, 0.7)}</defs><g transform="translate(70 236) rotate(-10)"><path d="M-14 10 L-24 54 L-10 46 L-4 60 L4 14z M14 10 L24 54 L10 46 L4 60 L-4 14z" fill="#1565c0"/>
        ${Array.from({ length: 16 }, (_, i) => `<circle cx="${Math.cos(i * Math.PI / 8) * 26}" cy="${Math.sin(i * Math.PI / 8) * 26}" r="9" fill="#1e88e5"/>`).join('')}<circle r="24" fill="url(#${g})" stroke="#fff" stroke-width="2"/><circle r="16" fill="#fff"/>
        <text y="6" text-anchor="middle" font-family="Russo One" font-size="15" fill="#0d47a1">1ST</text></g>`, 5, 4, 0.5); })(),
      `<g transform="translate(244 40)"><rect x="0" y="0" width="4" height="120" fill="#eceff1"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${4 + (i % 4) * 9}" y="${4 + Math.floor(i / 4) * 9}" width="9" height="9" fill="${(i + Math.floor(i / 4)) % 2 ? '#111' : '#fff'}"/>`).join('')}</g>`,
      T(['HORSE', 'RACE'], { font: 'Rye', size: 50, colors: ['#ffffff', '#ffe0b2', '#ff9800'], stroke: '#2a1205' })],
    cups: () => [bg(['#6a1b9a', '#38006b', '#12001f']), glow(150, 60, 200, '#e1bee7', 0.35), rays(150, -60, '#fff', 0.07, 10, 500),
      `<ellipse cx="150" cy="240" rx="150" ry="40" fill="#1b0a2a"/><ellipse cx="150" cy="232" rx="140" ry="30" fill="#4a148c" opacity=".6"/>`,
      A('cup', 70, 200, 92), A('cup', 230, 200, 92), A('cup', 150, 152, 96, 8), ball(150, 222, 13, '#fff9c4', '#ffb300'), `<path d="M128 196 q22 -10 44 0" stroke="#fff" stroke-opacity=".5" stroke-width="3" fill="none"/>`,
      sparkles(8, 12, '#fff', [30, 30, 270, 140]),
      T(['CUPS'], { font: 'Luckiest Guy', size: 78, colors: ['#ffffff', '#f3e5f5', '#ce93d8'], stroke: '#1a0030' })],
    rps: () => [`<rect width="300" height="400" fill="#101418"/><path d="M0 0 H150 L120 400 H0z" fill="#ff6d00"/><path d="M150 0 H300 V400 H120z" fill="#2962ff"/>`, glow(150, 150, 140, '#fff', 0.25),
      burst(150, 150, 54, ['#ffea00', '#3a2a00'], 12, 0.7), `<text x="150" y="164" text-anchor="middle" font-family="Bungee" font-size="36" fill="#1a1a1a">VS</text>`,
      A('rock', 74, 98, 100, -10), A('paper', 228, 96, 100, 10), A('scissors', 150, 240, 104, 0),
      T(['ROCK PAPER', 'SCISSORS'], { font: 'Bungee', size: 40, colors: ['#ffffff', '#fff8e1', '#ffd54f'], stroke: '#14141a' })],
    redblack: () => [`<rect width="300" height="400" fill="#0d0d0f"/><path d="M0 0 H300 L0 300z" fill="#b71c1c"/>`, glow(150, 150, 150, '#fff', 0.12),
      card(110, 150, 104, 'A', 'h', -12), card(196, 150, 104, 'A', 's', 12),
      suitPath('h', 40, 40, 30, '#fff'), suitPath('s', 262, 262, 30, '#fff'),
      T(['RED OR', 'BLACK'], { font: 'Titan One', size: 52, colors: ['#ffffff', '#ffe0e0', '#ff5252'], stroke: '#140000' })],
    colors: () => [bg(['#1d2633', '#0e141c', '#05080c']), glow(150, 150, 140, '#22e58b', 0.25),
      (() => { const order = [3, 12, 5, 13, 0, 8, 2, 14, 6]; let s = ''; order.forEach((n, i) => { const x = 150 + (i - 4) * 56, sc = 1 - Math.abs(i - 4) * 0.12, c = n === 0 ? '#18a865' : n <= 7 ? '#d93a50' : '#2a2f38'; s += `<g transform="translate(${x} 150) scale(${sc})"><rect x="-26" y="-34" width="52" height="68" rx="10" fill="${c}" stroke="#000" stroke-opacity=".4" stroke-width="2"/><text y="10" text-anchor="middle" font-family="Russo One" font-size="26" fill="#fff">${n}</text></g>`; }); return shadow(s, 6, 6, 0.6); })(),
      `<path d="M150 98 V204" stroke="#fff" stroke-width="3"/><path d="M140 94 h20 l-10 12z" fill="#fff"/>`, glow(150, 150, 46, '#22e58b', 0.5),
      `<text x="150" y="250" text-anchor="middle" font-family="Russo One" font-size="30" fill="#22e58b">14×</text>`,
      T(['COLORS'], { font: 'Righteous', size: 62, colors: ['#ffffff', '#e0ffe9', '#22e58b'], stroke: '#00140a' })],

    /* ===== Table games ===== */
    blackjack: () => [felt('#1b7a45', '#06301a'), `<path d="M-20 300 Q150 180 320 300" stroke="#e8c26a" stroke-width="2" fill="none" opacity=".6"/><text x="150" y="268" text-anchor="middle" font-family="Cinzel Decorative" font-size="11" fill="#e8c26a" opacity=".7" letter-spacing="2">BLACKJACK PAYS 3 TO 2</text>`,
      card(118, 140, 100, 'A', 's', -12), card(188, 130, 100, 'K', 'h', 10), chipStack(62, 236, 5, 'red', 26), chipStack(240, 240, 3, 'black', 24),
      T(['BLACKJACK'], { font: 'Cinzel Decorative', size: 46, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#1a1000' })],
    'roulette-us': () => [bg(['#4a0d0d', '#1d0505', '#000']), glow(150, 140, 160, '#ff8a65', 0.25), rouletteWheel(150, 140, 112, 2), ball(98, 92, 7),
      T(['AMERICAN', 'ROULETTE'], { font: 'Cinzel Decorative', size: 40, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#1a0505' })],
    'roulette-eu': () => [bg(['#0d3b4a', '#051d26', '#000']), glow(150, 140, 160, '#80deea', 0.22), rouletteWheel(150, 140, 112, 1), ball(204, 98, 7),
      T(['EUROPEAN', 'ROULETTE'], { font: 'Cinzel Decorative', size: 40, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#03141a' })],
    baccarat: () => [bg(['#4a148c', '#1f0640', '#080016']), glow(150, 140, 150, '#ffd54f', 0.25), rays(150, 140, '#ffd54f', 0.07),
      card(110, 146, 100, '9', 'd', -10), card(190, 146, 100, 'K', 'c', 10), chipStack(150, 262, 4, 'gold', 24),
      T(['BACCARAT'], { font: 'Cinzel Decorative', size: 44, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#12002a' })],
    'baccarat-tie': () => [bg(['#00695c', '#003d33', '#001410']), glow(150, 140, 150, '#a7ffeb', 0.22),
      card(108, 140, 96, '8', 'h', -10), card(192, 140, 96, '8', 's', 10), burst(150, 236, 40, ['#ffd54f', '#5d3a00'], 14, 0.78), `<text x="150" y="247" text-anchor="middle" font-family="Russo One" font-size="26" fill="#3a2400">8:1</text>`,
      T(['BACCARAT', 'TIE'], { font: 'Cinzel Decorative', size: 42, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#001410' })],
    'baccarat-side': () => [bg(['#880e4f', '#3d0322', '#120009']), glow(150, 140, 150, '#ff80ab', 0.25),
      card(96, 146, 88, 'Q', 'd', -16), card(150, 136, 88, 'Q', 'h', 0), card(204, 146, 88, '7', 'd', 16), sparkles(10, 14, '#ffe082', [30, 40, 270, 230]),
      T(['BACCARAT', 'BONUS'], { font: 'Cinzel Decorative', size: 42, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#120009' })],
    craps: () => [felt('#1f6e3d', '#082a16'), `<path d="M-10 70 Q150 20 310 70" stroke="#fff" stroke-width="3" fill="none" opacity=".5"/><text x="150" y="62" text-anchor="middle" font-family="Russo One" font-size="13" fill="#fff" opacity=".6" letter-spacing="3">PASS LINE</text>`,
      die(110, 160, 82, 6, -18, 'red', 5, 3), die(196, 132, 70, 1, 22, 'red', 3, 2), chip(70, 250, 24, 'blue', 10, '25'), chip(236, 244, 24, 'black', -20, '100'),
      T(['CRAPS'], { font: 'Titan One', size: 70, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#061f10' })],
    sicbo: () => [bg(['#b71c1c', '#6d0000', '#2a0000']), `<g opacity=".22" fill="none" stroke="#ffd54f" stroke-width="2">${Array.from({ length: 6 }, (_, i) => `<circle cx="150" cy="150" r="${40 + i * 36}"/>`).join('')}</g>`,
      (() => { const g = id('dm'); return `<defs>${rad(g, [['#ffffff', 0.35], ['#bbdefb', 0.12], ['#ffffff', 0.25]], 0.35, 0.3, 0.75)}</defs><ellipse cx="150" cy="232" rx="104" ry="20" fill="#3a0000"/><ellipse cx="150" cy="226" rx="98" ry="16" fill="#ffd54f"/>`; })(),
      die(110, 196, 56, 4, -12, 'white', 1, 2), die(186, 194, 56, 6, 14, 'white', 2, 3), die(148, 150, 56, 2, 4, 'white', 3, 6),
      (() => { const g = id('gd'); return `<defs>${rad(g, [['#ffffff', 0.3], ['#e3f2fd', 0.06]], 0.35, 0.3, 0.7)}</defs><path d="M52 226 C52 90 248 90 248 226z" fill="url(#${g})" stroke="#fff" stroke-opacity=".6" stroke-width="2.5"/><path d="M82 140 C96 112 120 100 140 98" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".6"/>`; })(),
      T(['SIC BO'], { font: 'Titan One', size: 66, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#2a0000' })],
    bigsix: () => [bg(['#2a1208', '#140804', '#050201']), glow(150, 150, 170, '#c98a3a', 0.35),
      `<image href="${C.bigSixArt()}" x="18" y="4" width="264" height="286"/>`,
      T(['BIG SIX'], { font: 'Anton', size: 64, colors: ['#ffffff', '#fbe7a6', '#d8a332'], stroke: '#2a0f05' })],
    dragontiger: () => [`<rect width="300" height="400" fill="#120000"/><path d="M0 0 H170 L130 400 H0z" fill="#8e0000"/><path d="M170 0 H300 V400 H130z" fill="#e65100"/>`, glow(150, 150, 150, '#ffd54f', 0.2),
      (() => { const r = rng(8); let s = ''; for (let i = 0; i < 9; i++) s += `<path d="M${180 + r() * 110} ${20 + i * 30} q${20 + r() * 20} ${10} ${40 + r() * 20} 0" stroke="#1a0a00" stroke-width="${5 + r() * 4}" fill="none" stroke-linecap="round" opacity=".55"/>`; return s; })(),
      (() => { let s = ''; for (let i = 0; i < 6; i++) s += `<path d="M${20 + i * 18} ${300 - i * 40} c10 -20 30 -20 40 0" stroke="#ffd54f" stroke-width="2" fill="none" opacity=".35"/>`; return s; })(),
      card(96, 140, 94, 'K', 'd', -10), card(204, 140, 94, 'Q', 'c', 10), burst(150, 150, 30, ['#ffd54f', '#3a2400'], 10, 0.6), `<text x="150" y="158" text-anchor="middle" font-family="Bungee" font-size="20" fill="#3a2400">VS</text>`,
      T(['DRAGON', 'TIGER'], { font: 'Cinzel Decorative', size: 46, colors: ['#fffbe6', '#ffd54f', '#b8860b'], stroke: '#140000' })],
    war: () => [bg(['#37474f', '#1c262b', '#07090a']), glow(150, 140, 120, '#ff6d00', 0.5), burst(150, 140, 70, ['#ffab40', 'none'], 16, 0.45), burst(150, 140, 44, ['#fff3e0', 'none'], 12, 0.5),
      card(120, 150, 100, 'K', 's', -28), card(180, 150, 100, 'K', 'h', 28),
      T(['CASINO', 'WAR'], { font: 'Anton', size: 58, colors: ['#ffffff', '#ffe0b2', '#ff6d00'], stroke: '#1a0a00', ls: 2 })],
    reddog: () => [bg(['#c62828', '#7f0000', '#2a0000']), (() => { let s = ''; [[60, 60], [230, 90], [80, 230], [240, 250]].forEach(([x, y], i) => { s += `<g opacity=".18" fill="#fff" transform="translate(${x} ${y}) rotate(${i * 30 - 20})"><ellipse cx="0" cy="8" rx="14" ry="12"/><circle cx="-14" cy="-8" r="5"/><circle cx="-5" cy="-14" r="5"/><circle cx="5" cy="-14" r="5"/><circle cx="14" cy="-8" r="5"/></g>`; }); return s; })(),
      card(84, 156, 82, '5', 'c', -14), card(216, 156, 82, 'J', 'd', 14), card(150, 136, 90, '8', 'h', 0), glow(150, 136, 70, '#fff59d', 0.3),
      T(['RED DOG'], { font: 'Titan One', size: 62, colors: ['#ffffff', '#ffe0e0', '#ff8a80'], stroke: '#2a0000' })],
    miniroulette: () => [bg(['#311b92', '#140a45', '#05021a']), glow(150, 150, 150, '#b388ff', 0.25),
      wheel(150, 150, 110, [0, 5, 10, 3, 8, 1, 12, 7, 2, 9, 4, 11, 6].map((n) => (n === 0 ? '#0f8a3a' : [1, 3, 5, 7, 9, 11].includes(n) ? '#c1121f' : '#151515')), [0, 5, 10, 3, 8, 1, 12, 7, 2, 9, 4, 11, 6], { fs: 20, font: 'Russo One', lr: 0.8 }),
      ball(150, 64, 8), T(['MINI', 'ROULETTE'], { font: 'Bungee', size: 44, colors: ['#ffffff', '#ede7f6', '#b388ff'], stroke: '#0b0326' })],
    andarbahar: () => [bg(['#00838f', '#004d55', '#001a1d']), (() => { let s = '<g fill="none" stroke="#ffcc80" stroke-opacity=".28" stroke-width="2">'; for (let i = 0; i < 12; i++) s += `<ellipse cx="150" cy="140" rx="110" ry="34" transform="rotate(${i * 15} 150 140)"/>`; return s + '<circle cx="150" cy="140" r="120"/><circle cx="150" cy="140" r="80"/></g>'; })(),
      card(70, 170, 72, '7', 'c', -14, true), card(62, 180, 72, 'Q', 'd', -8), card(230, 170, 72, '3', 'h', 14, true), card(238, 180, 72, '9', 's', 8), card(150, 130, 92, 'Q', 's', 0), glow(150, 130, 60, '#ffe082', 0.35),
      T(['ANDAR', 'BAHAR'], { font: 'Titan One', size: 54, colors: ['#ffffff', '#ffe0b2', '#ff9800'], stroke: '#001a1d' })],
    chuckaluck: () => [bg(['#4e342e', '#261713', '#0a0605']), glow(150, 140, 140, '#ffd54f', 0.25),
      (() => { const g = id('cg'); return `<defs>${lin(g, ['#ffe082', '#b8860b'], 0, 0, 1, 0)}</defs><g stroke="url(#${g})" stroke-width="3" fill="none"><path d="M70 40 C70 120 120 130 150 140 C180 130 230 120 230 40"/><path d="M70 260 C70 180 120 160 150 150 C180 160 230 180 230 260"/>${Array.from({ length: 7 }, (_, i) => `<path d="M${70 + i * 26.6} 40 C${100 + i * 8} 120 ${100 + i * 8} 170 ${70 + i * 26.6} 260" opacity=".55"/>`).join('')}<ellipse cx="150" cy="40" rx="80" ry="12"/><ellipse cx="150" cy="260" rx="80" ry="12"/></g><rect x="140" y="132" width="20" height="26" rx="4" fill="url(#${g})"/>`; })(),
      die(114, 226, 48, 3, -12, 'red', 1, 2), die(176, 230, 48, 6, 10, 'red', 2, 3), die(144, 76, 48, 1, 6, 'red', 4, 5),
      T(['CHUCK-A-LUCK'], { font: 'Rye', size: 40, colors: ['#ffffff', '#ffe0b2', '#ffb300'], stroke: '#1a0a05' })],
    crownanchor: () => [bg(['#0d47a1', '#062a63', '#010d24']), (() => `<circle cx="150" cy="140" r="112" fill="none" stroke="#d7b98e" stroke-width="10" stroke-dasharray="10 6"/><circle cx="150" cy="140" r="112" fill="none" stroke="#8d6e4a" stroke-width="2"/>`)(),
      A('anchor', 150, 154, 150), A('crown', 150, 74, 96), A('heart', 64, 236, 34), A('spade', 116, 252, 34), A('suitDiamond', 184, 252, 34), A('club', 236, 236, 34),
      T(['CROWN &', 'ANCHOR'], { font: 'Titan One', size: 48, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#010d24' })],
    uo7: () => [bg(['#1b5e20', '#0b2e10', '#020a03']), rays(150, 140, '#ffd54f', 0.12), glow(150, 140, 110, '#ffd54f', 0.5),
      title([['7', 190]], { font: 'Titan One', colors: ['#fff6c8', '#ffd54f', '#c99a06'], stroke: '#3a2400', y: 210, depth: 6, sw: 10 }),
      die(64, 230, 58, 3, -16, 'white', 2, 1), die(236, 230, 58, 4, 16, 'white', 5, 6),
      T(['UNDER', 'OVER 7'], { font: 'Titan One', size: 50, colors: ['#ffffff', '#e8f5e9', '#69f0ae'], stroke: '#020a03' })],
    duel: () => [`<rect width="300" height="400" fill="#0b0d12"/><path d="M0 0 H160 L140 400 H0z" fill="#1565c0"/><path d="M160 0 H300 V400 H140z" fill="#c62828"/>`,
      `<path d="M160 20 L132 150 L162 150 L136 280" stroke="#ffea00" stroke-width="8" fill="none" stroke-linejoin="round"/><path d="M160 20 L132 150 L162 150 L136 280" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/>`, glow(150, 150, 80, '#ffea00', 0.35),
      die(76, 136, 64, 6, -10, 'white', 5, 4), die(78, 220, 52, 5, 8, 'white', 3, 1), die(226, 136, 64, 4, 10, 'red', 1, 2), die(224, 220, 52, 6, -8, 'red', 2, 3),
      T(['DICE DUEL'], { font: 'Bungee', size: 46, colors: ['#ffffff', '#fffde7', '#ffea00'], stroke: '#0b0d12' })],

    /* ===== Poker ===== */
    videopoker: () => [bg(['#263238', '#11171a', '#000']), (() => { const g = id('sc'); return shadow(`<defs>${lin(g, ['#0d47a1', '#001b4d'])}</defs><rect x="20" y="40" width="260" height="200" rx="16" fill="#111" stroke="#90a4ae" stroke-width="4"/><rect x="32" y="52" width="236" height="176" rx="10" fill="url(#${g})"/>
        <text x="150" y="80" text-anchor="middle" font-family="Russo One" font-size="15" fill="#ffea00" letter-spacing="2">ROYAL FLUSH</text>`, 8, 8, 0.6); })(),
      ['10', 'J', 'Q', 'K', 'A'].map((r, i) => card(62 + i * 44, 150, 40, r, 's', 0)).join(''),
      ['HELD', 'HELD', 'HELD', 'HELD', 'HELD'].map((t, i) => `<text x="${62 + i * 44}" y="${206}" text-anchor="middle" font-family="Russo One" font-size="9" fill="#ffea00">${t}</text>`).join(''),
      `<g opacity=".18">${Array.from({ length: 44 }, (_, i) => `<rect x="32" y="${52 + i * 4}" width="236" height="1.4" fill="#000"/>`).join('')}</g>`,
      T(['VIDEO', 'POKER'], { font: 'Righteous', size: 56, colors: ['#ffffff', '#e1f5fe', '#4fc3f7'], stroke: '#00121f' })],
    paigow: () => [bg(['#1b5e20', '#0d3311', '#020a03']), `<g fill="none" stroke="#ffd54f" stroke-opacity=".22" stroke-width="2">${Array.from({ length: 5 }, (_, i) => `<rect x="${20 + i * 10}" y="${20 + i * 10}" width="${260 - i * 20}" height="${240 - i * 20}" rx="12"/>`).join('')}</g>`,
      ['A', 'A', 'K', 'K', '9'].map((r, i) => card(70 + i * 30, 132, 62, r, ['s', 'h', 'd', 'c', 's'][i], -12 + i * 6)).join(''), card(206, 210, 62, 'Q', 'h', 10), card(240, 214, 62, 'J', 'h', 18),
      T(['PAI GOW'], { font: 'Titan One', size: 60, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#020a03' })],
    threecard: () => [bg(['#283593', '#121858', '#04061f']), glow(150, 140, 140, '#8c9eff', 0.35),
      card(100, 156, 96, 'Q', 's', -18), card(150, 140, 96, 'K', 's', 0), card(200, 156, 96, 'A', 's', 18),
      T(['THREE CARD', 'POKER'], { font: 'Righteous', size: 44, colors: ['#ffffff', '#e8eaf6', '#8c9eff'], stroke: '#04061f' })],
    caribbean: () => [bg(['#ff7043', '#d84315', '#4a148c'], 0, 1), glow(150, 230, 90, '#ffeb3b', 0.9), `<circle cx="150" cy="240" r="46" fill="#ffd54f"/><rect y="240" width="300" height="160" fill="#0d47a1"/>${Array.from({ length: 6 }, (_, i) => `<path d="M${40 + i * 40} ${256 + i * 12} h${30 + i * 6}" stroke="#ffd54f" stroke-width="3" opacity=".5"/>`).join('')}`,
      (() => { const palm = (x, flip) => `<g transform="translate(${x} 0) scale(${flip} 1)" fill="#06210f"><path d="M0 400 C10 300 20 200 40 120 L48 122 C32 200 24 300 18 400z"/>${[[-60, 0], [-30, 30], [10, 40], [50, 10], [70, -20]].map(([dx, dy]) => `<path d="M44 120 C${44 + dx * 0.4} ${100 + dy * 0.2} ${44 + dx} ${110 + dy} ${44 + dx * 1.3} ${150 + dy}  C${44 + dx * 0.8} ${120 + dy} ${44 + dx * 0.3} ${118 + dy * 0.5} 44 124z"/>`).join('')}</g>`; return palm(-30, 1) + palm(330, -1); })(),
      card(118, 130, 82, 'A', 'h', -12), card(182, 126, 82, 'K', 'h', 12),
      T(['CARIBBEAN', 'STUD'], { font: 'Lilita One', size: 50, colors: ['#ffffff', '#fff3e0', '#ffab40'], stroke: '#2a0a00' })],
    holdem: () => [`<rect width="300" height="400" fill="#0b1016"/>`, (() => { const g = id('pt'); return `<defs>${rad(g, ['#1f8a4c', '#0a3d20'], 0.5, 0.45, 0.6)}</defs><ellipse cx="150" cy="170" rx="190" ry="140" fill="#3e2723"/><ellipse cx="150" cy="170" rx="174" ry="126" fill="url(#${g})"/>`; })(),
      card(116, 140, 96, 'A', 's', -12), card(184, 140, 96, 'A', 'h', 12), chipStack(64, 250, 6, 'black', 24), chipStack(236, 252, 4, 'red', 24),
      T(["HOLD'EM"], { font: 'Righteous', size: 62, colors: ['#ffffff', '#e8f5e9', '#69f0ae'], stroke: '#03140a' })],
    letitride: () => [felt('#2e7d32', '#0b2e10'), ['1', '2', '$'].map((t, i) => `<circle cx="${70 + i * 80}" cy="230" r="32" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/><text x="${70 + i * 80}" y="242" text-anchor="middle" font-family="Russo One" font-size="30" fill="#fff" opacity=".7">${t}</text>`).join(''),
      chip(70, 226, 22, 'red', 10, '5'), chip(150, 226, 22, 'red', -10, '5'), chip(230, 226, 22, 'red', 20, '5'),
      card(104, 118, 78, '10', 'd', -14), card(150, 108, 78, 'J', 'd', 0), card(196, 118, 78, 'Q', 'd', 14),
      T(['LET IT', 'RIDE'], { font: 'Titan One', size: 56, colors: ['#ffffff', '#fff3c4', '#ffc400'], stroke: '#061f10' })],
    casinoholdem: () => [bg(['#004d40', '#00251f', '#000a08']), glow(150, 120, 140, '#64ffda', 0.25),
      ['A', 'K', '7', 'Q', '2'].map((r, i) => card(54 + i * 48, 100, 44, r, ['h', 'h', 'c', 'h', 's'][i])).join(''), card(124, 196, 68, 'J', 'h', -8), card(176, 196, 68, '10', 'h', 8),
      T(['CASINO', "HOLD'EM"], { font: 'Righteous', size: 50, colors: ['#ffffff', '#e0f2f1', '#64ffda'], stroke: '#000a08' })],
    pokerdice: () => [bg(['#4a148c', '#23083f', '#0a0215']), glow(150, 160, 140, '#ea80fc', 0.3),
      die(70, 120, 56, 6, -14, 'black', 2, 3), die(150, 104, 56, 6, 4, 'black', 3, 2), die(230, 120, 56, 6, 14, 'black', 1, 5), die(108, 206, 56, 2, -6, 'black', 5, 4), die(192, 206, 56, 2, 10, 'black', 4, 1),
      T(['POKER', 'DICE'], { font: 'Bungee', size: 52, colors: ['#ffffff', '#f3e5f5', '#ea80fc'], stroke: '#0a0215' })],

    /* ===== Lottery & instant ===== */
    keno: () => [bg(['#7b1fa2', '#3c0a5a', '#12001f']), (() => { let s = '<g opacity=".25">'; for (let i = 0; i < 40; i++) s += `<rect x="${12 + (i % 8) * 35}" y="${24 + Math.floor(i / 8) * 35}" width="30" height="30" rx="6" fill="#fff"/>`; return s + '</g>'; })(),
      lottoBall(80, 130, 34, 7, '#ff1744'), lottoBall(160, 110, 40, 42, '#2979ff'), lottoBall(232, 150, 32, 19, '#ffc400'), lottoBall(120, 210, 30, 68, '#00c853'), lottoBall(206, 228, 28, 3, '#ff6d00'),
      T(['KENO'], { font: 'Luckiest Guy', size: 80, colors: ['#ffffff', '#f3e5f5', '#e040fb'], stroke: '#12001f' })],
    bingo: () => [bg(['#ff6f00', '#e65100', '#3e1400']), rays(150, 140, '#fff', 0.1),
      ['B', 'I', 'N', 'G', 'O'].map((l, i) => lottoBall(42 + i * 54, 120 + (i % 2) * 34, 28, l, ['#2979ff', '#ff1744', '#00c853', '#ffc400', '#d500f9'][i])).join(''),
      (() => { let s = '<g transform="translate(76 190) rotate(-6)">'; s += '<rect width="148" height="80" rx="8" fill="#fff8e1" stroke="#7a3d00" stroke-width="2"/>'; for (let i = 0; i < 15; i++) { const x = 8 + (i % 5) * 28, y = 8 + Math.floor(i / 5) * 24; s += `<rect x="${x}" y="${y}" width="24" height="20" rx="3" fill="${[2, 6, 7, 12].includes(i) ? '#ff1744' : '#ffe0b2'}"/><text x="${x + 12}" y="${y + 14}" text-anchor="middle" font-family="Russo One" font-size="9" fill="#3e1400">${[3, 18, 'F', 49, 62, 7, 21, 33, 55, 70, 11, 27, 44, 58, 66][i]}</text>`; } return shadow(s + '</g>', 5, 5, 0.5); })(),
      T(['BINGO'], { font: 'Luckiest Guy', size: 76, colors: ['#ffffff', '#fff8e1', '#ffd54f'], stroke: '#2a0e00' })],
    pick3: () => [bg(['#0277bd', '#01416b', '#001527']), glow(150, 140, 130, '#80d8ff', 0.35),
      (() => { const g = id('lm'); return `<defs>${rad(g, [['#ffffff', 0.35], ['#b3e5fc', 0.08]], 0.35, 0.3, 0.7)}</defs><circle cx="150" cy="110" r="84" fill="url(#${g})" stroke="#e1f5fe" stroke-opacity=".7" stroke-width="3"/><rect x="128" y="190" width="44" height="30" fill="#455a64"/><rect x="96" y="216" width="108" height="16" rx="6" fill="#263238"/>`; })(),
      lottoBall(118, 90, 18, 4, '#ffc400'), lottoBall(176, 120, 18, 9, '#ff1744'), lottoBall(140, 140, 18, 2, '#00c853'), lottoBall(186, 78, 16, 6, '#d500f9'),
      lottoBall(84, 262, 26, 7, '#ff1744'), lottoBall(150, 262, 26, 7, '#ff1744'), lottoBall(216, 262, 26, 7, '#ff1744'),
      T(['PICK 3'], { font: 'Luckiest Guy', size: 70, colors: ['#ffffff', '#e1f5fe', '#40c4ff'], stroke: '#001527', y: 350 })],

    /* ===== Slots ===== */
    slots: () => [bg(['#3a0a10', '#1c0408', '#070103']), (() => { const f = id('bk'), r = rng(21); return `<defs>${blurF(f, 5)}</defs><g filter="url(#${f})">${Array.from({ length: 24 }, () => { const c = ['#ffcf6b', '#ff8a3d', '#ffe7b0', '#e8384f'][(r() * 4) | 0]; return `<circle cx="${(r() * 300).toFixed(0)}" cy="${(r() * 230).toFixed(0)}" r="${(6 + r() * 22).toFixed(0)}" fill="${c}" opacity="${(0.15 + r() * 0.35).toFixed(2)}"/>`; }).join('')}</g>`; })(),
      (() => { const g = id('sm'), w = id('sw'); return shadow(`<defs>${lin(g, ['#f7f9fb', '#b9c2cc', '#6d7984', '#d9dfe5'])}${lin(w, ['#a8a294', '#fbf9f4', '#a8a294'])}</defs>
        <rect x="40" y="56" width="220" height="170" rx="24" fill="url(#${g})" stroke="#1a1d22" stroke-width="3"/><rect x="58" y="88" width="184" height="104" rx="10" fill="#1a1a1a"/>
        ${[0, 1, 2].map((i) => `<rect x="${64 + i * 59}" y="94" width="54" height="92" rx="6" fill="url(#${w})"/>`).join('')}<rect x="60" y="138" width="180" height="3" fill="#ff1744" opacity=".8"/>
        <rect x="262" y="96" width="10" height="70" rx="5" fill="#9e9e9e"/><circle cx="267" cy="90" r="12" fill="#ff1744" stroke="#7f0000" stroke-width="2"/>
        <text x="150" y="81" text-anchor="middle" font-family="Anton" font-size="18" letter-spacing="3" fill="#8f0613">JACKPOT</text>`, 8, 8, 0.6); })(),
      S('sevens', 'seven', 91, 140, 42), S('sevens', 'seven', 150, 140, 42), S('sevens', 'seven', 209, 140, 42),
      T(['SLOTS'], { font: 'Anton', size: 70, colors: ['#ffffff', '#e6ebf0', '#9aa6b2'], stroke: '#1a0d06' })],
    fruits: () => [bg(['#ffc46b', '#f58a3a', '#8a3410']), glow(150, 130, 150, '#fff3c4', 0.5),
      S('fruits', 'melon', 84, 190, 100, -12), S('fruits', 'grape', 214, 178, 92, 14), S('fruits', 'lemon', 222, 92, 72, -18), S('fruits', 'orange', 78, 96, 70, 10), S('fruits', 'cherry', 150, 132, 108, 0),
      T(['FRUIT', 'FRENZY'], { font: 'Lilita One', size: 60, colors: ['#ffffff', '#fff59d', '#ff9800'], stroke: '#4a1500' })],
    gems: () => [bg(['#5e35b1', '#311b92', '#0d0628']), glow(150, 140, 150, '#b388ff', 0.4), sparkles(16, 7, '#fff', [10, 10, 290, 280]),
      A('g-red', 86, 200, 90, -12), A('g-green', 214, 200, 90, 12), A('g-blue', 82, 100, 76, -18), A('g-orange', 222, 96, 76, 16), A('diamond', 150, 140, 140), A('crown', 150, 52, 70),
      T(['GEM RUSH'], { font: 'Titan One', size: 52, colors: ['#ffffff', '#f3e5f5', '#ce93d8'], stroke: '#0d0628' })],
    sevens: () => [bg(['#0a1a3f', '#071331', '#030716']), (() => { const f = id('bk'), r = rng(31); return `<defs>${blurF(f, 5)}</defs><g filter="url(#${f})">${Array.from({ length: 26 }, () => { const c = ['#6f8cff', '#ff4a5c', '#f4f1ea', '#9fb4ff'][(r() * 4) | 0]; return `<circle cx="${(r() * 300).toFixed(0)}" cy="${(r() * 220).toFixed(0)}" r="${(6 + r() * 22).toFixed(0)}" fill="${c}" opacity="${(0.15 + r() * 0.35).toFixed(2)}"/>`; }).join('')}</g>`; })(),
      S('sevens', 'seven', 84, 168, 84, -12), S('sevens', 'seven', 216, 168, 84, 12), S('sevens', 'seven', 150, 146, 110, 0),
      T(['LUCKY 7s'], { font: 'Anton', size: 58, colors: ['#ffffff', '#ffd9dd', '#e0122a'], stroke: '#0b1240' })],
    pharaoh: () => [bg(['#1a237e', '#ff8f00', '#ffcc80'], 0, 0.9), glow(150, 120, 120, '#fff3c4', 0.8), `<circle cx="150" cy="120" r="56" fill="#fff3c4" opacity=".9"/>`,
      `<path d="M-20 260 L80 120 L180 260z" fill="#c68a2e"/><path d="M80 120 L180 260 L120 260z" fill="#8a5a17"/><path d="M140 260 L230 140 L320 260z" fill="#d89b3a"/><path d="M230 140 L320 260 L270 260z" fill="#9c6516"/>`,
      `<rect y="250" width="300" height="150" fill="#e0a54a"/><path d="M0 250 C80 236 180 262 300 244 V260 H0z" fill="#c68a2e"/>`, S('pharaoh', 'wild', 150, 170, 150), S('pharaoh', 'ankh', 54, 214, 70, -10), S('pharaoh', 'scarab', 248, 216, 74, 10),
      T(["PHARAOH'S", 'FORTUNE'], { font: 'Cinzel Decorative', size: 42, colors: ['#fff8e1', '#ffd54f', '#b8860b'], stroke: '#2a1500' })],
    ocean: () => [bg(['#00b4d8', '#0077b6', '#023e8a', '#03045e']), rays(150, -60, '#fff', 0.09, 14, 560), bokeh(10, 31, ['#caf0f8'], 0.25),
      `<path d="M0 270 C60 250 120 280 180 262 C230 250 270 264 300 256 V400 H0z" fill="#e9c46a"/><path d="M0 286 C80 272 160 296 300 278 V400 H0z" fill="#d4a24c"/>`,
      S('ocean', 'chest', 150, 210, 140), S('ocean', 'octopus', 66, 120, 92, -10), S('ocean', 'starfish', 238, 240, 66, 18), S('ocean', 'shell', 46, 246, 56, -16), S('ocean', 'scatter', 236, 104, 80, 10),
      T(['DEEP SEA', 'TREASURE'], { font: 'Lilita One', size: 50, colors: ['#ffffff', '#e0f7fa', '#4dd0e1'], stroke: '#01243f' })],
    goldrush: () => [bg(['#ffb74d', '#d84315', '#3e1a07'], 0, 0.75), `<path d="M0 200 L60 120 L110 170 L170 90 L230 160 L300 110 V400 H0z" fill="#6d3b1a"/><path d="M0 240 L80 190 L150 230 L220 180 L300 220 V400 H0z" fill="#4e2a12"/>`,
      `<g stroke="#3e2410" stroke-width="5"><path d="M0 300 L300 270"/><path d="M0 330 L300 300"/></g><g stroke="#8d6e63" stroke-width="4">${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 36} ${302 - i * 3.3} l6 30"/>`).join('')}</g>`,
      S('goldrush', 'scatter', 150, 226, 150), S('goldrush', 'pickaxe', 58, 120, 86, -20), S('goldrush', 'lantern', 244, 128, 80, 8), S('goldrush', 'nugget', 236, 240, 56), sparkles(10, 41, '#fff8d0', [40, 120, 260, 280]),
      T(['GOLD RUSH'], { font: 'Rye', size: 46, colors: ['#fffde7', '#ffd54f', '#b8860b'], stroke: '#2a1205' })],
    dragon: () => [bg(['#d32f2f', '#8e0000', '#2a0000']), (() => { let s = '<g fill="none" stroke="#ffd54f" stroke-opacity=".28" stroke-width="2.5">'; for (let i = 0; i < 7; i++) s += `<path d="M${-20 + (i % 3) * 110} ${40 + i * 38} q20 -22 40 0 q20 -22 40 0"/>`; return s + '</g>'; })(),
      glow(150, 150, 110, '#ffab00', 0.6), S('dragon', 'wild', 150, 160, 170), S('dragon', 'lantern2', 46, 90, 70, -8), S('dragon', 'lantern2', 254, 90, 70, 8), S('dragon', 'coin', 62, 248, 56, -14), S('dragon', 'ingot', 240, 252, 62, 10),
      T(['DRAGON', 'PEARL'], { font: 'Cinzel Decorative', size: 46, colors: ['#fff8e1', '#ffd54f', '#b8860b'], stroke: '#2a0000' })],
    candy: () => [bg(['#ff80ab', '#f06292', '#ad1457']), `<g opacity=".3">${(() => { const r = rng(17); return Array.from({ length: 30 }, () => `<circle cx="${(r() * 300).toFixed(0)}" cy="${(r() * 300).toFixed(0)}" r="${(r() * 6 + 3).toFixed(1)}" fill="#fff"/>`).join(''); })()}</g>`, glow(150, 140, 130, '#fff', 0.35),
      S('candy', 'c-donut', 82, 206, 100, -14), S('candy', 'c-cupcake', 222, 200, 104, 10), S('candy', 'c-bear', 70, 104, 76, -16), S('candy', 'c-heart', 234, 98, 70, 16), S('candy', 'c-lolly', 150, 136, 140), S('candy', 'c-wrap', 150, 252, 70, -8),
      T(['CANDY POP'], { font: 'Luckiest Guy', size: 54, colors: ['#ffffff', '#fff59d', '#ffca28'], stroke: '#6a0036' })],
    neon: () => [`<rect width="300" height="400" fill="#120d18"/>`, `<g opacity=".4">${Array.from({ length: 20 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${c * 46 - (r % 2) * 23}" y="${r * 20}" width="44" height="18" fill="#2a1f2e"/>`).join('')).join('')}</g>`,
      glow(150, 150, 140, '#ff2d6f', 0.25), S('neon', 'n-seven', 150, 150, 160), S('neon', 'n-cherry', 64, 96, 84, -10), S('neon', 'n-diamond', 236, 98, 80, 10), S('neon', 'n-star', 62, 236, 70, -12), S('neon', 'n-bell', 238, 236, 72, 12),
      T(['NEON', 'NIGHTS'], { font: 'Monoton', size: 50, colors: ['#e0fbff', '#00e5ff'], neon: true })],
    clover: () => [bg(['#81c784', '#2e7d32', '#0b2a0b']), (() => { const cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa']; return cols.map((c, i) => `<path d="M${-30 + i * 12} 250 A${180 - i * 12} ${180 - i * 12} 0 0 1 ${330 - i * 12} 250" fill="none" stroke="${c}" stroke-width="12" opacity=".85"/>`).join(''); })(),
      clouds(13, '#ffffff', 0.95, 250), S('clover', 'pot', 150, 210, 140), S('clover', 'clover', 60, 110, 84, -14), S('clover', 'hat', 236, 112, 84, 12), S('clover', 'scatter', 254, 196, 54, 8), sparkles(12, 15, '#fff59d', [60, 130, 240, 220]),
      T(['LUCKY', 'CLOVER'], { font: 'Lilita One', size: 54, colors: ['#ffffff', '#f0f4c3', '#c6ff00'], stroke: '#0b2a0b' })],
    cosmic: () => [bg(['#311b92', '#1a0b3d', '#07031a']), stars(90, 23), glow(220, 90, 110, '#7c4dff', 0.45),
      S('cosmic', 'planet', 214, 96, 120, -12), S('cosmic', 'ufo', 84, 116, 100, -10), S('cosmic', 'astronaut', 150, 210, 130), S('cosmic', 'comet', 50, 226, 70), S('cosmic', 'scatter', 254, 204, 58),
      T(['COSMIC', 'CASH'], { font: 'Russo One', size: 54, colors: ['#ffffff', '#ede7f6', '#b388ff'], stroke: '#07031a' })],
  };

  /** Full cover SVG for a game id. */
  function svg(gameId) {
    const g = C.games.find((x) => x.id === gameId), recipe = R[gameId];
    if (!g || !recipe) return '';
    const parts = recipe(), t = parts.pop();
    const titleSvg = t && t.lines ? title(t.lines, t.o) : t || '';
    const clip = id('clip');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400"><defs><clipPath id="${clip}"><rect width="300" height="400" rx="14"/></clipPath></defs><g clip-path="url(#${clip})">${parts.join('')}${finish(g.cat).replace(/<text[^>]*>KRUSH[^<]*<\/text>/, '')}${titleSvg}${finish(g.cat).match(/<text[^>]*>KRUSH[^<]*<\/text>/)[0]}</g></svg>`;
  }
  /** Shrink any logo line wider than its box (needs the SVG to be in the document). */
  function fit(root) { root.querySelectorAll('text[data-fit]').forEach((t) => { const max = +t.dataset.fit, w = t.getComputedTextLength(); if (w > max) { t.setAttribute('textLength', max); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } }); }
  window.Covers = { svg, fit, ids: () => Object.keys(R), kit: { id, rng, lin, rad, shadowF, blurF, shadow, bg, glow, rays, stars, bokeh, sparkles, clouds, floorGrid, card, chip, chipStack, die, A, S, art, wheel, ball, lottoBall, coinArt, burst, fish, suitPath } };
})();
