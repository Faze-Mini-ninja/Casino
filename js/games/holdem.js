(function () {
  const C = Casino, L = Lib, h = C.h;
  const RAKE = 0.05, CAP_BB = 3;
  C.register({
    n: 18, id: 'holdem', name: "Texas Hold'em (Rake)", icon: '♠️', cat: 'cards', edge: `${RAKE * 100}% rake`,
    blurb: 'Fixed-limit Hold\'em vs 3 bots. The house takes a rake from every pot.',
    rules: `<p>Fixed-limit Texas Hold'em against three computer players. Small bets on pre-flop and flop (= big blind), big bets on turn and river (= 2× big blind), maximum 4 bets per round. The house rakes ${RAKE * 100}% of every pot that sees a flop, capped at ${CAP_BB} big blinds ("no flop, no drop"). The bots play on the server; the rake is the house's guaranteed cut.</p>
      <p>Your bets are taken from your balance as you make them; pots you win are credited to your balance. You need 24 big blinds in balance to sit in a hand.</p>`,
    edges: [['Rake', `${RAKE * 100}% of pot, cap ${CAP_BB} BB`, 'Varies (skill game)']],
    round: 'holdem',
    mount(root) {
      let BB = 2, busy = false, live = false;
      const stakesSel = C.select('Stakes (SB/BB)', [[2, '1 / 2'], [10, '5 / 10'], [50, '25 / 50'], [200, '100 / 200']], BB, (v) => { BB = +v; });
      const msg = C.msg();
      const seatEls = [0, 1, 2, 3].map((i) => h('div', { class: 'he-seat s' + i }));
      const boardEl = h('div', { class: 'cards he-board' });
      const potEl = h('div', { class: 'he-pot' });
      const logEl = h('div', { class: 'he-log' });
      const actEl = h('div', { class: 'controls' });
      const dealBtn = h('button', { class: 'btn big', onclick: () => start() }, 'DEAL HAND');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, stakesSel.el, h('div', { class: 'muted', style: 'font-size:12px' }, `Rake: ${RAKE * 100}% of pot, cap ${CAP_BB} BB, only when a flop is dealt.`), h('h3', null, 'Hand log'), logEl),
        h('div', { class: 'stage' }, h('div', { class: 'he-table' }, seatEls, h('div', { class: 'he-center' }, boardEl, potEl)), msg.el, dealBtn, actEl)));
      const f2 = (u) => C.fmt(u / 100);
      function render(v) {
        v.seats.forEach((s, i) => {
          const el = seatEls[i]; el.innerHTML = '';
          el.className = 'he-seat s' + i + (v.turn === i ? ' turn' : '') + (s.folded ? ' folded' : '') + (s.winner ? ' winner' : '');
          el.append(h('div', { class: 'he-name' }, s.name, v.button === i ? h('span', { class: 'he-btn' }, 'D') : ''),
            h('div', { class: 'cards' }, s.cards.map((c) => C.cardEl(c, { hidden: !c }))),
            h('div', { class: 'he-info' }, s.last || ' ', s.total ? ` • in pot ${f2(s.total)}` : ''),
            s.hand ? h('div', { class: 'he-hand' }, s.hand) : '');
        });
        boardEl.innerHTML = ''; v.board.forEach((c) => boardEl.appendChild(C.cardEl(c)));
        potEl.textContent = `Pot ${f2(v.pot)}`;
        logEl.innerHTML = ''; v.log.slice().reverse().forEach((t) => logEl.appendChild(h('div', null, t)));
        actEl.innerHTML = '';
        if (!v.over && v.turn === 0) actEl.append(
          h('button', { class: 'btn red', onclick: () => act('fold') }, 'Fold'),
          h('button', { class: 'btn green', onclick: () => act('call') }, v.toCall ? `Call ${f2(v.toCall)}` : 'Check'),
          v.canRaise ? h('button', { class: 'btn blue', onclick: () => act('raise') }, (v.toCall ? 'Raise to ' : 'Bet ') + f2(v.toCall + v.size)) : '');
      }
      function handle(r) {
        render(r.view);
        if (!r.done) return;
        live = false; dealBtn.style.display = ''; stakesSel.sel.disabled = false;
        C.settle(r);
        const net = C.net(r);
        msg.set(`${r.view.note} • You ${C.netMsg(net)}`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
      async function start() {
        if (busy || live) return; busy = true;
        const r = await C.try(() => C.play('holdem', 'start', { bb: BB }));
        busy = false; if (!r) return;
        live = true; dealBtn.style.display = 'none'; stakesSel.sel.disabled = true; msg.set(' ');
        handle(r);
      }
      async function act(a) {
        if (busy) return; busy = true; actEl.querySelectorAll('button').forEach((b) => (b.disabled = true));
        const r = await C.try(() => C.play('holdem', a, {}));
        busy = false; if (r) handle(r); else actEl.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.he-table{position:relative;width:100%;max-width:820px;height:560px;background:radial-gradient(ellipse at center,var(--felt) 0%,var(--felt2) 100%);border:12px solid #5a3a1a;border-radius:280px;box-shadow:inset 0 0 50px rgba(0,0,0,.6)}
  .he-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:8px}
  .he-pot{font-weight:900;color:var(--gold);font-size:18px;text-shadow:0 1px 3px #000}
  .he-seat{position:absolute;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 10px;border-radius:12px;background:rgba(0,0,0,.35);min-width:170px;transition:box-shadow .2s}
  .he-seat .card{width:52px;height:74px}.he-seat .card .cbig{font-size:24px}.he-seat .card .cr{font-size:15px}.he-seat .card .cs{top:20px;font-size:13px}
  .he-seat.turn{box-shadow:0 0 0 3px var(--gold)}.he-seat.folded{opacity:.45}.he-seat.winner{box-shadow:0 0 0 3px var(--green),0 0 24px rgba(47,209,122,.7)}
  .s0{left:50%;bottom:-6px;transform:translateX(-50%)}.s1{left:-6px;top:50%;transform:translateY(-50%)}.s2{left:50%;top:-6px;transform:translateX(-50%)}.s3{right:-6px;top:50%;transform:translateY(-50%)}
  .he-name{font-weight:800}.he-btn{display:inline-block;margin-left:6px;background:#fff;color:#000;border-radius:50%;width:20px;height:20px;text-align:center;font-size:12px;line-height:20px}
  .he-info{font-size:12px;color:#d6f5e3}.he-hand{font-size:12px;color:var(--gold);font-weight:700}
  .he-log{font-size:12px;color:var(--muted);max-height:340px;overflow:auto;display:flex;flex-direction:column;gap:2px}
  @media(max-width:700px){.he-table{height:640px;border-radius:40px}.he-seat{min-width:0}}`;
  document.head.appendChild(css);
})();
