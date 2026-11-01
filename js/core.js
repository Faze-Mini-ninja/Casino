/* Core client: talks to the casino server. Balances and every game result come from the server;
 * the browser only renders and animates. */
(function () {
  'use strict';
  const L = window.Lib;
  const C = (window.Casino = { games: [], L });
  const r2 = (x) => Math.round(x * 100) / 100;
  C.r2 = r2;

  /* ---------------- session state ---------------- */
  const S = { user: null, units: { demo: 0, real: 0 }, config: {}, mode: 'demo' };
  try { S.mode = localStorage.getItem('casino.mode') === 'real' ? 'real' : 'demo'; } catch (e) { /* storage blocked */ }
  C.S = S;
  const listeners = [];
  let pageListeners = []; // registered by the current page; dropped on navigation
  C.onChange = (f) => listeners.push(f);
  C.onPage = (f) => pageListeners.push(f);
  const emit = () => { listeners.forEach((f) => f(S)); pageListeners.forEach((f) => f(S)); };
  C.mode = () => S.mode;
  C.balance = () => S.units[S.mode] / 100;
  C.setMode = (m) => { S.mode = m; try { localStorage.setItem('casino.mode', m); } catch (e) { /* ignore */ } emit(); };
  const setUnits = (b) => { if (b) { S.units = { demo: b.demo, real: b.real }; emit(); } };
  C.odds = () => !!S.config.showOdds;
  C.solOf = (credits) => credits / (S.config.creditsPerSol || 1000);

  /* ---------------- API ---------------- */
  C.api = async (method, path, body) => {
    let res;
    try { res = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { C.toast('Connection problem — check your network', 'err'); throw e; }
    let j = {}; try { j = await res.json(); } catch (e) { /* empty */ }
    if (!res.ok) {
      if (res.status === 401 && S.user) { S.user = null; emit(); location.hash = '#login'; }
      const err = new Error(j.error || 'Request failed'); err.status = res.status; err.shown = true;
      C.toast(err.message, 'err'); throw err;
    }
    return j;
  };
  /**
   * Play a game action on the server. The wager is reflected in the balance immediately; the payout is
   * applied when the game calls C.settle(r) after its animation (or automatically after a few seconds).
   */
  C.play = async (game, action, params) => {
    if (!S.user) { location.hash = '#login'; throw new Error('login'); }
    const r = await C.api('POST', '/api/play', { game, action, params, mode: S.mode });
    if (r.preBalances) setUnits(r.preBalances);
    if (r.balances && r.preBalances) { r._t = setTimeout(() => setUnits(r.balances), 9000); }
    else setUnits(r.balances);
    return r;
  };
  C.settle = (r) => { if (r && r._t) { clearTimeout(r._t); r._t = null; } if (r && r.balances) setUnits(r.balances); };
  /** Wrap a game action so errors (already toasted) don't break the UI. Returns null on failure. */
  C.try = async (fn) => { try { return await fn(); } catch (e) { if (!e.shown && e.message !== 'login') { console.error(e); C.toast('Something went wrong', 'err'); } return null; } };

  /* ---------------- DOM helpers ---------------- */
  C.h = function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    const add = (k) => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(add); else e.appendChild(k.nodeType ? k : document.createTextNode(k)); };
    kids.forEach(add);
    return e;
  };
  const h = C.h;
  C.fmt = (n) => (+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  C.fmtSol = (n) => (+n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  C.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  C.toast = (msg, type = '') => {
    const t = h('div', { class: 'toast ' + type }, msg);
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  };
  C.copy = async (text) => { try { await navigator.clipboard.writeText(text); C.toast('Copied', 'win'); } catch (e) { C.toast('Copy failed — select and copy manually', 'err'); } };

  C.betInput = (opts = {}) => {
    const input = h('input', { type: 'number', min: '0', step: '0.01', value: opts.value || 10, class: 'bet-amt', inputmode: 'decimal' });
    const set = (v) => { input.value = r2(Math.max(0, v)); input.dispatchEvent(new Event('input')); };
    const btn = (label, f) => h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (!input.disabled) f(); } }, label);
    const solHint = h('div', { class: 'sol-hint' });
    const hint = () => { solHint.textContent = S.mode === 'real' && +input.value > 0 ? `≈ ${C.fmtSol(C.solOf(+input.value))} SOL` : ''; };
    input.addEventListener('input', hint); C.onPage(hint); hint();
    const el = h('div', { class: 'bet-input' },
      h('label', null, opts.label || 'Bet'),
      h('div', { class: 'bet-row' }, input,
        btn('½', () => set(+input.value / 2)), btn('2×', () => set(+input.value * 2)),
        btn('Max', () => set(Math.min(C.balance(), S.config.maxBet || Infinity)))), solHint);
    return { el, input, get value() { return r2(+input.value); }, set, disable(d) { input.disabled = d; el.classList.toggle('disabled', d); } };
  };
  C.select = (label, options, value, onchange) => {
    const s = h('select', { onchange: (e) => onchange && onchange(e.target.value) },
      options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) ? true : null }, t); }));
    return { el: h('div', { class: 'field' }, h('label', null, label), s), sel: s, get value() { return s.value; } };
  };
  C.cardEl = (c, opts = {}) => {
    if (!c || opts.hidden) return h('div', { class: 'card back' + (opts.cls ? ' ' + opts.cls : '') });
    const red = c.s === 1 || c.s === 2;
    return h('div', { class: 'card' + (red ? ' red' : '') + (opts.cls ? ' ' + opts.cls : '') },
      h('span', { class: 'cr' }, L.RANK_STR[c.r]), h('span', { class: 'cs' }, L.SUITS[c.s]), h('span', { class: 'cbig' }, L.SUITS[c.s]));
  };
  C.msg = () => {
    const el = h('div', { class: 'msg' }, ' ');
    return { el, set(text, type = '') { el.className = 'msg ' + type; el.textContent = text; } };
  };
  C.net = (r) => r2(r.payout - r.wager);
  C.netMsg = (net) => (net > 0 ? `+${C.fmt(net)}` : net === 0 ? 'even' : `−${C.fmt(-net)}`);

  /** Chip-placement table. Bets stay on the layout between rounds until cleared. */
  C.chipTable = (opts = {}) => {
    const T = { bets: {}, spots: {}, chip: opts.chip || 10, locked: false };
    const chips = opts.chips || [1, 5, 10, 25, 100, 500, 1000, 5000];
    const chipBtns = chips.map((v) => {
      const b = h('button', { class: 'chip c' + v + (v === T.chip ? ' sel' : ''), type: 'button', onclick: () => { T.chip = v; chipBtns.forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); } }, v >= 1000 ? v / 1000 + 'K' : String(v));
      return b;
    });
    const totalEl = h('span', { class: 'tot' }, '0.00');
    T.bar = h('div', { class: 'chipbar' }, h('div', { class: 'chips' }, chipBtns),
      h('div', { class: 'chip-actions' }, h('span', { class: 'muted' }, 'Total bet: '), totalEl,
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => T.double() }, '2×'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => T.clear() }, 'Clear')),
      h('div', { class: 'hint' }, 'Click a spot to place the selected chip. Right-click (or long-press) to remove.'));
    const paint = (id) => { const sp = T.spots[id]; if (!sp) return; const v = T.bets[id] || 0; sp.stack.textContent = v ? (v >= 1000 ? r2(v / 1000) + 'K' : r2(v)) : ''; sp.stack.style.display = v ? '' : 'none'; };
    T.total = () => r2(Object.values(T.bets).reduce((a, b) => a + b, 0));
    const upd = () => { totalEl.textContent = C.fmt(T.total()) + (S.mode === 'real' && T.total() ? ` (≈${C.fmtSol(C.solOf(T.total()))} SOL)` : ''); Object.keys(T.spots).forEach(paint); };
    T.add = (id, v) => { if (T.locked) return; if (T.total() + v > C.balance() + 1e-9) { C.toast('Not enough balance for that chip', 'err'); return; } T.bets[id] = r2((T.bets[id] || 0) + v); upd(); };
    T.remove = (id) => { if (T.locked || !T.bets[id]) return; T.bets[id] = r2(T.bets[id] - Math.min(T.bets[id], T.chip)); if (!T.bets[id]) delete T.bets[id]; upd(); };
    T.clear = () => { if (T.locked) return; T.bets = {}; upd(); T.mark([]); };
    T.double = () => { if (T.locked) return; if (T.total() * 2 > C.balance()) { C.toast('Not enough balance to double', 'err'); return; } for (const k in T.bets) T.bets[k] = r2(T.bets[k] * 2); upd(); };
    T.spot = (id, content, cls = '', title = '') => {
      const stack = h('span', { class: 'stack', style: 'display:none' });
      const e = h('div', { class: 'spot ' + cls, title, 'data-id': id }, content, stack);
      e.addEventListener('click', () => T.add(id, T.chip));
      e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); T.remove(id); });
      let lp; e.addEventListener('touchstart', () => { lp = setTimeout(() => T.remove(id), 550); }, { passive: true });
      e.addEventListener('touchend', () => clearTimeout(lp));
      T.spots[id] = { e, stack }; paint(id);
      return e;
    };
    T.mark = (ids) => { for (const k in T.spots) T.spots[k].e.classList.toggle('win', ids.includes(k)); };
    T.lock = (b) => { T.locked = b; T.bar.classList.toggle('disabled', b); };
    T.ready = () => { if (!T.total()) { C.toast('Place a bet first', 'err'); return false; } return true; };
    C.onPage(upd);
    return T;
  };

  /* ---------------- registry & pages ---------------- */
  C.CATS = { table: 'Table Games', cards: 'Card & Poker', dice: 'Dice & Wheels', lottery: 'Slots & Lottery', originals: 'Originals' };
  // Lobby grouping and short display names (game files keep their own detailed names)
  const RECAT = { 'roulette-us': 'table', 'roulette-eu': 'table', blackjack: 'table', baccarat: 'table', 'baccarat-tie': 'table', 'baccarat-side': 'table', craps: 'table', sicbo: 'table', bigsix: 'table', dragontiger: 'table', war: 'table',
    videopoker: 'poker', paigow: 'poker', threecard: 'poker', caribbean: 'poker', holdem: 'poker', letitride: 'poker', slots: 'lottery', keno: 'lottery', bingo: 'lottery', scratch: 'lottery' };
  const SHORT = { blackjack: 'Blackjack', 'roulette-us': 'American Roulette', 'roulette-eu': 'European Roulette', baccarat: 'Baccarat', 'baccarat-tie': 'Baccarat Tie', 'baccarat-side': 'Baccarat Bonus',
    craps: 'Craps', paigow: 'Pai Gow', bigsix: 'Big Six', threecard: 'Three Card Poker', caribbean: 'Caribbean Stud', holdem: "Hold'em", bingo: 'Bingo', scratch: 'Scratch Cards', war: 'Casino War', videopoker: 'Video Poker' };
  C.register = (g) => { g.cat = RECAT[g.id] || 'originals'; g.short = SHORT[g.id] || g.name; C.games.push(g); };
  let cleanup = null;
  const app = () => document.getElementById('app');
  const names = () => Object.fromEntries(C.games.map((g) => [g.statId || g.id, g.name.replace(/ — .*/, '')]));

  /* ---------------- icons (24×24 line icons) ---------------- */
  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
    zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    cards: '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".6"/><circle cx="15" cy="15" r=".6"/><circle cx="15" cy="9" r=".6"/><circle cx="9" cy="15" r=".6"/>',
    ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
    wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H3z"/><path d="M3 7l12-4v4"/><path d="M16 14h2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 5.5 5.8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
    play: '<path d="M8 5v14l11-7z" fill="currentColor"/>',
    star: '<path d="M12 3l2.7 5.6 6.3.9-4.5 4.4 1 6.1L12 17l-5.6 3 1-6.1L3 9.5l6.3-.9z"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    logout: '<path d="M9 21H5V3h4M16 17l5-5-5-5M21 12H9"/>',
  };
  C.icon = (name, cls = '') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + cls); s.innerHTML = ICONS[name] || ''; return s; };
  const iconize = (root = document) => root.querySelectorAll('[data-i]').forEach((el) => { if (!el.querySelector('svg')) el.prepend(C.icon(el.dataset.i)); });

  /* ---------------- generated game art ---------------- */
  const GLYPH = { slots: '7', keno: '80', blackjack: '21', 'roulette-us': '00', 'roulette-eu': '0', 'baccarat-tie': '8:1', 'baccarat-side': '♦', baccarat: '9', craps: '11', videopoker: '♠', paigow: '♣', sicbo: '3D', bingo: 'B', plinko: '▼', dragontiger: '龍', threecard: '3', caribbean: '♥', holdem: 'A♠', letitride: '$', bigsix: '6', crash: '×', mines: '◆', limbo: '∞', dice: '%', hilo: '↕', tower: '▲', scratch: '★', fish: '≈', coinflip: '½', war: '⚔' };
  const CAT_LABEL = { originals: 'Royal Edge Originals', table: 'Table Games', poker: 'Poker', lottery: 'Slots & Lottery' };
  C.hue = (g) => (g.n * 47 + 190) % 360;
  function motif(cat) {
    switch (cat) {
      case 'originals': return '<g stroke="#fff" stroke-opacity=".16" fill="none" stroke-width="2">' + [0, 1, 2, 3, 4].map((i) => `<rect x="${150 - 30 - i * 26}" y="${190 - 30 - i * 26}" width="${60 + i * 52}" height="${60 + i * 52}" rx="10" transform="rotate(45 150 190)"/>`).join('') + '</g>';
      case 'poker': return '<g fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".2" stroke-width="2"><rect x="120" y="70" width="120" height="170" rx="12" transform="rotate(14 180 155)"/><rect x="70" y="90" width="120" height="170" rx="12" transform="rotate(-10 130 175)"/></g>';
      case 'table': return '<g stroke="#fff" stroke-opacity=".18" fill="none" stroke-width="2"><circle cx="180" cy="150" r="120"/><circle cx="180" cy="150" r="84"/><circle cx="180" cy="150" r="30"/>' + Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `<line x1="${180 + Math.cos(a) * 30}" y1="${150 + Math.sin(a) * 30}" x2="${180 + Math.cos(a) * 120}" y2="${150 + Math.sin(a) * 120}"/>`; }).join('') + '</g>';
      case 'dice-unused': return '<g fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".22" stroke-width="2"><rect x="150" y="60" width="110" height="110" rx="20" transform="rotate(18 205 115)"/><rect x="70" y="140" width="110" height="110" rx="20" transform="rotate(-12 125 195)"/></g>';
      case 'lottery': return '<g fill="#fff" fill-opacity=".1" stroke="#fff" stroke-opacity=".2" stroke-width="2"><circle cx="200" cy="100" r="54"/><circle cx="110" cy="170" r="40"/><circle cx="220" cy="210" r="30"/><circle cx="90" cy="80" r="22"/></g>';
    }
    return '';
  }
  C.tileArt = (g) => {
    const hh = C.hue(g), id = 'g' + g.n;
    return `<svg viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hh},78%,52%)"/><stop offset="1" stop-color="hsl(${(hh + 40) % 360},80%,26%)"/></linearGradient>
      <radialGradient id="${id}r" cx=".8" cy=".1" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <rect width="300" height="400" fill="url(#${id})"/><rect width="300" height="400" fill="url(#${id}r)"/>${motif(g.cat)}
      <text x="280" y="120" text-anchor="end" font-family="-apple-system,Segoe UI,Arial" font-weight="900" font-size="110" fill="#fff" fill-opacity=".9" style="paint-order:stroke" stroke="rgba(0,0,0,.12)" stroke-width="6">${GLYPH[g.id] || ''}</text>
      <rect y="250" width="300" height="150" fill="url(#${id}s)"/><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-opacity="0"/><stop offset="1" stop-opacity=".45"/></linearGradient></svg>`;
  };
  const tileEl = (g) => h('a', { class: 'tile', href: '#' + g.id },
    h('div', { class: 'art', html: C.tileArt(g) }),
    g.cat === 'originals' ? h('span', { class: 't-badge' }, 'Original') : null,
    C.odds() ? h('span', { class: 't-edge' }, g.edge) : null,
    h('div', { class: 't-name' }, g.short),
    h('div', { class: 't-prov' }, 'Royal Edge'),
    h('div', { class: 'play' }, h('span', null, C.icon('play'))));
  C.tileEl = tileEl;
  const CAT_ORDER = ['originals', 'table', 'poker', 'lottery'];
  const CAT_ICON = { originals: 'zap', table: 'target', poker: 'cards', lottery: 'ticket' };
  const sorted = () => C.games.slice().sort((a, b) => a.n - b.n);

  function promo(kicker, title, text, cta, href, from, to, deco) {
    return h('a', { class: 'promo', href, style: `background:linear-gradient(120deg, ${from}, ${to})` },
      h('div', null, h('div', { class: 'kicker' }, kicker), h('h3', null, title), h('p', null, text)),
      h('span', { class: 'btn small' }, cta), h('span', { html: `<svg class="deco" viewBox="0 0 24 24">${ICONS[deco]}</svg>` }));
  }

  async function feedEl() {
    const box = h('div', { class: 'feed' }, h('div', { class: 'empty' }, 'Loading…'));
    const load = async () => {
      let r; try { r = await (await fetch('/api/feed')).json(); } catch (e) { return; }
      const byId = Object.fromEntries(C.games.map((g) => [g.statId || g.id, g]));
      box.innerHTML = '';
      if (!r.bets || !r.bets.length) { box.append(h('div', { class: 'empty' }, 'No bets yet — be the first.')); return; }
      box.append(h('table', null, h('tr', null, h('th', null, 'Game'), h('th', { class: 'hide-m' }, 'Player'), h('th', { class: 'hide-m' }, 'Time'), h('th', { class: 'r hide-m' }, 'Bet'), h('th', { class: 'r' }, 'Multiplier'), h('th', { class: 'r' }, 'Payout')),
        r.bets.map((b) => { const g = byId[b.game] || { name: b.game, n: 0 }; const m = b.wager ? b.payout / b.wager : 0; const cur = b.mode === 'real' ? ' ◎' : '';
          return h('tr', null, h('td', null, h('a', { class: 'g-cell', href: '#' + (g.id || '') }, h('span', { class: 'dot', style: `background:hsl(${C.hue(g)},70%,45%)` }), (g.short || g.name))),
            h('td', { class: 'hide-m muted' }, b.user), h('td', { class: 'hide-m muted' }, new Date(b.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
            h('td', { class: 'r hide-m' }, C.fmt(b.wager) + cur), h('td', { class: 'r' }, m.toFixed(2) + '×'), h('td', { class: 'r ' + (b.payout > b.wager ? 'pos' : 'muted') }, (b.payout > b.wager ? '+' : '') + C.fmt(b.payout - b.wager) + cur)); })));
    };
    load(); const t = setInterval(() => { if (!document.body.contains(box)) clearInterval(t); else load(); }, 8000);
    return box;
  }

  function lobby(cat) {
    let q = '';
    const body = h('div');
    const render = () => {
      body.innerHTML = '';
      const list = sorted().filter((g) => (!cat || g.cat === cat) && (!q || g.name.toLowerCase().includes(q)));
      if (cat || q) {
        body.append(h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, C.icon(cat ? CAT_ICON[cat] : 'search'), q ? `Results (${list.length})` : CAT_LABEL[cat])),
          list.length ? h('div', { class: 'grid' }, list.map(tileEl)) : h('div', { class: 'empty' }, 'No games found.')));
        return;
      }
      for (const c of CAT_ORDER) {
        const gs = list.filter((g) => g.cat === c); if (!gs.length) continue;
        body.append(h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, C.icon(CAT_ICON[c]), CAT_LABEL[c]), h('a', { href: '#cat-' + c }, `View all ${gs.length}`)), h('div', { class: 'rail' }, gs.map(tileEl))));
      }
    };
    const tabs = h('div', { class: 'tabs' }, [['', 'Lobby', 'home'], ...CAT_ORDER.map((c) => [c, CAT_LABEL[c].replace('Royal Edge ', ''), CAT_ICON[c]])].map(([k, v, ic]) =>
      h('a', { class: 'tab' + ((cat || '') === k ? ' sel' : ''), href: k ? '#cat-' + k : '#lobby' }, C.icon(ic), v)));
    const search = h('input', { class: 'search', placeholder: 'Search 30 games', oninput: (e) => { q = e.target.value.toLowerCase().trim(); render(); } });
    render();
    const pct = Math.round((S.config.referralShare || 0) * 100);
    const promos = cat ? null : h('div', { class: 'promos' },
      S.user ? promo('Deposit', 'Play with SOL', 'Fresh deposit address every day. Credited the moment your deposit is final.', 'Deposit now', '#wallet', '#7c3aed', '#0ea5a4', 'wallet')
        : promo('Welcome', 'Sign up, get 10,000 free credits', 'Try all 30 games in demo mode, then deposit SOL when you’re ready.', 'Create account', '#login', '#7c3aed', '#0ea5a4', 'star'),
      promo('Refer & Earn', `Earn ${pct}% commission`, 'Share your link and earn on every real-money bet your friends make — forever.', 'Get your link', S.user ? '#referrals' : '#login', '#f97316', '#db2777', 'users'),
      promo('Originals', 'Crash, Mines, Plinko & more', 'Fast in-house games with instant results.', 'Play originals', '#cat-originals', '#2563eb', '#16a34a', 'zap'));
    const feed = h('div', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, C.icon('activity'), 'Latest bets')));
    if (!cat) feedEl().then((f) => feed.append(f));
    return h('div', { class: 'lobby' }, promos, h('div', { class: 'lobby-bar' }, h('div', { class: 'search-wrap' }, C.icon('search'), search), tabs), body, cat ? null : feed);
  }

  function gamePage(g) {
    const root = h('div', { class: 'game-root' });
    const odds = C.odds();
    // Without odds: neutral rules and a Bet/Pays table (no edges, RTPs or probabilities).
    const payRows = (g.edges || []).filter(([b, p]) => p && !/÷|chance|probab|RTP|^target/i.test(p) && !/^(Overall|Every|Any |Each guess|\d-guess)/i.test(b))
      .map(([b, p]) => [b, String(p).replace(/\s*\(1 in [^)]*\)/, '')]);
    const info = h('details', { class: 'rules' }, h('summary', null, C.icon('info'), odds ? 'Rules, payouts & house edge' : 'Rules & payouts'),
      h('div', { class: 'rules-body' }, h('div', { html: odds ? g.rules || '' : (C.HOWTO && C.HOWTO[g.id]) || '' }),
        odds && g.edges ? h('table', { class: 'edge-table' }, h('tr', null, h('th', null, 'Bet'), h('th', null, 'Pays'), h('th', null, 'House edge')),
          g.edges.map(([b, p, e]) => h('tr', null, h('td', null, b), h('td', null, p), h('td', null, e)))) : null,
        !odds && payRows.length ? h('table', { class: 'edge-table' }, h('tr', null, h('th', null, 'Bet'), h('th', null, 'Pays')),
          payRows.map(([b, p]) => h('tr', null, h('td', null, b), h('td', null, p)))) : null));
    const page = h('div', { class: 'game-page' },
      h('div', { class: 'crumbs' }, h('a', { href: '#lobby' }, 'Casino'), '/', h('a', { href: '#cat-' + g.cat }, CAT_LABEL[g.cat]), '/', h('span', { class: 'cur-title' }, g.name),
        h('span', { class: 'spacer' }), h('span', { class: 'mode-pill ' + S.mode }, S.mode === 'real' ? 'REAL SOL' : 'DEMO'), odds ? h('span', { class: 'edge-pill' }, 'House edge ' + g.edge) : null),
      root, info);
    setTimeout(() => {
      const c = g.mount(root, g);
      // Stake-style: the primary action lives in the control panel, under the bet inputs
      const side = root.querySelector('.layout > .side'), stage = root.querySelector('.layout > .stage');
      if (side && stage && ['originals', 'lottery'].includes(g.cat) && g.id !== 'coinflip') {
        const mv = ['mines', 'slots', 'scratch'].includes(g.id) ? stage.querySelector(':scope > .controls') : stage.querySelector(':scope > .btn.big');
        if (mv) {
          const fields = side.querySelectorAll(':scope > .bet-input, :scope > .field, :scope > .stat-line, :scope > .row, :scope > label.row');
          const after = fields[fields.length - 1];
          mv.classList.add('side-action');
          if (after) after.after(mv); else side.prepend(mv);
        }
      }
      cleanup = () => { if (c) c(); if (g.round) C.api('POST', '/api/abandon', { game: g.round }).then((r) => r && r.balances && setUnits(r.balances)).catch(() => {}); };
    }, 0);
    return page;
  }

  function authPage() {
    let mode = 'login';
    const user = h('input', { placeholder: 'Username', autocomplete: 'username', autocapitalize: 'off' });
    const pass = h('input', { type: 'password', placeholder: 'Password (8+ characters)', autocomplete: 'current-password' });
    let saved = ''; try { saved = localStorage.getItem('casino.ref') || ''; } catch (e) { /* ignore */ }
    const ref = h('input', { placeholder: 'Referral code (optional)', autocapitalize: 'characters', autocomplete: 'off', value: saved, style: 'display:none' });
    const title = h('h2', null, 'Log in');
    const btn = h('button', { class: 'btn big', type: 'submit' }, 'Log in');
    const sw = h('a', { href: '#login', onclick: (e) => { e.preventDefault(); mode = mode === 'login' ? 'register' : 'login'; title.textContent = mode === 'login' ? 'Log in' : 'Create account'; ref.style.display = mode === 'login' ? 'none' : ''; btn.textContent = mode === 'login' ? 'Log in' : 'Create account'; sw.textContent = mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'; pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password'; } }, 'New here? Create an account');
    const form = h('form', { class: 'panel auth', onsubmit: async (e) => {
      e.preventDefault(); btn.disabled = true;
      const r = await C.try(() => C.api('POST', mode === 'login' ? '/api/login' : '/api/register', { username: user.value, password: pass.value, refCode: mode === 'login' ? undefined : ref.value.trim() }));
      btn.disabled = false;
      if (r) { if (mode !== 'login') { try { localStorage.removeItem('casino.ref'); } catch (e2) { /* ignore */ } } applyMe(r); C.toast(mode === 'login' ? `Welcome back, ${r.user.username}` : 'Account created — 10,000 demo credits added', 'win'); location.hash = '#lobby'; }
    } }, title, user, pass, ref, btn, sw,
    h('p', { class: 'muted small' }, 'You must be 18+ and allowed to gamble where you live. Gambling can be addictive — set limits and never deposit more than you can afford to lose.'));
    return h('div', { class: 'auth-wrap' }, form);
  }

  async function walletPage() {
    const wrap = h('div', { class: 'wallet-page' }, h('p', { class: 'muted' }, 'Loading wallet…'));
    const w = await C.try(() => C.api('GET', '/api/wallet'));
    wrap.innerHTML = '';
    if (!w) return wrap;
    setUnits(w.balances);
    const cfg = w.config, real = w.balances.real / 100;
    const net = cfg.cluster === 'mainnet-beta' ? null : cfg.cluster;
    const amount = h('input', { type: 'number', min: '0', step: '0.01', placeholder: 'Credits', inputmode: 'decimal' });
    const solOut = h('span', { class: 'muted' });
    amount.addEventListener('input', () => { solOut.textContent = +amount.value > 0 ? `≈ ${C.fmtSol(C.solOf(+amount.value) - cfg.withdrawFeeSol)} SOL after network fee` : ''; });
    const dest = h('input', { placeholder: 'Your Solana wallet address', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    const wBtn = h('button', { class: 'btn', onclick: async () => {
      wBtn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/withdraw', { address: dest.value.trim(), amount: +amount.value }));
      wBtn.disabled = false;
      if (r) { setUnits(r.balances); C.toast(r.status === 'approved' ? `Withdrawal of ${C.fmtSol(r.sol)} SOL is being sent` : 'Withdrawal requested — awaiting approval', 'win'); route(); }
    } }, 'Withdraw');
    const statusTag = (s) => h('span', { class: 'tag-s ' + s }, s);
    const explorer = (sig) => `https://explorer.solana.com/tx/${sig}${net ? '?cluster=' + net : ''}`;
    wrap.append(
      net ? h('div', { class: 'notice' }, `Test network: ${net}. Coins here have no value. Get free ${net} SOL from `, h('a', { href: 'https://faucet.solana.com', target: '_blank', rel: 'noopener' }, 'faucet.solana.com'), ', or switch Phantom to Devnet (Settings → Developer Settings → Testnet Mode).') : null,
      h('div', { class: 'kpis' },
        kpi('Real balance', `${C.fmt(real)} cr`), kpi('In SOL', C.fmtSol(C.solOf(real)) + ' SOL'), kpi('Credits per SOL', cfg.creditsPerSol.toLocaleString())),
      h('div', { class: 'wallet-grid' },
        h('div', { class: 'panel' }, h('h3', null, 'Deposit SOL'),
          w.address ? [
            h('p', { class: 'muted' }, `Your deposit address for today (${w.day} UTC). A fresh address is issued every day; deposits to your older addresses are still credited for ${cfg.watchDays} days.`),
            h('div', { class: 'addr' }, w.address),
            h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => C.copy(w.address) }, 'Copy address'),
              h('a', { class: 'btn small ghost', href: `solana:${w.address}?label=Royal%20Edge%20Casino` }, 'Open in wallet app')),
            h('p', { class: 'muted small' }, `Send SOL only (not tokens). Minimum ${cfg.minDepositSol} SOL. Deposits are credited after the transaction is finalized on-chain (usually under a minute).`),
          ] : h('p', { class: 'muted' }, 'Deposits are not enabled on this server.')),
        h('div', { class: 'panel' }, h('h3', null, 'Withdraw SOL'),
          h('div', { class: 'field' }, h('label', null, 'Amount (credits)'), h('div', { class: 'row' }, amount, h('button', { class: 'btn small ghost', onclick: () => { amount.value = real; amount.dispatchEvent(new Event('input')); } }, 'Max')), solOut),
          h('div', { class: 'field' }, h('label', null, 'Destination address'), dest), wBtn,
          h('p', { class: 'muted small' }, `Minimum ${cfg.minWithdrawSol} SOL. Up to ${cfg.autoApproveSol} SOL is sent automatically; larger withdrawals are reviewed first.`))),
      h('div', { class: 'panel' }, h('h3', null, 'Deposits'),
        w.deposits.length ? h('table', { class: 'data' }, h('tr', null, ['Time', 'SOL', 'Credited', 'Status', 'Tx'].map((x) => h('th', null, x))),
          w.deposits.map((d) => h('tr', null, h('td', null, new Date(d.ts).toLocaleString()), h('td', null, C.fmtSol(d.sol)), h('td', null, C.fmt(d.credits)), h('td', null, statusTag(d.kind === 'deposit' ? 'credited' : 'below minimum')), h('td', null, h('a', { href: explorer(d.signature), target: '_blank', rel: 'noopener' }, d.signature.slice(0, 8) + '…')))))
          : h('p', { class: 'muted' }, 'No deposits yet.'),
        h('h3', null, 'Withdrawals'),
        w.withdrawals.length ? h('table', { class: 'data' }, h('tr', null, ['Time', 'SOL', 'To', 'Status', 'Tx'].map((x) => h('th', null, x))),
          w.withdrawals.map((x) => h('tr', null, h('td', null, new Date(x.created).toLocaleString()), h('td', null, C.fmtSol(x.sol)), h('td', { class: 'mono' }, x.dest.slice(0, 6) + '…' + x.dest.slice(-4)), h('td', null, statusTag(x.status), x.note ? h('div', { class: 'muted small' }, x.note) : null), h('td', null, x.signature ? h('a', { href: explorer(x.signature), target: '_blank', rel: 'noopener' }, x.signature.slice(0, 8) + '…') : '—'))))
          : h('p', { class: 'muted' }, 'No withdrawals yet.')));
    return wrap;
  }

  async function adminPage() {
    const wrap = h('div', { class: 'panel' }, h('p', { class: 'muted' }, 'Loading…'));
    const [o, ws] = await Promise.all([C.try(() => C.api('GET', '/api/admin/overview')), C.try(() => C.api('GET', '/api/admin/withdrawals'))]);
    wrap.innerHTML = '';
    if (!o || !ws) return wrap;
    const act = async (id, action) => { if (await C.try(() => C.api('POST', '/api/admin/withdrawal', { id, action }))) { C.toast('Done', 'win'); route(); } };
    const tbl = (cols, rows) => (rows.length ? h('table', { class: 'data' }, h('tr', null, cols.map((c) => h('th', null, c))), rows) : h('p', { class: 'muted' }, 'None.'));
    wrap.append(h('h2', null, 'Admin'),
      h('div', { class: 'kpis' }, kpi('Network', o.cluster), kpi('Hot wallet', typeof o.hotSol === 'number' ? C.fmtSol(o.hotSol) + ' SOL' : 'unavailable'), kpi('Player balances (liability)', C.fmtSol(o.playerBalancesSol) + ' SOL'), kpi('Users', o.users), kpi(`Referral commission (${Math.round(o.referrals.share * 100)}%)`, `${C.fmtSol(o.referrals.pendingSol)} owed · ${C.fmtSol(o.referrals.paidSol)} paid SOL`),
        kpi('Watcher', o.watcher.lastError ? 'error' : o.watcher.lastRun ? 'ok ' + new Date(o.watcher.lastRun).toLocaleTimeString() : 'not run')),
      o.watcher.lastError ? h('div', { class: 'notice err' }, 'Cannot reach Solana RPC: ' + o.watcher.lastError) : null,
      typeof o.hotSol === 'string' ? h('div', { class: 'notice err small' }, o.hotSol) : null,
      h('p', { class: 'muted small' }, 'Hot wallet: ', h('span', { class: 'mono' }, o.hotWallet), h('br'), 'Treasury: ', h('span', { class: 'mono' }, o.treasury), ` — sweeps go to the hot wallet until it holds ${o.hotFloatSol} SOL, then to treasury.`),
      h('h3', null, 'Withdrawals'),
      tbl(['#', 'User', 'SOL', 'To', 'Status', 'Actions'], ws.withdrawals.map((x) => h('tr', null, h('td', null, x.id), h('td', null, x.username), h('td', null, C.fmtSol(x.sol)), h('td', { class: 'mono' }, x.dest.slice(0, 6) + '…' + x.dest.slice(-4)),
        h('td', null, h('span', { class: 'tag-s ' + x.status }, x.status), x.note ? h('div', { class: 'muted small' }, x.note) : null),
        h('td', null, x.status === 'pending' ? h('button', { class: 'btn small green', onclick: () => act(x.id, 'approve') }, 'Approve') : null, ' ', ['pending', 'approved'].includes(x.status) ? h('button', { class: 'btn small red', onclick: () => act(x.id, 'reject') }, 'Reject') : null)))),
      h('h3', null, 'Daily deposit wallets'),
      tbl(['Day (UTC)', 'Addresses issued', 'Deposits', 'SOL in'], o.days.map((d) => h('tr', null, h('td', null, d.day), h('td', null, d.addresses), h('td', null, d.deposits), h('td', null, C.fmtSol(d.sol))))),
      h('h3', null, 'Recent sweeps'),
      tbl(['Time', 'From', 'SOL', 'To', 'Status'], o.sweeps.map((s) => h('tr', null, h('td', null, new Date(s.ts).toLocaleString()), h('td', { class: 'mono' }, s.address.slice(0, 6) + '…'), h('td', null, C.fmtSol(s.sol)), h('td', { class: 'mono' }, s.dest.slice(0, 6) + '…'), h('td', null, s.status)))),
      h('h3', null, 'House results (real money)'),
      tbl(['Game', 'Rounds', 'Wagered SOL', 'Paid SOL', 'House SOL'], o.house.map((r) => h('tr', null, h('td', null, names()[r.game] || r.game), h('td', null, r.rounds), h('td', null, C.fmtSol(r.wageredSol)), h('td', null, C.fmtSol(r.paidSol)), h('td', { class: r.houseSol >= 0 ? 'pos' : 'neg' }, C.fmtSol(r.houseSol))))));
    return wrap;
  }

  async function referralsPage() {
    const r = await C.try(() => C.api('GET', '/api/referrals'));
    if (!r) return h('div');
    const link = location.origin + location.pathname + '#ref-' + r.code;
    const pct = Math.round(r.share * 100);
    const total = r.referrals.reduce((a, x) => ({ w: a.w + x.wagered, c: a.c + x.commission }), { w: 0, c: 0 });
    const claimBtn = h('button', { class: 'btn green', disabled: r.pending < 0.01 ? true : null, onclick: async () => {
      claimBtn.disabled = true;
      const c = await C.try(() => C.api('POST', '/api/referrals/claim'));
      if (c) { setUnits(c.balances); C.toast(`Claimed ${C.fmt(c.claimed)} credits (≈${C.fmtSol(C.solOf(c.claimed))} SOL) to your real balance`, 'win'); route(); } else claimBtn.disabled = false;
    } }, 'Claim to real balance');
    const codeIn = h('input', { placeholder: 'Enter a referral code', autocapitalize: 'characters' });
    return h('div', { class: 'wallet-page' },
      h('div', { class: 'panel' }, h('h2', null, 'Refer friends, earn forever'),
        h('p', null, `Share your link. You earn `, h('b', null, `${pct}% of the casino's profit margin`), ` on every real-money bet your referred players make, win or lose, for as long as they play. Commission builds up below; claim it into your real balance any time.`),
        h('div', { class: 'addr' }, link),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => C.copy(link) }, 'Copy link'), h('button', { class: 'btn small ghost', onclick: () => C.copy(r.code) }, 'Copy code ' + r.code))),
      h('div', { class: 'kpis' }, kpi('Ready to claim', C.fmt(r.pending) + ' cr'), kpi('≈ SOL', C.fmtSol(C.solOf(r.pending))), kpi('Claimed so far', C.fmt(r.paid) + ' cr'), kpi('Players referred', r.referrals.length), kpi('Their real wagers', C.fmt(total.w) + ' cr')),
      h('div', { class: 'row' }, claimBtn, h('span', { class: 'muted small' }, 'Commission is earned on real-money (SOL) play only, not demo credits.')),
      h('div', { class: 'panel' }, h('h3', null, 'Your referrals'),
        r.referrals.length ? h('table', { class: 'data' }, h('tr', null, ['Player', 'Joined', 'Rounds', 'Wagered', 'Your commission'].map((x) => h('th', null, x))),
          r.referrals.map((x) => h('tr', null, h('td', null, x.name), h('td', null, new Date(x.joined).toLocaleDateString()), h('td', null, x.rounds), h('td', null, C.fmt(x.wagered)), h('td', { class: 'pos' }, C.fmt(x.commission)))))
          : h('p', { class: 'muted' }, 'Nobody has signed up with your link yet.')),
      r.referredBy ? h('p', { class: 'muted small' }, `You were referred by ${r.referredBy}.`)
        : r.canAddCode ? h('div', { class: 'panel' }, h('h3', null, 'Were you referred?'), h('p', { class: 'muted small' }, 'You can add a referral code until your first real-money bet.'),
          h('div', { class: 'row' }, codeIn, h('button', { class: 'btn small', onclick: async () => { if (await C.try(() => C.api('POST', '/api/referrals/code', { code: codeIn.value }))) { C.toast('Referral code added', 'win'); route(); } } }, 'Add code'))) : null);
  }

  function accountPage() {
    const cur = h('input', { type: 'password', placeholder: 'Current password', autocomplete: 'current-password' });
    const nx = h('input', { type: 'password', placeholder: 'New password (8+ characters)', autocomplete: 'new-password' });
    const nx2 = h('input', { type: 'password', placeholder: 'Repeat new password', autocomplete: 'new-password' });
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Change password');
    return h('div', { class: 'auth-wrap' }, h('form', { class: 'panel auth', onsubmit: async (e) => {
      e.preventDefault();
      if (nx.value !== nx2.value) return C.toast('New passwords do not match', 'err');
      btn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/password', { current: cur.value, next: nx.value }));
      btn.disabled = false;
      if (r) { cur.value = nx.value = nx2.value = ''; C.toast('Password changed. Other devices have been signed out.', 'win'); }
    } }, h('h2', null, 'Account'), h('p', { class: 'muted' }, 'Signed in as ', h('b', null, S.user.username), S.user.role === 'admin' ? ' (admin)' : ''),
    h('h3', null, 'Change password'), cur, nx, nx2, btn,
    h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await C.try(() => C.api('POST', '/api/logout')); S.user = null; emit(); location.hash = '#login'; } }, 'Log out')));
  }

  async function historyPage() {
    const r = await C.try(() => C.api('GET', '/api/history?mode=' + S.mode));
    const n = names();
    return h('div', { class: 'panel' }, h('h2', null, `Recent rounds (${S.mode === 'real' ? 'real SOL' : 'demo'})`),
      r && r.rounds.length ? h('table', { class: 'data' },
        h('tr', null, ['Time', 'Game', 'Wager', 'Payout', 'Net', 'Details'].map((x) => h('th', null, x))),
        r.rounds.map((x) => h('tr', null, h('td', null, new Date(x.t).toLocaleTimeString()), h('td', null, n[x.game] || x.game), h('td', null, C.fmt(x.wager)), h('td', null, C.fmt(x.payout)),
          h('td', { class: x.payout - x.wager >= 0 ? 'pos' : 'neg' }, (x.payout - x.wager >= 0 ? '+' : '') + C.fmt(x.payout - x.wager)), h('td', { class: 'muted' }, x.detail))))
        : h('p', { class: 'muted' }, 'No rounds played yet in this mode.'));
  }

  async function statsPage() {
    const r = await C.try(() => C.api('GET', '/api/stats?mode=' + S.mode));
    const n = names(), edges = Object.fromEntries(C.games.filter((g) => !g.statId).map((g) => [g.id, g.edge]));
    const rows = r ? r.games : [];
    const tot = rows.reduce((a, x) => ({ w: a.w + x.wagered, p: a.p + x.won, n: a.n + x.rounds }), { w: 0, p: 0, n: 0 });
    return h('div', { class: 'panel' }, h('h2', null, `Your statistics (${S.mode === 'real' ? 'real SOL' : 'demo'})`),
      h('div', { class: 'kpis' }, kpi('Balance', C.fmt(C.balance())), kpi('Rounds', tot.n), kpi('Total wagered', C.fmt(tot.w)), kpi('Total returned', C.fmt(tot.p)), kpi('Net result', C.fmt(tot.p - tot.w)), kpi('Your RTP', tot.w ? ((tot.p / tot.w) * 100).toFixed(2) + '%' : '—')),
      rows.length ? h('table', { class: 'data' }, h('tr', null, ['Game', 'Rounds', 'Wagered', 'Returned', 'Net', 'Your RTP', C.odds() ? 'House edge' : null].filter(Boolean).map((x) => h('th', null, x))),
        rows.map((x) => h('tr', null, h('td', null, n[x.game] || x.game), h('td', null, x.rounds), h('td', null, C.fmt(x.wagered)), h('td', null, C.fmt(x.won)), h('td', { class: x.won - x.wagered >= 0 ? 'pos' : 'neg' }, C.fmt(x.won - x.wagered)), h('td', null, x.wagered ? ((x.won / x.wagered) * 100).toFixed(2) + '%' : '—'), C.odds() ? h('td', null, edges[x.game] || '') : null)))
        : h('p', { class: 'muted' }, 'Play some games to see statistics.'));
  }
  const kpi = (l, v) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-v' }, String(v)), h('div', { class: 'kpi-l' }, l));

  function edgesPage() {
    return h('div', { class: 'panel' }, h('h2', null, 'House edge by game'),
      h('p', { class: 'muted' }, 'House edge = expected loss per unit wagered, computed from this casino\'s own payout tables (verified by exact enumeration or simulation).'),
      h('table', { class: 'data' }, h('tr', null, ['#', 'Game', 'House edge', 'Notes'].map((x) => h('th', null, x))),
        C.games.slice().sort((a, b) => a.n - b.n).map((g) => h('tr', null, h('td', null, g.n), h('td', null, h('a', { href: '#' + g.id }, g.icon + ' ' + g.name)), h('td', null, h('b', null, g.edge)), h('td', { class: 'muted' }, g.blurb)))));
  }

  async function route() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    pageListeners = [];
    const hash = location.hash.replace(/^#\/?/, '').replace(/^game\//, '');
    const a = app(); a.innerHTML = '';
    document.body.classList.remove('nav-open');
    const gm = C.games.find((x) => x.id === hash);
    const navKey = gm ? 'cat-' + gm.cat : hash || 'lobby';
    document.querySelectorAll('.nav-item, .bottom-nav a').forEach((x) => x.classList.toggle('active', x.getAttribute('href') === '#' + navKey || (navKey === '' && x.getAttribute('href') === '#lobby')));
    window.scrollTo(0, 0);
    document.title = 'Royal Edge Casino';
    if (hash.startsWith('ref-')) { try { localStorage.setItem('casino.ref', hash.slice(4).toUpperCase()); } catch (e) { /* ignore */ } location.hash = S.user ? '#referrals' : '#login'; if (!S.user) setTimeout(() => { const sw = document.querySelector('.auth a'); if (sw && /Create/.test(sw.textContent)) sw.click(); }, 50); return; }
    const needLogin = ['history', 'stats', 'wallet', 'admin', 'account', 'referrals'].includes(hash) || C.games.some((g) => g.id === hash);
    if (hash === 'login') return a.appendChild(authPage());
    if (hash === 'account' && S.user) return a.appendChild(accountPage());
    if (needLogin && !S.user) { location.hash = '#login'; return; }
    const g = C.games.find((x) => x.id === hash);
    if (g) { document.title = g.name + ' — Royal Edge Casino'; return a.appendChild(gamePage(g)); }
    const page = { history: historyPage, stats: statsPage, edges: C.odds() ? edgesPage : null, wallet: walletPage, admin: adminPage, referrals: referralsPage }[hash];
    if (page) { const el = await page(); if (location.hash.replace(/^#/, '') === hash) { a.innerHTML = ''; a.appendChild(el); } return; }
    const cat = hash.startsWith('cat-') ? hash.slice(4) : null;
    a.appendChild(lobby(['originals', 'table', 'poker', 'lottery'].includes(cat) ? cat : null));
  }
  C.route = route;

  function applyMe(r) {
    S.user = r.user || null; S.config = r.config || {};
    if (r.balances) S.units = r.balances;
    emit();
  }

  C.start = async () => {
    iconize();
    document.getElementById('burger').append(C.icon('menu'));
    document.getElementById('chev').append(C.icon('chev'));
    document.getElementById('burger').onclick = () => document.body.classList.toggle('nav-open');
    document.getElementById('scrim').onclick = () => document.body.classList.remove('nav-open');
    const balEl = document.getElementById('balance'), menu = document.getElementById('cur-menu'), ico = document.getElementById('cur-ico');
    const userBox = document.getElementById('userbox');
    document.getElementById('bal-btn').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('open'); };
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.classList.remove('open'); });
    let shown = null;
    const paint = () => {
      const v = C.balance(), real = S.mode === 'real';
      balEl.textContent = real ? C.fmtSol(C.solOf(v)) : C.fmt(v);
      ico.className = 'cur ' + (real ? 'sol' : 'demo'); ico.textContent = real ? '◎' : 'D';
      document.getElementById('amt-real').textContent = C.fmtSol(C.solOf(S.units.real / 100));
      document.getElementById('amt-demo').textContent = C.fmt(S.units.demo / 100);
      balEl.classList.remove('up', 'down'); void balEl.offsetWidth;
      if (shown != null && shown.mode === S.mode) { if (v > shown.v) balEl.classList.add('up'); else if (v < shown.v) balEl.classList.add('down'); }
      shown = { v, mode: S.mode };
      menu.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('sel', b.dataset.mode === S.mode));
      document.body.classList.toggle('real-mode', real);
      document.body.classList.toggle('no-odds', !C.odds());
      document.getElementById('walletbox').style.display = S.user ? '' : 'none';
      userBox.innerHTML = '';
      if (S.user) userBox.append(h('a', { class: 'avatar', href: '#account', title: S.user.username }, C.icon('user')));
      else userBox.append(h('a', { href: '#login', class: 'btn small outline' }, 'Sign in'), h('a', { href: '#login', class: 'btn small', onclick: () => setTimeout(() => { const sw = document.querySelector('.auth a'); if (sw && /Create/.test(sw.textContent)) sw.click(); }, 60) }, 'Register'));
      const adm = document.getElementById('nav-admin'); if (adm) adm.style.display = S.user && S.user.role === 'admin' ? '' : 'none';
    };
    C.onChange(paint);
    menu.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      menu.classList.remove('open');
      if (b.dataset.mode === S.mode) return;
      C.setMode(b.dataset.mode);
      C.toast(S.mode === 'real' ? 'Now playing with SOL' : 'Now playing with demo credits', S.mode === 'real' ? 'win' : '');
      const onGame = C.games.some((g) => '#' + g.id === location.hash);
      if (onGame || ['', '#', '#lobby', '#history', '#stats', '#wallet'].includes(location.hash)) route();
    }));
    document.getElementById('refill').onclick = async () => { menu.classList.remove('open'); const r = await C.try(() => C.api('POST', '/api/demo/refill')); if (r) { setUnits(r.balances); C.toast('+10,000 demo credits', 'win'); } };
    window.addEventListener('hashchange', route);
    const r = await C.try(() => C.api('GET', '/api/me'));
    if (r) applyMe(r); else paint();
    route();
  };
})();
