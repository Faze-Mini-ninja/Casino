(function () {
  const C = Casino, L = Lib, h = C.h;
  C.register({
    n: 33, id: 'reddog', name: 'Red Dog', icon: '◆', cat: 'table', edge: '≈2.8%',
    blurb: 'Will the third card land between the first two?',
    rules: '<p>Two cards are dealt (Ace high). If they are consecutive the hand pushes. If they are a pair, a third card is dealt: three of a kind pays 11:1, otherwise it pushes. Otherwise you see the spread and can <b>raise</b> (double your bet) or <b>call</b>. If the third card falls strictly between the two, you win by the spread table.</p>',
    edges: [['Spread 1', '5:1', ''], ['Spread 2', '4:1', ''], ['Spread 3', '2:1', ''], ['Spread 4–11', '1:1', ''], ['Three of a kind', '11:1', ''], ['Overall (raise on 7+)', '', '≈2.8%']],
    round: 'reddog',
    mount(root) {
      const ante = C.betInput({ value: 10, label: 'Bet' });
      const msg = C.msg();
      const c1 = h('div', { class: 'cards' }), c2 = h('div', { class: 'cards' }), c3 = h('div', { class: 'cards' });
      const spreadEl = h('div', { class: 'rd-spread' });
      let busy = false;
      const dealBtn = h('button', { class: 'btn big', onclick: () => deal() }, 'DEAL');
      const raiseBtn = h('button', { class: 'btn green big', onclick: () => act('raise') }, 'RAISE 2×');
      const callBtn = h('button', { class: 'btn ghost big', onclick: () => act('call') }, 'CALL');
      const pt = h('div', { class: 'pays-list' }, [['Spread 1', '5:1'], ['Spread 2', '4:1'], ['Spread 3', '2:1'], ['Spread 4+', '1:1'], ['Three of a kind', '11:1']].map(([a, b]) => h('div', null, h('span', null, a), h('b', null, b))));
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, ante.el, h('h3', null, 'Pays'), pt, h('p', { class: 'muted small' }, 'Tip: raise when the spread is 7 or more.')),
        h('div', { class: 'stage' }, h('div', { class: 'felt rd' }, c1, h('div', { class: 'rd-mid' }, c3, spreadEl), c2), msg.el, h('div', { class: 'controls' }, dealBtn, raiseBtn, callBtn))));
      const show = (on) => { dealBtn.style.display = on ? 'none' : ''; raiseBtn.style.display = callBtn.style.display = on ? '' : 'none'; ante.disable(on); };
      show(false);
      [c1, c2, c3].forEach((e) => e.append(C.cardEl(null, { hidden: true })));
      const put = (el, c, cls) => { el.innerHTML = ''; el.append(C.cardEl(c, { hidden: !c, cls })); };
      function finish(r) {
        show(false); C.settle(r);
        if (r.view.third) put(c3, r.view.third, r.view.win ? 'glow' : '');
        const net = C.net(r);
        msg.set(`${r.view.note} (${C.netMsg(net)})`, net > 0 ? 'win' : net === 0 ? 'push' : 'lose');
      }
      async function deal() {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('reddog', 'start', { ante: ante.value }));
        busy = false; if (!r) return;
        put(c1, r.view.c1); await C.sleep(200); put(c2, r.view.c2); put(c3, null); msg.set(' ');
        spreadEl.textContent = r.view.spread ? `Spread ${r.view.spread} · pays ${r.view.pays}:1` : '';
        if (r.done) { await C.sleep(350); return finish(r); }
        show(true); msg.set('Raise or call?');
      }
      async function act(a) {
        if (busy) return; busy = true;
        const r = await C.try(() => C.play('reddog', a, {}));
        busy = false; if (!r) return;
        await C.sleep(250); finish(r);
      }
    },
  });
  const css = document.createElement('style');
  css.textContent = `.rd{display:flex;align-items:center;justify-content:center;gap:22px;min-height:220px}.rd-mid{display:flex;flex-direction:column;align-items:center;gap:8px}.rd-spread{font-weight:800;color:var(--gold);min-height:20px;font-size:13px}`;
  document.head.appendChild(css);
})();
