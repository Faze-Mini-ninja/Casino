(function () {
  const C = Casino, L = Lib, h = C.h;
  const rtp = L.SCRATCH_PRIZES.reduce((s, [m, p]) => s + m * p, 0);
  const odds = L.SCRATCH_PRIZES.reduce((s, [, p]) => s + p, 0);
  C.register({
    n: 27, id: 'scratch', name: 'Scratch Cards', icon: '🎟️', cat: 'lottery', edge: ((1 - rtp) * 100).toFixed(1) + '%',
    blurb: 'Scratch 9 boxes and match three prize amounts to win.',
    rules: `<p>Buy a ticket, scratch the 9 panels (drag with mouse or finger) or press Reveal. Find three matching multipliers and win ticket price × that multiplier. Overall odds of winning anything: 1 in ${(1 / odds).toFixed(2)}. RTP ${(rtp * 100).toFixed(2)}% (exact).</p>`,
    edges: L.SCRATCH_PRIZES.map(([m, p]) => [`3 × ${m}×`, `${m}× (1 in ${Math.round(1 / p).toLocaleString()})`, '']).concat([['Overall', '', ((1 - rtp) * 100).toFixed(2) + '%']]),
    mount(root) {
      let price = 5, st = null;
      const priceSel = C.select('Ticket price', [1, 5, 10, 25, 100, 500], price, (v) => { price = +v; });
      const msg = C.msg();
      const W = 360, H = 360;
      const grid = h('div', { class: 'sc-grid' });
      const cv = h('canvas', { width: W, height: H, class: 'sc-cover' });
      const ctx = cv.getContext('2d');
      const ticket = h('div', { class: 'sc-ticket' }, h('div', { class: 'sc-title' }, C.artEl('coinHeads', 'sc-ic'), 'TRIPLE TREASURE', C.artEl('coinHeads', 'sc-ic')), h('div', { class: 'sc-area' }, grid, cv), h('div', { class: 'sc-sub' }, 'Match 3 amounts to win that multiplier'));
      const buyBtn = h('button', { class: 'btn big', onclick: () => buy() }, 'BUY TICKET');
      const revBtn = h('button', { class: 'btn ghost', onclick: () => reveal() }, 'Reveal all');
      root.appendChild(h('div', { class: 'layout' },
        h('div', { class: 'side' }, priceSel.el, h('div', { class: 'pays-list' }, L.SCRATCH_PRIZES.map(([m, p]) => h('div', null, h('span', null, `3 × ${m}×`), h('b', null, C.odds() ? `1 in ${Math.round(1 / p).toLocaleString()}` : `wins ${m}× ticket`))))),
        h('div', { class: 'stage' }, ticket, msg.el, h('div', { class: 'controls' }, buyBtn, revBtn))));
      function cover() {
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#c0c0c0'); g.addColorStop(0.5, '#eeeeee'); g.addColorStop(1, '#9e9e9e');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#888'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) ctx.fillText('?', c * 120 + 60, r * 120 + 68);
        cv.style.opacity = 1;
      }
      cover(); revBtn.disabled = true;
      grid.innerHTML = Array(9).fill('<div class="sc-cell">?</div>').join('');
      let drawing = false, moves = 0;
      const pos = (e) => { const r = cv.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * W / r.width, (p.clientY - r.top) * H / r.height]; };
      const scr = (e) => {
        if (!drawing || !st || st.done) return;
        e.preventDefault();
        const [x, y] = pos(e);
        ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
        if (++moves % 15 === 0) check();
      };
      cv.addEventListener('mousedown', (e) => { drawing = true; scr(e); }); cv.addEventListener('mousemove', scr);
      cv.addEventListener('touchstart', (e) => { drawing = true; scr(e); }, { passive: false }); cv.addEventListener('touchmove', scr, { passive: false });
      const stop = () => { drawing = false; if (st && !st.done) check(); };
      window.addEventListener('mouseup', stop); window.addEventListener('touchend', stop);
      function check() {
        const d = ctx.getImageData(0, 0, W, H).data; let clear = 0;
        for (let i = 3; i < d.length; i += 64) if (d[i] === 0) clear++;
        if (clear / (d.length / 64) > 0.62) reveal();
      }
      async function buy() {
        if (st && !st.done) return C.toast('Finish scratching this ticket first', 'err');
        buyBtn.disabled = true;
        const r = await C.try(() => C.play('scratch', null, { price }));
        buyBtn.disabled = false;
        if (!r) return;
        st = { price, prize: r.result.prize, cells: r.result.cells, done: false, r };
        grid.innerHTML = '';
        st.cells.forEach((v) => grid.appendChild(h('div', { class: 'sc-cell', 'data-v': v }, v + '×')));
        cover(); revBtn.disabled = false; buyBtn.disabled = true; priceSel.sel.disabled = true;
        msg.set('Scratch away!');
      }
      function reveal() {
        if (!st || st.done) return;
        st.done = true; cv.style.opacity = 0;
        const pay = st.r.payout;
        C.settle(st.r);
        if (st.prize) grid.querySelectorAll(`[data-v="${st.prize}"]`).forEach((c) => c.classList.add('hit'));
        msg.set(st.prize ? `Three ${st.prize}×: you win ${C.fmt(pay)}!` : 'No match this time', st.prize ? 'win' : 'lose');
        revBtn.disabled = true; buyBtn.disabled = false; priceSel.sel.disabled = false;
      }
      return () => { window.removeEventListener('mouseup', stop); window.removeEventListener('touchend', stop); if (st && !st.done) reveal(); };
    },
  });
  const css = document.createElement('style');
  css.textContent = `.sc-ticket{background:linear-gradient(135deg,#7b2cbf,#c33c54);padding:16px;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.5);width:min(400px,100%)}
  .sc-title{display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Luckiest Guy','Lilita One',sans-serif;font-weight:400;font-size:24px;margin-bottom:10px;letter-spacing:.04em;color:#b71c1c}.sc-title .sc-ic{width:28px;height:28px}.sc-sub{text-align:center;font-size:12px;margin-top:8px;opacity:.85}
  .sc-area{position:relative;width:100%;aspect-ratio:1}.sc-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:#fff8e1;border-radius:10px;padding:6px}
  .sc-cell{display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px;color:#7b2cbf;font-weight:900;font-size:26px;border:2px dashed #e0c4ff}
  .sc-cell.hit{background:var(--gold);color:#000;border-color:#000;animation:pulse 1s infinite}
  @keyframes pulse{50%{transform:scale(1.06)}}
  .sc-cover{position:absolute;inset:0;width:100%;height:100%;border-radius:10px;cursor:crosshair;transition:opacity .5s;touch-action:none}`;
  document.head.appendChild(css);
})();
