/* Staff Panel. Tabs are shown by role: mod < staff < admin. The server enforces the same rules. */
(function () {
  'use strict';
  const C = Casino, h = C.h, S = C.S;
  const TABS = [
    ['dash', 'Dashboard', 'chart', 'mod'], ['players', 'Players', 'users', 'staff'], ['live', 'Live', 'live', 'mod'],
    ['games', 'Games & odds', 'sliders', 'admin'], ['support', 'Support', 'ticket2', 'mod'], ['chat', 'Chat', 'chat', 'mod'],
    ['announce', 'Announcement', 'mega', 'staff'], ['withdrawals', 'Withdrawals', 'wallet', 'admin'], ['compliance', 'Compliance', 'shield', 'admin'], ['treasury', 'Treasury', 'shield', 'admin'], ['log', 'Log', 'clock', 'admin'],
  ];
  const ROLE_LABEL = { player: 'Player', mod: 'Mod', staff: 'Staff', admin: 'Admin' };
  const gname = (id) => { const g = C.games.find((x) => x.id === id) || C.games.find((x) => (x.statId || x.round) === id); return g ? (g.short || g.name) : id; };
  const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? `${Math.floor(s)}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : new Date(t).toLocaleDateString(); };
  const roleBadge = (r) => (r && r !== 'player' ? h('span', { class: 'badge-r ' + r }, ROLE_LABEL[r]) : null);
  const tbl = (cols, rows, empty = 'Nothing here yet.') => (rows.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, cols.map((c) => h('th', null, c)))), h('tbody', null, rows))) : h('p', { class: 'muted' }, empty));
  const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
  const pct = (x) => (x == null ? '—' : (x * 100).toFixed(2) + '%');
  const alive = (el) => document.body.contains(el);

  C.page('admin', async (sub) => {
    const [tab, arg] = (() => { const m = /^(player|ticket)-(\d+)$/.exec(sub || ''); return m ? [m[1] === 'player' ? 'players' : 'support', +m[2]] : [sub || 'dash', null]; })();
    const tabs = TABS.filter((t) => C.can(t[3]));
    const cur = tabs.find((t) => t[0] === tab) ? tab : tabs[0][0];
    const body = h('div', { class: 'staff-body' });
    const nav = h('div', { class: 'staff-tabs' }, tabs.map(([k, label, icon]) => h('a', { class: 'stab' + (k === cur ? ' sel' : ''), href: '#admin-' + k }, C.icon(icon), label, h('span', { class: 'sbadge', 'data-badge': k }))));
    const page = h('div', { class: 'staff' },
      h('div', { class: 'staff-head' }, h('div', null, h('h2', null, 'Staff Panel'), h('div', { class: 'muted small' }, 'Signed in as ', h('b', null, S.user.username), ' ', roleBadge(S.user.role))), nav), body);
    const views = { dash, players, live, games, support, chat, announce, withdrawals, compliance, treasury, log };
    body.append(await views[cur](arg));
    badges(nav);
    return page;
  }, { auth: true, role: 'mod' });

  async function badges(nav) {
    const d = await C.try(() => C.api('GET', '/api/admin/dash')); if (!d) return;
    const set = (k, n) => { const b = nav.querySelector(`[data-badge="${k}"]`); if (b) { b.textContent = n || ''; b.style.display = n ? '' : 'none'; } };
    set('support', d.openTickets); set('withdrawals', d.pendingWithdrawals); set('compliance', d.openFlags);
  }

  /* ---------------- Dashboard ---------------- */
  async function dash() {
    const wrap = h('div', { class: 'wallet-page' });
    const paint = async () => {
      const d = await C.try(() => C.api('GET', '/api/admin/dash')); if (!d) return;
      wrap.innerHTML = '';
      wrap.append(
        h('div', { class: 'kpis' },
          C.kpi('Online now', `${d.online.total}`, 'accent'), C.kpi('Signed-in players online', d.online.users), C.kpi('Real GGR (24h)', C.money(d.real.ggrUsd), d.real.ggrUsd >= 0 ? 'good' : 'bad'),
          C.kpi('Real wagered (24h)', C.money(d.real.wageredUsd)), C.kpi('Real bets (24h)', d.real.bets.toLocaleString()), C.kpi('Demo bets (24h)', d.demo.bets.toLocaleString()),
          C.kpi('Deposits credited (24h)', C.money(d.depositsUsd)), C.kpi('Deposit fees (24h)', C.money(d.depositFeesUsd || 0), 'good'), C.kpi('Games in progress', d.activeRounds), C.kpi('New players (24h)', d.newUsers), C.kpi('Players total', d.users),
          C.kpi('Open tickets', d.openTickets, d.openTickets ? 'warn' : ''), C.kpi('Withdrawals to review', d.pendingWithdrawals, d.pendingWithdrawals ? 'warn' : ''), C.kpi('Compliance flags', d.openFlags, d.openFlags ? 'warn' : '')),
        h('div', { class: 'panel' }, h('h3', null, 'Most played (24h)'), tbl(['Game', 'Bets', 'Wagered (credits)'], d.topGames.map((g) => h('tr', null, h('td', null, gname(g.game)), h('td', null, g.bets), h('td', null, C.fmt(g.wagered)))), 'No bets in the last 24 hours.')));
    };
    await paint();
    const t = setInterval(() => (alive(wrap) ? paint() : clearInterval(t)), 15000);
    return wrap;
  }

  /* ---------------- Players ---------------- */
  async function players(id) {
    if (id) return profile(id);
    const wrap = h('div', { class: 'wallet-page' });
    const search = h('input', { placeholder: 'Search by username…', class: 'grow' });
    const role = h('select', null, h('option', { value: '' }, 'All roles'), ...['player', 'mod', 'staff', 'admin'].map((r) => h('option', { value: r }, ROLE_LABEL[r])));
    const list = h('div');
    const load = async () => {
      const r = await C.try(() => C.api('GET', '/api/admin/users?q=' + encodeURIComponent(search.value.trim()))); if (!r) return;
      const users = r.users.filter((u) => !role.value || u.role === role.value);
      list.innerHTML = '';
      list.append(tbl(['Player', 'Real balance', 'Demo', 'Deposited', 'Status', 'Joined', ''], users.map((u) => h('tr', { class: 'click' + (u.disabled ? ' off' : ''), onclick: () => { location.hash = '#admin-player-' + u.id; } },
        h('td', null, h('b', null, u.username), ' ', roleBadge(u.role)), h('td', null, C.money(u.real)), h('td', null, C.fmt(u.demo)), h('td', null, u.deposited ? C.money(u.deposited) : '—'),
        h('td', null, u.disabled ? h('span', { class: 'tag-s failed' }, 'Disabled') : u.muted ? h('span', { class: 'tag-s pending' }, 'Muted') : h('span', { class: 'muted' }, 'Active')),
        h('td', { class: 'muted' }, new Date(u.created).toLocaleDateString()), h('td', null, h('span', { class: 'btn small ghost' }, 'View')))), 'No players match.'));
    };
    let t; search.oninput = () => { clearTimeout(t); t = setTimeout(load, 250); }; role.onchange = load;
    if (C.can('admin')) wrap.append(createPanel(load));
    wrap.append(h('div', { class: 'panel' }, h('div', { class: 'row', style: 'margin-bottom:12px' }, search, role), list));
    await load();
    return wrap;
  }
  function createPanel(onDone) {
    const nu = h('input', { placeholder: 'Username' }), np = h('input', { placeholder: 'Password (8+)', autocomplete: 'off' });
    const nd = h('input', { type: 'number', min: '0', step: '0.01', value: '1000' }), nr = h('input', { type: 'number', min: '0', step: '0.01', value: '0' });
    const btn = h('button', { class: 'btn', onclick: async () => {
      btn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/admin/users/create', { username: nu.value.trim(), password: np.value, demo: +nd.value, real: +nr.value }));
      btn.disabled = false; if (r) { C.toast(`Account ${nu.value.trim()} created`, 'win'); nu.value = np.value = ''; onDone(); }
    } }, 'Create account');
    return h('details', { class: 'panel' }, h('summary', null, h('b', null, 'Create an account')),
      h('div', { class: 'ed-grid c4' }, h('div', { class: 'field' }, h('label', null, 'Username'), nu), h('div', { class: 'field' }, h('label', null, 'Password'), np),
        h('div', { class: 'field' }, h('label', null, 'Demo credits'), nd), h('div', { class: 'field' }, h('label', null, 'Real credits'), nr)), btn);
  }

  async function profile(id) {
    const r = await C.try(() => C.api('GET', '/api/admin/user?id=' + id));
    if (!r) return h('div');
    const u = r.user, t = r.totals, me = S.user.id === u.id;
    const reload = () => C.route();
    const actions = h('div', { class: 'panel pactions' });
    if (C.can('admin')) {
      const mode = h('select', null, h('option', { value: 'real' }, 'Real balance ($)'), h('option', { value: 'demo' }, 'Demo balance'));
      const amt = h('input', { type: 'number', step: '0.01', placeholder: 'Amount in credits' });
      const note = h('input', { placeholder: 'Reason (saved in the log)' });
      const hint = h('div', { class: 'sol-hint' });
      const upd = () => { hint.textContent = mode.value === 'real' && +amt.value ? `= ${C.money(Math.abs(+amt.value))}` : ''; }; amt.oninput = upd; mode.onchange = upd;
      const adjust = async (sign) => {
        const a = Math.abs(+amt.value); if (!a) return C.toast('Enter an amount', 'err');
        const res = await C.try(() => C.api('POST', '/api/admin/users/adjust', { id: u.id, mode: mode.value, amount: sign * a, note: note.value }));
        if (res) { C.toast(`${sign > 0 ? 'Added' : 'Removed'} ${C.fmt(a)} credits`, 'win'); if (me) C.setUnits(res.balances); reload(); }
      };
      const setRole = async (role) => { if (await C.try(() => C.api('POST', '/api/admin/users/role', { id: u.id, role }))) { C.toast(`${u.username} is now ${ROLE_LABEL[role]}`, 'win'); reload(); } };
      const pw = h('input', { placeholder: 'New password (8+)', autocomplete: 'off' });
      actions.append(
        h('h3', null, 'Balance'), h('div', { class: 'ed-grid' }, h('div', { class: 'field' }, h('label', null, 'Wallet'), mode), h('div', { class: 'field' }, h('label', null, 'Amount'), amt, hint), h('div', { class: 'field' }, h('label', null, 'Reason'), note)),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => adjust(1) }, 'Add balance'), h('button', { class: 'btn red', onclick: () => adjust(-1) }, 'Remove balance')),
        h('h3', null, 'Role'),
        u.role === 'admin' ? h('p', { class: 'muted small' }, 'Admins are set with ADMIN_USERNAME in the server settings.')
          : h('div', { class: 'seg' }, ['player', 'mod', 'staff'].map((rl) => h('button', { class: 'segb' + (u.role === rl ? ' sel' : ''), disabled: me || u.role === rl ? true : null, onclick: () => setRole(rl) }, rl === 'player' ? 'Player' : 'Make ' + ROLE_LABEL[rl]))),
        h('h3', null, 'Account'),
        h('div', { class: 'row' }, pw, h('button', { class: 'btn small ghost', onclick: async () => { if (await C.try(() => C.api('POST', '/api/admin/users/password', { id: u.id, password: pw.value }))) { C.toast('Password reset. They have been signed out everywhere.', 'win'); pw.value = ''; } } }, 'Reset password'),
          me ? null : h('button', { class: 'btn small ' + (u.disabled ? '' : 'red'), onclick: async () => { if (await C.try(() => C.api('POST', '/api/admin/users/disable', { id: u.id, disabled: !u.disabled }))) reload(); } }, u.disabled ? 'Enable account' : 'Disable account')));
    }
    if (!me && u.role !== 'admin') {
      const mute = async (minutes) => { if (await C.try(() => C.api('POST', '/api/mod/mute', { userId: u.id, minutes }))) { C.toast(minutes ? 'Muted' : 'Unmuted', 'win'); reload(); } };
      actions.append(h('h3', null, 'Chat'), h('div', { class: 'row' },
        u.mutedUntil > Date.now() ? h('span', { class: 'tag-s pending' }, 'Muted until ' + new Date(u.mutedUntil).toLocaleString()) : null,
        h('button', { class: 'btn small ghost', onclick: () => mute(10) }, 'Mute 10m'), h('button', { class: 'btn small ghost', onclick: () => mute(60) }, 'Mute 1h'),
        h('button', { class: 'btn small ghost', onclick: () => mute(1440) }, 'Mute 24h'), u.mutedUntil > Date.now() ? h('button', { class: 'btn small', onclick: () => mute(0) }, 'Unmute') : null));
    }
    let statMode = 'real';
    const statsBox = h('div');
    const paintStats = () => {
      statsBox.innerHTML = '';
      statsBox.append(tbl(['Game', 'Bets', 'Wagered', 'Won', 'Player profit', 'RTP'], r.stats[statMode].map((s) => h('tr', null, h('td', null, gname(s.game)), h('td', null, s.rounds), h('td', null, C.fmt(s.wagered)), h('td', null, C.fmt(s.won)),
        h('td', { class: s.won - s.wagered >= 0 ? 'pos' : 'neg' }, C.fmt(s.won - s.wagered)), h('td', null, s.wagered ? pct(s.won / s.wagered) : '—'))), `No ${statMode} bets yet.`));
    };
    paintStats();
    const statTabs = h('div', { class: 'seg' }, ['real', 'demo'].map((m) => h('button', { class: 'segb' + (m === statMode ? ' sel' : ''), onclick: (e) => { statMode = m; statTabs.querySelectorAll('.segb').forEach((b) => b.classList.remove('sel')); e.currentTarget.classList.add('sel'); paintStats(); } }, m === 'real' ? 'Real money' : 'Demo')));
    return h('div', { class: 'wallet-page' },
      h('a', { class: 'back-link', href: '#admin-players' }, '← All players'),
      h('div', { class: 'phead' }, h('div', { class: 'pavatar' }, u.username[0].toUpperCase()),
        h('div', null, h('h2', null, u.username, ' ', roleBadge(u.role), u.disabled ? h('span', { class: 'tag-s failed' }, 'Disabled') : null),
          h('div', { class: 'muted small' }, `Player #${u.id} · joined ${new Date(u.created).toLocaleDateString()}`, u.referrer ? ` · referred by ${u.referrer}` : '', ` · referral code ${u.refCode || '—'}`))),
      h('div', { class: 'kpis' }, C.kpi('Real balance', C.money(u.real)), C.kpi('Demo balance', C.fmt(u.demo)), C.kpi('Deposited', C.money(t.depositedUsd)), C.kpi('Withdrawn', C.money(t.withdrawnUsd)),
        C.kpi('Real tips sent / received', `${C.fmt(t.tipsSent)} / ${C.fmt(t.tipsReceived)}`), C.kpi('Players referred', t.referrals)),
      actions.children.length ? actions : null,
      rgPanel(u, r),
      h('div', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('h3', { style: 'margin:0' }, 'Results by game'), statTabs), statsBox),
      h('div', { class: 'panel' }, h('h3', null, 'Recent bets'), tbl(['Time', 'Game', 'Mode', 'Bet', 'Paid', 'Details'], r.rounds.map((x) => h('tr', null, h('td', { class: 'muted' }, ago(x.updated)), h('td', null, gname(x.game)), h('td', null, x.mode === 'real' ? 'SOL' : 'Demo'), h('td', null, C.fmt(x.wager)), h('td', { class: x.payout > x.wager ? 'pos' : '' }, C.fmt(x.payout)), h('td', { class: 'muted' }, x.detail))))),
      r.ledger.length ? h('div', { class: 'panel' }, h('h3', null, 'Balance history'), tbl(['Time', 'Wallet', 'Change', 'Balance after', 'Reason', 'Ref'], r.ledger.map((l) => h('tr', null, h('td', { class: 'muted' }, ago(l.ts)), h('td', null, l.mode), h('td', { class: l.delta >= 0 ? 'pos' : 'neg' }, (l.delta >= 0 ? '+' : '') + C.fmt(l.delta)), h('td', null, C.fmt(l.balance_after)), h('td', null, l.reason), h('td', { class: 'muted mono' }, l.ref || ''))))) : null);
  }

  /* ---------------- Responsible gambling & AML (profile panel and Compliance tab) ---------------- */
  const untilText = (t) => (t == null ? 'permanently' : 'until ' + new Date(t).toLocaleString());
  const FLAG = { 'large-deposit': 'Large deposit', 'daily-deposits': 'High 24 h deposits', 'low-turnover': 'Withdrawal with little play', 'over-deposit-limit': 'Over deposit limit',
    'deposit-while-cooloff': 'Deposit during cool-off', 'deposit-while-exclusion': 'Deposit during self-exclusion' };
  function rgPanel(u, r) {
    if (!r.rg) return null;
    const lim = (k) => (r.rg.limits[k].limit == null ? 'none' : `${C.money(r.rg.limits[k].used)} / ${C.money(r.rg.limits[k].limit)}`);
    const months = h('select', null, h('option', { value: '6' }, '6 months'), h('option', { value: '12' }, '1 year'), h('option', { value: '60' }, '5 years'), h('option', { value: '0' }, 'Permanently'));
    return h('div', { class: 'panel' }, h('h3', null, 'Responsible gambling & AML'),
      h('p', null, r.rg.block ? h('span', { class: 'tag-s failed' }, `${r.rg.block.kind === 'exclusion' ? 'Self-excluded' : 'Cool-off'} ${untilText(r.rg.block.until)}`) : h('span', { class: 'muted' }, 'No break or self-exclusion.')),
      h('p', { class: 'muted small' }, `Deposit limits — 24 h: ${lim('daily')} · 7 days: ${lim('weekly')} · 30 days: ${lim('monthly')}`),
      C.can('admin') && u.role !== 'admin' ? h('div', { class: 'row' }, months, h('button', { class: 'btn small red', onclick: async () => {
        if (!confirm(`Exclude ${u.username}? It cannot be lifted early.`)) return;
        if (await C.try(() => C.api('POST', '/api/admin/rg/exclude', { id: u.id, months: +months.value }))) { C.toast(`${u.username} is excluded`, 'win'); C.route(); }
      } }, 'Exclude player')) : null,
      h('h3', null, 'Flags'),
      tbl(['Time', 'Flag', 'Detail', 'Status'], r.flags.map((f) => h('tr', null, h('td', { class: 'muted' }, ago(f.created)), h('td', null, FLAG[f.kind] || f.kind), h('td', { class: 'muted' }, f.detail),
        h('td', null, f.status === 'open' ? h('a', { class: 'tag-s pending', href: '#admin-compliance' }, 'open') : h('span', { class: 'tag-s sent', title: f.note || '' }, 'cleared')))), 'No flags.'));
  }

  async function compliance() {
    const wrap = h('div', { class: 'wallet-page' });
    let status = 'open';
    const paint = async () => {
      const r = await C.try(() => C.api('GET', '/api/admin/compliance?status=' + status)); if (!r) return;
      wrap.innerHTML = '';
      const seg = h('div', { class: 'seg' }, [['open', 'Open'], ['cleared', 'Cleared'], ['all', 'All']].map(([k, v]) => h('button', { class: 'segb' + (k === status ? ' sel' : ''), onclick: () => { status = k; paint(); } }, v)));
      const rows = r.flags.map((f) => {
        const note = h('input', { placeholder: 'What you checked (required)' });
        return h('tr', null, h('td', { class: 'muted' }, ago(f.created)), h('td', null, h('a', { href: '#admin-player-' + f.user_id }, f.username)), h('td', null, FLAG[f.kind] || f.kind),
          h('td', null, f.usd == null ? '—' : C.money(f.usd)), h('td', { class: 'muted' }, f.detail),
          h('td', null, f.status === 'open' ? h('div', { class: 'row' }, note, h('button', { class: 'btn small', onclick: async () => {
            if (await C.try(() => C.api('POST', '/api/admin/compliance/clear', { id: f.id, note: note.value }))) { C.toast('Flag cleared', 'win'); paint(); }
          } }, 'Clear')) : h('span', { class: 'muted small' }, `Cleared by ${f.reviewer || '?'}: ${f.note || ''}`)));
      });
      wrap.append(
        h('div', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:8px' }, h('h3', { style: 'margin:0' }, 'AML flags'), seg),
          h('p', { class: 'muted small' }, 'While a player has an open flag, every withdrawal they request waits in Withdrawals for approval. Clear a flag once you have checked the player (source of funds, play pattern, linked accounts).'),
          tbl(['Time', 'Player', 'Flag', 'Amount', 'Detail', status === 'open' ? 'Review' : 'Outcome'], rows, status === 'open' ? 'No open flags.' : 'Nothing here.')),
        h('div', { class: 'panel' }, h('h3', null, 'Active breaks and self-exclusions'),
          tbl(['Player', 'Type', 'Until', 'Since'], r.blocks.map((b) => h('tr', null, h('td', null, h('a', { href: '#admin-player-' + b.user_id }, b.username)), h('td', null, b.kind === 'exclusion' ? 'Self-exclusion' : 'Cool-off'),
            h('td', null, b.until == null ? 'Permanent' : new Date(b.until).toLocaleString()), h('td', { class: 'muted' }, new Date(b.created).toLocaleDateString()))), 'None.')));
    };
    await paint();
    return wrap;
  }

  /* ---------------- Live ---------------- */
  async function live() {
    const r = await C.try(() => C.api('GET', '/api/admin/live')); if (!r) return h('div');
    const realOnly = h('input', { type: 'checkbox' });
    const bets = C.betTable(), bbody = bets.querySelector('tbody');
    const onlineK = C.kpi('Online now', r.online.total, 'accent'), activeK = C.kpi('Games in progress', r.active.length);
    const activeBody = h('tbody');
    const activeRow = (a) => h('tr', { 'data-round': a.id }, h('td', null, gname(a.game)), h('td', null, h('a', { href: '#admin-player-' + a.userId }, a.username || a.user)), h('td', null, a.mode === 'real' ? 'SOL' : 'Demo'), h('td', null, C.fmt(a.wager)), h('td', { class: 'muted' }, ago(a.created || a.t)));
    r.active.forEach((a) => activeBody.append(activeRow(a)));
    const addBet = (b, fresh) => {
      if (realOnly.checked && b.mode !== 'real') return;
      bbody.prepend(C.betRow(b, { fresh, userLink: true })); while (bbody.children.length > 80) bbody.lastChild.remove();
    };
    r.recent.slice().reverse().forEach((b) => addBet(b, false));
    realOnly.onchange = () => { bbody.innerHTML = ''; r.recent.slice().reverse().forEach((b) => addBet(b, false)); };
    C.onStream('bet', (b) => { r.recent.unshift(b); r.recent.length = Math.min(r.recent.length, 80); addBet(b, true); const row = activeBody.querySelector(`[data-round="${b.roundId}"]`); if (row) row.remove(); activeK.firstChild.textContent = activeBody.children.length; });
    C.onStream('round', (a) => { activeBody.prepend(activeRow(a)); activeK.firstChild.textContent = activeBody.children.length; });
    C.onStream('online', (o) => { onlineK.firstChild.textContent = o.total; });
    return h('div', { class: 'wallet-page' },
      h('div', { class: 'kpis' }, onlineK, activeK, C.kpi('Updates', 'Live', 'good')),
      h('div', { class: 'panel' }, h('h3', null, 'Games in progress'), h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Game', 'Player', 'Mode', 'Bet', 'Started'].map((c) => h('th', null, c)))), activeBody)),
        h('p', { class: 'muted small' }, 'Multi-step games (blackjack, mines, crash…) appear here until they finish.')),
      h('div', { class: 'panel' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', { style: 'margin:0' }, 'Live bets'), h('label', { class: 'row' }, realOnly, 'Real money only')), h('div', { class: 'feed' }, bets)));
  }

  /* ---------------- Games & odds ---------------- */
  async function games() {
    const r = await C.try(() => C.api('GET', '/api/admin/games')); if (!r) return h('div');
    const edgeIn = {}, plinkoIn = {}, openIn = {};
    const rows = r.games.map((g) => {
      openIn[g.id] = h('input', { type: 'checkbox', checked: !g.disabled });
      let control = h('span', { class: 'muted small' }, 'Fixed by game rules');
      if (g.edgeKey) {
        edgeIn[g.id] = h('input', { type: 'number', step: '0.1', min: r.limits.edgeMin * 100, max: r.limits.edgeMax * 100, value: +(r.odds.edge[g.edgeKey] * 100).toFixed(2), class: 'pct-in' });
        control = h('div', { class: 'row nowrap' }, edgeIn[g.id], '%', h('span', { class: 'muted small' }, `default ${(r.defaults.edge[g.edgeKey] * 100).toFixed(1)}%`));
      }
      if (g.id === 'plinko') {
        control = h('div', { class: 'row nowrap' }, ...['low', 'medium', 'high'].map((k) => {
          plinkoIn[k] = h('input', { type: 'number', step: '0.5', min: r.limits.plinkoMin * 100, max: r.limits.plinkoMax * 100, value: +(r.odds.plinko[k] * 100).toFixed(1), class: 'pct-in', title: k + ' risk RTP' });
          return h('span', { class: 'row nowrap' }, h('span', { class: 'muted small' }, k[0].toUpperCase()), plinkoIn[k]);
        }), h('span', { class: 'muted small' }, 'RTP %'));
      }
      return h('tr', { class: g.disabled ? 'off' : '' }, h('td', null, h('b', null, gname(g.id))), h('td', null, control),
        h('td', null, g.day.rounds), h('td', null, pct(g.day.rtp)), h('td', null, g.all.rounds), h('td', null, pct(g.all.rtp)),
        h('td', null, h('label', { class: 'switch' }, openIn[g.id], h('span'))));
    });
    const save = h('button', { class: 'btn', onclick: async () => {
      const edge = {}, plinko = {};
      for (const g of r.games) if (edgeIn[g.id]) edge[g.edgeKey] = +edgeIn[g.id].value / 100;
      for (const k in plinkoIn) plinko[k] = +plinkoIn[k].value / 100;
      const disabled = r.games.filter((g) => !openIn[g.id].checked).map((g) => g.id);
      save.disabled = true;
      const res = await C.try(() => C.api('POST', '/api/admin/games', { edge, plinko, disabled }));
      save.disabled = false;
      if (res) { C.applyOdds(res.odds); C.toast('Odds saved. They apply to new bets right away.', 'win'); C.route(); }
    } }, 'Save changes');
    const reset = h('button', { class: 'btn ghost', onclick: async () => { if (await C.try(() => C.api('POST', '/api/admin/games', { reset: true }))) { C.toast('Default odds restored', 'win'); C.route(); } } }, 'Restore defaults');
    // tipping rules
    const T = r.tipping;
    const tOn = h('input', { type: 'checkbox', checked: T.enabled }), tMin = h('input', { type: 'number', min: '0', value: T.minWagered }), tMax = h('input', { type: 'number', min: '0', value: T.dailyMax });
    const tSave = h('button', { class: 'btn small', onclick: async () => { if (await C.try(() => C.api('POST', '/api/admin/tipping', { enabled: tOn.checked, minWagered: +tMin.value, dailyMax: +tMax.value }))) C.toast('Tipping rules saved', 'win'); } }, 'Save tipping rules');
    return h('div', { class: 'wallet-page' },
      h('div', { class: 'notice' }, 'House edge is what the casino keeps on average. Changes apply to every player equally and take effect on new bets immediately. Rounds already in progress finish with the odds they started with, and anyone looking at old numbers is asked to refresh before their next bet goes through.'),
      h('div', { class: 'panel' }, tbl(['Game', 'House edge', 'Bets (24h)', 'Real RTP (24h)', 'Bets (all)', 'Real RTP (all)', 'Open'], rows), h('div', { class: 'row', style: 'margin-top:14px' }, save, reset)),
      h('div', { class: 'panel' }, h('h3', null, 'Player-to-player tips'), h('div', { class: 'ed-grid' },
        h('label', { class: 'row' }, tOn, 'Allow real-money tips'), h('div', { class: 'field' }, h('label', null, 'Min. real wagered before tipping (credits)'), tMin), h('div', { class: 'field' }, h('label', null, 'Daily real tip limit per player (credits)'), tMax)), tSave,
        h('p', { class: 'muted small' }, 'Limits make tips harder to abuse for moving money between accounts. Demo-credit tips are always allowed.')));
  }

  /* ---------------- Support ---------------- */
  async function support(openId) {
    let filter = 'open';
    const list = h('div', { class: 'tlist' }), view = h('div', { class: 'tview' });
    const load = async () => {
      const r = await C.try(() => C.api('GET', '/api/support/tickets?all=1' + (filter === 'all' ? '' : '&status=' + filter))); if (!r) return;
      list.innerHTML = '';
      if (!r.tickets.length) list.append(h('p', { class: 'muted' }, 'No tickets here.'));
      r.tickets.forEach((t) => list.append(h('a', { class: 'titem' + (t.id === openId ? ' sel' : ''), href: '#admin-ticket-' + t.id },
        h('div', null, h('b', null, t.subject), h('div', { class: 'muted small' }, `${t.user} · #${t.id} · ${ago(t.updated)}`)), C.ticketStatus(t.status))));
    };
    const filters = h('div', { class: 'seg' }, [['open', 'Waiting'], ['answered', 'Replied'], ['closed', 'Closed'], ['all', 'All']].map(([k, l]) => h('button', { class: 'segb' + (k === filter ? ' sel' : ''), onclick: (e) => { filter = k; filters.querySelectorAll('.segb').forEach((b) => b.classList.remove('sel')); e.currentTarget.classList.add('sel'); load(); } }, l)));
    await load();
    if (openId) view.append(await C.ticketThread(openId, { staff: true, onChange: () => C.route() }));
    else view.append(h('div', { class: 'panel muted' }, 'Pick a ticket to read and reply.'));
    C.onStream('ticket', load);
    return h('div', { class: 'support-grid' }, h('div', { class: 'panel' }, filters, list), view);
  }

  /* ---------------- Chat moderation ---------------- */
  async function chat() {
    const r = await C.try(() => C.api('GET', '/api/chat')); if (!r) return h('div');
    const body = h('tbody');
    const row = (m) => h('tr', { 'data-id': m.id }, h('td', { class: 'muted' }, new Date(m.ts).toLocaleTimeString()), h('td', null, m.user ? h('b', null, m.user) : h('span', { class: 'muted' }, 'system'), ' ', roleBadge(m.role)), h('td', null, m.text),
      h('td', { class: 'nowrap' }, h('button', { class: 'btn small ghost', onclick: async () => { if (await C.try(() => C.api('POST', '/api/chat/delete', { id: m.id }))) C.toast('Deleted'); } }, 'Delete'),
        m.user && m.kind === 'msg' && m.user !== S.user.username ? h('button', { class: 'btn small ghost', onclick: async () => { if (await C.try(() => C.api('POST', '/api/mod/mute', { username: m.user, minutes: 60 }))) C.toast(`${m.user} muted for 1 hour`, 'win'); } }, 'Mute 1h') : null));
    r.messages.slice().reverse().forEach((m) => body.append(row(m)));
    C.onStream('chat', (m) => body.prepend(row(m)));
    C.onStream('chat-del', (d) => { const e = body.querySelector(`[data-id="${d.id}"]`); if (e) e.remove(); });
    const who = h('input', { placeholder: 'Username' }), mins = h('select', null, [[10, '10 minutes'], [60, '1 hour'], [1440, '24 hours'], [10080, '7 days'], [0, 'Unmute']].map(([v, l]) => h('option', { value: v }, l)));
    return h('div', { class: 'wallet-page' },
      h('div', { class: 'panel' }, h('h3', null, 'Mute a player'), h('div', { class: 'row' }, who, mins, h('button', { class: 'btn small', onclick: async () => { if (await C.try(() => C.api('POST', '/api/mod/mute', { username: who.value.trim(), minutes: +mins.value }))) C.toast('Done', 'win'); } }, 'Apply'))),
      h('div', { class: 'panel' }, h('h3', null, 'Recent messages'), h('div', { class: 'tbl-wrap' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Time', 'From', 'Message', ''].map((c) => h('th', null, c)))), body))));
  }

  /* ---------------- Announcement ---------------- */
  async function announce() {
    const a = S.config.announcement;
    const text = h('textarea', { rows: 3, maxlength: '280', placeholder: 'e.g. Weekend race: top 10 players split 5 SOL. Ends Sunday 23:59 UTC.' }); text.value = a ? a.text : '';
    const tone = h('select', null, [['promo', 'Promo (purple)'], ['info', 'Info (blue)'], ['warning', 'Warning (orange)']].map(([v, l]) => h('option', { value: v, selected: a && a.tone === v ? true : null }, l)));
    const link = h('input', { placeholder: 'Optional link: #referrals or https://…', value: a ? a.link : '' });
    const publish = async (clear) => {
      const r = await C.try(() => C.api('POST', '/api/admin/announce', clear ? { text: '' } : { text: text.value, tone: tone.value, link: link.value.trim() }));
      if (r) { C.toast(clear ? 'Banner removed' : 'Banner is live for everyone', 'win'); try { localStorage.removeItem('casino.ann'); } catch (e) { /* ignore */ } }
    };
    return h('div', { class: 'wallet-page' },
      h('div', { class: 'panel' }, h('h3', null, 'Site banner'), h('p', { class: 'muted small' }, 'Shows at the top of every page for everyone, instantly. Players can dismiss it; posting a new one shows it again.'),
        h('div', { class: 'form' }, h('div', { class: 'field' }, h('label', null, 'Message'), text), h('div', { class: 'ed-grid' }, h('div', { class: 'field' }, h('label', null, 'Style'), tone), h('div', { class: 'field', style: 'grid-column: span 2' }, h('label', null, 'Link'), link)),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => publish(false) }, C.icon('mega'), 'Publish banner'), a ? h('button', { class: 'btn ghost', onclick: () => publish(true) }, 'Remove banner') : null))),
      h('div', { class: 'panel' }, h('h3', null, 'Currently showing'), a ? h('div', { class: 'announce ann-' + a.tone, style: 'border-radius:8px' }, h('div', { class: 'ann-text' }, a.text)) : h('p', { class: 'muted' }, 'No banner is live.')));
  }

  /* ---------------- Withdrawals / Treasury / Log (admin) ---------------- */
  async function withdrawals() {
    const ws = await C.try(() => C.api('GET', '/api/admin/withdrawals')); if (!ws) return h('div');
    const act = async (id, action) => { if (await C.try(() => C.api('POST', '/api/admin/withdrawal', { id, action }))) { C.toast(action === 'approve' ? 'Approved, sending now' : 'Rejected and refunded', 'win'); C.route(); } };
    return h('div', { class: 'panel' }, tbl(['#', 'Player', 'Amount', 'Coin', 'To', 'Requested', 'Status', ''], ws.withdrawals.map((x) => h('tr', null, h('td', null, x.id), h('td', null, h('a', { href: '#admin-player-' + x.user_id }, x.username)), h('td', null, C.money(x.usd)), h('td', null, `${(+x.coin).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${x.asset}`, x.url ? [' ', h('a', { href: x.url, target: '_blank', rel: 'noopener' }, '↗')] : null), h('td', { class: 'mono' }, short(x.dest)), h('td', { class: 'muted' }, ago(x.created)),
      h('td', null, h('span', { class: 'tag-s ' + x.status }, x.status), x.note ? h('div', { class: 'muted small' }, x.note) : null),
      h('td', { class: 'nowrap' }, x.status === 'pending' ? h('button', { class: 'btn small', onclick: () => act(x.id, 'approve') }, 'Approve') : null, ' ', ['pending', 'approved'].includes(x.status) ? h('button', { class: 'btn small red', onclick: () => act(x.id, 'reject') }, 'Reject') : null))), 'No withdrawals yet.'));
  }
  /** Owner cash-out: send coins from a hot wallet to any address (admin password required every time). */
  function cashoutPanel(o, coin) {
    if (!o.wallets.length) return null;
    const asset = h('select', null, o.wallets.map((w) => h('option', { value: w.asset }, `${w.asset} — hot wallet ${coin(w.balance, w.asset)}`)));
    const amount = h('input', { type: 'number', min: '0', step: 'any', placeholder: 'Amount in coins', inputmode: 'decimal' });
    const addr = h('input', { placeholder: 'Wallet address to send to', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    const pw = h('input', { type: 'password', placeholder: 'Your admin password', autocomplete: 'current-password' });
    let max = false;
    const maxBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: () => { max = true; const w = o.wallets.find((x) => x.asset === asset.value); amount.value = ''; amount.placeholder = `Max (${coin(w && w.balance, asset.value)} minus network fee)`; } }, 'Max');
    amount.oninput = () => { max = false; amount.placeholder = 'Amount in coins'; };
    asset.onchange = () => { max = false; amount.value = ''; amount.placeholder = 'Amount in coins'; };
    const go = h('button', { class: 'btn', type: 'button', onclick: async () => {
      if (!addr.value.trim() || (!max && !(+amount.value > 0)) || !pw.value) return C.toast('Fill in the amount, address and password', 'err');
      if (!confirm(`Send ${max ? 'everything' : amount.value} ${asset.value} from the hot wallet to\n${addr.value.trim()}?\n\nCrypto transfers cannot be reversed.`)) return;
      go.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/admin/cashout', { asset: asset.value, amount: max ? 'max' : +amount.value, address: addr.value.trim(), password: pw.value }));
      go.disabled = false; pw.value = '';
      if (r) { C.toast(`Sending ${coin(r.coin, r.asset)} to your wallet`, 'win'); setTimeout(() => C.route(), 1500); }
    } }, 'Cash out');
    return h('div', { class: 'panel' }, h('h3', { style: 'margin-top:0' }, 'Cash out'),
      h('p', { class: 'muted small' }, 'Send coins from a hot wallet to any wallet you choose. Coins waiting to go out to players are kept back. ', h('b', null, `Players are owed ${C.money(o.playerBalancesUsd)}`), ' — keep enough to pay withdrawals.'),
      h('div', { class: 'cashout-grid' }, h('div', { class: 'field' }, h('label', null, 'Coin'), asset), h('div', { class: 'field' }, h('label', null, 'Amount'), h('div', { class: 'row' }, amount, maxBtn)),
        h('div', { class: 'field wide' }, h('label', null, 'Send to'), addr), h('div', { class: 'field' }, h('label', null, 'Admin password'), pw), h('div', { class: 'field' }, h('label', null, '\u00a0'), go)),
      o.cashouts.length ? tbl(['Time', 'Amount', 'To', 'Status'], o.cashouts.map((c) => h('tr', null, h('td', { class: 'muted' }, ago(c.created)), h('td', null, coin(c.coin, c.asset), c.url ? [' ', h('a', { href: c.url, target: '_blank', rel: 'noopener' }, '↗')] : null),
        h('td', { class: 'mono' }, short(c.dest)), h('td', null, h('span', { class: 'tag-s ' + c.status }, c.status), c.note ? h('div', { class: 'muted small' }, c.note) : null)))) : null);
  }
  async function treasury() {
    const o = await C.try(() => C.api('GET', '/api/admin/overview')); if (!o) return h('div');
    const coin = (x, a) => (x == null ? 'unavailable' : `${(+x).toLocaleString(undefined, { maximumFractionDigits: a === 'USDC' ? 2 : 6 })} ${a}`);
    const errs = Object.entries(o.watcher.errors || {}).filter(([, e]) => e);
    return h('div', { class: 'wallet-page' },
      h('div', { class: 'kpis' }, C.kpi('Networks', o.testnet ? 'Test networks' : 'Mainnet'), C.kpi('Hot wallets', C.money(o.wallets.reduce((s, w) => s + (w.usd || 0), 0))), C.kpi('Owed to players', C.money(o.playerBalancesUsd)),
        C.kpi(`Referral commission (${Math.round(o.referrals.share * 100)}%)`, `${C.money(o.referrals.pendingUsd)} owed`), C.kpi('Deposit watcher', errs.length ? 'error' : o.watcher.lastRun ? 'ok' : 'starting', errs.length ? 'bad' : 'good')),
      errs.map(([chain, e]) => h('div', { class: 'notice err' }, `Cannot reach ${chain}: ${e}`)),
      cashoutPanel(o, coin),
      h('div', { class: 'panel' }, h('h3', { style: 'margin-top:0' }, 'Hot wallets'),
        tbl(['Coin', 'Balance', 'Value', 'Hot wallet address', 'Treasury'], o.wallets.map((w) => h('tr', null, h('td', null, h('b', null, w.asset), h('div', { class: 'muted small' }, w.network)), h('td', null, coin(w.balance, w.asset)), h('td', null, w.usd == null ? '—' : C.money(w.usd)),
          h('td', { class: 'mono small' }, w.hot, ' ', h('button', { class: 'btn small ghost', onclick: () => C.copy(w.hot) }, 'Copy')), h('td', { class: 'mono small' }, w.treasury || h('span', { class: 'muted' }, 'not set')))), 'Deposits are switched off (CHAIN_ENABLED=false).'),
        h('p', { class: 'muted small' }, `Deposits are swept into each coin's hot wallet; once a hot wallet holds ${C.money(o.hotFloatUsd)}, further sweeps go to that coin's treasury. Fund a hot wallet by sending to its address above.`),
        h('h3', null, 'Daily deposit wallets'), tbl(['Day (UTC)', 'Addresses', 'Deposits', 'Credited'], o.days.map((d) => h('tr', null, h('td', null, d.day), h('td', null, d.addresses), h('td', null, d.deposits), h('td', null, C.money(d.usd))))),
        h('h3', null, 'Recent sweeps'), tbl(['Time', 'Coin', 'From', 'Amount', 'To', 'Status'], o.sweeps.map((s) => h('tr', null, h('td', null, ago(s.ts)), h('td', null, s.asset), h('td', { class: 'mono' }, short(s.address)), h('td', null, coin(s.coin, s.asset), s.url ? [' ', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, '↗')] : null), h('td', { class: 'mono' }, short(s.dest)), h('td', null, s.status, s.note ? h('div', { class: 'muted small' }, s.note) : null))), 'No sweeps yet.'),
        h('h3', null, 'House results (real money)'), tbl(['Game', 'Bets', 'Wagered', 'Paid', 'House'], o.house.map((x) => h('tr', null, h('td', null, gname(x.game)), h('td', null, x.rounds), h('td', null, C.money(x.wageredUsd)), h('td', null, C.money(x.paidUsd)), h('td', { class: x.houseUsd >= 0 ? 'pos' : 'neg' }, C.money(x.houseUsd)))))))
  }
  async function log() {
    const r = await C.try(() => C.api('GET', '/api/admin/users')); if (!r) return h('div');
    return h('div', { class: 'panel' }, tbl(['When', 'By', 'Action', 'Player', 'Details'], r.log.map((l) => h('tr', null, h('td', { class: 'muted' }, ago(l.ts)), h('td', null, l.admin), h('td', null, l.action), h('td', null, l.target ? h('a', { href: '#admin-player-' + l.target_id }, l.target) : '—'), h('td', { class: 'muted' }, l.detail))), 'Nothing logged yet.'));
  }
})();
