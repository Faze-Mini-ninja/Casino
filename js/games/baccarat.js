(function () {
  const C = Casino, L = Lib, h = C.h;
  const bead = [];
  const EDGES = [['Player', '1:1', '1.24%'], ['Banker', '0.95:1 (5% commission)', '1.06%'], ['Tie', '8:1', '14.36%'], ['Player Pair', '11:1', '10.36%'], ['Banker Pair', '11:1', '10.36%'],
    ['Either Pair', '5:1', '≈13.7%'], ['Perfect Pair', '25:1', '≈11%'], ['Dragon 7 (Banker wins w/ 3-card 7)', '40:1', '≈7.6%'], ['Panda 8 (Player wins w/ 3-card 8)', '25:1', '≈10.2%']];
  const RULES = '<p>8-deck punto banco with standard third-card rules. Bet on Player, Banker or Tie, plus optional pair and bonus side bets. A tie returns Player/Banker bets. Side bets are where the house edge climbs.</p>';
  function mount(root, g) {
    const T = C.chipTable();
    const msg = C.msg();
    const pEl = h('div', { class: 'cards' }), bEl = h('div', { class: 'cards' });
    const pLbl = h('div', { class: 'hand-label' }, 'PLAYER'), bLbl = h('div', { class: 'hand-label' }, 'BANKER');
    const beadEl = h('div', { class: 'history-strip' });
    const paintBead = () => { beadEl.innerHTML = ''; bead.slice(-30).forEach((r) => beadEl.appendChild(h('span', { class: 'pill ' + (r === 'P' ? 'bl' : r === 'B' ? 'r' : 'g') }, r))); };
    paintBead();
    let busy = false, alive = true;
    const sp = (id, cls) => T.spot(id, [L.BAC_BETS[id].name, h('small', null, L.BAC_BETS[id].pays)], 'bspot ' + cls + (g.focus && g.focus.includes(id) ? ' focus' : ''));
    const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
    root.appendChild(h('div', null,
      h('div', { class: 'felt' },
        h('div', { class: 'bac-hands' }, h('div', null, pLbl, pEl), h('div', null, bLbl, bEl)),
        h('div', { class: 'bac-main' }, sp('ppair', ''), sp('player', 'big pl'), sp('tie', 'big ti'), sp('banker', 'big bk'), sp('bpair', '')),
        h('div', { class: 'bac-side' }, sp('epair', ''), sp('perfect', ''), sp('dragon7', ''), sp('panda8', ''))),
      msg.el, h('div', { class: 'controls' }, dealBtn), T.bar,
      h('div', { class: 'center muted', style: 'margin-top:10px;font-size:12px' }, 'Bead plate'), beadEl));
    async function deal() {
      if (busy || !T.ready()) return;
      busy = true; T.lock(true); dealBtn.disabled = true;
      const res = await C.try(() => C.play('baccarat', null, { bets: T.bets }));
      if (!res) { busy = false; T.lock(false); dealBtn.disabled = false; return; }
      T.mark([]); msg.set(' ');
      const r = res.result;
      pEl.innerHTML = ''; bEl.innerHTML = ''; pLbl.textContent = 'PLAYER'; bLbl.textContent = 'BANKER';
      const order = [[pEl, r.P[0]], [bEl, r.B[0]], [pEl, r.P[1]], [bEl, r.B[1]]];
      for (const [el, c] of order) { await C.sleep(350); if (!alive) return; el.appendChild(C.cardEl(c)); }
      const showT = (n) => { pLbl.innerHTML = `PLAYER <span class="tag">${L.bacTotal(r.P.slice(0, n.p))}</span>`; bLbl.innerHTML = `BANKER <span class="tag">${L.bacTotal(r.B.slice(0, n.b))}</span>`; };
      showT({ p: 2, b: 2 });
      if (r.P[2]) { await C.sleep(650); pEl.appendChild(C.cardEl(r.P[2])); showT({ p: 3, b: 2 }); }
      if (r.B[2]) { await C.sleep(650); bEl.appendChild(C.cardEl(r.B[2])); showT({ p: 3, b: 3 }); }
      await C.sleep(300);
      C.settle(res);
      T.mark(r.winners);
      const outcome = r.outcome;
      bead.push(outcome); paintBead();
      const label = outcome === 'P' ? `Player wins ${r.pt}–${r.bt}` : outcome === 'B' ? `Banker wins ${r.bt}–${r.pt}` : `Tie ${r.pt}–${r.bt}`;
      const net = C.net(res);
      msg.set(`${label} • ` + (net > 0 ? `+${C.fmt(net)}` : net === 0 ? 'even' : `−${C.fmt(-net)}`), net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      busy = false; T.lock(false); dealBtn.disabled = false;
    }
    return () => { alive = false; };
  }
  C.register({ n: 6, id: 'baccarat-tie', statId: 'baccarat', name: 'Baccarat: Tie Bet', icon: '🤝', cat: 'cards', edge: '14.36%', blurb: 'Back the Tie at 8:1.', rules: RULES, edges: EDGES, focus: ['tie'], mount });
  C.register({ n: 7, id: 'baccarat-side', statId: 'baccarat', name: 'Baccarat: Side Bets', icon: '💎', cat: 'cards', edge: '7.6–14%', blurb: 'Pairs, Perfect Pair, Dragon 7 and Panda 8.', rules: RULES, edges: EDGES, focus: ['ppair', 'bpair', 'epair', 'perfect', 'dragon7', 'panda8'], mount });
  C.register({ n: 8, id: 'baccarat', name: 'Baccarat: Player/Banker', icon: '🎴', cat: 'cards', edge: '1.24%', blurb: 'Punto banco: bet on Player or Banker.', rules: RULES, edges: EDGES, focus: ['player', 'banker'], mount });
  const css = document.createElement('style');
  css.textContent = `.bac-hands{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
  .bac-main{display:grid;grid-template-columns:1fr 1.4fr 1.2fr 1.4fr 1fr;gap:8px}.bac-side{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
  .bspot.big{min-height:70px;font-size:18px}.bspot.pl{background:rgba(30,90,200,.35)}.bspot.bk{background:rgba(200,30,40,.35)}.bspot.ti{background:rgba(30,160,80,.35)}
  .bspot.focus{border-color:var(--gold);box-shadow:inset 0 0 0 2px rgba(245,197,66,.4)}
  .pill.bl{background:#1d4ed8;border-color:#1d4ed8}
  @media(max-width:700px){.bac-main{grid-template-columns:repeat(3,1fr)}.bac-side{grid-template-columns:repeat(2,1fr)}}`;
  document.head.appendChild(css);
})();
