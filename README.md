# krush.casino

A web casino with 30 games, free **demo credits**, and **real SOL** deposits and withdrawals on Solana.
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

### Signing in
Players register and sign in with a **username and password** (Account page: change password, log out).
Set your own admin login in `.env`. The account is created at startup, or has its password reset if it already exists:
```
ADMIN_USERNAME=owner
ADMIN_PASSWORD=a-long-unique-password
```
With these set, every newly registered account is an ordinary player. Without them (local testing only), the first account registered becomes admin.

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
npm test         # house edges (exact/simulated) + API test playing every game against a throwaway DB
npm run smoke    # headless browser signs up and plays all 30 games (needs Playwright)
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

## Layout
```
server/index.js     HTTP server, auth, API routes, admin
server/games.js     all 30 games' server-side logic
server/play.js      round engine (debit → play → settle → record, one DB transaction)
server/payments.js  daily deposit wallets, crediting, sweeps, withdrawals, watcher loop
server/wallet.js    HD key derivation (SLIP-0010, Phantom-compatible)
server/chain.js     Solana RPC wrapper
server/db.js        SQLite schema, balances, ledger
server/referrals.js referral codes, commission accrual and claims
server/theo.js      theoretical house profit per round (basis for commission)
js/lib.js           shared paytables, RNG, card evaluators (used by server and browser)
js/core.js          client: API, login, wallet & admin pages, lobby
js/games/*.js       one UI file per game
```
