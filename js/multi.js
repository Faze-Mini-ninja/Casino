/* Multiplayer pages: PvP Arena (#pvp), Blackjack Duel (#bjduel-<id>), Live Blackjack tables (#tables, #table-<id>).
 * Everything is decided on the server (server/multi.js); these pages show it and update live over the event stream. */
(function () {
  'use strict';
  const C = Casino, h = C.h, S = C.S, L = window.Lib;
  const svg = (inner, cls = '') => h('span', { class: 'mp-glyph ' + cls, html: `<svg viewBox="0 0 64 64">${inner}</svg>` });
  const GLYPH = {
    coinflip: () => svg('<circle cx="32" cy="32" r="26" fill="#f5b72f" stroke="#a87400" stroke-width="4"/><circle cx="32" cy="32" r="18" fill="none" stroke="#fff3c4" stroke-width="2" opacity=".7"/><text x="32" y="41" text-anchor="middle" font-family="Lilita One,sans-serif" font-size="24" fill="#7a5200">K</text>'),
    dice: () => svg('<rect x="6" y="14" width="30" height="30" rx="7" fill="#fff" stroke="#c9d6e3" stroke-width="2" transform="rotate(-12 21 29)"/><g fill="#0b1622" transform="rotate(-12 21 29)"><circle cx="14" cy="22" r="3"/><circle cx="21" cy="29" r="3"/><circle cx="28" cy="36" r="3"/></g><rect x="28" y="22" width="30" height="30" rx="7" fill="#ff4d63" stroke="#b3122a" stroke-width="2" transform="rotate(10 43 37)"/><g fill="#fff" transform="rotate(10 43 37)"><circle cx="36" cy="30" r="3"/><circle cx="50" cy="30" r="3"/><circle cx="36" cy="44" r="3"/><circle cx="50" cy="44" r="3"/></g>'),
    rps: () => svg('<rect x="6" y="10" width="52" height="44" rx="10" fill="#22384e" stroke="#8197ad" stroke-width="2"/><text x="32" y="39" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="16" fill="#eaf0f7">RPS</text>'),
    bj: () => svg('<rect x="8" y="10" width="28" height="40" rx="5" fill="#fff" stroke="#c9d6e3" stroke-width="2" transform="rotate(-10 22 30)"/><text x="20" y="36" font-family="Georgia,serif" font-weight="700" font-size="16" fill="#0b1622" transform="rotate(-10 22 30)">A♠</text><rect x="26" y="14" width="28" height="40" rx="5" fill="#fff" stroke="#c9d6e3" stroke-width="2" transform="rotate(10 40 34)"/><text x="31" y="40" font-family="Georgia,serif" font-weight="700" font-size="16" fill="#d61f3a" transform="rotate(10 40 34)">K♥</text>'),
  };
  const GAMES = [['coinflip', 'Coin Flip', 'Call heads or tails. Your opponent gets the other side.'], ['dice', 'Dice Duel', 'Both roll 1–100. Higher roll wins.'],
    ['rps', 'Rock Paper Scissors', 'Pick in secret. Rock beats scissors, scissors beat paper, paper beats rock. Same hand = refund.'], ['bj', 'Blackjack Duel', 'Same shoe, one hand each. Hit or stand: closest to 21 wins. Blackjack beats 21. Both bust = refund.']];
  const RPS = { R: ['Rock', 'Rock'], P: ['Paper', 'Paper'], S: ['Scissors', 'Scissors'] };
  const money = (x, md) => (md === 'real' ? C.money(x) : C.fmt(x) + ' cr');
  const me = () => (S.user ? S.user.id : 0);
  const refreshBal = async () => { const r = await C.try(() => C.api('GET', '/api/me')); if (r && r.balances) C.setUnits(r.balances); };
  const alive = (el) => document.body.contains(el);
  const seg = (opts, val, onPick) => {
    const el = h('div', { class: 'seg mp-seg' });
    const paint = (v) => el.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === v));
    opts.forEach(([v, label]) => el.append(h('button', { type: 'button', class: 'segb', 'data-v': v, onclick: () => { paint(v); onPick(v); } }, label)));
    paint(val); return el;
  };
  const withLoader = (id, title, icon) => (C.loader ? C.loader({ id, title, sub: 'Multiplayer', icon }) : { ready() {}, close() {} });

  /* ---------- result animation (coin, dice, rock paper scissors) ---------- */
  function showResult(m, opts = {}) {
    const mine = m.creatorId === me() ? 'c' : 'j', won = m.winnerId === me(), tie = !m.winner;
    const stage = h('div', { class: 'mp-anim ' + m.game });
    const verdict = h('div', { class: 'mp-verdict' });
    const other = mine === 'c' ? m.joiner : m.creator;
    const body = h('div', { class: 'mp-result' }, h('div', { class: 'muted small' }, `${m.gameName} · stake ${money(m.stake, m.mode)} · vs ${other}`), stage, verdict,
      h('div', { class: 'row', style: 'justify-content:center;gap:10px' },
        h('button', { class: 'btn', onclick: () => { close(); if (opts.again) opts.again(); } }, 'Play again'), h('button', { class: 'btn ghost', onclick: () => close() }, 'Close')));
    const close = C.modal(m.gameName, body);
    const r = m.result;
    if (m.game === 'coinflip') {
      const mySide = mine === 'c' ? r.creatorSide : r.joinerSide;
      stage.append(h('div', { class: 'mp-coin spin-' + r.side }, h('div', { class: 'face h' }, 'H'), h('div', { class: 'face t' }, 'T')), h('div', { class: 'muted' }, `You had ${mySide === 'H' ? 'heads' : 'tails'}`));
      C.sfx && C.sfx('spin');
    } else if (m.game === 'dice') {
      const mineV = r[mine], theirs = r[mine === 'c' ? 'j' : 'c'];
      const a = h('b'), b = h('b');
      stage.append(h('div', { class: 'mp-rolls' }, h('div', null, h('span', { class: 'muted small' }, 'You'), a), h('div', { class: 'vs' }, 'vs'), h('div', null, h('span', { class: 'muted small' }, other), b)));
      const t0 = performance.now();
      const roll = () => { const k = Math.min(1, (performance.now() - t0) / 1300); a.textContent = k < 1 ? 1 + Math.floor(Math.random() * 100) : mineV; b.textContent = k < 1 ? 1 + Math.floor(Math.random() * 100) : theirs; if (k < 1 && alive(stage)) { C.sfx && Math.random() < 0.3 && C.sfx('tick'); requestAnimationFrame(roll); } };
      roll();
    } else if (m.game === 'rps') {
      const mineH = r[mine], theirs = r[mine === 'c' ? 'j' : 'c'];
      const a = h('div', { class: 'mp-hand shake' }, '?'), b = h('div', { class: 'mp-hand shake' }, '?');
      stage.append(h('div', { class: 'mp-rolls' }, h('div', null, h('span', { class: 'muted small' }, 'You'), a), h('div', { class: 'vs' }, 'vs'), h('div', null, h('span', { class: 'muted small' }, other), b)));
      setTimeout(() => { a.classList.remove('shake'); b.classList.remove('shake'); a.textContent = RPS[mineH][0]; b.textContent = RPS[theirs][0]; }, 1300);
    }
    const delay = m.game === 'coinflip' ? 1900 : 1400;
    setTimeout(() => {
      if (!alive(stage)) return;
      verdict.className = 'mp-verdict ' + (tie ? 'tie' : won ? 'win' : 'lose');
      verdict.textContent = tie ? `Tie: stake refunded (${r.text})` : won ? `You win ${money(m.prize, m.mode)}!` : `${m.winner} wins (${r.text})`;
      C.sfx && C.sfx(tie ? 'pop' : won ? 'win' : 'lose');
      refreshBal();
    }, delay);
  }

  /* ---------- notifications anywhere on the site ---------- */
  const handled = new Set(); // matches whose result this tab already showed
  C.onStream('pvp', (m) => {
    if (!S.user || (m.creatorId !== me() && m.joinerId !== me())) return;
    if (m.status === 'playing' && m.game === 'bj' && m.creatorId === me() && !handled.has('join' + m.id)) {
      handled.add('join' + m.id);
      C.toast(`${m.joiner} joined your Blackjack Duel`, 'win'); C.sfx && C.sfx('bet');
      if (!location.hash.startsWith('#bjduel-')) location.hash = '#bjduel-' + m.id;
    }
    if (m.status === 'done' && m.creatorId === me() && m.game !== 'bj' && !handled.has(m.id)) {
      handled.add(m.id);
      if (location.hash === '#pvp') showResult(m); else { C.toast(m.winnerId === me() ? `You won the ${m.gameName} vs ${m.joiner}: +${money(m.prize, m.mode)}` : !m.winner ? `${m.gameName} vs ${m.joiner}: tie, refunded` : `You lost the ${m.gameName} vs ${m.joiner}`, m.winnerId === me() ? 'win' : ''); refreshBal(); }
    }
  }, true);

  /* ======================= PvP Arena ======================= */
  let curGame = 'coinflip';
  try { curGame = sessionStorage.getItem('casino.pvp') || curGame; } catch (e) { /* ignore */ }
  C.page('pvp', async () => {
    const ld = withLoader('pvp', 'PvP Arena', 'users');
    const md = S.mode;
    const wrap = h('div', { class: 'mp wallet-page' });
    let data = await C.try(() => C.api('GET', '/api/pvp?mode=' + md));
    if (!data) { ld.close(); return wrap; }
    const rake = data.rakePct;
    const stake = C.betInput({ value: md === 'real' ? 5 : 100, label: 'Stake' });
    let choice = { coinflip: 'H', rps: 'R' };
    const choiceBox = h('div'), prizeLine = h('div', { class: 'muted small' });
    const paintPrize = () => { prizeLine.textContent = `Winner gets ${money(stake.value * 2 * (1 - rake / 100), md)} (both stakes minus ${rake}% house fee)`; };
    stake.input.addEventListener('input', paintPrize);
    const tabs = h('div', { class: 'mp-tabs' });
    const openBox = h('div', { class: 'mp-grid' }), mineBox = h('div'), recentBox = h('div');
    const desc = h('p', { class: 'muted' });
    const createBtn = h('button', { class: 'btn big', onclick: async () => {
      createBtn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/pvp/create', { game: curGame, mode: md, stake: stake.value, choice: choice[curGame] }));
      createBtn.disabled = false;
      if (r) { C.setUnits(r.balances); C.toast('Challenge created. Waiting for an opponent.', 'win'); C.sfx && C.sfx('bet'); reload(); }
    } }, 'Create challenge');

    const paintChoice = () => {
      choiceBox.innerHTML = '';
      if (curGame === 'coinflip') choiceBox.append(h('div', { class: 'field' }, h('label', null, 'Your side'), seg([['H', 'Heads'], ['T', 'Tails']], choice.coinflip, (v) => { choice.coinflip = v; })));
      if (curGame === 'rps') choiceBox.append(h('div', { class: 'field' }, h('label', null, 'Your hand (kept secret)'), seg(Object.entries(RPS).map(([k, v]) => [k, v[1]]), choice.rps, (v) => { choice.rps = v; })));
    };
    const card = (m) => {
      const mineM = m.creatorId === me();
      const joinBtn = h('button', { class: 'btn small', onclick: () => join(m) }, 'Join');
      return h('div', { class: 'mp-card' + (mineM ? ' mine' : '') },
        h('div', { class: 'mp-card-top' }, GLYPH[m.game](), h('div', null, h('b', null, m.creator), h('div', { class: 'muted small' }, m.gameName))),
        h('div', { class: 'mp-stake' }, money(m.stake, m.mode)),
        h('div', { class: 'muted small' }, m.game === 'coinflip' ? `They picked ${m.creatorChoice === 'H' ? 'heads' : 'tails'}, you get ${m.creatorChoice === 'H' ? 'tails' : 'heads'}` : m.game === 'rps' ? (mineM ? `Your hand: ${RPS[m.yourChoice] ? RPS[m.yourChoice][1] : '?'}` : 'Hand hidden') : `Prize ${money(m.prize, m.mode)}`),
        mineM ? h('button', { class: 'btn small ghost', onclick: async () => { const r = await C.try(() => C.api('POST', '/api/pvp/cancel', { id: m.id })); if (r) { C.setUnits(r.balances); reload(); } } }, 'Cancel') : joinBtn);
    };
    async function join(m) {
      let pick = null;
      if (m.game === 'rps') {
        pick = await new Promise((res) => {
          const body = h('div', { class: 'mp-pick' }, Object.entries(RPS).map(([k, v]) => h('button', { class: 'btn ghost big', onclick: () => { close(); res(k); } }, v[1])));
          const close = C.modal(`Your hand vs ${m.creator}`, body);
        });
      }
      handled.add(m.id);
      const r = await C.try(() => C.api('POST', '/api/pvp/join', { id: m.id, choice: pick }));
      if (!r) return reload();
      C.setUnits(r.balances);
      if (r.match.game === 'bj') { location.hash = '#bjduel-' + r.match.id; return; }
      showResult(r.match, { again: () => { curGame = m.game; reload(); } });
      reload();
    }
    function paint() {
      try { sessionStorage.setItem('casino.pvp', curGame); } catch (e) { /* ignore */ }
      tabs.innerHTML = '';
      GAMES.forEach(([id, name]) => {
        const n = data.open.filter((m) => m.game === id && m.creatorId !== me()).length;
        tabs.append(h('button', { class: 'mp-tab' + (id === curGame ? ' sel' : ''), onclick: () => { curGame = id; paint(); } }, GLYPH[id](), h('span', null, name), n ? h('i', { class: 'mp-count' }, n) : null));
      });
      desc.textContent = GAMES.find((g) => g[0] === curGame)[2];
      paintChoice(); paintPrize();
      openBox.innerHTML = '';
      const list = data.open.filter((m) => m.game === curGame);
      if (list.length) list.forEach((m) => openBox.append(card(m)));
      else openBox.append(h('div', { class: 'empty' }, 'No open challenges yet. Create one and wait for an opponent.'));
      mineBox.innerHTML = '';
      const live = data.mine.filter((m) => m.status === 'playing');
      if (live.length) mineBox.append(h('div', { class: 'panel' }, h('h3', null, 'Your duels in progress'), live.map((m) => h('a', { class: 'mp-live', href: '#bjduel-' + m.id }, GLYPH[m.game](), `${m.gameName} vs ${m.creatorId === me() ? m.joiner : m.creator} · ${money(m.stake, m.mode)}`, h('span', { class: 'btn small' }, 'Open')))));
      recentBox.innerHTML = '';
      recentBox.append(h('div', { class: 'panel' }, h('h3', null, 'Recent results'), data.recent.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' },
        h('tr', null, ['Game', 'Players', 'Stake', 'Result', 'Winner'].map((x) => h('th', null, x))),
        data.recent.map((m) => h('tr', null, h('td', null, m.gameName), h('td', null, `${m.creator} vs ${m.joiner}`), h('td', null, money(m.stake, m.mode)), h('td', { class: 'muted' }, m.result ? m.result.text : ''), h('td', null, m.winner ? h('b', { class: 'pos' }, m.winner) : h('span', { class: 'muted' }, 'tie')))))) : h('p', { class: 'muted' }, 'No finished matches yet.')));
    }
    async function reload() { const d = await C.try(() => C.api('GET', '/api/pvp?mode=' + md)); if (d) { data = d; paint(); } }
    let t; C.onStream('pvp', (m) => { if (m.mode === md) { clearTimeout(t); t = setTimeout(reload, 150); } });
    wrap.append(
      h('div', { class: 'mp-hero pvp' }, h('div', null, h('div', { class: 'kicker' }, md === 'real' ? 'Real money' : 'Demo credits'), h('h2', null, 'PvP Arena'),
        h('p', null, `Play other players head to head. Winner takes both stakes minus a ${rake}% house fee; ties are refunded.`)), h('div', { class: 'mp-hero-art' }, GLYPH.coinflip(), GLYPH.dice(), GLYPH.bj())),
      tabs,
      h('div', { class: 'mp-cols' },
        h('div', { class: 'panel mp-create' }, h('h3', null, 'New challenge'), desc, stake.el, choiceBox, prizeLine, createBtn),
        h('div', { class: 'panel' }, h('h3', null, 'Open challenges'), openBox)),
      mineBox, recentBox);
    paint();
    ld.ready(wrap);
    return wrap;
  }, { auth: true });

  /* ======================= Blackjack Duel ======================= */
  C.page('bjduel', async (sub) => {
    const id = +sub;
    const ld = withLoader('duel', 'Blackjack Duel', 'cards');
    const wrap = h('div', { class: 'mp wallet-page' });
    let skew = 0, m = null, finishedShown = false;
    const youBox = h('div', { class: 'duel-side you' }), themBox = h('div', { class: 'duel-side them' }), msg = h('div', { class: 'mp-verdict' });
    const hit = h('button', { class: 'btn green big', onclick: () => act('hit') }, 'Hit'), stand = h('button', { class: 'btn red big', onclick: () => act('stand') }, 'Stand');
    const controls = h('div', { class: 'controls' }, hit, stand);
    const timer = h('div', { class: 'mp-timer' }, h('i'));
    const head = h('div', { class: 'muted small' });
    async function load() { const r = await C.try(() => C.api('GET', '/api/pvp/match?id=' + id)); if (r) { m = r.match; skew = (m.now || Date.now()) - Date.now(); paint(); } return r; }
    async function act(a) {
      hit.disabled = stand.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/pvp/act', { id, action: a }));
      if (r) { m = r.match; C.sfx && C.sfx(a === 'hit' ? 'card' : 'bet'); paint(); }
      hit.disabled = stand.disabled = false;
    }
    const total = (cards) => L.bjValue(cards).total;
    function hand(box, title, cards, hiddenCount, t, done) {
      box.innerHTML = '';
      box.append(h('div', { class: 'hand-label' }, title, t != null ? h('span', { class: 'tag' }, t) : null, done ? h('span', { class: 'tag' }, t > 21 ? 'bust' : 'done') : h('span', { class: 'tag live' }, 'playing')),
        h('div', { class: 'cards' }, cards.map((c) => C.cardEl(c)), Array.from({ length: hiddenCount }, () => C.cardEl(null, { hidden: true }))));
    }
    function paint() {
      if (!m) return;
      const mine = m.creatorId === me() ? 'c' : m.joinerId === me() ? 'j' : null, theirs = mine === 'c' ? 'j' : 'c';
      const other = mine === 'c' ? m.joiner : m.creator;
      head.textContent = `Stake ${money(m.stake, m.mode)} each · winner gets ${money(m.prize, m.mode)}`;
      if (m.status === 'done') {
        const r = m.result;
        hand(youBox, 'You', r[mine] || [], 0, mine ? total(r[mine]) : null, true);
        hand(themBox, other || '', r[theirs] || [], 0, total(r[theirs] || []), true);
        controls.style.display = 'none'; timer.style.display = 'none';
        const won = m.winnerId === me();
        msg.className = 'mp-verdict ' + (!m.winner ? 'tie' : won ? 'win' : 'lose');
        msg.textContent = !m.winner ? `Tie: stakes refunded (${r.text})` : won ? `You win ${money(m.prize, m.mode)}! (${r.text})` : `${m.winner} wins (${r.text})`;
        if (!finishedShown) { finishedShown = true; C.sfx && C.sfx(!m.winner ? 'pop' : won ? 'win' : 'lose'); refreshBal(); }
        return;
      }
      if (m.status !== 'playing' || !m.you) { msg.textContent = m.status === 'open' ? 'Waiting for an opponent to join…' : 'This duel is not available.'; controls.style.display = 'none'; return; }
      const oppo = m.duel[theirs === 'c' ? 0 : 1];
      hand(youBox, 'You', m.you.cards, 0, m.you.total, m.you.done);
      hand(themBox, other, oppo.shown, oppo.count - oppo.shown.length, null, oppo.done);
      controls.style.display = m.you.done ? 'none' : '';
      msg.className = 'mp-verdict'; msg.textContent = m.you.done ? (oppo.done ? 'Revealing…' : `Waiting for ${other}…`) : 'Your move: hit or stand';
      timer.style.display = '';
    }
    const tickT = setInterval(() => {
      if (!alive(wrap)) return clearInterval(tickT);
      if (!m || m.status !== 'playing' || !m.you) return;
      const mine = m.creatorId === me() ? 'c' : 'j';
      const dl = m.you.done ? m.duel[mine === 'c' ? 1 : 0].deadline : m.you.deadline;
      const left = Math.max(0, dl - (Date.now() + skew)) / ((m.moveSecs || 30) * 1000);
      timer.firstChild.style.width = (Math.min(1, left) * 100).toFixed(1) + '%';
      timer.classList.toggle('low', left < 0.3);
    }, 200);
    C.onStream('pvp', (e) => { if (e.id === id) load(); });
    const r = await load();
    if (!r) { ld.close(); return wrap; }
    wrap.append(h('a', { class: 'back-link', href: '#pvp' }, '← PvP Arena'),
      h('div', { class: 'mp-hero bjduel' }, h('div', null, h('div', { class: 'kicker' }, m.mode === 'real' ? 'Real money' : 'Demo credits'), h('h2', null, 'Blackjack Duel'), head), h('div', { class: 'mp-hero-art' }, GLYPH.bj())),
      h('div', { class: 'felt duel-felt' }, themBox, h('div', { class: 'duel-vs' }, 'VS'), youBox), timer, msg, controls,
      h('p', { class: 'muted small center' }, 'Closest to 21 wins. A two-card blackjack beats any other 21. If you take no action for 30 seconds you stand automatically.'));
    ld.ready(wrap);
    return wrap;
  }, { auth: true });

  /* ======================= Live Blackjack: table list ======================= */
  C.page('tables', async () => {
    const ld = withLoader('tables', 'Live Blackjack', 'cards');
    const md = S.mode;
    const r = await C.try(() => C.api('GET', '/api/bjt'));
    const wrap = h('div', { class: 'mp wallet-page' });
    if (!r) { ld.close(); return wrap; }
    wrap.append(h('div', { class: 'mp-hero bjt' }, h('div', null, h('div', { class: 'kicker' }, md === 'real' ? 'Real money' : 'Demo credits'), h('h2', null, 'Live Blackjack'),
      h('p', null, `Up to 5 players against one dealer. Betting closes ${r.betSecs}s after the first bet; ${r.turnSecs}s per turn. Blackjack pays 3:2, dealer stands on 17, double on any first two cards.`)), h('div', { class: 'mp-hero-art' }, GLYPH.bj())),
    h('div', { class: 'mp-grid tables' }, r.tables.filter((t) => t.mode === md).map((t) => h('a', { class: 'mp-table-card', href: '#table-' + t.id },
      h('div', { class: 'mp-table-felt' }, Array.from({ length: t.seats }, (_, i) => h('i', { class: i < t.players ? 'on' : '' }))),
      h('b', null, t.name), h('div', { class: 'muted small' }, `Bets ${money(t.min, md)} – ${money(t.max, md)}`), h('div', { class: 'small' }, `${t.players}/${t.seats} players`), h('span', { class: 'btn small' }, t.players < t.seats ? 'Take a seat' : 'Watch')))));
    ld.ready(wrap);
    return wrap;
  }, { auth: true });

  /* ======================= Live Blackjack: a table ======================= */
  C.page('table', async (sub) => {
    const tid = sub;
    const ld = withLoader('table', 'Live Blackjack', 'cards');
    const wrap = h('div', { class: 'mp wallet-page' });
    let t = null, skew = 0, lastResultHand = 0, lastCards = 0;
    const dealerBox = h('div', { class: 'bjt-dealer' }), seatsBox = h('div', { class: 'bjt-seats' }), status = h('div', { class: 'bjt-status' }), controls = h('div', { class: 'bjt-controls' });
    const bet = C.betInput({ value: 10, label: 'Your bet' });
    const myIdx = () => (t ? t.seats.findIndex((s) => s && s.userId === me()) : -1);
    const srvNow = () => Date.now() + skew;
    async function call(path, body) { const r = await C.try(() => C.api('POST', path, { id: tid, ...body })); if (r) { if (r.balances) C.setUnits(r.balances); if (r.table) apply(r.table); } return r; }
    function apply(view) {
      t = view; skew = (view.now || Date.now()) - Date.now();
      const cards = (t.dealer || []).length + t.seats.reduce((s, x) => s + (x ? x.cards.length : 0), 0);
      if (cards > lastCards) C.sfx && C.sfx('card');
      lastCards = cards;
      const i = myIdx();
      if (t.phase === 'settled' && i >= 0 && t.seats[i].result && lastResultHand !== t.hand) {
        lastResultHand = t.hand; const s = t.seats[i];
        C.sfx && C.sfx(s.payout > s.bet ? 'win' : s.payout === s.bet ? 'pop' : 'lose'); refreshBal();
      }
      paint();
    }
    function seatEl(s, i) {
      const turn = t.phase === 'playing' && t.turn === i;
      if (!s) return h('div', { class: 'bjt-seat empty' }, h('div', { class: 'bjt-seat-n' }, `Seat ${i + 1}`), myIdx() < 0 ? h('button', { class: 'btn small', onclick: () => call('/api/bjt/sit', { seat: i }) }, 'Sit here') : h('span', { class: 'muted small' }, 'Empty'));
      return h('div', { class: 'bjt-seat' + (s.userId === me() ? ' me' : '') + (turn ? ' turn' : '') + (s.result ? ' r-' + (s.payout > s.bet ? 'win' : s.payout === s.bet && s.bet ? 'push' : 'lose') : '') },
        h('div', { class: 'cards' }, s.cards.map((c) => C.cardEl(c))),
        s.total != null ? h('div', { class: 'bjt-total' }, (s.soft && s.total < 21 ? 'soft ' : '') + s.total) : null,
        s.result ? h('div', { class: 'bjt-result' }, s.result, s.payout ? ` +${money(s.payout, t.mode)}` : '') : null,
        h('div', { class: 'bjt-chip' + (s.bet ? '' : ' none') }, s.bet ? money(s.bet, t.mode) : (t.phase === 'betting' ? 'betting…' : 'sitting out')),
        h('div', { class: 'bjt-name' }, s.name, s.leaving ? ' (leaving)' : ''),
        turn ? h('div', { class: 'mp-timer small' }, h('i', { 'data-deadline': t.deadline })) : null);
    }
    function paint() {
      if (!t) return;
      dealerBox.innerHTML = '';
      dealerBox.append(h('div', { class: 'hand-label' }, 'Dealer', t.dealerTotal != null ? h('span', { class: 'tag' }, t.dealerTotal) : null), h('div', { class: 'cards' }, t.dealer.map((c) => (c ? C.cardEl(c) : C.cardEl(null, { hidden: true })))));
      seatsBox.innerHTML = ''; t.seats.forEach((s, i) => seatsBox.append(seatEl(s, i)));
      const i = myIdx(), mine = i >= 0 ? t.seats[i] : null;
      controls.innerHTML = '';
      if (!mine) controls.append(h('p', { class: 'muted' }, t.seats.some((s) => !s) ? 'Pick an empty seat to join the table.' : 'The table is full, but you can watch.'));
      else if (t.phase === 'betting' && !mine.bet) {
        bet.input.min = t.min; bet.input.max = t.max;
        controls.append(bet.el, h('div', { class: 'row' }, [t.min, t.min * 5, t.min * 25].filter((v) => v <= t.max).map((v) => h('button', { class: 'btn small ghost', onclick: () => bet.set(v) }, money(v, t.mode)))),
          h('button', { class: 'btn big', onclick: () => call('/api/bjt/bet', { amount: bet.value }).then((r) => r && C.sfx && C.sfx('bet')) }, 'Place bet'));
      } else if (t.phase === 'playing' && t.turn === i) {
        controls.append(h('div', { class: 'controls' },
          h('button', { class: 'btn green big', onclick: () => call('/api/bjt/act', { action: 'hit' }) }, 'Hit'),
          h('button', { class: 'btn red big', onclick: () => call('/api/bjt/act', { action: 'stand' }) }, 'Stand'),
          mine.cards.length === 2 ? h('button', { class: 'btn blue big', onclick: () => call('/api/bjt/act', { action: 'double' }) }, 'Double') : null));
      } else controls.append(h('p', { class: 'muted' }, t.phase === 'settled' ? 'Hand over. The next hand starts in a moment.' : mine.bet ? (t.phase === 'betting' ? 'Your bet is in. Waiting for the others.' : 'Waiting for your turn…') : 'Sitting out this hand. You can bet when the next one opens.'));
      if (mine) controls.append(h('button', { class: 'btn small ghost', onclick: () => call('/api/bjt/leave', {}).then((r) => r && C.toast('You left the table')) }, 'Leave table'));
      paintStatus();
    }
    function paintStatus() {
      if (!t) return;
      const left = Math.max(0, Math.ceil((t.deadline - srvNow()) / 1000));
      const who = t.turn >= 0 && t.seats[t.turn] ? (t.seats[t.turn].userId === me() ? 'Your' : t.seats[t.turn].name + "'s") : '';
      status.textContent = t.phase === 'betting' ? (t.deadline ? `Place your bets. Dealing in ${left}s` : 'Place a bet to start the next hand')
        : t.phase === 'playing' ? `${who} turn (${left}s)` : t.phase === 'settled' ? `Next hand in ${left}s` : 'Dealer plays';
      status.classList.toggle('mine', t.phase === 'playing' && t.seats[t.turn] && t.seats[t.turn].userId === me());
      wrap.querySelectorAll('[data-deadline]').forEach((el) => { const l = Math.max(0, +el.dataset.deadline - srvNow()) / ((window.__bjtTurn || 20) * 1000); el.style.width = (Math.min(1, l) * 100).toFixed(1) + '%'; el.parentNode.classList.toggle('low', l < 0.3); });
    }
    const tickT = setInterval(() => { if (!alive(wrap)) return clearInterval(tickT); paintStatus(); }, 250);
    C.onStream('bjt', (v) => { if (v.id === tid) apply(v); });
    const r = await C.try(() => C.api('GET', '/api/bjt/table?id=' + encodeURIComponent(tid)));
    if (!r) { ld.close(); return wrap; }
    apply(r.table);
    C.api('GET', '/api/bjt').then((x) => { window.__bjtTurn = x.turnSecs; }).catch(() => {});
    wrap.append(h('a', { class: 'back-link', href: '#tables' }, '← All tables'),
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:baseline' }, h('h2', { style: 'margin:0' }, t.name), h('span', { class: 'muted' }, `${money(t.min, t.mode)} – ${money(t.max, t.mode)} · ${t.mode === 'real' ? 'Real money' : 'Demo'}`)),
      h('div', { class: 'felt bjt-felt' }, h('div', { class: 'bjt-arc' }, 'BLACKJACK PAYS 3 TO 2 · DEALER STANDS ON ALL 17s'), dealerBox, status, seatsBox), controls);
    ld.ready(wrap);
    return wrap;
  }, { auth: true });

  /* ---------- lobby entry ---------- */
  C.mpStrip = () => h('div', { class: 'mp-strip' },
    h('a', { class: 'mp-entry pvp', href: '#pvp' }, h('div', { class: 'mp-entry-art' }, GLYPH.coinflip(), GLYPH.dice()), h('div', null, h('div', { class: 'kicker' }, 'New · Multiplayer'), h('b', null, 'PvP Arena'), h('span', null, 'Coin flip, dice, rock paper scissors and blackjack duels against other players.'))),
    h('a', { class: 'mp-entry bjt', href: '#tables' }, h('div', { class: 'mp-entry-art' }, GLYPH.bj()), h('div', null, h('div', { class: 'kicker' }, 'New · Live table'), h('b', null, 'Live Blackjack'), h('span', null, 'Sit with up to 4 other players against the dealer.'))));
})();
