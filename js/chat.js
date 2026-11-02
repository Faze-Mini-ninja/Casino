/* Live chat panel, tipping dialog and a small modal helper. */
(function () {
  'use strict';
  const C = Casino, h = C.h, S = C.S;

  /* ---------- modal ---------- */
  C.modal = (title, body, opts = {}) => {
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
      h('div', { class: 'modal' + (opts.wide ? ' wide' : '') }, h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, C.icon('x'))), body));
    document.body.append(wrap); document.addEventListener('keydown', onKey);
    const first = wrap.querySelector('input'); if (first) setTimeout(() => first.focus(), 30);
    return close;
  };

  /* ---------- tip dialog ---------- */
  C.tipDialog = (to = '', amount = '') => {
    if (!S.user) { location.hash = '#login'; return; }
    const toIn = h('input', { value: to, placeholder: 'Username', autocapitalize: 'off' });
    const amt = h('input', { type: 'number', min: '1', step: '0.01', value: amount, placeholder: 'Amount in credits', inputmode: 'decimal' });
    const mode = h('select', null, h('option', { value: 'real', selected: S.mode === 'real' ? true : null }, 'Real balance ($)'), h('option', { value: 'demo', selected: S.mode === 'demo' ? true : null }, 'Demo credits'));
    const pub = h('input', { type: 'checkbox', checked: true });
    const hint = h('div', { class: 'sol-hint' });
    const upd = () => { hint.textContent = mode.value === 'real' && +amt.value ? `= ${C.money(+amt.value)}` : ''; };
    amt.oninput = upd; mode.onchange = upd;
    const btn = h('button', { class: 'btn', onclick: async () => {
      btn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/tip', { to: toIn.value.trim(), amount: +amt.value, mode: mode.value, public: pub.checked }));
      btn.disabled = false;
      if (r) { C.setUnits(r.balances); C.toast(`Tip sent to ${toIn.value.trim()}`, 'win'); close(); }
    } }, C.icon('gift'), 'Send tip');
    const close = C.modal('Send a tip', h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', null, 'To'), toIn), h('div', { class: 'field' }, h('label', null, 'Amount (credits)'), amt, hint),
      h('div', { class: 'field' }, h('label', null, 'From'), mode),
      h('label', { class: 'row' }, pub, 'Show this tip in chat'), btn,
      h('p', { class: 'muted small' }, 'Tips are instant and cannot be reversed. Double-check the username.')));
  };

  /* ---------- chat panel ---------- */
  const panel = document.getElementById('chat');
  if (!panel) return;
  let loaded = false, lastUser;
  const list = h('div', { class: 'chat-list' });
  const onlineEl = h('span', { class: 'online' }, h('i'), '0 online');
  const foot = h('div', { class: 'chat-foot' });
  panel.append(
    h('div', { class: 'chat-head' }, h('b', null, 'Chat'), onlineEl, h('button', { class: 'icon-btn', 'aria-label': 'Close chat', onclick: () => toggle(false) }, C.icon('x'))),
    list, foot);

  function paintFoot() {
    foot.innerHTML = '';
    if (!S.user) { foot.append(h('div', { class: 'chat-signin' }, h('a', { class: 'btn small', href: '#login' }, 'Sign in to chat'))); return; }
    const input = h('input', { placeholder: 'Say something… (/tip name amount)', maxlength: '280', enterkeyhint: 'send' });
    const send = async () => {
      const text = input.value.trim(); if (!text) return;
      const tip = /^\/tip\s+@?(\S+)\s*([\d.]*)/i.exec(text);
      if (tip) { input.value = ''; return C.tipDialog(tip[1], tip[2]); }
      input.value = '';
      const r = await C.try(() => C.api('POST', '/api/chat', { text }));
      if (!r) input.value = text;
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    foot.append(h('div', { class: 'chat-input' }, input, h('button', { class: 'icon-btn send', 'aria-label': 'Send', onclick: send }, C.icon('send'))),
      h('div', { class: 'chat-rules' }, 'Be nice. No spam, begging or links.'));
  }

  const ROLE_BADGE = { admin: 'Admin', staff: 'Staff', mod: 'Mod' };
  function userMenu(m, anchor) {
    document.querySelectorAll('.pop').forEach((p) => p.remove());
    const items = [];
    if (S.user && m.user !== S.user.username) items.push(['Tip ' + m.user, () => C.tipDialog(m.user)]);
    if (C.can('mod') && m.user !== S.user.username) {
      items.push(['Mute 10 minutes', () => mute(m.user, 10)], ['Mute 1 hour', () => mute(m.user, 60)], ['Mute 24 hours', () => mute(m.user, 1440)], ['Unmute', () => mute(m.user, 0)]);
    }
    if (C.can('mod')) items.push(['Delete message', async () => { if (await C.try(() => C.api('POST', '/api/chat/delete', { id: m.id }))) C.toast('Message deleted'); }]);
    if (C.can('staff') && m.uid) items.push(['Open player profile', () => { location.hash = '#admin-player-' + m.uid; }]);
    if (!items.length) return;
    const pop = h('div', { class: 'pop' }, items.map(([label, fn]) => h('button', { onclick: () => { pop.remove(); fn(); } }, label)));
    document.body.append(pop);
    const r = anchor.getBoundingClientRect();
    pop.style.top = Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 4) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
    setTimeout(() => document.addEventListener('click', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', off); } }), 0);
  }
  async function mute(username, minutes) {
    if (await C.try(() => C.api('POST', '/api/mod/mute', { username, minutes }))) C.toast(minutes ? `${username} muted` : `${username} unmuted`, 'win');
  }
  function msgEl(m) {
    const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (m.kind === 'tip') return h('div', { class: 'cmsg tip', 'data-id': m.id }, C.icon('gift'), h('span', null, m.text));
    if (m.kind === 'system') return h('div', { class: 'cmsg sys', 'data-id': m.id }, m.text);
    const name = h('button', { class: 'cname role-' + (m.role || 'player'), onclick: (e) => userMenu(m, e.currentTarget) }, m.user || '?');
    return h('div', { class: 'cmsg', 'data-id': m.id, title: time },
      h('div', { class: 'cmeta' }, ROLE_BADGE[m.role] ? h('span', { class: 'badge-r ' + m.role }, ROLE_BADGE[m.role]) : null, name, h('span', { class: 'ctime' }, time)),
      h('div', { class: 'ctext' }, m.text));
  }
  const nearBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  function add(m) {
    const stick = nearBottom();
    list.append(msgEl(m));
    while (list.children.length > 150) list.firstChild.remove();
    if (stick) list.scrollTop = list.scrollHeight;
  }
  async function load() {
    loaded = true;
    const r = await C.try(() => C.api('GET', '/api/chat'));
    if (!r) { loaded = false; return; }
    list.innerHTML = '';
    if (!r.messages.length) list.append(h('div', { class: 'chat-empty' }, 'No messages yet. Say hi!'));
    r.messages.forEach(add);
    list.scrollTop = list.scrollHeight;
  }
  function toggle(on) {
    on = on ?? !document.body.classList.contains('chat-open');
    document.body.classList.toggle('chat-open', on);
    try { localStorage.setItem('casino.chat', on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (on && !loaded) load();
    if (on) setTimeout(() => { list.scrollTop = list.scrollHeight; }, 50);
  }
  C.toggleChat = toggle;

  C.onStream('chat', (m) => { if (loaded) { const e = list.querySelector('.chat-empty'); if (e) e.remove(); add(m); } }, true);
  C.onStream('chat-del', (d) => { const e = list.querySelector(`[data-id="${d.id}"]`); if (e) e.remove(); }, true);
  C.onStream('online', (o) => { onlineEl.lastChild.textContent = `${o.total} online`; }, true);
  C.onChange(() => { const u = S.user ? S.user.id : 0; if (u !== lastUser) { lastUser = u; paintFoot(); } });
  paintFoot();

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href="#chat"], #chat-btn');
    if (!a) return;
    e.preventDefault(); toggle(); document.body.classList.remove('nav-open');
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#chat') { history.replaceState(null, '', '#lobby'); toggle(true); C.route(); }
    else if (window.innerWidth <= 1100 && document.body.classList.contains('chat-open')) toggle(false); // overlay on small screens: close when navigating
  });
  if (location.hash === '#chat') { history.replaceState(null, '', '#lobby'); toggle(true); }
  else { let saved = '0'; try { saved = localStorage.getItem('casino.chat') || '0'; } catch (e) { /* ignore */ } if (saved === '1' && window.innerWidth > 1100) toggle(true); }
})();
