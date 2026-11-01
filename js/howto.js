/* Player-facing rules used when odds are hidden (SHOW_ODDS=false): how to play and what each bet pays,
 * without house edges, RTPs or win probabilities. */
(function () {
  const L = Lib;
  Casino.HOWTO = {
    slots: '<p>Three reels, one payline (the middle row). Line up three matching symbols, or any two cherries, to win.</p>',
    keno: '<p>Choose 1 to 10 numbers. 20 of 80 balls are drawn and you are paid by how many of your numbers are hit. Payouts are total return per 1 credit bet.</p>',
    blackjack: `<p>6 decks, dealer stands on all 17s and peeks for blackjack. Blackjack pays 3:2. Double on any first two cards, split once (split aces get one card). No insurance or surrender.</p>
      <p><b>Perfect Pairs</b> pays on your first two cards. <b>21+3</b> pays on your two cards plus the dealer's up-card as a 3-card poker hand.</p>`,
    'roulette-us': '<p>Place chips on numbers or outside bets, then spin. Bets stay on the layout between spins until you clear them.</p>',
    'roulette-eu': '<p>Place chips on numbers or outside bets, then spin. Bets stay on the layout between spins until you clear them.</p>',
    baccarat: '<p>8-deck punto banco with standard third-card rules. Bet on Player, Banker or Tie, plus optional pair and bonus side bets. A tie returns Player and Banker bets.</p>',
    'baccarat-tie': '<p>8-deck punto banco with standard third-card rules. Bet on Player, Banker or Tie, plus optional pair and bonus side bets. A tie returns Player and Banker bets.</p>',
    'baccarat-side': '<p>8-deck punto banco with standard third-card rules. Bet on Player, Banker or Tie, plus optional pair and bonus side bets. A tie returns Player and Banker bets.</p>',
    craps: '<p>Two dice. One-roll bets are settled on every roll. Hardways and Big 6/8 stay up until they win or lose: a hardway loses on 7 or on the "easy" way; Big 6/8 lose on 7.</p>',
    videopoker: '<p>Jacks or Better draw poker. You are dealt 5 cards; tap cards to HOLD, then draw replacements. You are paid on the final hand.</p>',
    paigow: '<p>You and the dealer each get 7 cards and split them into a 5-card high hand and a 2-card low hand; the high hand must outrank the low hand. Win both hands to win (paid 1:1 less 5% commission), lose both to lose, otherwise push. The dealer wins exact ties. The <b>Fortune</b> side bet pays on the best 5-card hand in your 7 cards.</p>',
    sicbo: '<p>Three dice are shaken. Small (4–10) and Big (11–17) lose on any triple. Single-number bets pay 1:1, 2:1 or 3:1 for one, two or three matching dice.</p>',
    bingo: `<p>Buy 1–4 cards (bet is per card). ${L.BINGO_DRAW} of 75 balls are called. Every completed row, column or diagonal is a line (centre square is free), and each card is paid by its number of lines.</p>`,
    plinko: '<p>Drop a ball through the pegs; it lands in a multiplier slot at the bottom. Choose 8, 12 or 16 rows and a risk level.</p>',
    dragontiger: '<p>One card to Dragon, one to Tiger; the higher card wins (Ace low, King high). On a tie, Dragon and Tiger bets lose. Odd/Even bets lose when the card is a 7.</p>',
    threecard: '<p>Place an Ante and/or side bets. After seeing your 3 cards, Play (match the Ante) or Fold. The dealer needs Queen-high to qualify: if not, the Ante pays 1:1 and Play pushes; otherwise the higher hand wins 1:1 on both. Ante bonus pays on a straight or better. <b>Pair Plus</b> pays on your 3 cards; <b>6-Card Bonus</b> pays on the best 5 of your 3 plus the dealer\'s 3.</p>',
    caribbean: '<p>Place an Ante. You and the dealer get 5 cards (one dealer card face up). Fold, or Raise 2× your ante. The dealer qualifies with Ace-King or better. If the dealer doesn\'t qualify, the Ante pays 1:1 and the Raise pushes. If the dealer qualifies and you win, the Ante pays 1:1 and the Raise pays by the bonus table.</p>',
    holdem: '<p>Fixed-limit Texas Hold\'em against three computer players. Your bets are taken from your balance as you make them; pots you win are credited to your balance. The house takes a rake from pots that see a flop. You need 24 big blinds in balance to sit in a hand.</p>',
    letitride: '<p>Place three equal bets. You get 3 cards plus 2 face-down community cards. You may pull back bet #1 after seeing your cards and bet #2 after the first community card. Remaining bets are paid by the paytable on your final 5-card hand (pair of 10s or better).</p>',
    bigsix: '<p>Bet on the symbol you think the pointer will stop on. The payout equals the symbol value (e.g. $5 pays 5:1).</p>',
    crash: '<p>The multiplier climbs from 1.00× until it crashes. Cash out any time before the crash to win your bet × the current multiplier. Set an auto cash-out to cash out automatically.</p>',
    mines: '<p>Choose how many mines are hidden in the 5×5 grid. Each gem you reveal raises the multiplier; hit a mine and you lose the bet. Cash out any time after the first gem.</p>',
    limbo: '<p>Set a target multiplier. If the result is at or above your target, you win bet × target.</p>',
    dice: '<p>A number from 0.00 to 99.99 is rolled. Choose Roll Under or Roll Over and set your number with the slider; the payout multiplier is shown before you roll.</p>',
    hilo: '<p>Guess whether the next card is higher or lower (Ace low, King high). Each correct guess raises your multiplier; a wrong guess loses the bet. Cash out any time after one correct guess. Skipping a card is free.</p>',
    tower: '<p>Climb 8 floors by picking a safe tile on each floor; hit a trap and the bet is lost. Cash out after any floor. Harder difficulties pay more per floor.</p>',
    scratch: '<p>Buy a ticket, scratch the 9 panels (or press Reveal). Find three matching multipliers to win ticket price × that multiplier.</p>',
    fish: '<p>Tap the water to fire. Every shot costs your bet. Bullets bounce off the walls until they hit a fish, which may be caught for bet × its multiplier. A bullet that hits nothing is refunded.</p>',
    coinflip: `<p>Call heads or tails. A correct call pays ${L.COIN_MULT.toFixed(2)}× your bet.</p>`,
    war: `<p>6 decks, Ace high. Higher card wins 1:1. On a tie you may surrender (lose half your bet) or go to war: match your bet, three cards are burned and one more card each is dealt; if yours is equal or higher, your raise wins 1:1 and the original bet pushes. Optional Tie bet pays ${L.WAR_TIE_PAYS}:1.</p>`,
  };
})();
