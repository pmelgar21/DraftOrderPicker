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

**Turn 1 — the only two-part turn.** Owner 1 gets to see their 3 cards before choosing, and
the owner's browser never holds card values, so their numbers have to come from you:

1. Post the group-chat message with their turn link. They pick 3 face-down cards and send a code.
2. Paste it. The app hands you a second link carrying just those 3 cards, face-up.
3. Send that. They see the three numbers, keep one, and send a final code.
4. Paste it. Done — they already know their pick, so there is nothing to text back.

**Turns 2–12.**

1. Copy the group-chat message and post it. It names who's up and carries their turn link.
2. They open the link, pick their card, and send you back a short code.
3. Paste the code into **Submit code**. Their number appears — text it to them.

If someone goes dark, open **"not responding? Pick for them"** and take their turn from your
own screen. The draft never blocks on one person.

**The end.** Owner 12's card is assigned automatically. **Post this to the league** gives you
the final 1–12 order ready to paste.

## Back it up

The deck exists only in your browser, so the app keeps three copies: `localStorage`, the host
page's own URL (bookmark it), and a **backup code** you can copy. Text the backup code to
yourself once — pasting it into **Restore a draft** rebuilds the draft on any device.

## What owners can and can't see

A turn link contains only a name, a turn number, and anonymous slot ids — never card values.
The same is true of the code they send back. An owner who decodes their own link learns nothing
about their card or anyone else's, and a hand-edited code claiming extra cards, a taken card, or
another turn is rejected. Only your host screen ever holds the deck.

The one exception is Owner 1's second link, which necessarily carries the 3 numbers they are
choosing among — and nothing else. Because they then see the 2 cards they hand back, the
remaining pool is reshuffled at that point, exactly as those cards would be shuffled into the
deck at the table. So what Owner 1 saw tells them nothing about anyone else's card afterwards.
The commit hash still covers the deck as first dealt; the proof panel says so.

## Architecture

Single self-contained `index.html` — embedded CSS and JS, no build step, no dependencies, no
backend. Three views off the URL hash: setup/host (no hash), owner turn (`#t=`), host restore
(`#host=`).

Key functions in the `<script>` block:

- `shuffle` / `randInt` — Fisher–Yates over `crypto.getRandomValues`, rejection-sampled so it's unbiased
- `drawCount(turn)` — the whole house rule: 3 on turn 0, otherwise 1
- `commit(turn, drew, kept)` — claims the kept slot, returns the rest to the pool, auto-assigns the last card
- `reshuffleRemaining()` — re-deals values across unclaimed slots after Owner 1 sees their three
- `picker(mount, slots, draw, onDone)` — face-down card fan, shared by the owner view and "pick for them"
- `keepPicker(mount, cards, onDone)` — face-up fan for Owner 1's choice, shared with "choose for them"
- `keepPanel` / `revealView` — the two halves of turn 1's second phase
- `turnPanel` — generates turn links and validates returned codes
- `enc` / `dec` — base64url JSON for links, codes, and backups

State (`S`): `deck` (slot → pick number, live), `deck0` (as first dealt, what `commit` hashes),
`owners` (in picking order), `slotOwner`, `turn`, `log`, `pending` (turn 1 awaiting its choice),
`reshuffled`, `seed`, `commit`, `nonce`.
