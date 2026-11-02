(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 10, id: 'videopoker', name: 'Video Poker', icon: '🂡', cat: 'cards', edge: '≈6.5%',
    blurb: 'Jacks or Better with a short 6/5 paytable.',
    rules: '<p>Single-deck draw poker. You are dealt 5 cards, click cards to HOLD, then draw replacements. Paid on the final hand. This is a "6/5" Jacks or Better table with a reduced 250× royal: about 93.5% RTP with perfect strategy (a full-pay 9/6 machine is 99.5%). Typical play loses more.</p>',
    edges: L.VP_PAYS.map(([n, p]) => [n, p + '× bet', '']).concat([['Overall (optimal strategy)', '', '≈6.5%']]),
    round: 'videopoker',
    mount(root) {
      const bet = C.betInput({ value: 5 });
      const msg = C.msg();
      const cardsEl = h('div', { class: 'cards vp-cards' });
      const pt = h('div', { class: 'pays-list vp-pt' }, L.VP_PAYS.map(([n, p]) => h('div', { 'data-n': n }, h('span', null, n), h('b', null, p + '×'))));
      let hand = [], held = [false, false, false, false, false], phase = 'idle', busy = false;
      const btn = h('button', { class: 'btn big', onclick: () => (phase === 'drawn' ? draw() : deal()) }, 'DEAL');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, bet.el, h('h3', null, 'Paytable'), pt),
        h('div', { class: 'stage' }, h('div', { class: 'felt vp-felt' }, cardsEl), msg.el, btn, h('div', { class: 'muted', style: 'font-size:12px' }, 'Tap cards to hold them before drawing.'))));
      render();
      function render(win) {
        cardsEl.innerHTML = '';
        for (let i = 0; i < 5; i++) {
          const c = hand[i];
          const el = h('div', { class: 'vp-slot' }, C.cardEl(c, { hidden: !c, cls: (phase === 'drawn' ? 'clickable' : '') + (held[i] ? ' sel' : '') }), h('div', { class: 'vp-hold' }, held[i] ? 'HELD' : ' '));
          el.onclick = () => { if (phase !== 'drawn') return; held[i] = !held[i]; render(win); };
          cardsEl.appendChild(el);
        }
        pt.querySelectorAll('div').forEach((d) => d.classList.toggle('hit', d.dataset.n === win));
      }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('videopoker', 'start', { bet: bet.value }));
        busy = false; if (!r) return;
        hand = r.view.hand; held = [false, false, false, false, false];
        phase = 'drawn'; bet.disable(true); btn.textContent = 'DRAW';
        msg.set(r.view.dealt ? `Dealt: ${r.view.dealt}` : 'Choose cards to hold', r.view.dealt ? 'push' : '');
        render(r.view.dealt);
      }
      async function draw() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('videopoker', 'draw', { holds: held }));
        busy = false; if (!r) return;
        hand = r.view.hand; phase = 'idle'; bet.disable(false); btn.textContent = 'DEAL';
        C.settle(r);
        msg.set(r.view.pays ? `${r.view.name}: WIN ${C.fmt(r.payout)}` : `${r.view.name}: no win`, r.view.pays ? 'win' : 'lose');
        render(r.view.pays ? r.view.name : null);
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.vp-felt{display:flex;justify-content:center;background:radial-gradient(#1b3b8a,#0d1f4d);border-color:#2a3d7a}.vp-cards .card{width:90px;height:128px}.vp-cards .card .cbig{font-size:46px}
  .vp-slot{display:flex;flex-direction:column;align-items:center;gap:6px}.vp-hold{color:var(--gold);font-weight:900;letter-spacing:.1em}
  @media(max-width:600px){.vp-cards .card{width:58px;height:84px}.vp-cards .card .cbig{font-size:26px}}`;
  document.head.appendChild(css);
})();
