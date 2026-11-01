/* Core: wallet, persistence, UI helpers, router, lobby, history & stats. */
(function () {
  'use strict';
  const L = window.Lib;
  const C = (window.Casino = { games: [], L });
  const KEY = 'royal-edge-casino.v1';
  const START = 10000;
  const r2 = (x) => Math.round(x * 100) / 100;
  C.r2 = r2;

  /* ---------------- State & wallet ---------------- */
  const fresh = () => ({ balance: START, stats: {}, history: [], refills: 0, created: Date.now() });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
  const listeners = [];
  C.onChange = (f) => listeners.push(f);
  C.save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full / disabled */ } listeners.forEach((f) => f(S)); };
  C.balance = () => S.balance;
  const st = (id) => (S.stats[id] = S.stats[id] || { rounds: 0, wagered: 0, won: 0, biggest: 0 });

  /** Take a wager from the balance. Returns false (and toasts) if not possible. */
  C.bet = (id, amt) => {
    amt = r2(+amt);
    if (!(amt > 0) || !isFinite(amt)) { C.toast('Enter a valid bet amount', 'err'); return false; }
    if (amt > S.balance + 1e-9) { C.toast('Insufficient balance', 'err'); return false; }
    S.balance = r2(S.balance - amt);
    st(id).wagered = r2(st(id).wagered + amt);
    C.save();
    return true;
  };
  /** Credit a payout (total returned, including stake). */
  C.win = (id, amt) => {
    amt = L.round2(+amt);
    if (!(amt > 0)) return 0;
    S.balance = r2(S.balance + amt);
    const s = st(id);
    s.won = r2(s.won + amt);
    if (amt > s.biggest) s.biggest = amt;
    C.save();
    return amt;
  };
  /** Log a finished round in history. */
  C.record = (id, wager, payout, detail = '') => {
    st(id).rounds++;
    S.history.unshift({ t: Date.now(), g: id, w: r2(wager), p: r2(payout), d: detail });
    if (S.history.length > 300) S.history.length = 300;
    C.save();
  };
  C.refill = () => {
    if (S.balance >= 1000) { C.toast('Top-ups are available when your balance is below 1,000', 'err'); return; }
    S.balance = r2(S.balance + START); S.refills++; C.save();
    C.toast(`+${C.fmt(START)} play credits added`, 'win');
  };
  C.resetAll = () => { S = fresh(); C.save(); };

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
  C.fmtX = (m) => (m >= 100 ? (+m).toFixed(0) : (+m).toFixed(2)) + '×';
  C.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  C.toast = (msg, type = '') => {
    const t = h('div', { class: 'toast ' + type }, msg);
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2400);
    setTimeout(() => t.remove(), 2900);
  };

  /** Bet amount input with ½ / 2× / max controls. */
  C.betInput = (opts = {}) => {
    const input = h('input', { type: 'number', min: '0.01', step: '0.01', value: opts.value || 10, class: 'bet-amt' });
    const set = (v) => { input.value = r2(Math.max(0, v)); };
    const btn = (label, f) => h('button', { class: 'btn small ghost', type: 'button', onclick: () => { if (!input.disabled) f(); } }, label);
    const el = h('div', { class: 'bet-input' },
      h('label', null, opts.label || 'Bet'),
      h('div', { class: 'bet-row' }, input,
        btn('½', () => set(+input.value / 2)), btn('2×', () => set(+input.value * 2)),
        btn('Max', () => set(Math.floor(S.balance * 100) / 100))));
    return { el, input, get value() { return r2(+input.value); }, set, disable(d) { input.disabled = d; el.classList.toggle('disabled', d); } };
  };

  /** Generic labelled select. */
  C.select = (label, options, value, onchange) => {
    const s = h('select', { onchange: (e) => onchange && onchange(e.target.value) },
      options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) ? true : null }, t); }));
    return { el: h('div', { class: 'field' }, h('label', null, label), s), sel: s, get value() { return s.value; } };
  };

  /** Playing card element. */
  C.cardEl = (c, opts = {}) => {
    if (!c || opts.hidden) return h('div', { class: 'card back' + (opts.cls ? ' ' + opts.cls : '') });
    const red = c.s === 1 || c.s === 2;
    return h('div', { class: 'card' + (red ? ' red' : '') + (opts.cls ? ' ' + opts.cls : '') },
      h('span', { class: 'cr' }, L.RANK_STR[c.r]), h('span', { class: 'cs' }, L.SUITS[c.s]),
      h('span', { class: 'cbig' }, L.SUITS[c.s]));
  };

  /** Result message box. */
  C.msg = () => {
    const el = h('div', { class: 'msg' }, ' ');
    return { el, set(text, type = '') { el.className = 'msg ' + type; el.textContent = text; } };
  };

  /**
   * Chip-placement table used by roulette, sic bo, craps, baccarat, big six, dragon tiger.
   * Bets stay on the layout between rounds until cleared.
   */
  C.chipTable = (opts = {}) => {
    const T = { bets: {}, spots: {}, chip: opts.chip || 10, locked: false };
    const chips = opts.chips || [1, 5, 10, 25, 100, 500, 1000, 5000];
    const chipBtns = chips.map((v) => {
      const b = h('button', { class: 'chip c' + v + (v === T.chip ? ' sel' : ''), type: 'button', onclick: () => { T.chip = v; chipBtns.forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); } }, v >= 1000 ? v / 1000 + 'K' : String(v));
      return b;
    });
    const totalEl = h('span', { class: 'tot' }, '0.00');
    T.bar = h('div', { class: 'chipbar' }, h('div', { class: 'chips' }, chipBtns),
      h('div', { class: 'chip-actions' },
        h('span', { class: 'muted' }, 'Total bet: '), totalEl,
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => T.double() }, '2×'),
        h('button', { class: 'btn small ghost', type: 'button', onclick: () => T.clear() }, 'Clear')),
      h('div', { class: 'hint' }, 'Click a spot to place the selected chip. Right-click (or long-press) to remove.'));
    const paint = (id) => {
      const sp = T.spots[id]; if (!sp) return;
      const v = T.bets[id] || 0;
      sp.stack.textContent = v ? (v >= 1000 ? r2(v / 1000) + 'K' : r2(v)) : '';
      sp.stack.style.display = v ? '' : 'none';
    };
    T.total = () => r2(Object.values(T.bets).reduce((a, b) => a + b, 0));
    const upd = () => { totalEl.textContent = C.fmt(T.total()); Object.keys(T.spots).forEach(paint); if (opts.onChange) opts.onChange(); };
    T.add = (id, v) => {
      if (T.locked) return;
      if (T.total() + v > S.balance + 1e-9) { C.toast('Not enough balance for that chip', 'err'); return; }
      T.bets[id] = r2((T.bets[id] || 0) + v); upd();
    };
    T.remove = (id) => { if (T.locked || !T.bets[id]) return; T.bets[id] = r2(T.bets[id] - Math.min(T.bets[id], T.chip)); if (!T.bets[id]) delete T.bets[id]; upd(); };
    T.clear = () => { if (T.locked) return; T.bets = {}; upd(); T.mark([]); };
    T.double = () => { if (T.locked) return; if (T.total() * 2 > S.balance) { C.toast('Not enough balance to double', 'err'); return; } for (const k in T.bets) T.bets[k] = r2(T.bets[k] * 2); upd(); };
    T.spot = (id, content, cls = '', title = '') => {
      const stack = h('span', { class: 'stack', style: 'display:none' });
      const e = h('div', { class: 'spot ' + cls, title, 'data-id': id }, content, stack);
      e.addEventListener('click', () => T.add(id, T.chip));
      e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); T.remove(id); });
      let lp; e.addEventListener('touchstart', () => { lp = setTimeout(() => { T.remove(id); lp = 'done'; }, 550); }, { passive: true });
      e.addEventListener('touchend', () => clearTimeout(lp));
      T.spots[id] = { e, stack };
      paint(id);
      return e;
    };
    T.mark = (ids) => { for (const k in T.spots) T.spots[k].e.classList.toggle('win', ids.includes(k)); };
    T.lock = (b) => { T.locked = b; T.bar.classList.toggle('disabled', b); };
    /** Deduct total wager. */
    T.commit = (gameId) => { const t = T.total(); if (!t) { C.toast('Place a bet first', 'err'); return false; } return C.bet(gameId, t); };
    return T;
  };

  /* ---------------- Game registry & router ---------------- */
  C.CATS = { table: 'Table Games', cards: 'Card & Poker', dice: 'Dice & Wheels', lottery: 'Slots & Lottery', originals: 'Originals' };
  C.register = (g) => { C.games.push(g); };
  let cleanup = null;
  const app = () => document.getElementById('app');

  function lobby() {
    let filter = 'all', q = '';
    const grid = h('div', { class: 'grid' });
    const render = () => {
      grid.innerHTML = '';
      C.games.slice().sort((a, b) => a.n - b.n)
        .filter((g) => (filter === 'all' || g.cat === filter) && (!q || g.name.toLowerCase().includes(q)))
        .forEach((g) => grid.appendChild(h('a', { class: 'tile', href: '#/game/' + g.id },
          h('div', { class: 'tile-icon' }, g.icon),
          h('div', { class: 'tile-name' }, g.name),
          h('div', { class: 'tile-blurb' }, g.blurb),
          h('div', { class: 'tile-edge' }, 'House edge ', h('b', null, g.edge)),
          h('div', { class: 'tile-num' }, '#' + g.n))));
    };
    const tabs = h('div', { class: 'tabs' }, [['all', 'All Games'], ...Object.entries(C.CATS)].map(([k, v]) =>
      h('button', { class: 'tab' + (k === 'all' ? ' sel' : ''), onclick: (e) => { filter = k; tabs.querySelectorAll('.tab').forEach((t) => t.classList.remove('sel')); e.target.classList.add('sel'); render(); } }, v)));
    const search = h('input', { class: 'search', placeholder: 'Search games…', oninput: (e) => { q = e.target.value.toLowerCase(); render(); } });
    render();
    return h('div', { class: 'lobby' },
      h('section', { class: 'hero' }, h('h1', null, '30 games. One edge — ours.'),
        h('p', null, 'Every game uses a cryptographic RNG and publishes its exact payout table and house edge. Start with 10,000 free play credits.')),
      h('div', { class: 'lobby-bar' }, tabs, search), grid);
  }

  function gamePage(g) {
    const root = h('div', { class: 'game-root' });
    const info = h('details', { class: 'rules' }, h('summary', null, 'Rules, payouts & house edge'),
      h('div', { class: 'rules-body' },
        g.rules ? h('div', { html: g.rules }) : null,
        g.edges ? h('table', { class: 'edge-table' }, h('tr', null, h('th', null, 'Bet'), h('th', null, 'Pays'), h('th', null, 'House edge')),
          g.edges.map(([b, p, e]) => h('tr', null, h('td', null, b), h('td', null, p), h('td', null, e)))) : null));
    const page = h('div', { class: 'game-page' },
      h('div', { class: 'game-head' }, h('a', { href: '#/', class: 'btn small ghost' }, '← Lobby'),
        h('h2', null, g.icon + ' ' + g.name), h('span', { class: 'edge-pill' }, 'House edge ' + g.edge)),
      root, info);
    setTimeout(() => { cleanup = g.mount(root, g) || null; }, 0);
    return page;
  }

  function historyPage() {
    const names = Object.fromEntries(C.games.map((g) => [g.id, g.name]));
    return h('div', { class: 'panel' }, h('h2', null, 'Recent rounds'),
      S.history.length ? h('table', { class: 'data' },
        h('tr', null, ['Time', 'Game', 'Wager', 'Payout', 'Net', 'Details'].map((x) => h('th', null, x))),
        S.history.map((r) => h('tr', null, h('td', null, new Date(r.t).toLocaleTimeString()), h('td', null, names[r.g] || r.g),
          h('td', null, C.fmt(r.w)), h('td', null, C.fmt(r.p)),
          h('td', { class: r.p - r.w >= 0 ? 'pos' : 'neg' }, (r.p - r.w >= 0 ? '+' : '') + C.fmt(r.p - r.w)), h('td', { class: 'muted' }, r.d))))
        : h('p', { class: 'muted' }, 'No rounds played yet.'));
  }

  function statsPage() {
    const tot = { rounds: 0, wagered: 0, won: 0 };
    const rowsEl = C.games.slice().sort((a, b) => a.n - b.n).map((g) => {
      const s = S.stats[g.statId || g.id]; if (!s || g.statId) return null;
      tot.rounds += s.rounds; tot.wagered += s.wagered; tot.won += s.won;
      const rtp = s.wagered ? (s.won / s.wagered) * 100 : 0;
      return h('tr', null, h('td', null, g.icon + ' ' + g.name), h('td', null, s.rounds), h('td', null, C.fmt(s.wagered)), h('td', null, C.fmt(s.won)),
        h('td', { class: s.won - s.wagered >= 0 ? 'pos' : 'neg' }, C.fmt(s.won - s.wagered)), h('td', null, rtp.toFixed(2) + '%'), h('td', null, g.edge));
    }).filter(Boolean);
    return h('div', { class: 'panel' }, h('h2', null, 'Your statistics'),
      h('div', { class: 'kpis' },
        kpi('Balance', C.fmt(S.balance)), kpi('Total wagered', C.fmt(tot.wagered)), kpi('Total returned', C.fmt(tot.won)),
        kpi('Net result', C.fmt(tot.won - tot.wagered)), kpi('Your RTP', tot.wagered ? ((tot.won / tot.wagered) * 100).toFixed(2) + '%' : '—'), kpi('Free top-ups', S.refills)),
      rowsEl.length ? h('table', { class: 'data' }, h('tr', null, ['Game', 'Rounds', 'Wagered', 'Returned', 'Net', 'Your RTP', 'House edge'].map((x) => h('th', null, x))), rowsEl)
        : h('p', { class: 'muted' }, 'Play some games to see statistics.'),
      h('p', null, h('button', { class: 'btn danger', onclick: () => { if (confirm('Reset balance, history and stats?')) { C.resetAll(); route(); } } }, 'Reset account')));
  }
  const kpi = (l, v) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-v' }, String(v)), h('div', { class: 'kpi-l' }, l));

  function edgesPage() {
    return h('div', { class: 'panel' }, h('h2', null, 'House edge by game'),
      h('p', { class: 'muted' }, 'House edge = expected loss per unit wagered. Figures are computed from this casino\'s own payout tables (run "npm test" to re-verify by exact enumeration / simulation). Where a game has many bets, the range covers all of them.'),
      h('table', { class: 'data' }, h('tr', null, ['#', 'Game', 'House edge', 'Notes'].map((x) => h('th', null, x))),
        C.games.slice().sort((a, b) => a.n - b.n).map((g) => h('tr', null, h('td', null, g.n), h('td', null, h('a', { href: '#/game/' + g.id }, g.icon + ' ' + g.name)), h('td', null, h('b', null, g.edge)), h('td', { class: 'muted' }, g.blurb)))));
  }

  function route() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const hash = location.hash.replace(/^#\/?/, '');
    const a = app(); a.innerHTML = '';
    document.querySelectorAll('.topbar nav a').forEach((x) => x.classList.toggle('active', x.getAttribute('href') === '#/' + hash.split('/')[0] || (hash === '' && x.getAttribute('href') === '#/')));
    window.scrollTo(0, 0);
    if (hash.startsWith('game/')) {
      const g = C.games.find((x) => x.id === hash.slice(5));
      if (g) { document.title = g.name + ' — Royal Edge Casino'; return a.appendChild(gamePage(g)); }
    }
    document.title = 'Royal Edge Casino';
    if (hash === 'history') return a.appendChild(historyPage());
    if (hash === 'stats') return a.appendChild(statsPage());
    if (hash === 'edges') return a.appendChild(edgesPage());
    a.appendChild(lobby());
  }

  C.start = () => {
    const balEl = document.getElementById('balance');
    let shown = S.balance;
    const paint = () => { balEl.textContent = C.fmt(S.balance); balEl.classList.remove('up', 'down'); void balEl.offsetWidth; if (S.balance > shown) balEl.classList.add('up'); else if (S.balance < shown) balEl.classList.add('down'); shown = S.balance; };
    C.onChange(paint); paint();
    document.getElementById('refill').onclick = C.refill;
    window.addEventListener('hashchange', route);
    route();
  };
})();
