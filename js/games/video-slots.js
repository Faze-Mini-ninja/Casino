/* Video slots: registers every themed slot (L.SLOT_THEMES) on the shared slot client (slot-client.js). */
(function () {
  const C = Casino, L = Lib, h = C.h;
  const r2 = (x) => Math.floor(x * 100) / 100;
  const fmtX = (x) => (x >= 100 ? Math.floor(x) : x >= 10 ? Math.floor(x * 10) / 10 : x >= 1 ? r2(x) : (Math.floor(x * 1000) / 1000).toString().replace(/^0/, '0')) + '×';

  const SYM_NAME = { cherry: 'Cherry', lemon: 'Lemon', orange: 'Orange', plum: 'Plum', grape: 'Grapes', melon: 'Melon', bell: 'Bell', seven: 'Seven', wild: 'Wild', scatter: 'Bonus', bar: 'Bar', bar2: 'Double bar', bar3: 'Triple bar',
    'g-blue': 'Sapphire', 'g-green': 'Emerald', 'g-purple': 'Amethyst', 'g-orange': 'Topaz', 'g-red': 'Ruby', 'g-pink': 'Pink gem', crown: 'Crown', diamond: 'Diamond',
    T: '10', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace', ankh: 'Ankh', eye: 'Eye of Horus', scarab: 'Scarab', cat: 'Sacred cat', starfish: 'Starfish', octopus: 'Octopus', shell: 'Shell', chest: 'Treasure chest',
    horseshoe: 'Horseshoe', lantern: 'Lantern', pickaxe: 'Pickaxe', nugget: 'Gold nugget', fan: 'Fan', coin: 'Lucky coin', lantern2: 'Lantern', koi: 'Koi', ingot: 'Gold ingot',
    'c-wrap': 'Blue candy', 'c-drop': 'Gumdrop', 'c-heart': 'Candy heart', 'c-bear': 'Gummy bear', 'c-lolly': 'Lollipop', 'c-donut': 'Donut', 'c-cupcake': 'Cupcake',
    'n-cherry': 'Cherry', 'n-lemon': 'Lemon', 'n-bell': 'Bell', 'n-bar': 'Bar', 'n-diamond': 'Diamond', 'n-star': 'Star', 'n-seven': 'Seven',
    clover: 'Four-leaf clover', horseshoe2: 'Golden horseshoe', hat: 'Top hat', pot: 'Pot of gold', planet: 'Planet', comet: 'Comet', ufo: 'UFO', astronaut: 'Astronaut' };

  /* Cabinet look per theme: logo face, logo colours, cabinet class. */
  const THEMES = {
    fruits: { n: 50, font: 'Lilita One', logo: ['#fff59d', '#ff9800', '#e65100'], blurb: 'Five reels of fruit, ten lines, wilds and scatters.' },
    gems: { n: 51, font: 'Titan One', logo: ['#ffffff', '#e1bee7', '#8e24aa'], blurb: 'Cut gems and crowns across ten lines. Diamonds pay big.' },
    sevens: { n: 52, font: 'Bungee', logo: ['#fff', '#ff5252', '#b71c1c'], blurb: 'Three reels, five lines, bars and flaming sevens.' },
    pharaoh: { n: 54, font: 'Cinzel Decorative', logo: ['#fff6c8', '#ffd54f', '#a37400'], blurb: 'Twenty lines along the Nile. Three pyramids open ten free spins at 2×.' },
    ocean: { n: 55, font: 'Lilita One', logo: ['#e0f7fa', '#4dd0e1', '#00838f'], blurb: '243 ways to win on the sea floor. Free spins pay triple.' },
    goldrush: { n: 56, font: 'Rye', logo: ['#fff6c8', '#ffca28', '#8d5b00'], blurb: 'Stake a claim across 25 lines. Mine carts bring up to 20 free spins.' },
    dragon: { n: 57, font: 'Cinzel Decorative', logo: ['#fff3c4', '#ffd54f', '#c62828'], blurb: '1024 ways on four rows. The flaming pearl is wild.' },
    candy: { n: 58, font: 'Luckiest Guy', logo: ['#fff', '#ff80ab', '#d500f9'], blurb: '243 sugary ways. Gumball machines unlock free spins at 3×.' },
    neon: { n: 59, font: 'Monoton', logo: ['#e0fbff', '#00e5ff', '#00e5ff'], blurb: 'A late-night classic in glowing tubes. Ten lines, free spins at 2×.' },
    clover: { n: 60, font: 'Lilita One', logo: ['#fffde7', '#c6ff00', '#2e7d32'], blurb: 'Twenty lines of Irish luck. Gold coins award up to 20 free spins.' },
    cosmic: { n: 61, font: 'Russo One', logo: ['#ffffff', '#b388ff', '#6200ea'], blurb: 'Five by four, forty lines, out of this world.' },
  };

  function videoSlot(id) {
    const T0 = L.SLOT_THEMES[id], th = THEMES[id], ways = T0.mode === 'ways';
    const layoutTxt = ways ? `${T0.rows === 4 ? 1024 : 243} ways` : `${T0.lines.length} line${T0.lines.length > 1 ? 's' : ''}`;
    const edgeTxt = () => (L.EDGE[id] * 100).toFixed(0) + '%';
    const rules = `<p>${T0.reels} reels × ${T0.rows} rows, ${layoutTxt}. ${ways ? 'A symbol wins when it lands on adjacent reels starting from the left, in any position. Each extra matching symbol on a reel multiplies the win.' : 'Your bet is spread evenly across every line. A line wins with three or more matching symbols from the leftmost reel.'}
        Wild substitutes for every paying symbol.${T0.scatter ? ' Bonus symbols pay anywhere on the screen.' : ''}${T0.free ? ` Three or more Bonus symbols award ${Object.values(T0.free.spins).join(' / ')} free spins (for 3 / 4 / 5), and every free-spin win is multiplied by ${T0.free.mult}.` : ''}</p>`;
    C.register({
      n: th.n, id, name: T0.name, icon: '7', cat: 'slots', blurb: th.blurb, get edge() { return edgeTxt(); }, rules,
      get edges() {
        const t = L.slotTable(id);
        return [...Object.entries(t.pays).map(([s, p]) => [SYM_NAME[s] || s, p.map((x) => fmtX(ways ? x : x / t.lines.length)).join(' / '), '']),
          ...(t.scatter ? Object.entries(t.scatter).map(([k, v]) => [k + ' Bonus symbols', fmtX(v), '']) : []), ['Overall', '', edgeTxt()]];
      },
      mount(root) {
        return C.slotGame(root, {
          game: id, theme: id, name: T0.name, font: th.font, reels: T0.reels, rows: T0.rows, symbols: T0.symbols, lines: ways ? null : T0.lines, ways, free: T0.free, rulesHtml: rules,
          adapt: (r) => r.result,
          paytable: () => {
            const t = L.slotTable(id), heads = T0.reels === 3 ? ['3×'] : ['5×', '4×', '3×'];
            const rows = Object.entries(t.pays).reverse().map(([s, p]) => ({ sym: s, title: SYM_NAME[s] + (ways ? ' · per way' : ''), pays: p.map((x, i) => [T0.reels === 3 ? '3×' : `${i + 3}×`, ways ? x : x / t.lines.length]).reverse() }));
            if (t.scatter) rows.unshift({ sym: 'scatter', wide: true, title: 'BONUS — pays anywhere' + (T0.free ? ` · 3+ award ${Object.values(T0.free.spins).join('/')} free spins, wins ×${T0.free.mult}` : ''), pays: Object.entries(t.scatter).reverse().map(([k, v]) => [k + '×', v]) });
            rows.splice(t.scatter ? 1 : 0, 0, { sym: 'wild', wide: true, title: 'WILD — substitutes for every paying symbol', pays: (t.pays.wild || []).map((x, i) => [T0.reels === 3 ? '3×' : `${i + 3}×`, x / t.lines.length]).reverse() });
            return rows.filter((r, i, a) => r.sym !== 'wild' || a.findIndex((x) => x.sym === 'wild') === i);
          },
        });
      },
    });
  }
  L.SLOT_IDS.forEach(videoSlot);
})();
