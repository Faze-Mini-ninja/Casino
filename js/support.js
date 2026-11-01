/* Player support: tickets list, new ticket form and conversation view. Staff reply from the Staff Panel. */
(function () {
  'use strict';
  const C = Casino, h = C.h;
  const STATUS = { open: 'Waiting for support', answered: 'Support replied', closed: 'Closed' };
  C.ticketStatus = (s) => h('span', { class: 'tag-s t-' + s }, STATUS[s] || s);

  /** Conversation view, shared with the Staff Panel. */
  C.ticketThread = async (id, { staff = false, onChange } = {}) => {
    const r = await C.try(() => C.api('GET', '/api/support/ticket?id=' + id));
    if (!r) return h('div');
    const t = r.ticket;
    const reply = h('textarea', { rows: 3, placeholder: staff ? `Reply to ${t.user}…` : 'Add a reply…' });
    const send = h('button', { class: 'btn', onclick: async () => {
      if (!reply.value.trim()) return;
      send.disabled = true;
      const ok = await C.try(() => C.api('POST', '/api/support/reply', { id: t.id, text: reply.value }));
      send.disabled = false;
      if (ok) { C.toast('Reply sent', 'win'); onChange ? onChange() : C.route(); }
    } }, 'Send reply');
    const setStatus = async (status) => { if (await C.try(() => C.api('POST', '/api/support/status', { id: t.id, status }))) onChange ? onChange() : C.route(); };
    return h('div', { class: 'panel thread' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('div', null, h('h3', { style: 'margin:0' }, t.subject), h('div', { class: 'muted small' }, `#${t.id}`, staff ? ` · ${t.user}` : '', ' · opened ', new Date(t.created).toLocaleString())),
        C.ticketStatus(t.status)),
      h('div', { class: 'msgs' }, r.messages.map((m) => h('div', { class: 'tmsg' + (m.staff ? ' staff' : '') },
        h('div', { class: 'tmeta' }, h('b', null, m.user), ' · ', new Date(m.ts).toLocaleString()), h('div', { class: 'tbody' }, m.text)))),
      t.status === 'closed'
        ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'This ticket is closed.'), h('button', { class: 'btn small ghost', onclick: () => setStatus('open') }, 'Reopen'))
        : h('div', { class: 'form' }, reply, h('div', { class: 'row' }, send, h('button', { class: 'btn ghost', onclick: () => setStatus('closed') }, staff ? 'Close ticket' : 'Mark as solved'))));
  };

  C.page('support', async (sub) => {
    const wrap = h('div', { class: 'wallet-page' });
    if (sub) {
      wrap.append(h('a', { href: '#support', class: 'back-link' }, '← All tickets'), await C.ticketThread(Number(sub)));
      C.onStream('ticket', (t) => { if (t.id === Number(sub)) C.route(); });
      return wrap;
    }
    const r = await C.try(() => C.api('GET', '/api/support/tickets'));
    const subject = h('input', { placeholder: 'e.g. My deposit has not arrived', maxlength: '120' });
    const text = h('textarea', { rows: 5, placeholder: 'Tell us what happened. Include transaction IDs or amounts if it is about a payment.' });
    const btn = h('button', { class: 'btn', onclick: async () => {
      btn.disabled = true;
      const res = await C.try(() => C.api('POST', '/api/support/tickets', { subject: subject.value, text: text.value }));
      btn.disabled = false;
      if (res) { C.toast('Ticket sent. We usually reply within a few hours.', 'win'); location.hash = '#support-' + res.id; }
    } }, 'Send to support');
    wrap.append(
      h('div', { class: 'support-hero' }, h('h2', null, 'How can we help?'), h('p', { class: 'muted' }, 'Open a ticket and our team will get back to you here. You will see replies on this page.')),
      h('div', { class: 'wallet-grid' },
        h('div', { class: 'panel' }, h('h3', null, 'New ticket'), h('div', { class: 'form' }, h('div', { class: 'field' }, h('label', null, 'Subject'), subject), h('div', { class: 'field' }, h('label', null, 'Message'), text), btn)),
        h('div', { class: 'panel' }, h('h3', null, 'Your tickets'),
          r && r.tickets.length ? h('div', { class: 'tlist' }, r.tickets.map((t) => h('a', { class: 'titem', href: '#support-' + t.id },
            h('div', null, h('b', null, t.subject), h('div', { class: 'muted small' }, `#${t.id} · updated ${new Date(t.updated).toLocaleString()}`)), C.ticketStatus(t.status))))
            : h('p', { class: 'muted' }, 'You have not opened any tickets yet.'))));
    C.onStream('ticket', () => C.route());
    return wrap;
  }, { auth: true });
})();
