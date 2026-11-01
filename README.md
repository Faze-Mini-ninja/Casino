# 🎰 Royal Edge Casino

A complete, **play-money** web casino with 30 games. Every game publishes its exact paytable and house edge, and a test script checks those numbers by exact enumeration or Monte Carlo simulation.

> Credits are virtual: they can't be bought, cashed out or transferred. Players start with 10,000 credits and can top up for free when their balance falls below 1,000.

## Run it

```bash
npm start            # http://localhost:8080  (zero dependencies, Node 18+)
# or just open index.html in a browser — it works from file:// too
```

```bash
npm test             # verify every house edge (≈30 s)
npm run test:quick   # same, fewer simulation rounds
npm run smoke        # headless-browser test that plays every game (needs Playwright)
```

## Games and house edges

| # | Game | House edge here | How |
|---|------|-----------------|-----|
| 1 | Slots | 20.2% | 3 weighted reels, 200× top prize |
| 2 | Keno | 27.9–32.1% | 1–10 spots, 20 of 80 drawn |
| 3 | Blackjack + side bets | Perfect Pairs ≈21%, 21+3 ≈17% (main ≈0.5%) | 6 decks, S17, 3:2 |
| 4 | American Roulette | 5.26% (Top Line 7.89%) | 0 and 00 |
| 5 | European Roulette | 2.70% | single 0 |
| 6 | Baccarat — Tie | 14.36% | 8:1 |
| 7 | Baccarat — Side bets | 7.6–14% | Pairs, Either Pair, Perfect Pair, Dragon 7, Panda 8 |
| 8 | Baccarat — Player/Banker | 1.24% / 1.06% | punto banco, 8 decks |
| 9 | Craps propositions | 9.1–16.7% | Any 7, hops, horn numbers, hardways, Big 6/8 |
| 10 | Video Poker | ≈6.5% (optimal play) | 6/5 Jacks or Better, 250× royal |
| 11 | Pai Gow Poker + Fortune | Fortune ≈26.6% (main ≈3%) | house-way dealer |
| 12 | Sic Bo | 2.78–33.33% | triples ≈30%, doubles 33.3% |
| 13 | Speed Bingo | ≈31% | 75 balls, 30 calls, paid per line |
| 14 | Plinko | 12% / 22% / 40% | low / medium / high risk, 8–16 rows |
| 15 | Dragon Tiger | 7.5–32.8% | tie takes the whole bet |
| 16 | Three Card Poker | Pair Plus 15.06%, 6-Card ≈13% | Q-high qualifier, ante bonus |
| 17 | Caribbean Stud | 5.22% | AK qualifier, 100:1 royal |
| 18 | Texas Hold'em | 5% rake, capped at 3 BB | fixed-limit vs 3 bots |
| 19 | Let It Ride | 3.51% | standard 1000:1 paytable |
| 20 | Big Six Wheel | 11.1–24.07% | 54 segments |
| 21 | Crash | 8% | P(crash ≥ m) = 0.92/m |
| 22 | Mines | 10% | 1–24 mines, cash out any time |
| 23 | Limbo | 8% | any target up to 1,000,000× |
| 24 | Dice | 6% | roll over/under, 2–95% chance |
| 25 | Hi-Lo | 6% per guess | compounds with streaks |
| 26 | Tower | 10% | 4 difficulties, 8 floors |
| 27 | Scratch Cards | 31.5% | scratchable canvas tickets |
| 28 | Fish Table | 20% | catch chance = 0.8 / multiplier |
| 29 | Coin Flip | 10% | pays 1.8× |
| 30 | Casino War | ≈2.9% (Tie bet ≈18.6%) | 6 decks, go to war or surrender |

To change an edge, edit the paytable or `L.EDGE` in `js/lib.js`, then run `npm test` to check the result.

## Project layout

```
index.html          app shell
css/style.css       theme
js/lib.js           RNG (crypto.getRandomValues), cards, poker evaluators, all paytables (shared with Node)
js/core.js          wallet, persistence (localStorage), chip table, router, lobby/history/stats pages
js/games/*.js       one file per game (27 files, 30 lobby entries)
server.js           zero-dependency static server
test/rtp.js         house-edge verifier
test/smoke.js       browser test that plays every game
```

## Notes

- Everything runs in the browser and the wallet is stored in `localStorage`. Because the client controls the balance, this setup suits play-money only. Real-money play would need a server-side wallet and RNG, licensing, KYC/age checks, and responsible-gambling tools.
- Card games deal from real shoes: 6 decks for blackjack and war, 8 for baccarat and Dragon Tiger, a fresh single deck for the poker games.
