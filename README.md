# krush.casino

A web casino with 53 games, free **demo credits**, and **real SOL** deposits and withdrawals on Solana.
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
| Games & odds | admin | House edge per game (Crash, Mines, Limbo, Dice, Hi-Lo, Tower, Coin Flip, Fish, Wheel, Cases, Pump, Penalty, Darts, Horse Race, Cups, Rock Paper Scissors, Red or Black and the three video slots) and Plinko RTP, open/close games, tipping rules |
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

### Try a devnet deposit
1. Register, open **Wallet**, copy today's deposit address.
2. Get free devnet SOL from https://faucet.solana.com, or in Phantom turn on *Settings → Developer Settings → Testnet Mode*, pick Devnet and airdrop.
3. Send ≥ 0.01 SOL to the address. Once the transaction is finalized (~15–40 s) it's credited and appears in **Wallet**.
4. Switch the header toggle to **Real SOL** and play. Withdraw from **Wallet** to any address.

## How the money flows

```
player ──SOL──▶ today's deposit address ──sweep──▶ hot wallet ──(above HOT_FLOAT_SOL)──▶ treasury (cold)
                (new one per player per UTC day)          │
                                                           └──▶ withdrawals to players
```

- **A fresh deposit wallet every day.** Each player gets a new address each UTC day, derived from one master seed
  (`m/44'/501'/i'/0'`, the same scheme Phantom uses, so any wallet can be recovered from the seed).
  Deposits to a player's older addresses are still credited for `ADDRESS_WATCH_DAYS` (30 by default).
- **Crediting** uses only *finalized* transactions. It's idempotent: each signature is credited once,
  even across restarts.
- **Sweeps** move each credited deposit into the hot wallet until it holds `HOT_FLOAT_SOL`, and the rest to
  `TREASURY_ADDRESS`, a cold wallet whose private key never touches the server. Sweeps only run after every
  finalized deposit to that address has been credited.
- **Withdrawals** are debited when requested. Small ones (`AUTO_APPROVE_SOL`, `AUTO_APPROVE_DAILY_SOL`) send
  automatically; larger ones wait in **Admin** for approval. The transaction signature is stored *before* broadcasting.
  A withdrawal is refunded only if its transaction provably never landed (blockhash expired with no status), so a
  network timeout can't pay a player twice.
- **Ledger.** Every balance change writes a ledger row (`data/casino.db`), so balances can always be reconciled.

## Security notes
- Game logic, RNG (`crypto.getRandomValues`) and balances live on the server. The client can't change outcomes.
- Passwords are hashed with scrypt. Sessions are HttpOnly SameSite=Strict cookies. Logins, sign-ups, game actions and
  withdrawals are rate-limited. Responses carry a strict CSP.
- **Protect `MASTER_SEED`.** It controls every deposit wallet and the hot wallet. Keep an offline backup, keep the
  hot float small, and put the treasury on a hardware or multisig wallet.
- Use a paid RPC provider in production; the public endpoints are rate-limited.

## Before mainnet (not built yet)
This code handles the money mechanics. Running it for real money also needs:
KYC/age verification, AML monitoring, geo-blocking, responsible-gambling tools (deposit limits, self-exclusion),
regulator-approved RTPs (several games here have 20–40% edges, above what many regulators accept),
an audit of the payments code, and monitoring/alerting for the hot wallet and the watcher.

## Tests

```bash
npm test         # house edges + API, referral and social/staff tests against throwaway databases
npm run smoke    # headless browser signs up and plays all 53 games (needs Playwright)
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

## Layout
```
server/index.js     HTTP server, auth, API routes, admin
server/games.js     all games' server-side logic
server/play.js      round engine (debit → play → settle → record, one DB transaction)
server/payments.js  daily deposit wallets, crediting, sweeps, withdrawals, watcher loop
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
js/lib.js           shared paytables, RNG, card evaluators (used by server and browser)
js/core.js          client: API, login, wallet & admin pages, lobby
js/games/*.js       one UI file per game (more-*.js hold games 34–53)
js/art.js           drawn SVG symbols (fruit, gems, bars, sevens, coins, cups, balloons…) used by the games and lobby tiles
js/fx.js            synthesised sound effects, mute button, big-win celebration
```
