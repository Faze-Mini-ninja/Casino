/* Casino-style wallet pop-up: pick a coin (SOL, USDC, ETH, LTC), then Deposit (address + QR code, live "deposit
 * received"), Withdraw or Buy crypto. Balances are dollars; deposits are credited at the market price.
 * Opens from the header Wallet button, the phone bottom bar and the Deposit banner; #wallet keeps the full history. */
(function () {
  'use strict';
  const C = window.Casino, h = C.h;
  const ICON = {
    SOL: '<svg viewBox="0 0 32 32"><defs><linearGradient id="ic-sol" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#0c0b14"/><g fill="url(#ic-sol)"><path d="M10 20.6h12.6l-2.6 2.6H7.4z"/><path d="M22 14.7H9.4l2.6 2.6h12.6z"/><path d="M10 8.8h12.6L20 11.4H7.4z"/></g></svg>',
    USDC: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#2775ca"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="20 6"/><text x="16" y="21.5" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="15" fill="#fff">$</text></svg>',
    ETH: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#627eea"/><path d="M16 5l-6.5 11L16 19.8 22.5 16z" fill="#fff" opacity=".95"/><path d="M16 21.1l-6.5-3.9L16 27l6.5-9.8z" fill="#fff" opacity=".8"/><path d="M16 5v14.8l6.5-3.8z" fill="#c1ccf7" opacity=".7"/></svg>',
    LTC: '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#345d9d"/><path d="M13.6 8h3.2l-1.6 6.3 2.4-.9-.6 2.2-2.4.9-1.1 4.3h7.3l-.7 2.7H9.6l1.4-5.6-1.9.7.6-2.2 1.9-.7z" fill="#fff"/></svg>',
  };
  const COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const WARN = {
    SOL: (n) => `Send SOL on ${n} only.`,
    USDC: (n) => `Send USDC on ${n} only. USDC sent from Ethereum or another chain will be lost.`,
    ETH: (n) => `Send ETH on ${n} only — not tokens, and not from Base, Arbitrum, BSC or other networks.`,
    LTC: (n) => `Send LTC on ${n} only.`,
  };
  const PLACEHOLDER = { SOL: 'Your Solana wallet address', USDC: 'Your Solana wallet address (not a token account)', ETH: 'Your Ethereum address (0x…)', LTC: 'Your Litecoin address (ltc1… / L… / M…)' };
  const qrSvg = (text) => { if (!window.qrcode) return ''; const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); };
  const fmtCoin = (asset, x) => (+x).toLocaleString(undefined, { maximumFractionDigits: asset === 'USDC' ? 2 : asset === 'ETH' ? 6 : 5 });
  const copyBtn = (text, label = 'Copy') => {
    const b = h('button', { class: 'wl-copy', type: 'button', 'aria-label': label, html: COPY + `<span>${label}</span>` });
    b.onclick = async () => { await C.copy(text); b.innerHTML = CHECK + '<span>Copied</span>'; b.classList.add('ok'); setTimeout(() => { b.innerHTML = COPY + `<span>${label}</span>`; b.classList.remove('ok'); }, 1600); };
    return b;
  };
  let openState = null; // set while the pop-up is open
  let lastCoin = 'SOL';

  C.openWallet = async (tab = 'deposit', coin) => {
    if (!C.loggedIn()) { location.hash = '#login'; return; }
    if (openState) return;
    const body = h('div', { class: 'wl' }, h('div', { class: 'wl-loading' }, 'Loading wallet…'));
    const close = C.modal('Wallet', body, { wide: true });
    const wrap = body.closest('.modal-wrap'); wrap.classList.add('wl-wrap');
    openState = {};
    new MutationObserver((_, obs) => { if (!document.body.contains(wrap)) { openState = null; obs.disconnect(); } }).observe(document.body, { childList: true });
    const w = await C.try(() => C.api('GET', '/api/wallet'));
    if (!w) { close(); return; }
    C.setUnits(w.balances);
    const cfg = w.config, coins = cfg.coins, info = Object.fromEntries(coins.map((c) => [c.id, c])), px = w.prices || {};
    let cur = coin && info[coin] ? coin : info[lastCoin] ? lastCoin : (coins[0] || {}).id;

    /* balance strip */
    const balV = h('b');
    const paintBal = () => { balV.textContent = C.money(C.balanceOf('real')); };
    const head = h('div', { class: 'wl-bal' }, h('div', { class: 'wl-coins-ico' }, coins.slice(0, 4).map((c) => h('span', { html: ICON[c.id] || '' }))),
      h('div', null, h('span', { class: 'wl-k' }, 'Real balance'), balV, h('div', { class: 'wl-sub' }, 'Deposit any coin — it is credited in dollars at the market price.')));

    /* coin picker shared by deposit and withdraw */
    const pickers = [];
    const picker = () => { const el = h('div', { class: 'wl-picker' }, coins.map((c) => h('button', { type: 'button', 'data-c': c.id, onclick: () => setCoin(c.id) }, h('span', { html: ICON[c.id] || '' }), h('b', null, c.id)))); pickers.push(el); return el; };

    /* deposit */
    const depBox = h('div', { class: 'wl-pane-body' });
    const status = h('div', { class: 'wl-status' }, h('i'), h('span', null, 'Waiting for your deposit…'));
    const recent = h('div', { class: 'wl-recent' });
    const paintRecent = () => {
      recent.innerHTML = ''; const list = w.deposits.slice(0, 4);
      if (!list.length) return;
      recent.append(h('div', { class: 'wl-k' }, 'Recent deposits'), ...list.map((d) => h('div', { class: 'wl-row' }, h('span', null, new Date(d.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
        h('b', null, `+${fmtCoin(d.asset, d.coin)} ${d.asset}`), h('span', { class: 'muted' }, d.usd ? C.money(d.usd) : ''), h('span', { class: 'tag-s ' + (d.kind === 'deposit' ? 'credited' : 'rejected') }, d.kind === 'deposit' ? 'credited' : 'below minimum'))));
    };
    const paintDeposit = () => {
      depBox.innerHTML = '';
      const c = info[cur], a = w.addresses[cur];
      if (w.depositBlock) { depBox.append(h('div', { class: 'notice warn' }, w.depositBlock, ' ', h('a', { href: '#rg', onclick: () => close() }, 'Responsible gambling'))); return; }
      if (!a) { depBox.append(h('div', { class: 'notice' }, 'Deposits are not switched on yet on this site.')); return; }
      depBox.append(
        w.depositRoom != null ? h('p', { class: 'wl-room muted' }, `Your deposit limit lets you deposit ${C.money(w.depositRoom)} more right now. Anything above that is still credited but goes against your limit.`) : null,
        h('div', { class: 'wl-net' }, h('span', { class: 'muted' }, 'Network'), h('b', null, c.network), px[cur] ? h('span', { class: 'wl-px' }, `1 ${cur} ≈ ${C.money(px[cur])}`) : null),
        h('div', { class: 'wl-dep' },
          h('div', { class: 'wl-qr', html: qrSvg(a.address) }),
          h('div', { class: 'wl-addr' }, h('span', { class: 'wl-k' }, `Your ${cur} deposit address`), h('div', { class: 'wl-addr-v' }, a.address),
            h('div', { class: 'wl-btns' }, copyBtn(a.address, 'Copy address'), cur === 'SOL' || cur === 'USDC' ? h('a', { class: 'btn small ghost', href: `solana:${a.address}` }, 'Open wallet app') : null), status)),
        h('div', { class: 'wl-warn' }, WARN[cur](c.network.replace(' (SPL)', ''))),
        h('ul', { class: 'wl-notes' },
          h('li', null, `Minimum deposit ${c.minDeposit} ${cur}${px[cur] ? ` (≈ ${C.money(c.minDeposit * px[cur])})` : ''}.`),
          h('li', null, `Credited automatically after ${c.confirm}, at the market price at that moment.`),
          h('li', null, `This address changes every day (UTC). Deposits to your older addresses still count for ${cfg.watchDays} days.`)),
        cfg.testnet ? h('div', { class: 'notice' }, `Test network: coins have no value. Free test coins: `, h('a', { href: 'https://faucet.solana.com', target: '_blank', rel: 'noopener' }, 'SOL'), ' · ',
          h('a', { href: 'https://faucet.circle.com', target: '_blank', rel: 'noopener' }, 'USDC'), ' · ', h('a', { href: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia', target: '_blank', rel: 'noopener' }, 'Sepolia ETH'), ' · any Litecoin testnet faucet.') : null,
        recent);
      paintRecent();
    };

    /* withdraw */
    const amount = h('input', { type: 'number', min: '0', step: '0.01', placeholder: '0.00', inputmode: 'decimal' });
    const dest = h('input', { autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    const receive = h('div', { class: 'wl-receive' }), wNotes = h('ul', { class: 'wl-notes' });
    const paintReceive = () => {
      const a = +amount.value, p = px[cur], fee = info[cur].withdrawFee;
      receive.innerHTML = '';
      if (!(a > 0) || !p) return;
      receive.append(h('span', null, 'You receive'), h('b', null, `${fmtCoin(cur, Math.max(0, a / p - fee))} ${cur}`), h('span', { class: 'muted' }, `after the ${fee} ${cur} network fee`));
    };
    const paintWithdraw = () => {
      dest.placeholder = PLACEHOLDER[cur]; paintReceive();
      wNotes.innerHTML = '';
      wNotes.append(h('li', null, `Minimum withdrawal ${C.money(cfg.minWithdrawUsd)}. Network fee ${info[cur].withdrawFee} ${cur}, paid from the amount.`),
        h('li', null, `Up to ${C.money(cfg.autoApproveUsd)} is sent automatically, usually within minutes; larger withdrawals are reviewed first.`),
        h('li', null, `Paid out as ${cur} on ${info[cur].network}${cur === 'USDC' ? ' — use a Solana wallet address' : ''}.`));
    };
    amount.addEventListener('input', paintReceive);
    const setPct = (f) => () => { amount.value = Math.floor(C.balanceOf('real') * f * 100) / 100; paintReceive(); };
    const wBtn = h('button', { class: 'btn big wl-go', type: 'button', onclick: async () => {
      if (!(+amount.value > 0) || !dest.value.trim()) { C.toast(`Enter an amount and your ${cur} address`, 'err'); return; }
      wBtn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/withdraw', { asset: cur, address: dest.value.trim(), amount: +amount.value }));
      wBtn.disabled = false;
      if (r) { C.setUnits(r.balances); paintBal(); amount.value = ''; paintReceive(); C.sfx && C.sfx('cash'); C.toast(r.status === 'approved' ? `Sending ${fmtCoin(r.asset, r.coin)} ${r.asset} to your wallet` : 'Withdrawal requested — it will be reviewed shortly', 'win'); }
    } }, 'Withdraw');

    /* buy */
    const buy = (name, href, note) => h('a', { class: 'wl-buy', href, target: '_blank', rel: 'noopener' }, h('b', null, name), h('span', null, note), h('i', null, '↗'));

    const panes = {
      deposit: h('div', { class: 'wl-pane' }, picker(), depBox),
      withdraw: h('div', { class: 'wl-pane' }, picker(),
        h('div', { class: 'field' }, h('label', null, 'Amount ($)'), h('div', { class: 'wl-amt' }, amount, h('button', { type: 'button', class: 'btn small ghost', onclick: setPct(0.25) }, '25%'), h('button', { type: 'button', class: 'btn small ghost', onclick: setPct(0.5) }, '50%'), h('button', { type: 'button', class: 'btn small ghost', onclick: setPct(1) }, 'Max'))),
        h('div', { class: 'field' }, h('label', null, 'Send to'), dest), receive, wBtn, wNotes),
      buy: h('div', { class: 'wl-pane' }, h('p', { class: 'muted' }, 'No crypto yet? Buy SOL, USDC, ETH or LTC with a card or bank, then send it to your deposit address.'),
        h('div', { class: 'wl-buys' }, buy('Coinbase', 'https://www.coinbase.com', 'Buy all four coins; send USDC on Solana'), buy('Phantom', 'https://phantom.com/download', 'Wallet app with card purchase (SOL, USDC, ETH)'),
          buy('Kraken', 'https://www.kraken.com', 'Exchange with bank transfer')),
        h('button', { class: 'btn', type: 'button', onclick: () => show('deposit') }, 'Show my deposit address')),
    };
    const tabs = {};
    const tabBar = h('div', { class: 'wl-tabs' }, [['deposit', 'Deposit'], ['withdraw', 'Withdraw'], ['buy', 'Buy crypto']].map(([k, v]) => (tabs[k] = h('button', { type: 'button', onclick: () => show(k) }, v))));
    const show = (k) => { Object.keys(panes).forEach((x) => { panes[x].hidden = x !== k; tabs[x].classList.toggle('on', x === k); }); };
    function setCoin(c) { cur = c; lastCoin = c; pickers.forEach((p) => p.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === c))); status.className = 'wl-status'; status.lastChild.textContent = 'Waiting for your deposit…'; paintDeposit(); paintWithdraw(); }

    body.innerHTML = '';
    body.append(head, tabBar, panes.deposit, panes.withdraw, panes.buy, h('a', { class: 'wl-hist', href: '#wallet', onclick: () => close() }, 'Full transaction history →'));
    setCoin(cur); show(tab); paintBal();

    openState.onDeposit = (d) => {
      status.className = 'wl-status ' + (d.belowMinimum ? 'bad' : 'ok');
      status.lastChild.textContent = d.belowMinimum ? `Received ${fmtCoin(d.asset, d.coin)} ${d.asset} — below the minimum, not credited` : `Received ${fmtCoin(d.asset, d.coin)} ${d.asset} — +${C.money(d.usd)} added`;
      w.deposits.unshift({ ts: Date.now(), asset: d.asset, coin: d.coin, usd: d.usd, kind: d.belowMinimum ? 'below-minimum' : 'deposit' }); paintRecent();
      setTimeout(paintBal, 400);
    };
  };

  /* every tab hears about credited deposits, wherever the player is */
  C.onStream('deposit', (d) => {
    if (d.belowMinimum) C.toast(`Deposit of ${fmtCoin(d.asset, d.coin)} ${d.asset} is below the minimum and was not credited`, 'err');
    else { C.toast(`Deposit received: ${fmtCoin(d.asset, d.coin)} ${d.asset} → +${C.money(d.usd)}`, 'win'); C.sfx && C.sfx('cash'); }
    C.refreshMe();
    if (openState && openState.onDeposit) openState.onDeposit(d);
  }, true);

  /* open the pop-up from the header button, the phone bottom bar and the Deposit banner */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('#wallet-btn, .bottom-nav a[href="#wallet"], a.promo[href="#wallet"], [data-open-wallet]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); C.openWallet(a.dataset.openWallet || 'deposit');
  });

  const css = document.createElement('style');
  css.textContent = `
  .wl-wrap .modal{width:min(560px,100%);padding:20px;max-height:calc(100vh - 32px);overflow:auto}
  .wl-loading{padding:40px;text-align:center;color:var(--muted)}
  .wl-bal{display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:linear-gradient(120deg,rgba(34,229,139,.16),rgba(98,126,234,.14));box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .wl-coins-ico{display:grid;grid-template-columns:repeat(2,22px);gap:3px;flex:none}.wl-coins-ico span svg{width:22px;height:22px;display:block}
  .wl-bal b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.wl-k{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .wl-sub{font-size:12.5px;color:var(--muted)}
  .wl-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:14px 0;padding:4px;border-radius:12px;background:var(--panel2)}
  .wl-tabs button{border:0;border-radius:9px;padding:10px 0;font-weight:800;color:var(--muted);background:none;cursor:pointer}.wl-tabs button.on{background:var(--panel3);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,.3)}
  .wl-pane{display:flex;flex-direction:column;gap:12px}.wl-pane[hidden]{display:none}.wl-pane-body{display:flex;flex-direction:column;gap:12px}
  .wl-picker{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
  .wl-picker button{display:flex;align-items:center;justify-content:center;gap:7px;padding:9px 6px;border-radius:10px;border:1.5px solid transparent;background:var(--panel2);color:var(--text);cursor:pointer;font-size:14px}
  .wl-picker button svg{width:20px;height:20px;display:block}.wl-picker button.on{border-color:var(--brand);background:rgba(34,229,139,.08)}
  .wl-net{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--panel2);font-size:14px}.wl-px{margin-left:auto;font-size:13px;color:var(--green);font-weight:700}
  .wl-dep{display:flex;gap:16px;align-items:stretch}
  .wl-qr{flex:none;width:156px;height:156px;padding:8px;border-radius:12px;background:#fff}.wl-qr svg{width:100%;height:100%;display:block}
  .wl-addr{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
  .wl-addr-v{font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.45;word-break:break-all;padding:10px 12px;border-radius:10px;background:var(--panel2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  .wl-btns{display:flex;gap:8px;flex-wrap:wrap}
  .wl-copy{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:8px;padding:8px 12px;font-weight:800;font-size:13px;cursor:pointer;background:var(--brand);color:var(--brand-ink)}
  .wl-copy svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.wl-copy.ok{background:var(--green)}
  .wl-status{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--muted)}
  .wl-status i{width:9px;height:9px;border-radius:50%;background:#ffc24b;flex:none;animation:wlp 1.6s infinite}
  .wl-status.ok{color:var(--green)}.wl-status.ok i{background:var(--green);animation:none}.wl-status.bad{color:var(--red)}.wl-status.bad i{background:var(--red);animation:none}
  @keyframes wlp{0%{box-shadow:0 0 0 0 rgba(255,194,75,.7)}70%{box-shadow:0 0 0 8px rgba(255,194,75,0)}100%{box-shadow:0 0 0 0 rgba(255,194,75,0)}}
  .wl-warn{padding:9px 12px;border-radius:10px;background:rgba(255,194,75,.1);box-shadow:inset 0 0 0 1px rgba(255,194,75,.3);color:#ffd27a;font-size:13px;font-weight:700}
  .wl-notes{margin:0;padding-left:18px;font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
  .wl-recent{display:flex;flex-direction:column;gap:6px}.wl-row{display:grid;grid-template-columns:1fr auto auto auto;gap:10px;align-items:center;font-size:13px;padding:8px 10px;border-radius:8px;background:var(--panel2)}
  .wl-amt{display:flex;gap:6px}.wl-amt input{flex:1;min-width:0}
  .wl-receive{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;font-size:14px;color:var(--muted)}.wl-receive:empty{display:none}.wl-receive b{color:var(--text);font-size:17px}
  .wl-go{width:100%}
  .wl-buys{display:flex;flex-direction:column;gap:8px}.wl-buy{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:12px 14px;border-radius:10px;background:var(--panel2);color:var(--text);text-decoration:none}
  .wl-buy span{color:var(--muted);font-size:13px}.wl-buy:hover{background:var(--panel3)}
  .wl-hist{display:block;margin-top:14px;text-align:center;font-size:13px;color:var(--muted)}
  @media(max-width:520px){.wl-dep{flex-direction:column;align-items:center}.wl-qr{width:180px;height:180px}.wl-addr{width:100%}.wl-wrap .modal{padding:16px}.wl-picker button{font-size:12.5px;gap:5px;padding:9px 2px}.wl-row{grid-template-columns:1fr auto auto}.wl-row .muted{display:none}}
  `;
  document.head.appendChild(css);
})();
