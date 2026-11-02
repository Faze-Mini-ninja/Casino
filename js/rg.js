/* Responsible gambling: deposit limits, cool-off, self-exclusion, help links; plus the site-wide notice shown to
 * players who are on a break, self-excluded or in a country where real money is not offered. The server enforces all of it. */
(function () {
  'use strict';
  const C = Casino, h = C.h, S = C.S;
  const until = (t) => (t == null ? 'permanently' : 'until ' + new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
  const regionName = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return (c) => { try { return d.of(c); } catch (e) { return c; } }; } catch (e) { return (c) => c; } })();

  /* ---------- notice strip ---------- */
  const strip = h('div', { class: 'rg-strip', hidden: true });
  function paintStrip() {
    const r = S.user && S.rg;
    const text = !r ? '' : r.block ? r.block.text : r.geoBlocked || '';
    strip.hidden = !text; strip.innerHTML = '';
    if (text) strip.append(h('span', null, text), h('a', { href: '#rg' }, 'Details'));
  }
  C.onChange(paintStrip);
  const ann = document.getElementById('announce'); if (ann) ann.after(strip);
  C.refreshRg = async () => { const r = await C.try(() => C.api('GET', '/api/rg')); if (r) { S.rg = r; paintStrip(); } return r; };

  /* ---------- page ---------- */
  C.page('rg', async () => {
    const r = await C.refreshRg();
    if (!r) return h('div');
    const wrap = h('div', { class: 'wallet-page rg' });
    const money = (x) => (x == null ? 'No limit' : C.money(x));

    // status
    const status = r.block
      ? h('div', { class: 'notice warn' }, h('b', null, r.block.kind === 'exclusion' ? 'Self-excluded' : 'Cool-off active'), ' ', until(r.block.until), '. ',
        r.block.kind === 'exclusion' ? 'You cannot play any games, deposit or tip. ' : 'You cannot play for real money, deposit or tip. ', 'Withdrawals stay open. This cannot be shortened.')
      : r.geoBlocked ? h('div', { class: 'notice warn' }, r.geoBlocked) : null;

    // deposit limits
    const inputs = {};
    const row = (k, label) => {
      const l = r.limits[k];
      inputs[k] = h('input', { type: 'number', min: '1', step: '1', placeholder: 'No limit', value: l.limit == null ? '' : String(l.limit), inputmode: 'decimal' });
      return h('div', { class: 'field' }, h('label', null, label), inputs[k],
        h('div', { class: 'muted small' }, l.limit == null ? `Deposited ${C.money(l.used)}` : `Deposited ${C.money(l.used)} of ${C.money(l.limit)} · ${C.money(l.left)} left`));
    };
    const save = h('button', { class: 'btn', onclick: async () => {
      save.disabled = true;
      const val = (k) => (inputs[k].value.trim() === '' ? null : +inputs[k].value);
      const res = await C.try(() => C.api('POST', '/api/rg/limits', { daily: val('daily'), weekly: val('weekly'), monthly: val('monthly') }));
      save.disabled = false;
      if (res) { S.rg = res; C.toast(res.pending ? `Saved. Lower limits apply now; higher ones from ${new Date(res.pending.at).toLocaleString()}` : 'Deposit limits saved', 'win'); C.route(); }
    } }, 'Save limits');
    const limits = h('div', { class: 'panel' }, h('h3', null, 'Deposit limits'),
      h('p', { class: 'muted' }, `Cap how much you can deposit. Lowering a limit takes effect at once; raising or removing one takes ${r.increaseDelayHours} hours.`),
      h('div', { class: 'ed-grid' }, row('daily', '24 hours ($)'), row('weekly', '7 days ($)'), row('monthly', '30 days ($)')),
      r.pending ? h('div', { class: 'notice' }, `Change waiting: 24 h ${money(r.pending.daily)}, 7 days ${money(r.pending.weekly)}, 30 days ${money(r.pending.monthly)}, from ${new Date(r.pending.at).toLocaleString()}.`) : null,
      save);

    // cool-off
    const label = (d) => (d === 1 ? '24 hours' : d % 7 === 0 ? `${d / 7} week${d > 7 ? 's' : ''}` : `${d} days`);
    const coolOff = h('div', { class: 'panel' }, h('h3', null, 'Take a break'),
      h('p', { class: 'muted' }, 'Stop real-money play and deposits for a while. Demo games and withdrawals stay open. A break cannot be cancelled or shortened.'),
      h('div', { class: 'row' }, r.cooloffDays.map((d) => h('button', { class: 'btn ghost', disabled: r.block ? true : null, onclick: async () => {
        if (!confirm(`Take a ${label(d)} break from real-money play? This cannot be undone.`)) return;
        const res = await C.try(() => C.api('POST', '/api/rg/cooloff', { days: d }));
        if (res) { S.rg = res; paintStrip(); C.toast(`Break started — ${until(res.block.until)}`, 'win'); C.route(); }
      } }, label(d)))));

    // self-exclusion
    const months = h('select', null, r.exclusionMonths.map((m) => h('option', { value: String(m) }, m === 0 ? 'Permanently' : m % 12 === 0 ? `${m / 12} year${m > 12 ? 's' : ''}` : `${m} months`)));
    const pw = h('input', { type: 'password', placeholder: 'Your password', autocomplete: 'current-password' });
    const exBtn = h('button', { class: 'btn red', disabled: r.block && r.block.kind === 'exclusion' && r.block.until == null ? true : null, onclick: async () => {
      if (!pw.value) return C.toast('Enter your password to confirm', 'err');
      if (!confirm('Self-exclude? You will not be able to play any game until it ends, and it cannot be lifted early — not even by support.')) return;
      exBtn.disabled = true;
      const res = await C.try(() => C.api('POST', '/api/rg/exclude', { months: +months.value, password: pw.value }));
      exBtn.disabled = false;
      if (res) { S.rg = res; paintStrip(); C.toast('Self-exclusion is active', 'win'); C.route(); }
    } }, 'Self-exclude');
    const exclusion = h('div', { class: 'panel' }, h('h3', null, 'Self-exclusion'),
      h('p', { class: 'muted' }, 'Close your account to all gambling — real money and demo — for at least six months. You can still log in to withdraw your balance. We recommend also blocking gambling sites on your devices (e.g. Gamban, BetBlocker).'),
      h('div', { class: 'row' }, months, pw, exBtn));

    // help
    const link = (name, href, note) => h('li', null, h('a', { href, target: '_blank', rel: 'noopener' }, name), ' — ', note);
    const help = h('div', { class: 'panel' }, h('h3', null, 'Getting help'),
      h('p', null, 'Gambling should be entertainment, not a way to make money. Warning signs: chasing losses, spending more than you planned, borrowing to gamble, or hiding it from people close to you.'),
      h('ul', { class: 'rg-links' },
        link('Gamblers Anonymous', 'https://www.gamblersanonymous.org', 'meetings worldwide'),
        link('GamCare', 'https://www.gamcare.org.uk', 'free support, advice and counselling'),
        link('Gambling Therapy', 'https://www.gamblingtherapy.org', 'free online support in many languages'),
        link('BetBlocker', 'https://betblocker.org', 'free gambling-site blocker for every device')),
      h('p', { class: 'muted small' }, 'You must be 18 or older to play. Underage gambling is an offence.'),
      S.config.blockedCountries && S.config.blockedCountries.length
        ? h('p', { class: 'muted small' }, 'Real-money play is not offered in: ', S.config.blockedCountries.map(regionName).join(', '), '.') : null);

    wrap.append(...[h('h2', null, 'Responsible gambling'), status, limits, coolOff, exclusion, help].filter(Boolean));
    return wrap;
  }, { auth: true });
})();
