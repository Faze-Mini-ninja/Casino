/* Table games: Mini Roulette, Andar Bahar, Chuck-a-Luck, Crown & Anchor, Under/Over 7, Dice Duel. */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const css = (t) => { const s = document.createElement('style'); s.textContent = t; document.head.appendChild(s); };
  const strip = (el, max = 16) => { while (el.children.length > max) el.lastChild.remove(); };

  /* ---------------- Mini Roulette ---------------- */
  C.register({
    n: 42, id: 'miniroulette', name: 'Mini Roulette', icon: '◍', cat: 'table', edge: '7.69%',
    blurb: 'Thirteen pockets, faster spins, 11:1 straight-up.',
    rules: '<p>A compact wheel with numbers 0–12. Straight-up pays 11:1, columns 2:1, red/black, odd/even and 1–6/7–12 pay 1:1. Zero loses all outside bets.</p>',
    edges: [['Straight up', '11:1', '7.69%'], ['Column', '2:1', '7.69%'], ['Red/Black, Odd/Even, 1–6/7–12', '1:1', '7.69%']],
    mount(root) {
      const T = C.chipTable(); let busy = false, rot = 0;
      const msg = C.msg(), hist = h('div', { class: 'history-strip' });
      const order = [0, 5, 10, 3, 8, 1, 12, 7, 2, 9, 4, 11, 6], seg = (Math.PI * 2) / 13;
      const cv = h('canvas', { width: 300, height: 300, class: 'mini-wheel' }), g = cv.getContext('2d');
      const col = (n) => (n === 0 ? '#15803d' : L.MINI_REDS.has(n) ? '#c1121f' : '#1a1a1a');
      function draw(hl = -1) {
        g.clearRect(0, 0, 300, 300); g.beginPath(); g.arc(150, 150, 146, 0, 7); g.fillStyle = '#5a3a1a'; g.fill();
        order.forEach((n, i) => { const a0 = rot + i * seg - Math.PI / 2; g.beginPath(); g.moveTo(150, 150); g.arc(150, 150, 138, a0, a0 + seg); g.closePath(); g.fillStyle = col(n); g.globalAlpha = hl < 0 || hl === i ? 1 : 0.6; g.fill(); g.globalAlpha = 1; g.strokeStyle = '#d4af37'; g.stroke();
          g.save(); g.translate(150, 150); g.rotate(a0 + seg / 2); g.translate(118, 0); g.rotate(Math.PI / 2); g.fillStyle = '#fff'; g.font = 'bold 15px Arial'; g.textAlign = 'center'; g.fillText(n, 0, 5); g.restore(); });
        g.beginPath(); g.arc(150, 150, 70, 0, 7); g.fillStyle = '#3b2410'; g.fill(); g.beginPath(); g.arc(150, 150, 28, 0, 7); g.fillStyle = '#d4af37'; g.fill();
        g.beginPath(); g.moveTo(140, 2); g.lineTo(160, 2); g.lineTo(150, 18); g.fillStyle = '#ffc24b'; g.fill();
      }
      draw();
      const num = (n) => T.spot('n:' + n, h('span', null, n), 'mrn ' + (n === 0 ? 'g' : L.MINI_REDS.has(n) ? 'r' : 'b'));
      const out = (id, label) => T.spot(id, h('span', null, label), 'mro');
      const grid = h('div', { class: 'mr-grid' }, h('div', { class: 'mr-zero' }, num(0)), h('div', { class: 'mr-nums' }, [3, 2, 1].map((row) => [...[0, 1, 2, 3].map((c) => num(c * 3 + row)), out('c' + row, '2:1')])));
      const outs = h('div', { class: 'mr-outs' }, out('low', '1–6'), out('even', 'EVEN'), out('red', 'RED'), out('black', 'BLACK'), out('odd', 'ODD'), out('high', '7–12'));
      const btn = h('button', { class: 'btn big', onclick: () => spin() }, 'SPIN');
      root.appendChild(h('div', { class: 'roulette' }, h('div', { class: 'rleft' }, cv, msg.el, btn, hist), h('div', null, h('div', { class: 'felt' }, grid, outs), T.bar)));
      async function spin() {
        if (busy || !T.ready()) return; busy = true; T.lock(true); btn.disabled = true;
        const r = await C.try(() => C.play('miniroulette', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
        T.mark([]);
        const k = order.indexOf(r.result.n), target = (((-(k + 0.5) * seg) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), cur = ((rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const s0 = rot, e = rot + Math.PI * 8 + (((target - cur) + Math.PI * 2) % (Math.PI * 2)), t0 = performance.now();
        await new Promise((done) => { (function f(t) { const p = Math.min(1, (t - t0) / 3000); rot = s0 + (e - s0) * (1 - Math.pow(1 - p, 3)); draw(); if (p < 1) requestAnimationFrame(f); else done(); })(t0); });
        draw(k); C.settle(r); T.mark(['n:' + r.result.n, ...r.result.winners]);
        hist.prepend(h('span', { class: 'pill ' + (r.result.n === 0 ? 'g' : L.MINI_REDS.has(r.result.n) ? 'r' : 'b') }, String(r.result.n))); strip(hist);
        msg.set(`${r.result.n} — ` + (r.payout ? `pays ${C.fmt(r.payout)}` : 'no win'), r.payout > r.wager ? 'win' : 'lose');
        busy = false; T.lock(false); btn.disabled = false;
      }
    },
  });
  css(`.mini-wheel{width:min(300px,80vw)}.mr-grid{display:flex;gap:4px}.mr-zero{display:flex;width:52px}.mr-zero .spot{flex:1}
  .mr-nums{flex:1;display:grid;grid-template-columns:repeat(4,1fr) 52px;gap:4px}
  .mrn{min-height:52px;font-size:17px}.mrn.r{background:#c1121f}.mrn.b{background:#1a1a1a}.mrn.g{background:#15803d}
  .mr-outs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-top:6px}`);

  /* ---------------- Andar Bahar ---------------- */
  C.register({
    n: 43, id: 'andarbahar', name: 'Andar Bahar', icon: 'A', cat: 'table', edge: '2–3%',
    blurb: 'Which side gets the matching card first?',
    rules: '<p>One card is turned face up in the middle. Cards are then dealt alternately to Andar (left) and Bahar (right), starting with Andar, until one matches the middle card’s rank. Andar pays 0.9:1, Bahar pays 1:1.</p>',
    edges: [['Andar', '0.9:1', '≈2.0%'], ['Bahar', '1:1', '≈3.1%']],
    mount(root) {
      const T = C.chipTable(); let busy = false;
      const msg = C.msg(), hist = h('div', { class: 'history-strip' });
      const joker = h('div', { class: 'cards' }, C.cardEl(null, { hidden: true })), aRow = h('div', { class: 'ab-row' }), bRow = h('div', { class: 'ab-row' });
      const btn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      root.appendChild(h('div', null, h('div', { class: 'felt ab' },
        h('div', { class: 'ab-side' }, h('div', { class: 'hand-label' }, 'ANDAR'), aRow, T.spot('andar', ['ANDAR', h('small', null, '0.9 : 1')], 'abspot')),
        h('div', { class: 'ab-mid' }, h('div', { class: 'hand-label' }, 'JOKER'), joker),
        h('div', { class: 'ab-side' }, h('div', { class: 'hand-label' }, 'BAHAR'), bRow, T.spot('bahar', ['BAHAR', h('small', null, '1 : 1')], 'abspot'))),
      h('div', { class: 'stage', style: 'min-height:0' }, msg.el, btn, hist), T.bar));
      async function deal() {
        if (busy || !T.ready()) return; busy = true; T.lock(true); btn.disabled = true;
        const r = await C.try(() => C.play('andarbahar', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
        T.mark([]); aRow.innerHTML = ''; bRow.innerHTML = ''; msg.set(' ');
        joker.innerHTML = ''; joker.append(C.cardEl(r.result.joker, { cls: 'glow' }));
        const n = r.result.andar.length + r.result.bahar.length, delay = Math.max(70, Math.min(260, 3200 / n));
        for (let i = 0; i < n; i++) {
          await C.sleep(delay);
          const side = i % 2 ? r.result.bahar : r.result.andar, c = side[Math.floor(i / 2)], last = i === n - 1;
          (i % 2 ? bRow : aRow).append(C.cardEl(c, { cls: last ? 'glow' : '' }));
          C.sfx && C.sfx('tick');
        }
        C.settle(r); T.mark([r.result.winner]);
        hist.prepend(h('span', { class: 'pill ' + (r.result.winner === 'andar' ? 'bl' : 'r') }, r.result.winner[0].toUpperCase())); strip(hist, 24);
        msg.set(`${r.result.winner === 'andar' ? 'Andar' : 'Bahar'} wins after ${r.result.dealt} cards — ` + (r.payout ? `pays ${C.fmt(r.payout)}` : 'no win'), r.payout > r.wager ? 'win' : 'lose');
        busy = false; T.lock(false); btn.disabled = false;
      }
    },
  });
  css(`.ab{display:grid;grid-template-columns:1fr 120px 1fr;gap:14px;align-items:start}.ab-side{display:flex;flex-direction:column;gap:8px}.ab-mid{display:flex;flex-direction:column;align-items:center}
  .ab-row{display:flex;flex-wrap:wrap;min-height:104px;padding-right:44px}.ab-row .card{margin-right:-44px;margin-bottom:6px}.abspot{min-height:58px;font-size:17px}
  @media(max-width:900px){.ab{grid-template-columns:1fr 70px 1fr}.ab-row .card{margin-right:-36px}}`);

  /* ---------------- Chuck-a-Luck & Crown and Anchor ---------------- */
  function threeDice(cfg) {
    C.register({
      n: cfg.n, id: cfg.id, name: cfg.name, icon: cfg.icon, cat: 'table', edge: '7.87%', blurb: cfg.blurb,
      rules: `<p>${cfg.rule} Bet on one or more ${cfg.word}s. If your ${cfg.word} shows on one die you win 1:1, on two dice 2:1, on all three 3:1.</p>`,
      edges: [['One match', '1:1', ''], ['Two matches', '2:1', ''], ['Three matches', '3:1', ''], ['Overall', '', '7.87%']],
      mount(root) {
        const T = C.chipTable(); let busy = false;
        const msg = C.msg(), hist = h('div', { class: 'history-strip' });
        const dice = h('div', { class: 'dice-row cfdice' }, cfg.faces.slice(0, 3).map((f) => cfg.dieEl(f)));
        const board = h('div', { class: 'cf-board' }, cfg.faces.map((f) => T.spot(f, [cfg.faceArt(f), h('small', null, cfg.label(f))], 'cfspot')));
        const btn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
        root.appendChild(h('div', null, h('div', { class: 'felt cf-felt ' + cfg.id }, cfg.cage ? h('div', { class: 'cage' }, dice) : dice, board), h('div', { class: 'stage', style: 'min-height:0' }, msg.el, btn, hist), T.bar));
        async function roll() {
          if (busy || !T.ready()) return; busy = true; T.lock(true); btn.disabled = true;
          const r = await C.try(() => C.play(cfg.id, null, { bets: T.bets }));
          if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
          T.mark([]);
          dice.classList.add('shake');
          for (let i = 0; i < 8; i++) { dice.innerHTML = ''; for (let k = 0; k < 3; k++) dice.append(cfg.dieEl(cfg.faces[Math.floor(Math.random() * 6)])); await C.sleep(85); }
          dice.classList.remove('shake'); dice.innerHTML = ''; r.result.dice.forEach((f) => dice.append(cfg.dieEl(f)));
          C.settle(r); T.mark(r.result.winners);
          hist.prepend(h('span', { class: 'pill' }, r.result.dice.map(cfg.short).join(' '))); strip(hist, 10);
          msg.set(r.payout ? `Pays ${C.fmt(r.payout)}` : 'No match', r.payout > r.wager ? 'win' : 'lose');
          busy = false; T.lock(false); btn.disabled = false;
        }
      },
    });
  }
  threeDice({ n: 44, id: 'chuckaluck', name: 'Chuck-a-Luck', icon: '⚂', word: 'number', cage: true, blurb: 'The old birdcage dice game. Pick a number, three dice tumble.',
    rule: 'Three dice tumble in the birdcage.', faces: ['1', '2', '3', '4', '5', '6'], dieEl: (f) => C.dieEl(+f), faceArt: (f) => C.dieEl(+f, 'mini'), label: () => '1 · 2 · 3 : 1', short: (f) => f });
  const CA_ART = { diamond: 'suitDiamond' };
  const CA_LABEL = { crown: 'Crown', anchor: 'Anchor', heart: 'Heart', spade: 'Spade', diamond: 'Diamond', club: 'Club' };
  threeDice({ n: 45, id: 'crownanchor', name: 'Crown & Anchor', icon: '♛', word: 'symbol', blurb: 'The sailors’ dice game. Crowns, anchors and suits.',
    rule: 'Three dice marked with a crown, an anchor and the four card suits are thrown.', faces: L.CROWN,
    dieEl: (f) => h('div', { class: 'cadie' }, C.artEl(CA_ART[f] || f)), faceArt: (f) => h('div', { class: 'ca-face' }, C.artEl(CA_ART[f] || f)), label: (f) => CA_LABEL[f], short: (f) => CA_LABEL[f][0] });
  css(`.cf-felt{display:flex;flex-direction:column;align-items:center;gap:18px}.cf-board{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;width:100%}
  .cfspot{min-height:96px;gap:6px}.cfspot .die.mini{width:40px;height:40px;padding:5px}.cfspot .die.mini .pip{width:7px;height:7px}
  .cage{border:3px solid #d4af37;border-radius:50% 50% 16px 16px;padding:30px 26px 18px;background:radial-gradient(circle at 50% 30%,rgba(212,175,55,.15),transparent 70%)}
  .dice-row.shake{animation:shk .25s infinite}@keyframes shk{25%{transform:translate(-3px,2px) rotate(-2deg)}75%{transform:translate(3px,-2px) rotate(2deg)}}
  .cadie{width:56px;height:56px;border-radius:12px;background:linear-gradient(145deg,#fff,#dfe4ea);padding:9px;box-shadow:0 6px 14px rgba(0,0,0,.45)}.cadie .artw{width:100%;height:100%}
  .ca-face{width:54px;height:54px;padding:8px;border-radius:12px;background:linear-gradient(145deg,#fff,#dfe4ea);box-shadow:0 4px 10px rgba(0,0,0,.35)}.ca-face .artw{width:100%;height:100%}
  @media(max-width:900px){.cf-board{grid-template-columns:repeat(3,1fr)}}`);

  /* ---------------- Under / Over 7 ---------------- */
  C.register({
    n: 46, id: 'uo7', name: 'Under / Over 7', icon: '7', cat: 'table', edge: '16.67%',
    blurb: 'The classic fairground dice bet. Lucky seven pays 4:1.',
    rules: '<p>Two dice are rolled. Under 7 pays 1:1, over 7 pays 1:1, exactly 7 pays 4:1.</p>',
    edges: [['Under 7', '1:1', '16.67%'], ['Exactly 7', '4:1', '16.67%'], ['Over 7', '1:1', '16.67%']],
    mount(root) {
      const T = C.chipTable(); let busy = false;
      const msg = C.msg(), hist = h('div', { class: 'history-strip' }), dice = h('div', { class: 'dice-row' }, C.dieEl(3, 'red'), C.dieEl(4, 'red'));
      const btn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
      root.appendChild(h('div', null, h('div', { class: 'felt uo-felt' }, dice, h('div', { class: 'uo-board' }, T.spot('under', ['UNDER 7', h('small', null, '2 – 6 · pays 1:1')], 'uospot'), T.spot('seven', ['7', h('small', null, 'pays 4:1')], 'uospot seven'), T.spot('over', ['OVER 7', h('small', null, '8 – 12 · pays 1:1')], 'uospot'))),
        h('div', { class: 'stage', style: 'min-height:0' }, msg.el, btn, hist), T.bar));
      async function roll() {
        if (busy || !T.ready()) return; busy = true; T.lock(true); btn.disabled = true;
        const r = await C.try(() => C.play('uo7', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
        T.mark([]); await C.rollDice(dice, r.result.dice, 'red'); C.settle(r); T.mark([r.result.hit]);
        const t = r.result.dice[0] + r.result.dice[1];
        hist.prepend(h('span', { class: 'pill ' + (t === 7 ? 'g' : t < 7 ? 'bl' : 'r') }, String(t))); strip(hist);
        msg.set(`${t} — ` + (r.payout ? `pays ${C.fmt(r.payout)}` : 'no win'), r.payout > r.wager ? 'win' : 'lose');
        busy = false; T.lock(false); btn.disabled = false;
      }
    },
  });
  css(`.uo-felt{display:flex;flex-direction:column;align-items:center;gap:20px}.uo-board{display:grid;grid-template-columns:1fr .7fr 1fr;gap:10px;width:100%;max-width:640px}
  .uospot{min-height:90px;font-size:20px}.uospot.seven{font-size:40px;background:rgba(255,194,75,.12)}`);

  /* ---------------- Dice Duel ---------------- */
  C.register({
    n: 47, id: 'duel', name: 'Dice Duel', icon: '⚅', cat: 'table', edge: '9.9–11.3%',
    blurb: 'Your two dice against the dealer’s. Ties go to the house.',
    rules: '<p>You and the dealer each roll two dice. Higher total wins 1:1; the dealer wins ties. The Tie bet pays 7:1 when both totals match.</p>',
    edges: [['Player', '1:1 (dealer wins ties)', '11.27%'], ['Tie', '7:1', '9.88%']],
    mount(root) {
      const T = C.chipTable(); let busy = false;
      const msg = C.msg(), you = h('div', { class: 'dice-row' }, C.dieEl(6), C.dieEl(5)), dealer = h('div', { class: 'dice-row' }, C.dieEl(6, 'red'), C.dieEl(5, 'red'));
      const yT = h('span', { class: 'tag' }), dT = h('span', { class: 'tag' });
      const btn = h('button', { class: 'btn big', onclick: () => roll() }, 'ROLL');
      root.appendChild(h('div', null, h('div', { class: 'felt duel' }, h('div', null, h('div', { class: 'hand-label' }, 'DEALER ', dT), dealer), h('div', { class: 'war-vs' }, 'VS'), h('div', null, h('div', { class: 'hand-label' }, 'YOU ', yT), you)),
        h('div', { class: 'colspots duel-spots', style: 'margin:14px auto 0' }, T.spot('player', ['YOU WIN', h('small', null, '1:1')], 'colspot'), T.spot('tie', ['TIE', h('small', null, '7:1')], 'colspot green')),
        h('div', { class: 'stage', style: 'min-height:0' }, msg.el, btn), T.bar));
      async function roll() {
        if (busy || !T.ready()) return; busy = true; T.lock(true); btn.disabled = true;
        const r = await C.try(() => C.play('duel', null, { bets: T.bets }));
        if (!r) { busy = false; T.lock(false); btn.disabled = false; return; }
        T.mark([]); yT.textContent = dT.textContent = '';
        await C.rollDice(dealer, r.result.dealer, 'red'); dT.textContent = r.result.dealer[0] + r.result.dealer[1];
        await C.rollDice(you, r.result.you); yT.textContent = r.result.you[0] + r.result.you[1];
        C.settle(r); T.mark(r.result.res === 'dealer' ? [] : [r.result.res]);
        msg.set(r.result.res === 'player' ? `You win — ${C.fmt(r.payout)}` : r.result.res === 'tie' ? (r.payout ? `Tie! Pays ${C.fmt(r.payout)}` : 'Tie — dealer wins') : 'Dealer wins', r.payout > r.wager ? 'win' : 'lose');
        busy = false; T.lock(false); btn.disabled = false;
      }
    },
  });
  css('.duel{display:flex;justify-content:space-around;align-items:center;gap:18px}.colspots.duel-spots{grid-template-columns:1fr 1fr;max-width:440px}.colspots .colspot.green{background:rgba(24,168,101,.25)}');
})();
