# Bug: history replay duplicates messages and misattributes your own

Found during the Transit Signal redesign (visual symptom), diagnosed afterwards.
Not caused by that change — it predates it. The redesign only made it easier to
see, because incoming and outgoing bubbles are now different colours and sit on
different sides.

## Symptoms

Refresh the tab while you have message history in `sessionStorage`:

1. The entire history block renders **twice**, each preceded by its own
   `— earlier messages —` separator.
2. In the **first** copy, your own past messages render as if someone else sent
   them: left-aligned, cyan accent, incoming styling.
3. The second copy is correct.

## Root cause

Two bugs with one shared trigger: on reconnect, the server issues a fresh random
name *before* it processes the name claim, so the client sees two `joined`
messages with two different names.

### Sequence

| Step | Where | What happens |
|------|-------|--------------|
| 1 | `public/app.js` `open` handler | Client sends `claim` with the saved name + token |
| 2 | `src/server.js:215` | Server has *already* assigned a fresh random name on connect |
| 3 | `src/server.js` | Server sends `joined` with that **random** name |
| 4 | `public/app.js:72-86` | First branch matches (`!myName`) → sets `myName` to the random name → calls `replayHistory()` |
| 5 | `src/server.js:236-268` | Server processes the `claim`, reassigns the name |
| 6 | `src/server.js:262-267` | Server sends a second `joined` with the **claimed** name |
| 7 | `public/app.js:88-98` | Second branch matches → sets `myName` to the claimed name → calls `replayHistory()` **again** |

### Bug 1 — duplicate replay

`replayHistory()` is called at both `public/app.js:78` and `public/app.js:94`.
During a reconnect-with-claim, both run. There is no guard preventing a second
replay.

### Bug 2 — misattribution in the first copy

`replayHistory()` decides ownership with:

```js
addMessage(entry.from, entry.text, entry.from === myName);
```

At step 4, `myName` holds the *temporary random* name (e.g. `Crimson Walrus`),
but the stored history entries were written under the *previous* name (e.g.
`Shiny Mole`). Every comparison fails, so every one of your own past messages is
rendered as incoming.

Note: `myName` is not null at that point — my first guess was that it was, and
that is wrong. It is set, just set to the wrong name.

## Suggested fix

Replay once, after the identity has settled. Rough shape:

- Add a `historyReplayed` flag (alongside the existing `pendingClaim`) and
  return early from `replayHistory()` if it is already set.
- When `pendingClaim` is true, **skip** the replay in the first `joined` branch
  (`public/app.js:78`) and let the post-claim branch (`public/app.js:94`) do it,
  since only that one knows the final name.
- When `pendingClaim` is false (a genuine first join, no saved name), replay in
  the first branch as it does today.

### Important: do not simply move the call

The unconditional `replayHistory()` at `public/app.js:78` is **deliberate**. It
was added in commit `de12d7e` specifically to handle the claim-failure path:

> `fix: replay history on claim failure path (unconditional replayHistory in branch 1)`

If the claim is **rejected**, the server sends nothing back — every validation
failure at `src/server.js:239-244` returns silently. The post-claim branch
therefore never fires, and deferring the replay to it would mean history is
never shown at all. That is the regression the earlier commit was fixing, so any
fix here must keep the failure path working.

This makes the "skip in branch 1 when `pendingClaim` is true" suggestion above
**insufficient on its own**. It needs one of:

- Server acknowledges failed claims (e.g. a `claim-rejected` message), so the
  client always gets a second event and can replay deterministically; or
- A client-side timeout: if no post-claim `joined` arrives within ~1s, replay
  under the fallback name; or
- Make the replay idempotent and re-render rather than append — replay
  immediately in branch 1 as today, then on a successful claim **re-attribute
  the already-rendered history** (flip the `.mine` class where `from` matches
  the final name) instead of replaying a second time.

The third option is probably the cleanest: it keeps the failure path working
untouched, shows history immediately, and fixes both bugs.

Storing an owner marker on each history entry at write time (rather than
comparing names at read time) would also fix bug 2 and is more robust against
any future rename — `storeMessage()` at `public/app.js:14` is where entries are
written.

## Reproducing

1. `PORT=3000 node src/server.js` — port 3000 matters, the origin allowlist at
   `src/server.js:12-16` only accepts `localhost:3000`.
2. Open `http://localhost:3000` in two tabs so you have a conversation partner.
3. Send a few messages from each side.
4. Refresh one tab.
5. Observe the duplicated history block and the misattributed first copy.

## Tests

There is currently no browser/DOM test harness in this repo — `npm test` is
`node --test` over `test/*.test.js`, and the existing client-side tests in
`test/theme.test.js` assert on file *contents* rather than runtime behaviour.
Testing this properly needs either a DOM shim (jsdom) or extracting the replay
decision into a pure function that can be unit-tested without a DOM. The latter
is probably the cheaper option and worth doing as part of the fix.
