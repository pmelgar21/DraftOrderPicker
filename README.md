# Draft Order Picker

Runs the league's card-draw draft-order ritual remotely, for owners who can't make the draft party.

**Live app:** https://pmelgar21.github.io/DraftOrderPicker/

## The rule it implements

- **Owner 1** picks any **3** of the 12 face-down cards, then **sees all three face-up** and
  keeps the one they want; the other 2 go back into the pool, which is reshuffled.
- **Owners 2–11** each draw exactly **1** card. Owner 11 is choosing from the last 2.
- **Owner 12** gets the leftover card automatically.

Twelve cards, twelve owners, no leftovers.

## How to run the draft

**Setup (once).** Open the app, type the 12 owner names in the order they'll pick, hit
**Shuffle deck and start**. The deck is shuffled with `crypto.getRandomValues` and lives only
in your browser.

Optionally hit **Copy commit hash** and post it to the group chat before anyone picks. It's a
SHA-256 fingerprint of the deck as first dealt. At the end the app shows that deck, so anyone
can re-hash it and confirm it is the one you started from.

**Each turn — two messages, no back and forth.**

1. Copy the group-chat message and post it. It names who's up and carries their turn link.
2. They open it, tap cards, and see their pick number right there on screen. They send you
   back a short code.
3. Paste the code into **Submit code**. That's it — they already know their pick, so there is
   nothing for you to send back.

Owner 1's turn works the same way: they tap 3 cards, each turns over as they go, and once all
three are up they keep whichever they want.

If someone goes dark, open **"not responding? Pick for them"** and take their turn from your
own screen. The draft never blocks on one person.

**The end.** Owner 12's card is assigned automatically. **Post this to the league** gives you
the final 1–12 order ready to paste.

## Back it up

The deck exists only in your browser, so the app keeps three copies: `localStorage`, the host
page's own URL (bookmark it), and a **backup code** you can copy. Text the backup code to
yourself once — pasting it into **Restore a draft** rebuilds the draft on any device.

## What owners can and can't see

A turn link carries **only the cards that owner was dealt** — one card, or three for Owner 1 —
and never the deck. So an owner who decodes their own link learns their own number a few seconds
early and nothing else. Nobody can see another owner's card, or which pool card is the number 1
pick.

This is what lets the reveal happen instantly in their browser with no server: the app decides
which cards they get at the moment it builds the link, exactly as the cards are already
face-down and settled on a table before anyone reaches for them. Which rectangle they tap is
ceremony, and the odds are identical either way.

A hand-edited code claiming a card they were not dealt is rejected, as are codes from another
draft, from another turn, or already used.

Because Owner 1 does see the two cards they hand back, the remaining pool is reshuffled at that
point — the same as sliding those cards into the deck. So what they saw tells them nothing about
anyone else's card. The commit hash still covers the deck as first dealt; the proof panel says
so.

## Architecture

Single self-contained `index.html` — embedded CSS and JS, no build step, no dependencies, no
backend. Three views off the URL hash: setup/host (no hash), owner turn (`#t=`), host restore
(`#host=`). An owner's turn is a single page load — no round trip mid-turn.

Key functions in the `<script>` block:

- `shuffle` / `randInt` — Fisher–Yates over `crypto.getRandomValues`, rejection-sampled so it's unbiased
- `drawCount(turn)` — the whole house rule: 3 on turn 0, otherwise 1
- `commit(turn, drew, kept)` — claims the kept slot, returns the rest to the pool, auto-assigns the last card
- `offerFor(turn)` — deals this turn's cards once and stores them, so the link never changes
- `reshuffleRemaining()` — re-deals values across unclaimed slots after Owner 1 sees their three
- `drawPicker(mount, poolSize, cards, onDone)` — the owner's whole turn: tap, flip, keep
- `keepPicker(mount, cards, onDone)` — face-up chooser, used when the host takes a turn
- `turnPanel` — generates turn links and validates returned codes
- `enc` / `dec` — base64url JSON for links, codes, and backups

State (`S`): `deck` (slot → pick number, live), `deck0` (as first dealt, what `commit` hashes),
`owners` (in picking order), `slotOwner`, `turn`, `log`, `offer` (the cards dealt for the current
turn), `reshuffled`, `seed`, `commit`, `nonce`.
