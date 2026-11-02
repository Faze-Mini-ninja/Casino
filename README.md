# krush.casino

A web casino with 61 games, free **demo credits**, and real-money deposits and withdrawals in **SOL, USDC, ETH and LTC** (balances in dollars).
Every bet, card and spin is decided on the server; the browser only animates the results.

> **Devnet by default.** Out of the box it runs on Solana devnet, where coins have no value. The server
> refuses to start on mainnet until you set `REAL_MONEY_ACKNOWLEDGED=yes`. Only set that once you hold a gambling
> licence for every jurisdiction you accept players from, with KYC/AML checks and geo-blocking in place.

## Run it

Requires **Node 22.13+** (uses the built-in SQLite).

```bash
npm install
cp .env.example .env      # optional — defaults are fine for devnet
npm start                 # http://localhost:8080
```

### Put it online (to test with friends)
The repo includes a `Dockerfile`, so any Docker host works. On **Railway**:
1. railway.app → **New Project → Deploy from GitHub repo** → pick this repo, and set the branch under *Settings → Source*.
2. **Add a Volume** to the service, mounted at `/data`. It holds the database and the devnet seed.
3. **Variables:** `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `REGISTRATION_CODE` (the invite code you give testers),
   `COOKIE_SECURE=true`, `TRUST_PROXY=true`.
4. *Settings → Networking → Generate Domain*, then share that URL. Later, add `krush.casino` as a custom domain there.

Render and Fly.io work the same way: Docker deploy, a persistent disk at `/data`, and the same variables.
The health check is at `/healthz`.

### Signing in
Players register and sign in with a **username and password** (Account page: change password, log out).
Set your own admin login in `.env`. The account is created at startup, or has its password reset if it already exists:
```
ADMIN_USERNAME=owner
ADMIN_PASSWORD=a-long-unique-password
```
With these set, every newly registered account is an ordinary player. Without them (local testing only), the first account registered becomes admin.

### Staff Panel and roles
Roles go **player → mod → staff → admin**. The admin gives roles from **Staff Panel → Players → (player) → Make Mod / Make Staff**.

| Tab | Who | What |
|---|---|---|
| Dashboard | mod+ | Online now, 24h GGR, bets, deposits, open tickets, pending withdrawals |
| Players | staff+ | Search, profiles (balances, per-game results, recent bets), mute. Admin: add/remove balance, roles, reset password, disable |
| Live | mod+ | Games in progress and a live bet feed with player names |
| Games & odds | admin | House edge per game (Crash, Mines, Limbo, Dice, Hi-Lo, Tower, Coin Flip, Fish, Wheel, Cases, Pump, Penalty, Darts, Horse Race, Cups, Rock Paper Scissors, Red or Black and every video slot) and Plinko RTP, open/close games, tipping rules |
| Support | mod+ | Reply to and close player tickets |
| Chat | mod+ | Delete messages, mute players |
| Announcement | staff+ | Site-wide banner, pushed live |
| Withdrawals, Treasury, Log | admin | Approve cash-outs, wallets and sweeps, audit log |

**Odds changes are applied to everyone equally.** Rounds already in progress keep the odds they started with, and the
browser sends the odds version it is showing with every bet. If payouts changed since the page loaded, the bet is
refused and the page refreshes, so nobody is ever paid differently from what they were shown. There is deliberately no
per-player odds control.

### Chat, tips and support
- **Live chat** (sidebar on desktop, Chat tab on phones) with role badges. Tap a name to tip; mods can mute or delete.
- **Tips:** `/tip name amount` in chat or the tip button. Real-SOL tips need a minimum amount wagered first and have a daily cap
  (Staff Panel → Games & odds → tipping rules). Every tip is in the ledger.
- **Support:** players open tickets on the Support page and see replies there; staff answer from the Staff Panel.

### Odds display
Odds are **hidden from players by default**. Players still see what every bet pays, but no house edges, RTPs, win
probabilities or "1 in X" odds, and the House Edges page is hidden. Set `SHOW_ODDS=true` to show them; some licences require RTP to be published.

### Referrals
Every account has a referral link (`…/#ref-CODE`) on the **Refer & Earn** page. Players who sign up through it,
or enter the code before their first real-money bet, are linked to the referrer for good.
The referrer earns `REFERRAL_SHARE` (default 10%, max 50%) of the house's **theoretical** profit on those players'
real-money bets: stake × that bet's house edge. It's paid win or lose, so it doesn't swing with luck. Hold'em pays a
share of the rake the player contributed to. Commission builds up and is claimed into the referrer's real balance in one click.
Every edge used is exact or slightly under, so referring your own second account only earns back part of the
house edge and never turns a profit.

### Try a test-network deposit
By default every coin uses its test network (Solana devnet, Ethereum Sepolia, Litecoin testnet); test coins are free.
1. Register, switch the header balance to **USD (real money)**, tap **Wallet** and pick a coin. Copy today's address
   or scan the QR code.
2. Get free test coins: SOL at https://faucet.solana.com, USDC (Solana devnet) at https://faucet.circle.com,
   Sepolia ETH from any Sepolia faucet, LTC from any Litecoin testnet faucet.
3. Send at least the minimum (0.01 SOL, 1 USDC, 0.002 ETH, 0.01 LTC). It is credited in dollars at the market price once
   confirmed: about 30 s for SOL/USDC, 12 blocks (~3 min) for ETH, 3 blocks (~8 min) for LTC. The wallet pop-up
   and a toast tell the player the moment it lands.
4. Play, then withdraw from **Wallet** in any of the four coins.

## How the money flows

```
player ──coin──▶ today's deposit address ──sweep──▶ that coin's hot wallet ──(above HOT_FLOAT_USD)──▶ treasury (cold)
                 (new one per player, per chain, per UTC day)      │
                                                                    └──▶ withdrawals to players
```

- **Balances are dollars** (1 credit = $1). Each deposit is converted at the market price when it is credited, and
  each withdrawal at the price when it is requested. The price is the median of CoinGecko, Coinbase and Kraken;
  if none answers, deposits simply wait for the next pass and withdrawals are refused for a moment. USDC counts as $1.
  Note the house holds the coins, so their price moves are the operator's, not the players'.
- **Coins and keys.** One master seed derives everything (index 0 = hot wallet, index n = deposit-address row n):
  SOL and USDC share a Solana address (`m/44'/501'/n'/0'`, Phantom's scheme; USDC lands in its token account),
  ETH uses `m/44'/60'/0'/0/n` (MetaMask's scheme), LTC uses native SegWit `m/84'/2'/0'/0/n` (`ltc1…`).
  Any of these wallets can be recovered from the seed with standard wallet software.
- **Crediting** only counts confirmed funds: finalized Solana transactions, ETH balances read 12 blocks behind
  the chain head, LTC payments with 3 confirmations. Each deposit is credited once, even across restarts
  (`deposits` primary key = transaction + address + coin). Deposits under the minimum are recorded but not credited.
- **Sweeps** move deposits into the coin's hot wallet until it holds `HOT_FLOAT_USD` worth, and the rest to that
  coin's treasury (`TREASURY_ADDRESS` for SOL/USDC, `TREASURY_ETH`, `TREASURY_LTC`): cold wallets whose private keys
  never touch the server. USDC sweeps are paid for by the hot wallet, which also gets the token account's rent back.
- **Deposit fee.** `DEPOSIT_FEE_PCT` (default 1%) of each deposit's dollar value is kept and the rest credited. The
  wallet shows it up front (with a calculator), and every deposit lists its value, fee and credited amount. The Staff
  Panel dashboard shows fees collected. Deposits below the minimum are not credited and pay no fee.
- **Withdrawals** are debited in dollars when requested and paid in the chosen coin minus that coin's network fee
  (`WITHDRAW_FEE_*`). Up to `AUTO_APPROVE_USD` per withdrawal and `AUTO_APPROVE_DAILY_USD` per day go out
  automatically; larger ones wait for approval in the Staff Panel. The signed transaction is stored *before*
  broadcasting, and a withdrawal is refunded only if it provably never landed (expired Solana blockhash, Ethereum
  nonce used by another transaction, Litecoin inputs spent elsewhere), so a timeout can't pay a player twice.
- **Fund the hot wallets** (Staff Panel → Treasury shows each address and balance) so withdrawals can be paid:
  ETH and LTC need a little extra for network fees, and USDC payouts need some SOL in the Solana hot wallet for fees.
- **Ledger.** Every balance change writes a ledger row (`data/casino.db`), so balances can always be reconciled.

## Security notes
- Game logic, RNG (`crypto.getRandomValues`) and balances live on the server. The client can't change outcomes.
- Passwords are hashed with scrypt. Sessions are HttpOnly SameSite=Strict cookies. Logins, sign-ups, game actions and
  withdrawals are rate-limited. Responses carry a strict CSP.
- **Protect `MASTER_SEED`.** It controls every deposit wallet and the hot wallet. Keep an offline backup, keep the
  hot float small, and put the treasury on a hardware or multisig wallet.
- Use paid RPC/API providers in production (`RPC_URL`, `ETH_RPC_URL`, `LTC_API_URL`); the public endpoints are rate-limited.

## Compliance (`server/compliance.js`)
- **Geo-blocking** is not part of this app; it is handled by the operator's own system in front of it.
- **Behind a proxy** set `TRUST_PROXY=true` and `PROXY_HOPS` to the number of proxies (Railway alone = 1; Cloudflare
  in front of Railway = 2), otherwise a player could fake their IP to dodge rate limits.
- **Age.** Sign-up requires confirming 18+. (Real ID checks: add KYC.)
- **Responsible gambling** (player page `#rg`): deposit limits per 24 h / 7 / 30 days (tighter is immediate, looser
  waits `RG_INCREASE_DELAY_HOURS`), cool-off 24 h–6 weeks (no real money), self-exclusion 6 months–permanent (no
  play at all). Neither can be lifted early, by anyone. Admins can also exclude a player. Crypto can't be refused, so
  a deposit sent anyway is credited and flagged for staff.
- **AML flags** (Staff Panel → Compliance): large single deposits (`AML_DEPOSIT_FLAG_USD`), high 24 h deposits
  (`AML_DAILY_FLAG_USD`), deposits over a limit or during a break, and withdrawals before wagering
  `AML_MIN_TURNOVER` × recent deposits. While a flag is open every withdrawal waits for manual approval; clearing a
  flag needs a note and is written to the audit log.
- **Licence details** for the footer: `LICENSE_TEXT`.

## Before mainnet (still to do)
KYC (ID and proof-of-address checks; planned), regulator-approved RTPs if your licence needs them, an audit of the
payments code, and monitoring/alerting for the hot wallet and the watcher.

## Tests

```bash
npm test         # house edges + API, referral and social/staff tests against throwaway databases
npm run smoke    # headless browser signs up and plays all 61 games (needs Playwright)
npm run covers   # re-render the game cover images into img/covers/ (needs Playwright)
npm run slot-art # re-render slot symbols, backgrounds and logos into img/slots/<theme>/ (needs Playwright)
```

## Games and house edges

| # | Game | House edge |
|---|------|-----------|
| 1 | Slots | 20.2% |
| 2 | Keno | 27.9–32.1% |
| 3 | Blackjack + side bets | Perfect Pairs ≈22%, 21+3 ≈16% (main ≈0.5%) |
| 4 / 5 | American / European Roulette | 5.26% / 2.70% |
| 6 / 7 / 8 | Baccarat Tie / Side bets / Player | 14.36% / 7.5–13.5% / 1.24% |
| 9 | Craps propositions | 9.1–16.7% |
| 10 | Video Poker (6/5 JoB) | ≈6.5% |
| 11 | Pai Gow Fortune | ≈25% |
| 12 | Sic Bo | 2.78–33.33% |
| 13 | Bingo | ≈30% |
| 14 | Plinko | 12 / 22 / 40% |
| 15 | Dragon Tiger | 7.5–32.8% |
| 16 | Three Card Poker sides | Pair Plus 15.06%, 6-Card ≈16% |
| 17 | Caribbean Stud | 5.22% |
| 18 | Texas Hold'em | 5% rake (cap 3 BB) |
| 19 | Let It Ride | 3.51% |
| 20 | Big Six | 11.1–24.07% |
| 21–26 | Crash / Mines / Limbo / Dice / Hi-Lo / Tower | 8 / 10 / 8 / 6 / 6 per guess / 10% |
| 27 | Scratch Cards | 31.5% |
| 28 | Fish Table | 20% |
| 29 | Coin Flip | 10% |
| 30 | Casino War | ≈3% (Tie bet ≈18.8%) |
| 31 | Wheel | ≈7% (adjustable) |
| 32 | Cases | ≈10% (adjustable) |
| 33 | Red Dog | ≈2.8% |
| 34 | Pump | 8% (adjustable) |
| 35 | Penalty Shootout | 7% (adjustable) |
| 36 | Darts | ≈8.5% (adjustable) |
| 37 | Horse Race | 10% (adjustable) |
| 38 | Cups | 7% (adjustable) |
| 39 | Rock Paper Scissors | 6% (adjustable) |
| 40 | Red or Black | 5% per guess (adjustable) |
| 41 | Colors | 6.67% |
| 42 | Mini Roulette | 7.69% |
| 43 | Andar Bahar | ≈2.0% Andar / ≈3.1% Bahar |
| 44 / 45 | Chuck-a-Luck / Crown & Anchor | 7.87% |
| 46 | Under / Over 7 | 16.67% |
| 47 | Dice Duel | 11.27% (Tie bet 9.88%) |
| 48 | Casino Hold'em | ≈2.2% of the ante with good strategy |
| 49 | Poker Dice | 11.27% |
| 50 / 51 | Fruit Frenzy / Gem Rush (5×3, 10 lines) | 12% (adjustable) |
| 52 | Lucky 7s (3×3, 5 lines) | 15% (adjustable) |
| 53 | Pick 3 | 30% |
| 54 | Pharaoh's Fortune (5×3, 20 lines, free spins ×2) | 10% (adjustable) |
| 55 | Deep Sea Treasure (243 ways, free spins ×3) | 10% (adjustable) |
| 56 | Gold Rush (5×3, 25 lines, free spins ×2) | 12% (adjustable) |
| 57 | Dragon Pearl (5×4, 1024 ways, free spins ×2) | 10% (adjustable) |
| 58 | Candy Pop (243 ways, free spins ×3) | 12% (adjustable) |
| 59 | Neon Nights (5×3, 10 lines, free spins ×2) | 12% (adjustable) |
| 60 | Lucky Clover (5×3, 20 lines, free spins ×2) | 12% (adjustable) |
| 61 | Cosmic Cash (5×4, 40 lines, free spins ×2) | 10% (adjustable) |

Video slot returns are calculated exactly, free spins included (every cell is an independent weighted draw), and
`test/rtp.js` cross-checks the spin engine against that figure by simulation.

## Layout
```
server/index.js     HTTP server, auth, API routes, admin
server/games.js     all games' server-side logic
server/play.js      round engine (debit → play → settle → record, one DB transaction)
server/payments.js  daily deposit wallets, crediting, sweeps, withdrawals, watcher loop
server/compliance.js deposit limits, cool-off, self-exclusion, AML flags
server/wallet.js    HD key derivation (SLIP-0010, Phantom-compatible)
server/chain.js     Solana RPC wrapper
server/db.js        SQLite schema, balances, ledger
server/referrals.js referral codes, commission accrual and claims
server/theo.js      theoretical house profit per round (basis for commission)
server/settings.js  live odds, closed games, announcement, tipping rules
server/social.js    chat, moderation, tips, support tickets
server/admin.js     Staff Panel API
server/stream.js    live updates to browsers (Server-Sent Events)
js/staff.js         Staff Panel UI
js/chat.js          chat panel and tip dialog
js/support.js       player support page
js/rg.js            responsible-gambling page and the break/blocked notice
js/lib.js           shared paytables, RNG, card evaluators (used by server and browser)
js/core.js          client: API, login, wallet & admin pages, lobby
js/games/*.js       one UI file per game (more-*.js hold games 34–53, video-slots.js all video slots)
js/games/slot-client.js  the slot game screen every slot runs on: scene, logo, reel cabinet, slot HUD,
                    quick stop, anticipation, free spins, big-win celebration, in-game paytable
js/art.js           drawn SVG symbols (fruit, gems, bars, sevens, coins, cups, balloons…) used by the games
js/art-slots.js     symbol art for the themed video slots (plus card royals in each theme's typeface)
js/covers.js        game cover illustrations; tools/build-covers.js renders them to img/covers/*.webp
js/slot-assets.js   build-time slot art: polished symbols, background scenes, logos (tools/build-slot-art.js)
fonts/              display typefaces for logos and symbols (open licences, see fonts/LICENSES.md)
js/fx.js            synthesised sound effects, mute button, big-win celebration
```
