/* Casino-style wallet pop-up: Deposit (address + QR code, live "deposit received"), Withdraw, Buy crypto.
 * Opens from the header Wallet button, the phone bottom bar and the Deposit banner; #wallet keeps the full history. */
(function () {
  'use strict';
  const C = window.Casino, h = C.h;
  const SOL_LOGO = '<svg viewBox="0 0 32 32" class="sol-logo"><defs><linearGradient id="solg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9945ff"/><stop offset="1" stop-color="#14f195"/></linearGradient></defs><circle cx="16" cy="16" r="16" fill="#0c0b14"/><g fill="url(#solg)"><path d="M10 20.6h12.6l-2.6 2.6H7.4z"/><path d="M10 14.7h12.6l-2.6 2.6H7.4z" transform="scale(-1 1) translate(-32 0)"/><path d="M10 8.8h12.6L20 11.4H7.4z"/></g></svg>';
  const COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /* SOL → USD for display only (fetched by the player's browser; hidden if unavailable) */
  let usd = null, usdAt = 0;
  async function solUsd() {
    if (usd && Date.now() - usdAt < 60000) return usd;
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { cache: 'no-store' });
      const j = await r.json(); if (j && j.solana && j.solana.usd) { usd = j.solana.usd; usdAt = Date.now(); }
    } catch (e) { /* offline or blocked: show no USD */ }
    return usd;
  }
  const fmtUsd = (x) => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function qrSvg(text) {
    if (!window.qrcode) return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  const copyBtn = (text, label = 'Copy') => {
    const b = h('button', { class: 'wl-copy', type: 'button', 'aria-label': label, html: COPY + `<span>${label}</span>` });
    b.onclick = async () => { await C.copy(text); b.innerHTML = CHECK + '<span>Copied</span>'; b.classList.add('ok'); setTimeout(() => { b.innerHTML = COPY + `<span>${label}</span>`; b.classList.remove('ok'); }, 1600); };
    return b;
  };

  let openState = null; // { onDeposit } while the pop-up is open

  C.openWallet = async (tab = 'deposit') => {
    if (!C.loggedIn()) { location.hash = '#login'; return; }
    if (openState) return;
    const body = h('div', { class: 'wl' }, h('div', { class: 'wl-loading' }, 'Loading wallet…'));
    const close = C.modal('Wallet', body, { wide: true });
    const wrap = body.closest('.modal-wrap'); wrap.classList.add('wl-wrap');
    const done = () => { openState = null; };
    new MutationObserver((_, obs) => { if (!document.body.contains(wrap)) { done(); obs.disconnect(); } }).observe(document.body, { childList: true });
    openState = { onDeposit: null };
    const w = await C.try(() => C.api('GET', '/api/wallet'));
    if (!w) { close(); return; }
    C.setUnits(w.balances);
    const cfg = w.config, net = cfg.cluster === 'mainnet-beta' ? null : cfg.cluster;
    const solOf = (cr) => cr / cfg.creditsPerSol;

    /* balance strip */
    const balCr = h('b'), balSol = h('span'), balUsd = h('span', { class: 'wl-usd' });
    const paintBal = async () => {
      const real = C.balanceOf ? C.balanceOf('real') : w.balances.real / 100;
      balCr.textContent = C.fmt(real) + ' credits'; balSol.textContent = '≈ ' + C.fmtSol(solOf(real)) + ' SOL';
      const p = await solUsd(); balUsd.textContent = p && !net ? '≈ ' + fmtUsd(solOf(real) * p) : '';
    };
    const head = h('div', { class: 'wl-bal' }, h('div', { class: 'wl-coin', html: SOL_LOGO }), h('div', null, h('span', { class: 'wl-k' }, 'Real balance'), balCr, h('div', { class: 'wl-sub' }, balSol, ' ', balUsd)));

    /* tabs */
    const panes = {}, tabs = {};
    const tabBar = h('div', { class: 'wl-tabs' }, [['deposit', 'Deposit'], ['withdraw', 'Withdraw'], ['buy', 'Buy crypto']].map(([k, v]) => (tabs[k] = h('button', { type: 'button', onclick: () => show(k) }, v))));
    const show = (k) => { Object.keys(panes).forEach((x) => { panes[x].hidden = x !== k; tabs[x].classList.toggle('on', x === k); }); };

    /* deposit */
    const status = h('div', { class: 'wl-status' }, h('i'), h('span', null, 'Waiting for your deposit…'));
    const recentDep = h('div', { class: 'wl-recent' });
    const paintDeposits = (list) => {
      recentDep.innerHTML = '';
      if (!list.length) return;
      recentDep.append(h('div', { class: 'wl-k' }, 'Recent deposits'), ...list.slice(0, 4).map((d) => h('div', { class: 'wl-row' }, h('span', null, new Date(d.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
        h('b', null, '+' + C.fmtSol(d.sol) + ' SOL'), h('span', { class: 'tag-s ' + (d.kind === 'deposit' ? 'credited' : 'rejected') }, d.kind === 'deposit' ? 'credited' : 'below minimum'))));
    };
    paintDeposits(w.deposits);
    panes.deposit = h('div', { class: 'wl-pane' },
      w.address ? [
        h('div', { class: 'wl-cur' }, h('div', { class: 'wl-sel' }, h('span', { html: SOL_LOGO }), h('b', null, 'SOL'), h('span', { class: 'muted' }, 'Solana')),
          h('div', { class: 'wl-sel net' }, h('span', { class: 'muted' }, 'Network'), h('b', null, net ? `Solana ${net}` : 'Solana'))),
        h('div', { class: 'wl-dep' },
          h('div', { class: 'wl-qr', html: qrSvg(`solana:${w.address}`) }),
          h('div', { class: 'wl-addr' }, h('span', { class: 'wl-k' }, 'Your SOL deposit address'), h('div', { class: 'wl-addr-v' }, w.address), h('div', { class: 'wl-btns' }, copyBtn(w.address, 'Copy address'),
            h('a', { class: 'btn small ghost', href: `solana:${w.address}?label=krush.casino` }, 'Open wallet app')), status)),
        h('ul', { class: 'wl-notes' },
          h('li', null, 'Send ', h('b', null, 'SOL only'), ' on the Solana network. Tokens and other coins sent here are lost.'),
          h('li', null, `Minimum deposit ${cfg.minDepositSol} SOL · 1 SOL = ${cfg.creditsPerSol.toLocaleString()} credits.`),
          h('li', null, 'Credited automatically after the network confirms it, usually within a minute.'),
          h('li', null, `This address changes every day (UTC). Deposits to your older addresses still count for ${cfg.watchDays} days.`)),
        net ? h('div', { class: 'notice' }, `Test network (${net}): coins have no value. Get free test SOL at `, h('a', { href: 'https://faucet.solana.com', target: '_blank', rel: 'noopener' }, 'faucet.solana.com'), '.') : null,
        recentDep,
      ] : h('div', { class: 'notice' }, 'Deposits are not switched on yet on this site.'));

    /* withdraw */
    const amount = h('input', { type: 'number', min: '0', step: '0.01', placeholder: '0.00', inputmode: 'decimal' });
    const dest = h('input', { placeholder: 'Your Solana wallet address', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    const receive = h('div', { class: 'wl-receive' });
    const paintReceive = async () => {
      const a = +amount.value; if (!(a > 0)) { receive.textContent = ''; return; }
      const sol = Math.max(0, solOf(a) - cfg.withdrawFeeSol), p = await solUsd();
      receive.innerHTML = ''; receive.append(h('span', null, 'You receive'), h('b', null, `${C.fmtSol(sol)} SOL`), p && !net ? h('span', { class: 'wl-usd' }, '≈ ' + fmtUsd(sol * p)) : null);
    };
    amount.addEventListener('input', paintReceive);
    const wBtn = h('button', { class: 'btn big wl-go', type: 'button', onclick: async () => {
      if (!(+amount.value > 0) || !dest.value.trim()) { C.toast('Enter an amount and your Solana address', 'err'); return; }
      wBtn.disabled = true;
      const r = await C.try(() => C.api('POST', '/api/withdraw', { address: dest.value.trim(), amount: +amount.value }));
      wBtn.disabled = false;
      if (r) { C.setUnits(r.balances); paintBal(); amount.value = ''; paintReceive(); C.sfx && C.sfx('cash'); C.toast(r.status === 'approved' ? `Sending ${C.fmtSol(r.sol)} SOL to your wallet` : 'Withdrawal requested — it will be reviewed shortly', 'win'); }
    } }, 'Withdraw');
    panes.withdraw = h('div', { class: 'wl-pane' },
      h('div', { class: 'field' }, h('label', null, 'Amount (credits)'), h('div', { class: 'wl-amt' }, amount,
        ...[0.25, 0.5].map((f) => h('button', { type: 'button', class: 'btn small ghost', onclick: () => { amount.value = Math.floor((C.balanceOf ? C.balanceOf('real') : 0) * f * 100) / 100; paintReceive(); } }, f * 100 + '%')),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { amount.value = C.balanceOf ? C.balanceOf('real') : 0; paintReceive(); } }, 'Max'))),
      h('div', { class: 'field' }, h('label', null, 'Send to (Solana address)'), dest), receive, wBtn,
      h('ul', { class: 'wl-notes' }, h('li', null, `Minimum ${cfg.minWithdrawSol} SOL. Network fee ${cfg.withdrawFeeSol} SOL.`),
        h('li', null, `Up to ${cfg.autoApproveSol} SOL is sent automatically, usually within a minute; larger withdrawals are reviewed first.`)));

    /* buy */
    const buy = (name, href, note) => h('a', { class: 'wl-buy', href, target: '_blank', rel: 'noopener' }, h('b', null, name), h('span', null, note), h('i', null, '↗'));
    panes.buy = h('div', { class: 'wl-pane' },
      h('p', { class: 'muted' }, 'No SOL yet? Buy it with a card or bank in one of these apps, then send it to your deposit address.'),
      h('div', { class: 'wl-buys' }, buy('Phantom', 'https://phantom.com/download', 'Wallet app with built-in card purchase'), buy('Coinbase', 'https://www.coinbase.com/price/solana', 'Buy SOL, then send it to your address'),
        buy('Kraken', 'https://www.kraken.com/prices/solana', 'Exchange with bank transfer')),
      h('button', { class: 'btn', type: 'button', onclick: () => show('deposit') }, 'Show my deposit address'));

    body.innerHTML = '';
    body.append(head, tabBar, panes.deposit, panes.withdraw, panes.buy, h('a', { class: 'wl-hist', href: '#wallet', onclick: () => close() }, 'Full transaction history →'));
    show(tab); paintBal();

    openState.onDeposit = (d) => {
      status.className = 'wl-status ' + (d.belowMinimum ? 'bad' : 'ok');
      status.lastChild.textContent = d.belowMinimum ? `Received ${C.fmtSol(d.sol)} SOL — below the ${cfg.minDepositSol} SOL minimum, not credited` : `Received ${C.fmtSol(d.sol)} SOL — +${C.fmt(d.credits)} credits added`;
      w.deposits.unshift({ ts: Date.now(), sol: d.sol, kind: d.belowMinimum ? 'below-minimum' : 'deposit' }); paintDeposits(w.deposits);
      setTimeout(paintBal, 400);
    };
  };

  /* every tab hears about credited deposits, wherever the player is */
  C.onStream('deposit', (d) => {
    if (d.belowMinimum) C.toast(`Deposit of ${C.fmtSol(d.sol)} SOL is below the minimum and was not credited`, 'err');
    else { C.toast(`Deposit received: +${C.fmt(d.credits)} credits`, 'win'); C.sfx && C.sfx('cash'); }
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
  .wl-bal{display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:linear-gradient(120deg,rgba(153,69,255,.18),rgba(20,241,149,.12));box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
  .wl-coin{width:42px;height:42px;flex:none}.wl-coin svg{width:100%;height:100%}
  .wl-bal b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.wl-k{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
  .wl-sub{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}.wl-usd{color:var(--green)}
  .wl-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:14px 0;padding:4px;border-radius:12px;background:var(--panel2)}
  .wl-tabs button{border:0;border-radius:9px;padding:10px 0;font-weight:800;color:var(--muted);background:none;cursor:pointer}.wl-tabs button.on{background:var(--panel3);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,.3)}
  .wl-pane{display:flex;flex-direction:column;gap:12px}.wl-pane[hidden]{display:none}
  .wl-cur{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wl-sel{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--panel2);font-size:14px}
  .wl-sel span svg{width:22px;height:22px;display:block}.wl-sel.net{justify-content:space-between}
  .wl-dep{display:flex;gap:16px;align-items:stretch}
  .wl-qr{flex:none;width:156px;height:156px;padding:8px;border-radius:12px;background:#fff}.wl-qr svg{width:100%;height:100%;display:block}
  .wl-addr{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
  .wl-addr-v{font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.45;word-break:break-all;padding:10px 12px;border-radius:10px;background:var(--panel2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  .wl-btns{display:flex;gap:8px;flex-wrap:wrap}
  .wl-copy{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:8px;padding:8px 12px;font-weight:800;font-size:13px;cursor:pointer;background:var(--brand);color:var(--brand-ink)}
  .wl-copy svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.wl-copy.ok{background:var(--green)}
  .wl-status{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--muted)}
  .wl-status i{width:9px;height:9px;border-radius:50%;background:#ffc24b;box-shadow:0 0 0 0 rgba(255,194,75,.7);animation:wlp 1.6s infinite}
  .wl-status.ok{color:var(--green)}.wl-status.ok i{background:var(--green);animation:none}.wl-status.bad{color:var(--red)}.wl-status.bad i{background:var(--red);animation:none}
  @keyframes wlp{70%{box-shadow:0 0 0 8px rgba(255,194,75,0)}100%{box-shadow:0 0 0 0 rgba(255,194,75,0)}}
  .wl-notes{margin:0;padding-left:18px;font-size:12.5px;color:var(--muted);display:flex;flex-direction:column;gap:4px}
  .wl-recent{display:flex;flex-direction:column;gap:6px}.wl-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;font-size:13px;padding:8px 10px;border-radius:8px;background:var(--panel2)}
  .wl-amt{display:flex;gap:6px}.wl-amt input{flex:1;min-width:0}
  .wl-receive{display:flex;gap:10px;align-items:baseline;font-size:14px;color:var(--muted)}.wl-receive:empty{display:none}.wl-receive b{color:var(--text);font-size:17px}
  .wl-go{width:100%}
  .wl-buys{display:flex;flex-direction:column;gap:8px}.wl-buy{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:12px 14px;border-radius:10px;background:var(--panel2);color:var(--text);text-decoration:none}
  .wl-buy span{color:var(--muted);font-size:13px}.wl-buy:hover{background:var(--panel3)}
  .wl-hist{display:block;margin-top:14px;text-align:center;font-size:13px;color:var(--muted)}
  @media(max-width:520px){.wl-dep{flex-direction:column;align-items:center}.wl-qr{width:180px;height:180px}.wl-addr{width:100%}.wl-wrap .modal{padding:16px}}
  `;
  document.head.appendChild(css);
})();
