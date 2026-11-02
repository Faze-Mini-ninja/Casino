/* Classic Slots: 3 reels, one payline (the middle row), any two cherries return the stake. Runs on the shared slot client. */
(function () {
  const C = Casino, L = Lib;
  const ID = { '🍒': 'cherry', '🍋': 'lemon', '🍊': 'orange', '🔔': 'bell', '⭐': 'star', '7️⃣': 'seven' }; // server symbol → art name
  const TITLE = { seven: 'Three 7s', star: 'Three stars', bell: 'Three bells', orange: 'Three oranges', lemon: 'Three lemons', cherry: 'Three cherries' };
  const rules = '<p>Three reels, one payline (the middle row). Line up three matching symbols, or any two cherries on the line to get your stake back. Cherries are common, 7s are rare.</p>';
  C.register({
    n: 1, id: 'slots', name: 'Slots', icon: '7', cat: 'slots', edge: '20.2%',
    blurb: 'Classic 3-reel fruit machine with a 200× jackpot.',
    rules: rules + '<p>RTP 79.78% (exact).</p>',
    edges: [['Three 7s', '200×', ''], ['Three stars', '80×', ''], ['Three bells', '40×', ''], ['Three oranges', '20×', ''], ['Three lemons', '12×', ''], ['Three cherries', '5×', ''], ['Any two cherries', '1× (stake back)', ''], ['Overall', '', '20.22%']],
    mount(root) {
      const symbols = L.SLOT_SYMBOLS.map((x) => [ID[x.s], x.w]);
      const W = symbols.reduce((a, x) => a + x[1], 0);
      const rnd = () => { let x = Math.random() * W; for (const [s, w] of symbols) { x -= w; if (x < 0) return s; } return 'cherry'; };
      return C.slotGame(root, {
        game: 'slots', theme: 'classic', name: 'Classic Slots', font: 'Bungee', reels: 3, rows: 3, symbols, lines: [[1, 1, 1]], ways: false, free: null, rulesHtml: rules,
        adapt: (r) => {
          const line = r.result.line.map((s) => ID[s]), m = r.result.mult;
          const grid = line.map((s) => [rnd(), s, rnd()]);
          const cells = m === 1 ? line.map((s, i) => (s === 'cherry' ? [i, 1] : null)).filter(Boolean) : [[0, 1], [1, 1], [2, 1]];
          return { grid, wins: m > 0 ? [{ line: 0, sym: line[0], n: 3, cells, pay: m }] : [], scatter: 0, scatterPay: 0, baseMult: m, free: [], freeMult: 0, mult: m };
        },
        paytable: () => [...Object.entries(L.SLOT_PAYS).map(([s, m]) => ({ sym: ID[s], title: TITLE[ID[s]], pays: [['3×', m]] })),
          { sym: 'cherry', title: 'Any two cherries', pays: [['2×', 1]] }],
      });
    },
  });
})();
