// Draft Order Picker - shared server logic.
//
// PocketBase runs every route handler in an isolated VM with no access to the
// outer scope, so all shared code lives here and each handler require()s it.
//
// The whole draft is one small JSON document on disk. There is no schema to
// create: drop this in pb_hooks and the app works. Turns are strictly
// sequential and only one owner can act at a time, so there is no concurrent
// writer to race with.

const N = 12;
const STATE = `${__hooks}/../pb_data/dop_state.json`;

/* ---------- storage ---------- */

function load() {
    try {
        const raw = $os.readFile(STATE);
        const text = typeof raw === "string" ? raw : toString(raw);
        if (!text) return null;
        return JSON.parse(text);
    } catch (err) {
        return null; // no draft yet
    }
}

function save(st) {
    $os.writeFile(STATE, JSON.stringify(st), 0o644);
}

function wipe() {
    try { $os.remove(STATE); } catch (err) { /* already gone */ }
}

/* ---------- randomness ----------
   Rejection-sampled so every outcome is equally likely; a plain modulo of a
   random number would quietly favour the low cards. */

function randInt(n) {
    const LIMIT = 1000000000;
    const cap = Math.floor(LIMIT / n) * n;
    for (let guard = 0; guard < 1000; guard++) {
        const x = parseInt($security.randomStringWithAlphabet(9, "0123456789"), 10);
        if (x < cap) return x % n;
    }
    throw new Error("randInt failed to sample");
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* ---------- rules ---------- */

// Owner 1 is the only one who draws three and keeps one.
function drawCount(turn) { return turn === 0 ? 3 : 1; }

function available(st) {
    const out = [];
    for (let i = 0; i < N; i++) if (st.slotOwner[i] === null) out.push(i);
    return out;
}

function create(names) {
    const seed = $security.randomString(32);
    const deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const slotOwner = [];
    const tokens = [];
    for (let i = 0; i < N; i++) { slotOwner.push(null); tokens.push($security.randomString(22)); }

    return {
        v: 1,
        started: new Date().toISOString(),
        names: names,
        seed: seed,
        deck: deck,          // live: slot -> pick number
        deck0: deck.slice(),  // as first dealt; this is what `commit` hashes
        commit: $security.sha256(seed + "|" + deck.join(",")),
        turn: 0,
        reshuffled: false,
        slotOwner: slotOwner,
        log: [],
        pending: null,        // {turn, slots} once an owner has committed to a draw
        hostToken: $security.randomString(26),
        tokens: tokens
    };
}

/* Owner 1 sees the two cards they hand back, so the unclaimed cards are dealt
   again - the same as sliding those two into the deck at the table. */
function reshuffleRemaining(st) {
    const slots = available(st);
    const vals = shuffle(slots.map(i => st.deck[i]));
    slots.forEach((slot, i) => { st.deck[slot] = vals[i]; });
    st.reshuffled = true;
}

function commit(st, turn, drew, kept) {
    st.slotOwner[kept] = turn;
    st.log.push({
        turn: turn,
        owner: st.names[turn],
        drew: drew,
        kept: kept,
        value: st.deck[kept],
        at: new Date().toISOString()
    });
    st.turn = turn + 1;
    st.pending = null;

    if (turn === 0 && drew.length > 1) reshuffleRemaining(st);

    // The last owner has no choice left, so their card is assigned for them.
    if (st.turn === N - 1) {
        const left = available(st);
        if (left.length === 1) {
            const slot = left[0];
            st.slotOwner[slot] = st.turn;
            st.log.push({
                turn: st.turn,
                owner: st.names[st.turn],
                drew: [slot],
                kept: slot,
                value: st.deck[slot],
                at: new Date().toISOString(),
                auto: true
            });
            st.turn = N;
        }
    }
}

/* ---------- views ---------- */

function ownerIndex(st, token) {
    for (let i = 0; i < N; i++) if (st.tokens[i] === token) return i;
    return -1;
}

function myPick(st, turn) {
    const rows = st.log.filter(l => l.turn === turn);
    return rows.length ? rows[0].value : null;
}

// What an owner is allowed to know. Never includes the deck.
function turnView(st, turn) {
    const done = myPick(st, turn);
    if (done !== null) {
        return { name: st.names[turn], stage: "done", value: done, turn: turn };
    }
    if (st.turn < turn) {
        return {
            name: st.names[turn], stage: "waiting", turn: turn,
            ahead: turn - st.turn, upNow: st.names[st.turn]
        };
    }
    const draw = drawCount(turn);
    const pool = available(st);

    // Mid-turn: they already committed to a draw, so they see the same cards
    // again however many times they reload. No fishing for a better hand.
    if (st.pending && st.pending.turn === turn) {
        return {
            name: st.names[turn], stage: "reveal", turn: turn, draw: draw,
            cards: st.pending.slots.map(i => ({ i: i, x: st.deck[i] }))
        };
    }
    return {
        name: st.names[turn], stage: "draw", turn: turn, draw: draw,
        slots: shuffle(pool), poolSize: pool.length
    };
}

// Safe for anyone to see: who has picked what, and nothing about the pool.
function boardView(st) {
    const picks = st.log.map(l => ({ pick: l.value, name: l.owner }));
    picks.sort((a, b) => a.pick - b.pick);
    return {
        names: st.names,
        turn: st.turn,
        total: N,
        poolSize: available(st).length,
        upNow: st.turn < N ? st.names[st.turn] : null,
        done: st.turn >= N,
        picks: picks
    };
}

module.exports = {
    N, STATE,
    load, save, wipe,
    randInt, shuffle,
    drawCount, available, create, commit, reshuffleRemaining,
    ownerIndex, myPick, turnView, boardView
};
