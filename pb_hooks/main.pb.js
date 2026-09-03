/// <reference path="../pb_data/types.d.ts" />
//
// Draft Order Picker - HTTP API.
//
// The deck never leaves this server. An owner can only ever learn the value of
// a card after committing to draw it, which is what makes free selection of
// any 3 of the 12 safe: there is nothing in the browser to peek at.

routerAdd("GET", "/api/dop/health", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    return e.json(200, {
        ok: true,
        hasDraft: !!st,
        turn: st ? st.turn : null,
        statePath: lib.STATE
    });
});

// Creates the draft. Allowed when no draft exists yet, or with the host token
// (which is how "start over" replaces one). Create yours immediately after
// starting the container, before you hand any link out.
routerAdd("POST", "/api/dop/new", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const body = e.requestInfo().body || {};
    const existing = lib.load();

    if (existing && body.hostToken !== existing.hostToken) {
        throw new ForbiddenError("A draft already exists. Use your host link to start over.");
    }

    const names = body.names;
    if (!Array.isArray(names) || names.length !== lib.N) {
        throw new BadRequestError("Expected " + lib.N + " owner names.");
    }
    const clean = names.map(n => String(n == null ? "" : n).trim());
    if (clean.some(n => !n)) throw new BadRequestError("Every owner needs a name.");
    const lower = clean.map(n => n.toLowerCase());
    if (new Set(lower).size !== lib.N) {
        throw new BadRequestError("Two owners have the same name. Make them unique.");
    }

    const st = lib.create(clean);
    lib.save(st);

    return e.json(200, {
        hostToken: st.hostToken,
        commit: st.commit,
        owners: clean.map((name, i) => ({ name: name, turn: i + 1, token: st.tokens[i] }))
    });
});

// Everything the host is allowed to see, which is everything.
routerAdd("GET", "/api/dop/host", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) throw new NotFoundError("No draft yet.");
    if (e.request.url.query().get("h") !== st.hostToken) {
        throw new ForbiddenError("Bad host token.");
    }
    return e.json(200, {
        board: lib.boardView(st),
        deck: st.deck,
        deck0: st.deck0,
        seed: st.seed,
        commit: st.commit,
        reshuffled: st.reshuffled,
        slotOwner: st.slotOwner,
        log: st.log,
        pending: st.pending,
        started: st.started,
        owners: st.names.map((name, i) => ({ name: name, turn: i + 1, token: st.tokens[i] }))
    });
});

routerAdd("POST", "/api/dop/reset", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) return e.json(200, { ok: true });
    const body = e.requestInfo().body || {};
    if (body.hostToken !== st.hostToken) throw new ForbiddenError("Bad host token.");
    lib.wipe();
    return e.json(200, { ok: true });
});

// A public progress board - names and revealed picks only.
routerAdd("GET", "/api/dop/board", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) throw new NotFoundError("No draft yet.");
    return e.json(200, lib.boardView(st));
});

// What this owner should be looking at right now.
routerAdd("GET", "/api/dop/turn", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) throw new NotFoundError("No draft yet.");
    const idx = lib.ownerIndex(st, e.request.url.query().get("t"));
    if (idx < 0) throw new ForbiddenError("That link is not valid for this draft.");
    return e.json(200, { view: lib.turnView(st, idx), board: lib.boardView(st) });
});

// Commit to drawing specific cards. This is the point of no return: the
// selection is stored before any value is returned, so the cards cannot be
// re-rolled by reloading.
routerAdd("POST", "/api/dop/draw", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) throw new NotFoundError("No draft yet.");

    const body = e.requestInfo().body || {};
    const idx = lib.ownerIndex(st, body.t);
    if (idx < 0) throw new ForbiddenError("That link is not valid for this draft.");
    if (lib.myPick(st, idx) !== null) throw new BadRequestError("You have already picked.");
    if (st.turn !== idx) throw new BadRequestError("It is not your turn yet.");

    // Already drawn: hand back the same cards rather than dealing new ones.
    if (st.pending && st.pending.turn === idx) {
        return e.json(200, { cards: st.pending.slots.map(i => ({ i: i, x: st.deck[i] })) });
    }

    const want = lib.drawCount(idx);
    const slots = Array.isArray(body.slots) ? body.slots.map(n => parseInt(n, 10)) : [];
    if (slots.length !== want) {
        throw new BadRequestError("Expected " + want + " card" + (want === 1 ? "" : "s") + ".");
    }
    if (new Set(slots).size !== slots.length) throw new BadRequestError("Same card twice.");
    const pool = lib.available(st);
    if (!slots.every(i => pool.indexOf(i) >= 0)) {
        throw new BadRequestError("That card is not in the pool.");
    }

    st.pending = { turn: idx, slots: slots };
    lib.save(st);

    return e.json(200, { cards: slots.map(i => ({ i: i, x: st.deck[i] })) });
});

// Keep one of the drawn cards. The rest go back into the pool.
routerAdd("POST", "/api/dop/keep", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) throw new NotFoundError("No draft yet.");

    const body = e.requestInfo().body || {};
    const idx = lib.ownerIndex(st, body.t);
    if (idx < 0) throw new ForbiddenError("That link is not valid for this draft.");

    const already = lib.myPick(st, idx);
    if (already !== null) return e.json(200, { value: already });   // idempotent
    if (st.turn !== idx) throw new BadRequestError("It is not your turn yet.");
    if (!st.pending || st.pending.turn !== idx) {
        throw new BadRequestError("Draw your cards first.");
    }

    const kept = parseInt(body.kept, 10);
    if (st.pending.slots.indexOf(kept) < 0) {
        throw new BadRequestError("That is not one of the cards you drew.");
    }

    const value = st.deck[kept];
    lib.commit(st, idx, st.pending.slots, kept);
    lib.save(st);

    return e.json(200, { value: value });
});

// Lets the host take a turn for an owner who has gone quiet.
routerAdd("POST", "/api/dop/force", (e) => {
    const lib = require(`${__hooks}/lib.js`);
    const st = lib.load();
    if (!st) throw new NotFoundError("No draft yet.");

    const body = e.requestInfo().body || {};
    if (body.hostToken !== st.hostToken) throw new ForbiddenError("Bad host token.");
    if (st.turn >= lib.N) throw new BadRequestError("The draft is finished.");

    const idx = st.turn;
    const pool = lib.available(st);

    if (pool.length === 1) {                       // last owner, no choice to make
        lib.commit(st, idx, [pool[0]], pool[0]);
        lib.save(st);
        return e.json(200, { value: st.log[st.log.length - 1].value });
    }

    let slots;
    if (st.pending && st.pending.turn === idx) slots = st.pending.slots;
    else slots = lib.shuffle(pool).slice(0, lib.drawCount(idx));

    // Take the best card on offer, which is what the owner would have done.
    let kept = slots[0];
    slots.forEach(i => { if (st.deck[i] < st.deck[kept]) kept = i; });

    const value = st.deck[kept];
    lib.commit(st, idx, slots, kept);
    lib.save(st);
    return e.json(200, { value: value });
});
