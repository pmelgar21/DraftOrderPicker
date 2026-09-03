# Draft Order Picker

Runs the league's card-draw draft-order ritual remotely, for owners who can't make the draft
party. Self-hosted on Unraid — see **[SETUP.md](SETUP.md)** to deploy it.

## The rule it implements

- **Owner 1** picks any **3** of the 12 face-down cards, sees all three, and keeps the one they
  want. The other 2 go back into the pool, which is then reshuffled.
- **Owners 2–11** each draw exactly **1** card. Owner 11 is choosing from the last 2.
- **Owner 12** gets the leftover card automatically.

Twelve cards, twelve owners, no leftovers.

## How a draft runs

You set it up once and then do nothing.

1. Open the site, enter the 12 owner names in picking order, hit **Shuffle deck and start**.
2. Copy the 12 owner links and send each owner theirs. Bookmark your host link.
3. That's it. Owners pick whenever they get to it; your board updates by itself.

A link only works on that owner's turn, so you can send all 12 up front. An owner who opens
theirs early sees how many picks are ahead of them, and the page comes alive on their turn.
Nobody sends anything back to you — they pick, they see their number, and your board already
knows.

If someone goes quiet, **Take their turn** on the host board draws for them and keeps the best
card on offer.

The bare site address (no token) is a read-only board that's safe to post in the group chat.

## Why there's a server

Two things the league wanted are impossible without one:

**Free selection of any 3 of 12.** For a browser to flip whichever card you touch, it would have
to hold all 12 values — and anyone could then read the deck and take pick #1. Here the browser
holds nothing. It sends up which slots you chose, and the server sends back only those cards.
The selection is recorded *before* any value is returned, so reloading can't re-roll a hand you
don't like.

**No texting codes around.** Two browsers with no shared storage have no way to reach each
other. The server is what lets an owner's pick land on your board without anyone relaying it.

The deck never leaves the server. Nothing an owner can open, decode, or inspect reveals another
owner's card.

## Fairness

At setup the app publishes a SHA-256 **commit hash** of the shuffled deck. Post it to the group
chat before anyone picks; at the end the app reveals the deck itself, so anyone can re-hash it
and confirm it's the one you started from.

Because Owner 1 sees the two cards they hand back, the unclaimed pool is dealt again at that
point — the same as sliding those two into the deck at the table. So what Owner 1 saw tells them
nothing about anyone else's card. The proof panel says so explicitly.

Shuffling is Fisher–Yates over rejection-sampled random numbers, so every order is equally
likely; a plain modulo would quietly favour the low cards.

## Layout

| Path | What it is |
|---|---|
| `pb_hooks/main.pb.js` | HTTP API — the only thing that can see the deck |
| `pb_hooks/lib.js` | Shared server logic: shuffling, rules, state on disk |
| `pb_public/index.html` | The whole front end — setup, host board, owner view, public board |
| `index.html` | Older self-contained fallback needing no server (see below) |
| `SETUP.md` | Unraid + DuckDNS + PocketBase deployment |

PocketBase runs each route handler in an isolated VM with no access to outer scope, which is why
shared code lives in `lib.js` and every handler `require()`s it. The whole draft is one small
JSON document in `pb_data/` — there is no schema to create. Turns are strictly sequential and a
token only works on its owner's turn, so there is no concurrent writer to race with.

### API

| Route | Who | Does |
|---|---|---|
| `GET /api/dop/health` | anyone | Is it alive, is there a draft |
| `POST /api/dop/new` | first caller, then host | Creates the draft, returns host + owner tokens |
| `GET /api/dop/host?h=` | host | Everything, deck included |
| `GET /api/dop/board` | anyone | Names and revealed picks only |
| `GET /api/dop/turn?t=` | one owner | What that owner should see now |
| `POST /api/dop/draw` | one owner | Commit to slots, get back only those values |
| `POST /api/dop/keep` | one owner | Keep one drawn card |
| `POST /api/dop/force` | host | Take a silent owner's turn |
| `POST /api/dop/reset` | host | Start over |

### Fallback

`index.html` at the repo root is the earlier version that needs no server at all — one
self-contained file, deployed at <https://pmelgar21.github.io/DraftOrderPicker/>. It works
entirely in one browser, at the cost of the host relaying codes by text and the app dealing
Owner 1's three cards rather than letting them choose. Kept as insurance in case the server
isn't ready in time.
