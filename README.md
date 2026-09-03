# Draft Order Picker

Runs the league's card-draw draft-order ritual remotely, for owners who can't make the draft party.

**Live app:** https://pmelgar21.github.io/DraftOrderPicker/

## The rule it implements

- **Owner 1** picks any **3** of the 12 face-down cards, keeps **1**; the other 2 go back in the pool.
- **Owners 2–11** each draw exactly **1** card. Owner 11 is choosing from the last 2.
- **Owner 12** gets the leftover card automatically.

Twelve cards, twelve owners, no leftovers.

## How to run the draft

**Setup (once).** Open the app, type the 12 owner names in the order they'll pick, hit
**Shuffle deck and start**. The deck is shuffled with `crypto.getRandomValues` and lives only
in your browser.

Optionally hit **Copy commit hash** and post it to the group chat before anyone picks. It's a
SHA-256 fingerprint of the shuffled deck. At the end the app shows the deck itself, so anyone
can re-hash it and confirm you didn't reshuffle mid-draft.

**Each turn (11 times).**

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

## Architecture

Single self-contained `index.html` — embedded CSS and JS, no build step, no dependencies, no
backend. Three views off the URL hash: setup/host (no hash), owner turn (`#t=`), host restore
(`#host=`).

Key functions in the `<script>` block:

- `shuffle` / `randInt` — Fisher–Yates over `crypto.getRandomValues`, rejection-sampled so it's unbiased
- `drawCount(turn)` — the whole house rule: 3 on turn 0, otherwise 1
- `commit(turn, drew, kept)` — claims the kept slot, returns the rest to the pool, auto-assigns the last card
- `picker(mount, slots, draw, onDone)` — the card-fan UI, shared by the owner view and "pick for them"
- `turnPanel` — generates turn links and validates returned codes
- `enc` / `dec` — base64url JSON for links, codes, and backups

State (`S`): `deck` (slot → pick number), `owners` (in picking order), `slotOwner`, `turn`, `log`,
`seed`, `commit`, `nonce`.
