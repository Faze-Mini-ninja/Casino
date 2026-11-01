/* Symbol artwork for the themed video slots. Registered as "<theme>-<symbol>" (e.g. "pharaoh-ankh"),
 * plus styled card royals (10 J Q K A) in each theme's typeface. */
(function () {
  'use strict';
  const C = window.Casino, { id, lg, rg, svg } = C.artKit;
  const stops = (gid, cols, x2 = 0, y2 = 1) => `<linearGradient id="${gid}" x1="0" y1="0" x2="${x2}" y2="${y2}">${cols.map((c, i) => `<stop offset="${i / (cols.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const GOLD = ['#fff6c8', '#ffd54f', '#c99a06', '#7a5200'];
  const drop = (fid) => `<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2.5" stdDeviation="1.6" flood-color="#000" flood-opacity=".55"/></filter>`;
  /** Label band across the bottom ("WILD", "BONUS"). */
  const band = (text, fill, font = 'Lilita One', ink = '#fff') => `<rect x="8" y="73" width="84" height="21" rx="6" fill="${fill}" stroke="#000" stroke-opacity=".55" stroke-width="2.5"/>
    <rect x="11" y="75" width="78" height="7" rx="3" fill="#fff" opacity=".22"/>
    <text x="50" y="89.5" text-anchor="middle" font-family="${font}, Impact, sans-serif" font-size="16" fill="${ink}" stroke="#000" stroke-width="3" paint-order="stroke" letter-spacing="1">${text}</text>`;
  const sym = (inner, defs = '') => { const f = id(); return svg(`<defs>${drop(f)}${defs}</defs><g filter="url(#${f})">${inner}</g>`); };

  /* ---------- card royals ---------- */
  const ROYAL_COL = { T: ['#bbdefb', '#1e88e5', '#0d47a1'], J: ['#c8e6c9', '#43a047', '#1b5e20'], Q: ['#e1bee7', '#8e24aa', '#4a148c'], K: ['#ffcdd2', '#e53935', '#8e0000'], A: ['#ffe0b2', '#fb8c00', '#bf360c'] };
  const ROYAL_STYLE = {
    pharaoh: { font: 'Cinzel Decorative', size: 58, stroke: '#2b1a00', gold: true },
    ocean: { font: 'Lilita One', size: 66, stroke: '#04263a' },
    goldrush: { font: 'Rye', size: 56, stroke: '#2a1505' },
    dragon: { font: 'Cinzel Decorative', size: 58, stroke: '#3b0000' },
    clover: { font: 'Lilita One', size: 66, stroke: '#0b2a0b' },
    cosmic: { font: 'Russo One', size: 60, stroke: '#0a0630' },
  };
  function royal(theme, L) {
    const st = ROYAL_STYLE[theme] || ROYAL_STYLE.ocean, g = id(), f = id(), c = ROYAL_COL[L];
    const txt = L === 'T' ? '10' : L, size = L === 'T' ? st.size * 0.82 : st.size;
    const fill = st.gold ? stops(g, [c[0], c[1], c[2]]) : stops(g, [c[0], c[1], c[2]]);
    const rim = st.gold ? `<text x="50" y="${50 + size * 0.36}" text-anchor="middle" font-family="${st.font}, Georgia, serif" font-size="${size}" font-weight="900" fill="none" stroke="#ffd54f" stroke-width="2" letter-spacing="${L === 'T' ? -3 : 0}">${txt}</text>` : '';
    return svg(`<defs>${fill}${drop(f)}</defs><g filter="url(#${f})">
      <text x="50" y="${50 + size * 0.36}" text-anchor="middle" font-family="${st.font}, Georgia, serif" font-size="${size}" font-weight="900" fill="url(#${g})" stroke="${st.stroke}" stroke-width="7" paint-order="stroke" stroke-linejoin="round" letter-spacing="${L === 'T' ? -3 : 0}">${txt}</text>${rim}</g>`);
  }

  /* ---------- shared shapes ---------- */
  function horseshoe(c) {
    const a = id();
    return sym(`<defs>${stops(a, c, 1, 1)}</defs><path d="M30 18 C12 46 20 86 50 86 C80 86 88 46 70 18" fill="none" stroke="url(#${a})" stroke-width="17" stroke-linecap="butt"/>
      <path d="M30 18 C12 46 20 86 50 86 C80 86 88 46 70 18" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2" transform="translate(0 7)"/>
      <rect x="19" y="10" width="20" height="12" rx="3" fill="url(#${a})" transform="rotate(-18 29 16)"/><rect x="61" y="10" width="20" height="12" rx="3" fill="url(#${a})" transform="rotate(18 71 16)"/>
      ${[[23, 40], [22, 58], [30, 74], [77, 40], [78, 58], [70, 74]].map(([x, y]) => `<rect x="${x - 2.5}" y="${y - 3.5}" width="5" height="7" rx="1.5" fill="#1b1b1b" opacity=".7"/>`).join('')}
      <path d="M26 36 C22 52 26 70 38 78" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>`);
  }
  const star5 = (cx, cy, R, r, rot = -90) => Array.from({ length: 10 }, (_, i) => { const a = ((rot + i * 36) * Math.PI) / 180, rr = i % 2 ? r : R; return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`; }).join(' ');
  const coinStack = (x, y, n, w = 22) => Array.from({ length: n }, (_, i) => { const g = id(); return `<defs>${stops(g, GOLD, 1, 0)}</defs><ellipse cx="${x}" cy="${y - i * 5}" rx="${w / 2}" ry="${w / 5}" fill="url(#${g})" stroke="#7a5200" stroke-width="1.2"/>`; }).join('');

  const ART = {
    /* ===== Pharaoh's Fortune ===== */
    'pharaoh-ankh'() { const a = id(); return sym(`<defs>${stops(a, GOLD, 1, 1)}</defs>
      <ellipse cx="50" cy="27" rx="15" ry="19" fill="none" stroke="url(#${a})" stroke-width="10"/>
      <rect x="16" y="44" width="68" height="12" rx="3" fill="url(#${a})" stroke="#5d3a00" stroke-width="1.5"/>
      <path d="M44 54 L56 54 L62 94 L38 94z" fill="url(#${a})" stroke="#5d3a00" stroke-width="1.5"/>
      <ellipse cx="50" cy="27" rx="15" ry="19" fill="none" stroke="#5d3a00" stroke-width="1.2"/><circle cx="50" cy="50" r="4" fill="#1565c0" stroke="#5d3a00"/>`); },
    'pharaoh-eye'() { const a = id(), b = id(); return sym(`<defs>${stops(a, GOLD, 1, 1)}${rg(b, '#64b5f6', '#0d47a1')}</defs>
      <circle cx="50" cy="50" r="44" fill="url(#${b})" stroke="url(#${a})" stroke-width="6"/>
      <path d="M16 46 Q50 20 84 46 Q50 66 16 46z" fill="#fff8e1" stroke="#0b1a4a" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="50" cy="45" r="11" fill="#0b1a4a"/><circle cx="46" cy="41" r="3" fill="#fff"/>
      <path d="M16 31 Q50 10 86 29" fill="none" stroke="#0b1a4a" stroke-width="6" stroke-linecap="round"/>
      <path d="M42 58 L37 84" stroke="#0b1a4a" stroke-width="5" stroke-linecap="round"/>
      <path d="M58 57 C66 70 82 64 82 76 C82 84 72 86 70 80" fill="none" stroke="#0b1a4a" stroke-width="5" stroke-linecap="round"/>`); },
    'pharaoh-scarab'() { const a = id(), b = id(), c = id(); return sym(`<defs>${rg(a, '#80cbc4', '#004d40')}${stops(b, GOLD, 1, 1)}${rg(c, '#ffab91', '#bf360c')}</defs>
      <circle cx="50" cy="15" r="11" fill="url(#${c})" stroke="#7a2400" stroke-width="1.5"/>
      <path d="M33 48 C14 36 4 54 10 74 C20 72 28 64 34 60z" fill="url(#${b})" stroke="#5d3a00" stroke-width="1.5"/>
      <path d="M67 48 C86 36 96 54 90 74 C80 72 72 64 66 60z" fill="url(#${b})" stroke="#5d3a00" stroke-width="1.5"/>
      <path d="M32 64 L18 80 M34 72 L24 90 M68 64 L82 80 M66 72 L76 90" stroke="#3e2723" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse cx="50" cy="60" rx="19" ry="27" fill="url(#${a})" stroke="#00251a" stroke-width="2"/>
      <path d="M50 36 L50 86" stroke="#00251a" stroke-width="2"/><path d="M33 44 Q50 50 67 44" fill="none" stroke="#00251a" stroke-width="2"/>
      <path d="M40 30 Q50 22 60 30 L58 36 L42 36z" fill="url(#${a})" stroke="#00251a" stroke-width="2"/>
      <ellipse cx="42" cy="54" rx="5" ry="9" fill="#fff" opacity=".3"/>`); },
    'pharaoh-cat'() { const a = id(), b = id(); return sym(`<defs>${stops(a, ['#455a64', '#1c262b', '#0b1013'])}${stops(b, GOLD, 1, 0)}</defs>
      <path d="M66 88 C86 88 92 72 84 62" fill="none" stroke="#1c262b" stroke-width="7" stroke-linecap="round"/>
      <path d="M36 44 C24 60 26 86 32 92 L68 92 C74 86 76 60 64 44z" fill="url(#${a})"/>
      <path d="M34 26 L36 4 L48 16z M66 26 L64 4 L52 16z" fill="url(#${a})"/>
      <circle cx="50" cy="30" r="17" fill="url(#${a})"/>
      <path d="M40 28 Q44 24 47 29 Q43 31 40 28z M60 28 Q56 24 53 29 Q57 31 60 28z" fill="#76ff03"/>
      <path d="M48 36 L52 36 L50 39z" fill="#ff8a80"/>
      <ellipse cx="50" cy="47" rx="15" ry="4.5" fill="url(#${b})" stroke="#5d3a00" stroke-width="1"/><circle cx="50" cy="54" r="5" fill="url(#${b})" stroke="#5d3a00"/>
      <circle cx="50" cy="54" r="2" fill="#1565c0"/><circle cx="64" cy="10" r="1.8" fill="#ffd54f"/>`); },
    'pharaoh-wild'() { const a = id(), b = id(); return sym(`<defs>${stops(a, GOLD, 1, 1)}${stops(b, ['#1e40af', '#0b1f63'])}</defs>
      <path d="M20 40 C20 12 80 12 80 40 L88 78 L12 78z" fill="url(#${b})" stroke="#0b1020" stroke-width="2"/>
      ${[18, 26, 34, 42, 50, 58, 66].map((y, i) => `<path d="M${15 + i * 0.4} ${y + 12} L${85 - i * 0.4} ${y + 12}" stroke="url(#${a})" stroke-width="3.5" opacity=".95"/>`).join('')}
      <path d="M34 30 C34 18 66 18 66 30 L66 52 C66 64 58 70 50 70 C42 70 34 64 34 52z" fill="url(#${a})" stroke="#5d3a00" stroke-width="1.5"/>
      <path d="M38 38 Q43 33 48 38 Q43 41 38 38z M62 38 Q57 33 52 38 Q57 41 62 38z" fill="#0b1020"/>
      <path d="M36 38 L48 38 M52 38 L64 38" stroke="#0b1020" stroke-width="1.5"/>
      <path d="M47 46 L50 54 L53 46" fill="none" stroke="#7a5200" stroke-width="1.5"/><path d="M44 60 Q50 63 56 60" stroke="#7a5200" stroke-width="2" fill="none"/>
      <path d="M46 16 C46 10 54 10 54 16 L52 22 L48 22z" fill="url(#${a})" stroke="#5d3a00"/>
      ${band('WILD', '#1e40af', 'Cinzel Decorative')}`); },
    'pharaoh-scatter'() { const a = id(), b = id(), c = id(); return sym(`<defs>${stops(a, ['#ffe082', '#e0a526'], 1, 0)}${stops(b, ['#b7791f', '#7c4a03'])}${rg(c, '#fff3b0', '#ff9800')}</defs>
      ${Array.from({ length: 12 }, (_, i) => `<path d="M50 34 L${50 + Math.cos(i * Math.PI / 6) * 48} ${34 + Math.sin(i * Math.PI / 6) * 48} L${50 + Math.cos(i * Math.PI / 6 + 0.13) * 48} ${34 + Math.sin(i * Math.PI / 6 + 0.13) * 48}z" fill="#ffd54f" opacity=".35"/>`).join('')}
      <circle cx="50" cy="26" r="14" fill="url(#${c})"/>
      <path d="M50 22 L88 74 L50 74z" fill="url(#${b})"/><path d="M50 22 L12 74 L50 74z" fill="url(#${a})"/>
      <path d="M50 22 L12 74 L88 74z" fill="none" stroke="#5d3a00" stroke-width="2" stroke-linejoin="round"/>
      <path d="M31 48 L69 48 M23 60 L77 60" stroke="#5d3a00" stroke-opacity=".35" stroke-width="1.5"/>
      ${band('BONUS', '#c62828', 'Cinzel Decorative')}`); },

    /* ===== Deep Sea Treasure ===== */
    'ocean-starfish'() { const a = id(); return sym(`<defs>${rg(a, '#ffcc80', '#e64a19')}</defs>
      <polygon points="${star5(50, 52, 46, 20)}" fill="url(#${a})" stroke="#e64a19" stroke-width="9" stroke-linejoin="round"/>
      <polygon points="${star5(50, 52, 46, 20)}" fill="url(#${a})" stroke="#8a2a00" stroke-width="2" stroke-linejoin="round"/>
      ${[[50, 30], [50, 42], [70, 46], [62, 54], [30, 46], [38, 54], [38, 70], [62, 70], [44, 62], [56, 62]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff3e0" opacity=".85"/>`).join('')}`); },
    'ocean-octopus'() { const a = id(); return sym(`<defs>${rg(a, '#f48fb1', '#7b1fa2')}</defs>
      ${[[22, -1], [34, -1], [46, -1], [54, 1], [66, 1], [78, 1]].map(([x, d]) => `<path d="M${x} 56 C${x + d * 6} 72 ${x - d * 14} 78 ${x - d * 4} 92" fill="none" stroke="#8e24aa" stroke-width="9" stroke-linecap="round"/>`).join('')}
      <path d="M18 58 C14 26 30 8 50 8 C70 8 86 26 82 58 C70 66 30 66 18 58z" fill="url(#${a})" stroke="#4a148c" stroke-width="2"/>
      <ellipse cx="38" cy="42" rx="9" ry="10" fill="#fff"/><ellipse cx="62" cy="42" rx="9" ry="10" fill="#fff"/>
      <circle cx="40" cy="44" r="5" fill="#1a1a2e"/><circle cx="60" cy="44" r="5" fill="#1a1a2e"/><circle cx="38" cy="42" r="1.6" fill="#fff"/><circle cx="58" cy="42" r="1.6" fill="#fff"/>
      <ellipse cx="38" cy="22" rx="10" ry="5" fill="#fff" opacity=".35" transform="rotate(-25 38 22)"/>`); },
    'ocean-shell'() { const a = id(); return sym(`<defs>${rg(a, '#ffe0d6', '#ff7a59')}</defs>
      <path d="M50 86 L14 42 C18 14 82 14 86 42z" fill="url(#${a})" stroke="#a63a1e" stroke-width="2.5" stroke-linejoin="round"/>
      ${[-36, -24, -12, 0, 12, 24, 36].map((d) => `<path d="M50 84 L${50 + d * 0.95} ${22 + Math.abs(d) * 0.45}" stroke="#a63a1e" stroke-opacity=".55" stroke-width="2.4"/>`).join('')}
      <path d="M36 84 L64 84 L60 94 L40 94z" fill="url(#${a})" stroke="#a63a1e" stroke-width="2"/>
      <path d="M26 34 C34 22 48 20 60 22" stroke="#fff" stroke-opacity=".6" stroke-width="3" fill="none" stroke-linecap="round"/>`); },
    'ocean-chest'() { const a = id(), b = id(), c = id(); return sym(`<defs>${stops(a, ['#a1662f', '#5d3412'])}${stops(b, GOLD, 1, 1)}${rg(c, '#fff8c4', 'rgba(255,214,79,0)')}</defs>
      <circle cx="50" cy="40" r="40" fill="url(#${c})"/>
      ${coinStack(30, 44, 3)}${coinStack(50, 40, 4)}${coinStack(70, 44, 3)}
      <path d="M14 52 L86 52 L82 92 L18 92z" fill="url(#${a})" stroke="#2d1806" stroke-width="2"/>
      <path d="M14 52 C14 30 86 30 86 52" fill="none" stroke="url(#${a})" stroke-width="0"/>
      <rect x="12" y="50" width="76" height="9" rx="2" fill="url(#${b})" stroke="#5d3a00"/>
      <rect x="26" y="52" width="7" height="40" fill="url(#${b})" opacity=".9"/><rect x="67" y="52" width="7" height="40" fill="url(#${b})" opacity=".9"/>
      <rect x="42" y="58" width="16" height="16" rx="3" fill="url(#${b})" stroke="#5d3a00"/><circle cx="50" cy="65" r="2.5" fill="#2d1806"/><rect x="49" y="66" width="2" height="5" fill="#2d1806"/>`); },
    'ocean-wild'() { const a = id(), b = id(); return sym(`<defs>${rg(b, '#4dd0e1', '#01579b')}${stops(a, GOLD, 1, 1)}</defs>
      <circle cx="50" cy="44" r="40" fill="url(#${b})" stroke="#80deea" stroke-width="2"/>
      ${[[24, 24, 4], [76, 30, 3], [70, 62, 2.5], [28, 60, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#e0f7fa" stroke-width="1.2" opacity=".7"/>`).join('')}
      <rect x="47" y="34" width="6" height="44" fill="url(#${a})" stroke="#5d3a00" stroke-width="1"/>
      <path d="M30 14 L30 32 C30 40 70 40 70 32 L70 14 L64 22 L64 30 C60 34 40 34 36 30 L36 22z" fill="url(#${a})" stroke="#5d3a00" stroke-width="1.2"/>
      <path d="M47 8 L50 2 L53 8 L53 34 L47 34z" fill="url(#${a})" stroke="#5d3a00" stroke-width="1.2"/>
      ${band('WILD', '#00838f')}`); },
    'ocean-scatter'() { const a = id(), b = id(), c = id(); return sym(`<defs>${rg(a, '#ffffff', '#c7b8ff')}${stops(b, ['#ffb199', '#d1495b'])}${rg(c, 'rgba(255,255,255,.9)', 'rgba(255,255,255,0)')}</defs>
      <path d="M12 48 C14 20 86 20 88 48z" fill="url(#${b})" stroke="#7a1f2b" stroke-width="2"/>
      <path d="M12 52 C20 76 80 76 88 52z" fill="url(#${b})" stroke="#7a1f2b" stroke-width="2"/>
      <circle cx="50" cy="50" r="30" fill="url(#${c})"/><circle cx="50" cy="50" r="15" fill="url(#${a})" stroke="#9e8cff" stroke-width="1"/>
      <circle cx="45" cy="45" r="4" fill="#fff"/>
      ${band('BONUS', '#d1495b')}`); },

    /* ===== Gold Rush ===== */
    'goldrush-horseshoe'() { return horseshoe(['#eceff1', '#90a4ae', '#455a64']); },
    'goldrush-lantern'() { const a = id(), b = id(); return sym(`<defs>${stops(a, ['#6d7b84', '#2b3238'], 1, 0)}${rg(b, '#fff9c4', '#ff8f00')}</defs>
      <circle cx="50" cy="58" r="34" fill="#ffb300" opacity=".18"/>
      <path d="M38 14 C38 2 62 2 62 14" fill="none" stroke="#37474f" stroke-width="4"/>
      <path d="M34 14 L66 14 L72 26 L28 26z" fill="url(#${a})" stroke="#1c2226" stroke-width="1.5"/>
      <path d="M30 26 L70 26 C80 46 80 66 70 80 L30 80 C20 66 20 46 30 26z" fill="url(#${b})" stroke="#1c2226" stroke-width="2" opacity=".95"/>
      <path d="M50 42 C56 50 58 60 50 66 C42 60 44 50 50 42z" fill="#fff" opacity=".9"/>
      <path d="M38 26 L36 80 M62 26 L64 80 M50 26 L50 38" stroke="#1c2226" stroke-width="3"/>
      <path d="M26 80 L74 80 L70 92 L30 92z" fill="url(#${a})" stroke="#1c2226" stroke-width="1.5"/>`); },
    'goldrush-pickaxe'() { const a = id(), b = id(); return sym(`<defs>${stops(a, ['#c48a4a', '#7a4a1c'], 1, 0)}${stops(b, ['#eceff1', '#78909c', '#37474f'])}</defs>
      <rect x="45" y="14" width="10" height="82" rx="4" fill="url(#${a})" stroke="#3e2410" stroke-width="1.5" transform="rotate(35 50 55)"/>
      <path d="M8 34 C30 12 66 8 92 24 C70 20 46 22 28 40 z" fill="url(#${b})" stroke="#263238" stroke-width="2" transform="rotate(35 50 55) translate(0 -6)"/>
      <rect x="42" y="18" width="16" height="14" rx="2" fill="#455a64" stroke="#263238" transform="rotate(35 50 55)"/>`); },
    'goldrush-nugget'() { const a = id(); return sym(`<defs>${rg(a, '#fff59d', '#c99a06')}</defs>
      <path d="M18 60 C10 44 22 26 38 28 C44 16 64 14 72 26 C88 26 94 46 84 58 C90 72 72 86 58 80 C46 90 26 84 24 72 C16 70 14 64 18 60z" fill="url(#${a})" stroke="#7a5200" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M34 40 L44 36 L48 46 L38 50z M58 32 L68 36 L64 44z M60 58 L72 54 L70 66z M34 62 L44 64 L40 72z" fill="#fff" opacity=".45"/>
      <path d="M40 30 C48 26 56 26 62 30" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/>`); },
    'goldrush-wild'() { const a = id(); const pts = Array.from({ length: 12 }, (_, i) => { const ang = (i * 30 - 90) * Math.PI / 180, r = i % 2 ? 22 : 40; return `${50 + Math.cos(ang) * r},${40 + Math.sin(ang) * r}`; }).join(' ');
      return sym(`<defs>${stops(a, GOLD, 1, 1)}</defs><polygon points="${pts}" fill="url(#${a})" stroke="#5d3a00" stroke-width="2" stroke-linejoin="round"/>
      ${Array.from({ length: 6 }, (_, i) => { const ang = (i * 60 - 90) * Math.PI / 180; return `<circle cx="${50 + Math.cos(ang) * 40}" cy="${40 + Math.sin(ang) * 40}" r="5" fill="url(#${a})" stroke="#5d3a00" stroke-width="1.5"/>`; }).join('')}
      <circle cx="50" cy="40" r="16" fill="none" stroke="#7a5200" stroke-width="2"/><polygon points="${star5(50, 40, 10, 4)}" fill="#7a5200"/>
      ${band('WILD', '#6d3b12', 'Rye')}`); },
    'goldrush-scatter'() { const a = id(), b = id(); return sym(`<defs>${stops(a, ['#6d7b84', '#2b3238'])}${rg(b, '#fff59d', '#c99a06')}</defs>
      ${[[30, 34, 12], [48, 28, 14], [66, 34, 12], [40, 40, 10], [58, 40, 11]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${b})" stroke="#7a5200" stroke-width="1.5"/>`).join('')}
      <path d="M14 42 L86 42 L78 70 L22 70z" fill="url(#${a})" stroke="#11171a" stroke-width="2"/>
      ${[22, 36, 50, 64, 78].map((x) => `<circle cx="${x}" cy="47" r="1.8" fill="#b0bec5"/>`).join('')}
      <circle cx="32" cy="72" r="7" fill="#263238" stroke="#90a4ae" stroke-width="2.5"/><circle cx="68" cy="72" r="7" fill="#263238" stroke="#90a4ae" stroke-width="2.5"/>
      ${band('BONUS', '#b71c1c', 'Rye')}`); },

    /* ===== Dragon Pearl ===== */
    'dragon-fan'() { const a = id(); return sym(`<defs>${stops(a, ['#ff5252', '#b71c1c'])}</defs>
      <path d="M50 84 L8 46 C20 14 80 14 92 46z" fill="url(#${a})" stroke="#4a0000" stroke-width="2.5" stroke-linejoin="round"/>
      ${[-40, -27, -14, 0, 14, 27, 40].map((d) => `<path d="M50 84 L${50 + d} ${24 + Math.abs(d) * 0.55}" stroke="#ffd54f" stroke-width="2"/>`).join('')}
      <path d="M18 40 C34 22 66 22 82 40" fill="none" stroke="#ffd54f" stroke-width="3"/>
      <circle cx="50" cy="84" r="6" fill="#ffd54f" stroke="#7a5200" stroke-width="1.5"/>
      <path d="M50 90 C46 96 40 94 38 98" stroke="#ffd54f" stroke-width="2" fill="none"/>`); },
    'dragon-coin'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#fff59d', '#c99a06')}${stops(b, GOLD, 1, 1)}</defs>
      <circle cx="50" cy="50" r="42" fill="url(#${a})" stroke="#7a5200" stroke-width="3"/><circle cx="50" cy="50" r="34" fill="none" stroke="#7a5200" stroke-width="2" opacity=".6"/>
      <rect x="40" y="40" width="20" height="20" fill="#5a1010" stroke="#7a5200" stroke-width="2.5"/>
      ${[[50, 24], [50, 76], [24, 50], [76, 50]].map(([x, y]) => `<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="2" fill="none" stroke="#7a5200" stroke-width="2.5" transform="rotate(45 ${x} ${y})"/>`).join('')}
      <ellipse cx="36" cy="30" rx="10" ry="5" fill="#fff" opacity=".45" transform="rotate(-30 36 30)"/>`); },
    'dragon-lantern2'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#ff8a80', '#b71c1c')}${stops(b, GOLD, 1, 0)}</defs>
      <circle cx="50" cy="50" r="40" fill="#ff5252" opacity=".18"/>
      <rect x="48" y="2" width="4" height="12" fill="#7a5200"/><rect x="34" y="12" width="32" height="9" rx="3" fill="url(#${b})" stroke="#5d3a00"/>
      <ellipse cx="50" cy="50" rx="36" ry="30" fill="url(#${a})" stroke="#4a0000" stroke-width="2"/>
      ${[-24, -12, 0, 12, 24].map((d) => `<path d="M${50 + d} 21 C${50 + d * 1.7} 40 ${50 + d * 1.7} 60 ${50 + d} 79" fill="none" stroke="#4a0000" stroke-opacity=".45" stroke-width="2"/>`).join('')}
      <rect x="34" y="78" width="32" height="9" rx="3" fill="url(#${b})" stroke="#5d3a00"/>
      <path d="M44 87 L44 98 M50 87 L50 99 M56 87 L56 98" stroke="#ffd54f" stroke-width="2"/>`); },
    'dragon-koi'() { const a = id(); return sym(`<defs>${stops(a, ['#ffb74d', '#e65100'], 1, 0)}</defs>
      <path d="M82 70 C92 78 96 90 88 94 C84 86 78 82 72 80z M82 70 C94 66 98 54 92 48 C88 58 80 62 74 64z" fill="#ff7043" stroke="#8a2a00" stroke-width="1.5"/>
      <path d="M12 36 C22 18 52 18 66 40 C74 52 80 62 82 70 C70 74 56 70 46 62 C30 56 10 52 12 36z" fill="url(#${a})" stroke="#8a2a00" stroke-width="2"/>
      <path d="M30 26 C38 30 40 40 34 48 M50 34 C54 42 52 52 46 58" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
      <path d="M40 54 C40 64 34 72 26 74 C30 66 32 60 34 54z M48 24 C52 14 60 12 66 14 C60 18 56 24 54 30z" fill="#ff8a65" stroke="#8a2a00" stroke-width="1.2"/>
      <circle cx="20" cy="34" r="3.5" fill="#1a1a1a"/><circle cx="19" cy="33" r="1" fill="#fff"/>
      <path d="M12 40 C8 44 6 48 8 52" stroke="#8a2a00" stroke-width="1.5" fill="none"/>`); },
    'dragon-ingot'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#fff59d', '#c99a06')}${stops(b, ['#ffe082', '#b8860b'])}</defs>
      <ellipse cx="50" cy="48" rx="20" ry="18" fill="url(#${a})" stroke="#7a5200" stroke-width="2"/>
      <path d="M6 50 C10 40 24 44 30 54 L70 54 C76 44 90 40 94 50 C92 72 76 84 50 84 C24 84 8 72 6 50z" fill="url(#${b})" stroke="#7a5200" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M16 58 C26 72 74 72 84 58" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
      <ellipse cx="44" cy="40" rx="6" ry="4" fill="#fff" opacity=".55"/>`); },
    'dragon-wild'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#ffffff', '#ffd180')}${stops(b, ['#ffea00', '#ff3d00'])}</defs>
      ${Array.from({ length: 8 }, (_, i) => { const r = i * 45; return `<path d="M50 40 C${56} ${18} ${70} ${12} ${78} ${16} C${68} ${22} ${64} ${30} ${62} 40z" fill="url(#${b})" opacity=".9" transform="rotate(${r} 50 40)"/>`; }).join('')}
      <circle cx="50" cy="40" r="20" fill="url(#${a})" stroke="#ff6d00" stroke-width="2.5"/>
      <circle cx="44" cy="34" r="6" fill="#fff"/>
      ${band('WILD', '#b71c1c', 'Cinzel Decorative', '#ffd54f')}`); },
    'dragon-scatter'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#ffe0a3', '#a0611a')}${stops(b, ['#c62828', '#6d0000'])}</defs>
      <path d="M12 12 L88 12 L88 20 L80 20 L80 72 L74 72 L74 20 L26 20 L26 72 L20 72 L20 20 L12 20z" fill="url(#${b})" stroke="#2b0000" stroke-width="1.5"/>
      <path d="M40 20 L40 26 M60 20 L60 26" stroke="#ffd54f" stroke-width="2"/>
      <circle cx="50" cy="46" r="21" fill="url(#${a})" stroke="#5d3a00" stroke-width="2.5"/>
      <circle cx="50" cy="46" r="13" fill="none" stroke="#5d3a00" stroke-opacity=".5" stroke-width="2"/><circle cx="50" cy="46" r="5" fill="#5d3a00" opacity=".6"/>
      ${band('BONUS', '#c62828', 'Cinzel Decorative', '#ffd54f')}`); },

    /* ===== Candy Pop ===== */
    'candy-c-wrap'() { const a = id(); return sym(`<defs>${rg(a, '#b3e5fc', '#0277bd')}</defs>
      <path d="M26 50 L6 30 L10 50 L6 70z M74 50 L94 30 L90 50 L94 70z" fill="#4fc3f7" stroke="#01579b" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="50" cy="50" rx="27" ry="22" fill="url(#${a})" stroke="#01579b" stroke-width="2"/>
      <path d="M30 40 C40 54 60 54 70 40 M30 58 C40 46 60 46 70 58" fill="none" stroke="#fff" stroke-width="3.5" opacity=".75"/>
      <ellipse cx="40" cy="38" rx="8" ry="4" fill="#fff" opacity=".6"/>`); },
    'candy-c-drop'() { const a = id(); return sym(`<defs>${rg(a, '#ccff90', '#2e7d32')}</defs>
      <path d="M16 82 C14 40 30 16 50 16 C70 16 86 40 84 82z" fill="url(#${a})" stroke="#1b5e20" stroke-width="2.5"/>
      ${[[32, 40], [44, 30], [60, 34], [70, 50], [28, 60], [50, 48], [40, 70], [62, 66], [74, 74]].map(([x, y]) => `<rect x="${x}" y="${y}" width="3.5" height="3.5" fill="#fff" opacity=".85" transform="rotate(30 ${x} ${y})"/>`).join('')}
      <ellipse cx="38" cy="30" rx="8" ry="5" fill="#fff" opacity=".45" transform="rotate(-35 38 30)"/>`); },
    'candy-c-heart'() { const a = id(); return sym(`<defs>${rg(a, '#ffd1e8', '#e91e63')}</defs>
      <path d="M50 88 C18 66 8 50 8 32 C8 18 20 8 32 8 C40 8 46 12 50 20 C54 12 60 8 68 8 C80 8 92 18 92 32 C92 50 82 66 50 88z" fill="url(#${a})" stroke="#880e4f" stroke-width="2.5"/>
      <path d="M22 26 C24 18 32 16 38 18" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75"/>`); },
    'candy-c-bear'() { const a = id(); return sym(`<defs>${rg(a, '#ff8a80', '#c62828')}</defs><g fill="url(#${a})" stroke="#7f0000" stroke-width="2" opacity=".95">
      <circle cx="34" cy="16" r="8"/><circle cx="66" cy="16" r="8"/><circle cx="50" cy="30" r="20"/>
      <ellipse cx="50" cy="66" rx="22" ry="26"/><circle cx="26" cy="54" r="9"/><circle cx="74" cy="54" r="9"/><circle cx="32" cy="88" r="10"/><circle cx="68" cy="88" r="10"/></g>
      <circle cx="43" cy="28" r="2.5" fill="#4a0000"/><circle cx="57" cy="28" r="2.5" fill="#4a0000"/><ellipse cx="50" cy="36" rx="5" ry="3.5" fill="#7f0000" opacity=".6"/>
      <ellipse cx="42" cy="56" rx="7" ry="11" fill="#fff" opacity=".3"/>`); },
    'candy-c-lolly'() { const a = id(); const sp = Array.from({ length: 60 }, (_, i) => { const t = i / 8, r = 2 + i * 0.52; return `${(50 + Math.cos(t) * r).toFixed(1)},${(38 + Math.sin(t) * r).toFixed(1)}`; }).join(' ');
      return sym(`<defs>${rg(a, '#fff', '#f8bbd0')}</defs><rect x="47" y="60" width="6" height="36" rx="3" fill="#f5f5f5" stroke="#9e9e9e"/>
      <circle cx="50" cy="38" r="33" fill="url(#${a})" stroke="#ad1457" stroke-width="2.5"/>
      <polyline points="${sp}" fill="none" stroke="#e91e63" stroke-width="6" stroke-linecap="round"/><polyline points="${sp}" fill="none" stroke="#7c4dff" stroke-width="2.5" stroke-linecap="round" transform="rotate(20 50 38)" opacity=".8"/>
      <ellipse cx="36" cy="22" rx="9" ry="5" fill="#fff" opacity=".6" transform="rotate(-30 36 22)"/>`); },
    'candy-c-donut'() { const a = id(), b = id(); const sp = [[30, 30, '#ffeb3b', 20], [62, 24, '#4fc3f7', -30], [74, 48, '#fff', 60], [26, 56, '#69f0ae', -10], [44, 76, '#ffeb3b', 45], [68, 70, '#e040fb', 15], [50, 22, '#69f0ae', 80], [80, 36, '#e040fb', 10], [20, 42, '#4fc3f7', 70]];
      return sym(`<defs>${rg(a, '#ffe0b2', '#c17a3a')}${rg(b, '#ffc1e3', '#ec407a')}</defs>
      <circle cx="50" cy="52" r="42" fill="url(#${a})" stroke="#6d3b12" stroke-width="2"/>
      <path d="M50 14 C74 12 92 30 90 50 C92 58 86 62 82 58 C78 66 70 70 66 64 C58 74 46 72 42 66 C32 72 22 66 22 60 C12 60 8 50 12 44 C12 28 30 14 50 14z" fill="url(#${b})" stroke="#ad1457" stroke-width="1.5"/>
      <circle cx="50" cy="48" r="12" fill="#2a1a12" stroke="#6d3b12" stroke-width="2"/>
      ${sp.map(([x, y, c, r]) => `<rect x="${x - 4}" y="${y - 1.4}" width="8" height="2.8" rx="1.4" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('')}`); },
    'candy-c-cupcake'() { const a = id(), b = id(), c = id(); return sym(`<defs>${stops(a, ['#4fc3f7', '#0277bd'], 1, 0)}${rg(b, '#fff', '#f8bbd0')}${rg(c, '#ff8a80', '#b71c1c')}</defs>
      <path d="M20 56 L80 56 L72 94 L28 94z" fill="url(#${a})" stroke="#01579b" stroke-width="2"/>
      ${[30, 40, 50, 60, 70].map((x) => `<path d="M${x} 56 L${x + (x - 50) * -0.12} 94" stroke="#01579b" stroke-opacity=".45" stroke-width="2"/>`).join('')}
      <path d="M16 58 C10 46 22 40 28 42 C26 30 42 26 48 32 C50 20 66 22 66 32 C76 28 86 38 80 46 C90 50 86 60 78 58z" fill="url(#${b})" stroke="#ad1457" stroke-width="2"/>
      <path d="M30 44 C40 48 60 48 72 42" stroke="#f48fb1" stroke-width="3" fill="none"/>
      <circle cx="54" cy="20" r="9" fill="url(#${c})" stroke="#7f0000" stroke-width="1.5"/><path d="M56 12 C58 6 64 4 68 4" stroke="#2e7d32" stroke-width="2.5" fill="none"/>
      <circle cx="51" cy="17" r="2.5" fill="#fff" opacity=".7"/>`); },
    'candy-wild'() { const a = id(); const cols = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#2979ff', '#d500f9'];
      return sym(`<defs>${rg(a, '#fff', 'rgba(255,255,255,0)')}</defs>
      ${cols.map((c, i) => `<path d="M50 38 L${50 + Math.cos((i * 60 - 90) * Math.PI / 180) * 40} ${38 + Math.sin((i * 60 - 90) * Math.PI / 180) * 40} A40 40 0 0 1 ${50 + Math.cos(((i + 1) * 60 - 90) * Math.PI / 180) * 40} ${38 + Math.sin(((i + 1) * 60 - 90) * Math.PI / 180) * 40}z" fill="${c}"/>`).join('')}
      <circle cx="50" cy="38" r="40" fill="none" stroke="#fff" stroke-width="3"/><circle cx="50" cy="38" r="26" fill="url(#${a})" opacity=".8"/>
      <polygon points="${star5(50, 38, 15, 7)}" fill="#fff" stroke="#ff4081" stroke-width="2"/>
      ${band('WILD', '#d500f9', 'Luckiest Guy')}`); },
    'candy-scatter'() { const a = id(), b = id(); const balls = [[38, 30, '#ff1744'], [54, 26, '#2979ff'], [66, 36, '#ffea00'], [44, 44, '#00e676'], [60, 50, '#d500f9'], [32, 48, '#ff9100'], [50, 58, '#ff4081']];
      return sym(`<defs>${rg(a, 'rgba(255,255,255,.55)', 'rgba(200,230,255,.15)')}${stops(b, ['#ff5252', '#b71c1c'])}</defs>
      <circle cx="50" cy="40" r="30" fill="#1b2a3a" opacity=".35"/>
      ${balls.map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="8" fill="${c}" stroke="#000" stroke-opacity=".25"/><circle cx="${x - 2.5}" cy="${y - 2.5}" r="2" fill="#fff" opacity=".7"/>`).join('')}
      <circle cx="50" cy="40" r="30" fill="url(#${a})" stroke="#fff" stroke-opacity=".7" stroke-width="2.5"/>
      <rect x="44" y="6" width="12" height="6" rx="2" fill="url(#${b})"/>
      <path d="M30 66 L70 66 L74 74 L26 74z" fill="url(#${b})" stroke="#4a0000" stroke-width="1.5"/>
      ${band('BONUS', '#ff1744', 'Luckiest Guy')}`); },

    /* ===== Neon Nights (drawn as glowing tubes) ===== */
    ...Object.fromEntries([
      ['n-cherry', '#ff2d6f', '<circle cx="34" cy="68" r="16"/><circle cx="66" cy="70" r="16"/><path d="M36 52 C40 32 54 20 70 12 M64 54 C62 36 64 24 70 12 M70 12 C78 8 88 12 90 20 C80 22 74 18 70 12"/>'],
      ['n-lemon', '#ffe600', '<path d="M12 52 C12 30 34 18 54 20 C70 21 84 32 88 48 C92 62 80 78 58 82 C36 86 12 74 12 52z M88 48 L96 44 M12 54 L4 58"/>'],
      ['n-bell', '#ffb300', '<path d="M50 10 C70 10 76 30 76 48 C76 62 84 70 88 76 L12 76 C16 70 24 62 24 48 C24 30 30 10 50 10z M42 82 C42 90 58 90 58 82 M50 6 L50 10"/>'],
      ['n-bar', '#00e5ff', '<rect x="8" y="30" width="84" height="40" rx="8"/><path d="M20 40 L20 60 L30 60 C36 60 36 50 30 50 L20 50 M20 40 L29 40 C34 40 34 50 29 50 M42 60 L50 40 L58 60 M45 53 L55 53 M68 60 L68 40 L77 40 C84 40 84 51 77 51 L68 51 M76 51 L82 60"/>'],
      ['n-diamond', '#40c4ff', '<path d="M50 90 L8 38 L26 14 L74 14 L92 38z M8 38 L92 38 M26 14 L40 38 L50 14 L60 38 L74 14 M40 38 L50 90 L60 38"/>'],
      ['n-star', '#b388ff', `<polygon points="${star5(50, 52, 44, 18)}"/>`],
      ['n-seven', '#ff1744', '<path d="M18 16 L84 16 L84 28 C66 46 54 66 50 90 L32 90 C36 66 48 44 64 30 L18 30z"/>'],
      ['n-crown', '#ffd600', '<path d="M12 70 L18 26 L36 48 L50 16 L64 48 L82 26 L88 70z M14 80 L86 80"/><circle cx="18" cy="24" r="4"/><circle cx="50" cy="12" r="4"/><circle cx="82" cy="24" r="4"/>'],
    ].map(([name, col, d]) => ['neon-' + name, () => { const f = id(); return svg(`<defs><filter id="${f}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
      <g fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="${col}" stroke-width="9" filter="url(#${f})" opacity=".9">${d}</g><g stroke="${col}" stroke-width="5">${d}</g><g stroke="#fff" stroke-width="1.8" opacity=".9">${d}</g></g>`); }])),
    'neon-wild'() { const f = id(); return svg(`<defs><filter id="${f}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <rect x="6" y="24" width="88" height="52" rx="10" fill="none" stroke="#ff2d6f" stroke-width="7" filter="url(#${f})"/><rect x="6" y="24" width="88" height="52" rx="10" fill="none" stroke="#ff2d6f" stroke-width="3"/><rect x="6" y="24" width="88" height="52" rx="10" fill="none" stroke="#fff" stroke-width="1"/>
      <text x="50" y="62" text-anchor="middle" font-family="Monoton, Impact, sans-serif" font-size="26" fill="#00e5ff" filter="url(#${f})">WILD</text><text x="50" y="62" text-anchor="middle" font-family="Monoton, Impact, sans-serif" font-size="26" fill="#e0fbff">WILD</text>`); },
    'neon-scatter'() { const f = id(); return svg(`${C.art('neon-n-crown').replace(/^<svg[^>]*>|<\/svg>$/g, '')}<defs><filter id="${f}"><feGaussianBlur stdDeviation="2.5"/></filter></defs>
      <text x="50" y="97" text-anchor="middle" font-family="Monoton, Impact, sans-serif" font-size="15" fill="#ffd600" filter="url(#${f})">BONUS</text><text x="50" y="97" text-anchor="middle" font-family="Monoton, Impact, sans-serif" font-size="15" fill="#fffde7">BONUS</text>`); },

    /* ===== Lucky Clover ===== */
    'clover-clover'() { const a = id(); const leaf = (r) => `<path d="M50 50 C36 46 26 30 34 22 C40 16 48 20 50 28 C52 20 60 16 66 22 C74 30 64 46 50 50z" fill="url(#${a})" stroke="#1b5e20" stroke-width="2" transform="rotate(${r} 50 50)"/>`;
      return sym(`<defs>${rg(a, '#b9f6ca', '#2e7d32')}</defs><path d="M52 54 C58 70 62 82 74 92" stroke="#2e7d32" stroke-width="6" fill="none" stroke-linecap="round"/>${[0, 90, 180, 270].map(leaf).join('')}<circle cx="50" cy="50" r="4" fill="#1b5e20"/>`); },
    'clover-horseshoe2'() { return horseshoe(['#fff6c8', '#ffd54f', '#b8860b']); },
    'clover-hat'() { const a = id(), b = id(); return sym(`<defs>${stops(a, ['#43a047', '#1b5e20'], 1, 0)}${stops(b, GOLD, 1, 1)}</defs>
      <ellipse cx="50" cy="80" rx="44" ry="12" fill="url(#${a})" stroke="#0b2a0b" stroke-width="2"/>
      <path d="M26 80 L30 16 C40 10 60 10 70 16 L74 80z" fill="url(#${a})" stroke="#0b2a0b" stroke-width="2"/>
      <path d="M28 58 L72 58 L73 70 L27 70z" fill="#212121"/>
      <rect x="40" y="55" width="20" height="18" rx="2" fill="none" stroke="url(#${b})" stroke-width="4"/>
      <path d="M38 22 C44 18 52 18 58 20" stroke="#fff" stroke-opacity=".35" stroke-width="3" fill="none"/>
      <path d="M62 50 C70 42 80 46 76 54 C72 60 64 56 62 50z" fill="#66bb6a" stroke="#1b5e20" stroke-width="1.5"/>`); },
    'clover-pot'() { const a = id(); return sym(`<defs>${rg(a, '#546e7a', '#101518')}</defs>
      ${[[32, 34, 12], [50, 26, 14], [68, 34, 12], [42, 40, 11], [60, 40, 11]].map(([x, y, r]) => coinStack(x, y + 8, 1, r * 2)).join('')}
      ${[[30, 30], [52, 20], [70, 30]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="3" fill="#ffe082" stroke="#7a5200"/>`).join('')}
      <path d="M14 46 L86 46 C90 70 74 92 50 92 C26 92 10 70 14 46z" fill="url(#${a})" stroke="#000" stroke-width="2"/>
      <rect x="10" y="42" width="80" height="9" rx="4.5" fill="#37474f" stroke="#000" stroke-width="1.5"/>
      <ellipse cx="34" cy="64" rx="6" ry="10" fill="#fff" opacity=".12"/>`); },
    'clover-wild'() { const cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
      return sym(`${cols.map((c, i) => `<path d="M${12 + i * 4} 66 A${38 - i * 4} ${38 - i * 4} 0 0 1 ${88 - i * 4} 66" fill="none" stroke="${c}" stroke-width="4.2"/>`).join('')}
      <g fill="#fff" stroke="#b0bec5" stroke-width="1.5"><circle cx="16" cy="64" r="9"/><circle cx="26" cy="62" r="11"/><circle cx="20" cy="70" r="8"/><circle cx="84" cy="64" r="9"/><circle cx="74" cy="62" r="11"/><circle cx="80" cy="70" r="8"/></g>
      ${band('WILD', '#2e7d32')}`); },
    'clover-scatter'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#fff59d', '#c99a06')}${rg(b, '#b9f6ca', '#1b5e20')}</defs>
      <circle cx="50" cy="40" r="34" fill="url(#${a})" stroke="#7a5200" stroke-width="3"/><circle cx="50" cy="40" r="27" fill="none" stroke="#7a5200" stroke-width="1.5" opacity=".6"/>
      ${[0, 90, 180, 270].map((r) => `<path d="M50 40 C42 38 36 28 41 23 C45 19 49 22 50 27 C51 22 55 19 59 23 C64 28 58 38 50 40z" fill="url(#${b})" stroke="#0b2a0b" stroke-width="1.2" transform="rotate(${r} 50 40)"/>`).join('')}
      ${band('BONUS', '#c62828')}`); },

    /* ===== Cosmic Cash ===== */
    'cosmic-planet'() { const a = id(); return sym(`<defs>${rg(a, '#ffe0b2', '#e65100')}</defs>
      <path d="M8 58 C8 46 92 30 92 42" fill="none" stroke="#ffcc80" stroke-width="7" opacity=".9"/>
      <circle cx="50" cy="50" r="30" fill="url(#${a})" stroke="#7a2400" stroke-width="1.5"/>
      <path d="M24 40 C40 44 60 44 78 38 M22 54 C40 58 62 58 80 52 M28 66 C44 70 58 70 74 64" stroke="#bf360c" stroke-opacity=".45" stroke-width="3" fill="none"/>
      <path d="M8 58 C8 70 92 54 92 42" fill="none" stroke="#ffcc80" stroke-width="7"/><path d="M8 58 C8 70 92 54 92 42" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6"/>`); },
    'cosmic-comet'() { const a = id(), b = id(); return sym(`<defs><linearGradient id="${a}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00e5ff" stop-opacity="0"/><stop offset="1" stop-color="#80d8ff"/></linearGradient>${rg(b, '#ffffff', '#40c4ff')}</defs>
      <path d="M4 10 L66 58 L56 70z" fill="url(#${a})"/><path d="M14 4 L72 52 L68 60z" fill="url(#${a})" opacity=".6"/><path d="M2 26 L58 66 L52 72z" fill="url(#${a})" opacity=".5"/>
      <circle cx="68" cy="66" r="18" fill="url(#${b})"/><circle cx="68" cy="66" r="26" fill="#40c4ff" opacity=".2"/>`); },
    'cosmic-ufo'() { const a = id(), b = id(), c = id(); return sym(`<defs>${rg(a, '#e0f7fa', '#4dd0e1')}${stops(b, ['#cfd8dc', '#546e7a'])}<linearGradient id="${c}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b2ff59" stop-opacity=".7"/><stop offset="1" stop-color="#b2ff59" stop-opacity="0"/></linearGradient></defs>
      <path d="M36 56 L64 56 L84 96 L16 96z" fill="url(#${c})"/>
      <ellipse cx="50" cy="38" rx="20" ry="18" fill="url(#${a})" stroke="#006064" stroke-width="1.5"/>
      <ellipse cx="50" cy="50" rx="44" ry="13" fill="url(#${b})" stroke="#263238" stroke-width="2"/>
      ${[20, 35, 50, 65, 80].map((x, i) => `<circle cx="${x}" cy="${52 - Math.abs(x - 50) * 0.08}" r="3.2" fill="${['#ffea00', '#ff1744', '#00e676', '#ff1744', '#ffea00'][i]}"/>`).join('')}
      <ellipse cx="44" cy="30" rx="6" ry="4" fill="#fff" opacity=".7"/>`); },
    'cosmic-astronaut'() { const a = id(), b = id(); return sym(`<defs>${rg(a, '#ffffff', '#b0bec5')}${stops(b, ['#ffe082', '#ff8f00', '#4a148c'], 1, 1)}</defs>
      <circle cx="50" cy="46" r="40" fill="url(#${a})" stroke="#455a64" stroke-width="2"/>
      <rect x="18" y="84" width="64" height="14" rx="6" fill="url(#${a})" stroke="#455a64" stroke-width="2"/>
      <path d="M22 46 C22 24 78 24 78 46 C78 64 66 72 50 72 C34 72 22 64 22 46z" fill="url(#${b})" stroke="#263238" stroke-width="2.5"/>
      ${[[36, 40, 1.8], [58, 36, 1.2], [64, 52, 1.6], [44, 56, 1]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('')}
      <path d="M30 40 C34 32 42 30 48 30" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".75"/>`); },
    'cosmic-wild'() { const a = id(); return sym(`<defs>${rg(a, '#ffffff', 'rgba(224,64,251,0)')}</defs>
      <circle cx="50" cy="40" r="40" fill="url(#${a})"/>
      ${Array.from({ length: 16 }, (_, i) => `<path d="M50 40 L${50 + Math.cos(i * Math.PI / 8) * (i % 2 ? 26 : 42)} ${40 + Math.sin(i * Math.PI / 8) * (i % 2 ? 26 : 42)}" stroke="${i % 2 ? '#ea80fc' : '#fff'}" stroke-width="${i % 2 ? 2 : 3}" stroke-linecap="round"/>`).join('')}
      <polygon points="${star5(50, 40, 20, 9)}" fill="#fff" stroke="#e040fb" stroke-width="2"/>
      ${band('WILD', '#6a1b9a', 'Russo One')}`); },
    'cosmic-scatter'() { const a = id(); return sym(`<defs>${rg(a, '#ffffff', 'rgba(124,77,255,0)')}</defs>
      <circle cx="50" cy="40" r="36" fill="#1a0b3d"/>
      ${[0, 120, 240].map((r) => `<path d="M50 40 C62 30 78 34 82 46 C70 40 60 44 50 40z" fill="#b388ff" opacity=".8" transform="rotate(${r} 50 40)"/><path d="M50 40 C58 46 60 58 52 66 C54 56 50 48 50 40z" fill="#80d8ff" opacity=".7" transform="rotate(${r} 50 40)"/>`).join('')}
      <circle cx="50" cy="40" r="12" fill="url(#${a})"/>
      ${[[20, 18], [80, 22], [26, 64], [78, 60], [62, 12]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#fff"/>`).join('')}
      ${band('BONUS', '#311b92', 'Russo One')}`); },
  };
  C.addArt(ART);

  /** Art name for a symbol in a theme (falls back to the shared art set). */
  C.slotSymArt = (theme, s) => {
    if (s.length === 1 && 'TJQKA'.includes(s)) return C.art('royal:' + theme + ':' + s);
    const n = theme + '-' + s;
    return C.hasArt(n) ? C.art(n) : C.hasArt('neon-' + s) && theme === 'neon' ? C.art('neon-' + s) : C.art(s);
  };
  C.addArt(Object.fromEntries(Object.keys(ROYAL_STYLE).flatMap((t) => ['T', 'J', 'Q', 'K', 'A'].map((L) => ['royal:' + t + ':' + L, () => royal(t, L)]))));
})();
