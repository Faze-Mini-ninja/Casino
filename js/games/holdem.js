(function () {
  const C = Casino, L = Lib, h = C.h;
  const RAKE = 0.05, CAP_BB = 3;
  const cid = (c) => c.r * 4 + c.s;

  /** Monte Carlo equity of `hole` vs nOpp random hands. */
  function equity(hole, board, nOpp, iters = 220) {
    const known = new Set([...hole, ...board].map(cid));
    const rest = L.newDeck(1).filter((c) => !known.has(cid(c)));
    const need = 5 - board.length + 2 * nOpp, n = rest.length;
    let win = 0;
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < need; k++) { const j = k + L.int(n - k); const t = rest[k]; rest[k] = rest[j]; rest[j] = t; }
      const b = board.concat(rest.slice(0, 5 - board.length));
      const me = L.best5(hole.concat(b)).score;
      let best = 0, ties = 0, lost = false;
      for (let o = 0; o < nOpp; o++) {
        const off = 5 - board.length + o * 2;
        const s = L.best5([rest[off], rest[off + 1], ...b]).score;
        if (s > me) { lost = true; break; }
        if (s === me) ties++;
        if (s > best) best = s;
      }
      if (!lost) win += 1 / (ties + 1);
    }
    return win / iters;
  }

  C.register({
    n: 18, id: 'holdem', name: "Texas Hold'em (Rake)", icon: '♠️', cat: 'cards', edge: `${RAKE * 100}% rake`,
    blurb: 'Fixed-limit Hold\'em vs 3 bots. The house takes a rake from every pot.',
    rules: `<p>Fixed-limit Texas Hold'em against three computer players. Small bets on pre-flop and flop (= big blind), big bets on turn and river (= 2× big blind), maximum 4 bets per round. The house rakes ${RAKE * 100}% of every pot that sees a flop, capped at ${CAP_BB} big blinds ("no flop, no drop"). You compete against the bots — the house edge depends on your skill; the rake is the house's guaranteed cut.</p>
      <p>Your bets are taken from your balance as you make them; pots you win are credited to your balance. You need 24 big blinds in balance to sit in a hand.</p>`,
    edges: [['Rake', `${RAKE * 100}% of pot, cap ${CAP_BB} BB`, 'Varies (skill game)']],
    mount(root) {
      let BB = 2, alive = true, running = false, button = L.int(4);
      const stakesSel = C.select('Stakes (SB/BB)', [[2, '1 / 2'], [10, '5 / 10'], [50, '25 / 50'], [200, '100 / 200']], BB, (v) => { BB = +v; });
      const msg = C.msg();
      const seats = [{ name: 'You', bot: false }, { name: 'Ava 🤖', bot: true }, { name: 'Max 🤖', bot: true }, { name: 'Zoe 🤖', bot: true }];
      const seatEls = seats.map((s, i) => h('div', { class: 'he-seat s' + i }));
      const boardEl = h('div', { class: 'cards he-board' });
      const potEl = h('div', { class: 'he-pot' });
      const logEl = h('div', { class: 'he-log' });
      const actEl = h('div', { class: 'controls' });
      const dealBtn = h('button', { class: 'btn big', onclick: () => start() }, 'DEAL HAND');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, stakesSel.el, h('div', { class: 'muted', style: 'font-size:12px' }, `Rake: ${RAKE * 100}% of pot, cap ${CAP_BB} BB, only when a flop is dealt.`), h('h3', null, 'Hand log'), logEl),
        h('div', { class: 'stage' }, h('div', { class: 'he-table' }, seatEls, h('div', { class: 'he-center' }, boardEl, potEl)), msg.el, dealBtn, actEl)));
      let H = null; // hand state
      const log = (t) => { logEl.prepend(h('div', null, t)); while (logEl.children.length > 60) logEl.lastChild.remove(); };
      function render(showdown) {
        seats.forEach((s, i) => {
          const el = seatEls[i]; el.innerHTML = '';
          const show = !s.bot || showdown;
          el.className = 'he-seat s' + i + (H && H.turn === i ? ' turn' : '') + (s.folded ? ' folded' : '') + (s.winner ? ' winner' : '');
          el.append(h('div', { class: 'he-name' }, s.name, H && button === i ? h('span', { class: 'he-btn' }, 'D') : null),
            h('div', { class: 'cards' }, (s.cards || []).map((c) => C.cardEl(c, { hidden: !show || (s.folded && s.bot) }))),
            h('div', { class: 'he-info' }, s.last || ' ', s.total ? ` • in pot ${C.fmt(s.total)}` : ''),
            showdown && s.hand && !s.folded ? h('div', { class: 'he-hand' }, s.hand) : '');
        });
        boardEl.innerHTML = '';
        if (H) H.board.forEach((c) => boardEl.appendChild(C.cardEl(c)));
        potEl.textContent = H ? `Pot ${C.fmt(H.pot)}` : '';
      }
      render();
      function put(i, amt) {
        const s = seats[i];
        if (amt <= 0) return true;
        if (!s.bot) { if (!C.bet('holdem', amt)) return false; H.playerIn += amt; }
        s.inStreet = C.r2(s.inStreet + amt); s.total = C.r2(s.total + amt); H.pot = C.r2(H.pot + amt);
        return true;
      }
      function playerDecide(toCall, canRaise, size) {
        return new Promise((res) => {
          actEl.innerHTML = '';
          actEl.append(
            h('button', { class: 'btn red', onclick: () => res('fold') }, 'Fold'),
            h('button', { class: 'btn green', onclick: () => res('call') }, toCall ? `Call ${C.fmt(toCall)}` : 'Check'),
            canRaise ? h('button', { class: 'btn blue', onclick: () => res('raise') }, (toCall ? 'Raise to ' : 'Bet ') + C.fmt(toCall + size)) : '');
          H.resolve = res;
        }).then((a) => { actEl.innerHTML = ''; return a; });
      }
      function botDecide(i, toCall, canRaise) {
        const s = seats[i];
        const nOpp = seats.filter((x) => !x.folded).length - 1;
        const eq = equity(s.cards, H.board, nOpp);
        const ratio = eq * (nOpp + 1), r = L.random();
        const potOdds = toCall / (H.pot + toCall);
        if (ratio > 1.7 && canRaise && r < 0.85) return 'raise';
        if (toCall === 0) return (canRaise && ((ratio > 1.25 && r < 0.6) || r < 0.07)) ? 'raise' : 'call';
        if (eq > potOdds * 1.1 || r < 0.04) return 'call';
        return 'fold';
      }
      async function bettingRound(street) {
        const size = street < 2 ? BB : BB * 2;
        let curBet = street === 0 ? BB : 0, raises = street === 0 ? 1 : 0;
        seats.forEach((s) => { if (street > 0) s.inStreet = 0; s.acted = false; });
        let i = street === 0 ? (button + 3) % 4 : (button + 1) % 4;
        for (let guard = 0; guard < 200; guard++) {
          if (!alive) throw new Error('left');
          const active = seats.filter((s) => !s.folded);
          if (active.length === 1) return;
          if (active.every((s) => s.acted && s.inStreet === curBet)) return;
          const s = seats[i];
          if (!s.folded) {
            H.turn = i; render();
            const toCall = C.r2(curBet - s.inStreet), canRaise = raises < 4;
            let a;
            if (s.bot) { await C.sleep(550); a = botDecide(i, toCall, canRaise); }
            else a = await playerDecide(toCall, canRaise, size);
            if (!alive) throw new Error('left');
            if (a === 'fold') { s.folded = true; s.last = 'Fold'; }
            else if (a === 'call') { put(i, toCall); s.last = toCall ? 'Call ' + C.fmt(toCall) : 'Check'; }
            else { put(i, toCall + size); curBet = C.r2(curBet + size); raises++; seats.forEach((o) => { if (o !== s) o.acted = false; }); s.last = (curBet === size && street > 0 ? 'Bet ' : 'Raise to ') + C.fmt(curBet); }
            s.acted = true;
            log(`${s.name}: ${s.last}`);
            if (!s.bot && s.folded) return;
          }
          i = (i + 1) % 4;
        }
      }
      async function start() {
        if (running) return;
        if (C.balance() < BB * 24) return C.toast(`You need at least ${C.fmt(BB * 24)} (24 big blinds) to play these stakes`, 'err');
        running = true; dealBtn.style.display = 'none'; stakesSel.sel.disabled = true; msg.set(' ');
        button = (button + 1) % 4;
        const deck = L.shuffle(L.newDeck(1));
        H = { board: [], pot: 0, playerIn: 0, turn: -1 };
        seats.forEach((s) => { s.cards = [deck.pop(), deck.pop()]; s.folded = false; s.inStreet = 0; s.total = 0; s.last = ''; s.winner = false; s.hand = ''; });
        log(`— New hand (blinds ${C.fmt(BB / 2)}/${C.fmt(BB)}) —`);
        const sb = (button + 1) % 4, bb = (button + 2) % 4;
        put(sb, BB / 2); seats[sb].last = 'SB ' + C.fmt(BB / 2);
        put(bb, BB); seats[bb].last = 'BB ' + C.fmt(BB);
        render();
        try {
          let flopSeen = false;
          for (let street = 0; street < 4; street++) {
            if (street === 1) { deck.pop(); H.board.push(deck.pop(), deck.pop(), deck.pop()); flopSeen = true; }
            if (street >= 2) { deck.pop(); H.board.push(deck.pop()); }
            if (street > 0) { seats.forEach((s) => { if (!s.folded) s.last = ''; }); log(['', 'Flop', 'Turn', 'River'][street] + ': ' + H.board.map(L.cardStr).join(' ')); render(); await C.sleep(400); }
            await bettingRound(street);
            if (seats[0].folded || seats.filter((s) => !s.folded).length === 1) break;
          }
          H.turn = -1;
          const rake = flopSeen ? Math.min(L.round2(H.pot * RAKE), CAP_BB * BB) : 0;
          const net = C.r2(H.pot - rake);
          let pay = 0, note;
          if (seats[0].folded) note = 'You folded';
          else {
            const live = seats.filter((s) => !s.folded);
            let winners;
            if (live.length === 1) winners = live;
            else {
              while (H.board.length < 5) H.board.push(deck.pop());
              live.forEach((s) => { const b = L.best5([...s.cards, ...H.board]); s.score = b.score; s.hand = L.handName(b.score); });
              const best = Math.max(...live.map((s) => s.score));
              winners = live.filter((s) => s.score === best);
            }
            winners.forEach((w) => (w.winner = true));
            const share = L.round2(net / winners.length);
            if (winners.includes(seats[0])) pay = C.win('holdem', share);
            note = winners.map((w) => w.name).join(' & ') + (live.length > 1 ? ` win with ${winners[0].hand}` : ' win (everyone folded)') + ` — pot ${C.fmt(H.pot)}, rake ${C.fmt(rake)}`;
          }
          log(note);
          C.record('holdem', H.playerIn, pay, note);
          render(!seats[0].folded && seats.filter((s) => !s.folded).length > 1);
          const pnet = pay - H.playerIn;
          msg.set(`${note} • You ${pnet >= 0 ? '+' : '−'}${C.fmt(Math.abs(pnet))}`, pnet > 0 ? 'win' : pnet === 0 ? 'push' : 'lose');
        } catch (e) { if (alive) throw e; }
        running = false; dealBtn.style.display = ''; stakesSel.sel.disabled = false; actEl.innerHTML = '';
      }
      return () => { alive = false; if (H && H.resolve) H.resolve('fold'); };
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
