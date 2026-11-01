(function () {
  const C = Casino, L = Lib, h = C.h;
  const RCOL = { common: '#7d8ea3', uncommon: '#22c55e', rare: '#3d8bff', epic: '#8b5cf6', legendary: '#f0a91c', mythic: '#e11d48' };
  C.register({
    n: 32, id: 'cases', name: 'Cases', icon: '▣', cat: 'originals', edge: 'set by admin',
    blurb: 'Open a case and win whatever multiplier it lands on.',
    rules: '<p>Choose a case and your bet, then open it. The reel stops on one item and you win your bet × that item’s multiplier. Rarer items pay more. The Jackpot case is the most volatile.</p>',
    edges: Object.entries(L.CASES).map(([id, c]) => [c.name + ' case', 'up to ' + Math.max(...L.caseTable(id).items.map((i) => i.m)) + '×', '']),
    mount(root) {
      const bet = C.betInput({ value: 10 });
      let pick = 'starter', busy = false, alive = true;
      const msg = C.msg();
      const caseBtns = h('div', { class: 'case-picks' });
      const contents = h('div', { class: 'case-contents' });
      const strip = h('div', { class: 'case-strip' }), reel = h('div', { class: 'case-reel' }, strip, h('div', { class: 'case-marker' }));
      const btn = h('button', { class: 'btn big', onclick: () => open() }, 'OPEN CASE');
      root.appendChild(h('div', { class: 'layout' }, h('div', { class: 'side' }, bet.el, h('h3', null, 'Case'), caseBtns, h('h3', null, 'Contents'), contents), h('div', { class: 'stage' }, reel, msg.el, btn)));
      const item = (it) => h('div', { class: 'citem', style: `--c:${RCOL[it.rarity]}` }, h('div', { class: 'cgem' }), h('b', null, it.m + '×'), h('small', null, it.rarity));
      function paint() {
        caseBtns.innerHTML = '';
        for (const [id, c] of Object.entries(L.CASES)) caseBtns.append(h('button', { class: 'case-btn' + (id === pick ? ' sel' : ''), style: `--c:${c.color}`, onclick: () => { if (!busy) { pick = id; paint(); } } }, h('span', { class: 'case-box' }), c.name));
        const t = L.caseTable(pick);
        contents.innerHTML = '';
        t.items.slice().reverse().forEach((it) => contents.append(h('div', { class: 'crow', style: `--c:${RCOL[it.rarity]}` }, h('span', null, it.rarity), h('b', null, it.m + '×'))));
        fill();
      }
      function randomItem(t) { let x = Math.random(); for (const it of t.items) { if (x < it.p) return it; x -= it.p; } return t.items[0]; }
      function fill(winner) {
        const t = L.caseTable(pick);
        strip.innerHTML = ''; strip.style.transition = 'none'; strip.style.transform = 'translateX(0)';
        for (let i = 0; i < 48; i++) strip.append(item(i === 40 && winner ? winner : randomItem(t)));
      }
      paint();
      async function open() {
        if (busy) return; busy = true; btn.disabled = true; bet.disable(true);
        const r = await C.try(() => C.play('cases', null, { bet: bet.value, case: pick }));
        if (!r) { busy = false; btn.disabled = false; bet.disable(false); return; }
        msg.set(' ');
        const t = L.caseTable(pick), win = t.items[r.result.index];
        fill(win); void strip.offsetWidth;
        const w = strip.children[0].offsetWidth + 8, center = reel.clientWidth / 2;
        const x = 40 * w + w / 2 - center + (Math.random() - 0.5) * w * 0.6;
        strip.style.transition = 'transform 4.2s cubic-bezier(.12,.8,.16,1)'; strip.style.transform = `translateX(${-x}px)`;
        await C.sleep(4300); if (!alive) return;
        strip.children[40].classList.add('won'); C.settle(r);
        const m = r.result.mult;
        msg.set(`${win.rarity[0].toUpperCase() + win.rarity.slice(1)}: ${m}× · ${m >= 1 ? 'won' : 'returned'} ${C.fmt(r.payout)}`, m >= 1 ? 'win' : 'lose');
        busy = false; btn.disabled = false; bet.disable(false);
      }
      return () => { alive = false; };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.case-picks{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .case-btn{appearance:none;border:2px solid transparent;background:var(--bg2);color:var(--text);border-radius:10px;padding:10px 4px;font:inherit;font-weight:700;font-size:12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px}
  .case-btn.sel{border-color:var(--c)}.case-box{width:34px;height:26px;border-radius:5px;background:linear-gradient(160deg,var(--c),#0b1622);box-shadow:inset 0 -6px 0 rgba(0,0,0,.25)}
  .case-contents{display:flex;flex-direction:column;gap:4px}.crow{display:flex;justify-content:space-between;font-size:12px;padding:6px 10px;border-radius:6px;background:var(--bg2);border-left:3px solid var(--c);text-transform:capitalize;color:var(--muted)}.crow b{color:var(--text)}
  .case-reel{position:relative;width:100%;max-width:760px;overflow:hidden;background:var(--bg);border-radius:12px;padding:14px 0;mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}
  .case-strip{display:flex;gap:8px;padding:0 8px;will-change:transform}
  .citem{flex:none;width:104px;height:120px;border-radius:10px;background:linear-gradient(180deg,var(--panel3),var(--panel));border-bottom:4px solid var(--c);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
  .citem small{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--c);font-weight:800}.citem b{font-size:17px}
  .citem.won{box-shadow:0 0 0 2px var(--c),0 0 26px var(--c)}
  .cgem{width:34px;height:34px;transform:rotate(45deg);border-radius:6px;background:linear-gradient(135deg,var(--c),rgba(255,255,255,.2))}
  .case-marker{position:absolute;left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px;background:var(--brand);box-shadow:0 0 12px var(--brand)}
  @media(max-width:900px){.citem{width:84px;height:100px}}`;
  document.head.appendChild(css);
})();
