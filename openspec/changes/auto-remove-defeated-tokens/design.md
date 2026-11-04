# Design

## Context

See `proposal.md` for why, and `specs/` for the behavior. The parts of the current code the approach depends on:

- **Pipeline (CLAUDE.md invariants 1-2).** `Command -> decide -> events -> store.append -> reduce -> broadcast`. `decide` and `reduce` are pure.
- **Where HP falls (all in `packages/shared/src/decide.ts`).** Each emits `TokenStatsSet { stats, previous }`, with HP floored at `MIN_HP = -999` (`conditions.ts`):
  1. `roll.applyDamage` (~line 771-791): `hp = max(MIN_HP, target.stats.hp - amount)`.
  2. `areaEffect.resolve` (~867-910): per-row amount, `TokenStatsSet` at ~897, before `AreaEffectResolved`.
  3. `nuke.detonate` (~923-950): the loop at ~930-937 damages every token with HP. This is the "HP-setting command near line 935"; it is not a stats edit, it is the nuke.
  4. `token.setStats` (~615-632): the token card's HP edit; owners may edit their own token.
  5. `token.update` (~477-532): `changes.stats`, same event at ~532.
  Also seen and **not** a damage path: `history.undo` (~1193) emits inverse `TokenStatsSet`s, and encounter application creates tokens. Undo restores earlier values; it never removes a token (see Decision 6).
- **Room options.** `room.setReducedEffects` (`decide.ts` ~916) -> `ReducedEffectsSet { enabled, previous }` (`events.ts` ~277) -> `RoomState.reducedEffects` (`state.ts` ~377, default `false`, "Older rooms read as false"), passed to everyone by `visibility.ts` (~263). ADR 0038 describes it. There is no web control for it today. The new option follows this pattern exactly. `state.preset` is the other option (fixed at creation, public).
- **Token deletion.** `token.delete` (GM only) -> `TokenDeleted { token }` carrying the whole token. `reduce` removes the token from `tokens` only (it leaves `initiative.order`, `tokenGroups` and `rolls` alone; `tokenGroups` is documented to outlive the token so undoing a deletion regroups it). `TokenDeleted` is **not** in `REVERSIBLE_EVENT_TYPES` (only `TokenCreated` is, whose inverse is `TokenDeleted`), so no batch containing it is undoable today.
- **Undo (`undo.ts`).** An action is one command's batch; it is undoable only if every event in it is reversible (`isReversible`). `canUndo` further refuses a batch with a `TokenStatsSet` unless it also holds `RollDamageApplied`, `MapNuked` or `AreaEffectResolved` ("HP edits on their own are not undoable: the GM just edits them again"). `history.undo` applies `entry.events.map(inverseOf).reverse().flat()` plus `ActionUndone`. `undoConflict` refuses when a token's current state differs from the event's value or when a token is gone.
- **Filters (`visibility.ts`).** `TokenDeleted` is redacted for a viewer who cannot see the token (hidden, or fogged for a player) and otherwise passes with `tokenForViewer(token)`. For a token the viewer owns, `TokenDeleted` returns `resync` (the sight origin changed, ~line 183).
- **Board.** Live events reach `Board.tsx` through `connection.onCommitted(committed, before, after)`, then `attackEffectFor(event, after, viewer)` (`effects.ts`) returns an `AttackEffect` that `BoardView.playAttackEffect` draws. `BoardView.syncTokens()` (~line 2027) destroys the sprite of any token missing from `state.tokens` immediately. `effectiveReducedMotion` (`effects.ts` ~165) combines the OS preference, the client `reducedAnimations` and `RoomState.reducedEffects`; `graphicsBudget()` reads `graphicsQuality`.
- **Settings menu.** `ui/SettingsMenu.tsx` holds only per-browser `ClientSettings` ("Saved in this browser"). It is also mounted from `account/AccountPages.tsx` where there is no room.

## Goals / Non-Goals

**Goals:**
- One rule, applied in the server pipeline for every damage path, in the same batch as the HP change.
- Reuse `TokenDeleted` (carries the full token) so history stays append-only and undo restores the token and its HP.
- Nothing about a hidden token reaches a player, including through the animation.

**Non-Goals:**
- Death saves or "dying" states (a token at 0 HP is removed outright).
- Removing tokens already at 0 HP or below when the setting is turned on, or when a token with `hp: null` gains HP.
- Per-scene or per-token overrides, or a client-side opt-out of the removal.
- A web control for `reducedEffects` (a separate gap).
- Making manual `token.delete` undoable.

## Decisions

### 1. Name, wording, state

- Setting `RoomState.autoRemoveDefeated: boolean`, default `true`; absent in older snapshots, which read as true (`?? true` in readers; `decide` treats only an explicit `false` as off). Unlike `reducedEffects`, which defaults to false. Public to everyone (no GM-only content), so `filterStateForViewer` passes it unchanged.
- Command `room.setAutoRemoveDefeated { enabled }`, event `AutoRemoveDefeatedSet { enabled, previous }`. `can.administer` first; refuse an unchanged value as `invalid` (as `room.setReducedEffects`). Reduce: `{ ...state, autoRemoveDefeated: event.enabled }`. Not in `REVERSIBLE_EVENT_TYPES`, like `ReducedEffectsSet`: a switch is flipped back, not undone. `visibility.ts` returns `pass`. Activity log: "<actor> turned automatic removal of defeated tokens on/off".
- UI label: **Remove tokens at 0 HP**. Hint: "Defeated tokens leave the board when their HP reaches 0 or below. You can undo it."
- Alternatives: a field on `ClientSettings` (rejected: every browser could differ, so tokens would stay or go depending on who is looking, and the server cannot enforce it); a new `room.*` bag of options (rejected: one boolean does not justify it).

### 2. One removal helper in `decide`

`decide` gains a small pure function, `withDefeats(state, events)`, that takes the stats events a command has just built and, when `state.autoRemoveDefeated` is true, appends for each `TokenStatsSet` with `stats.hp !== null && stats.hp <= 0` a `TokenDeleted { token: { ...state.tokens[id], stats }, reason: "defeated" }` directly after it. The token is built from the current state plus the new stats, so the event carries the deleted entity as it was just before removal (invariant 6), including its 0 or negative HP. It runs once at the end of each of the five paths (`roll.applyDamage`, `areaEffect.resolve`, `nuke.detonate`, `token.setStats`, `token.update`), which makes the rule uniform and testable in one place. No clock or randomness is involved.

- Order in a batch: `TokenStatsSet`, `TokenDeleted`, then the closing event (`RollDamageApplied`, `AreaEffectResolved`; for the nuke `MapNuked` comes first as today). For `token.update`, the delete goes after every other event for that token, so no later event names a missing token.
- `reduce` already throws on events for a missing token, so each path must not emit anything after the delete for that id. `areaEffect.resolve` adds conditions after stats today: the helper should put the delete after the token's last event, or the resolve loop should skip conditions for a defeated token. Implementation task 2.3 settles which; the spec only requires one batch.
- Alternative: a `reduce` rule that deletes a token when HP <= 0 (rejected: `reduce` would invent history that is not in the log, and undo/filters would see no event).
- Alternative: new event `TokenDefeated` (rejected: the user asked to reuse deletion, and it duplicates `TokenDeleted`'s redaction and replay handling).

### 3. `TokenDeleted` gets an optional `reason: "defeated"`

`reason` is optional, so stored logs and snapshots parse unchanged. `token.delete` and the member-leaves path (`decide.ts` ~1270) leave it unset. This is the schema change to an existing event that needs the ADR. It tells the board to animate (Decision 7), the activity log what to say ("<name> was defeated and removed"), `replay.ts` the same, and the undo code which deletions it may reverse.

### 4. Undo as a compensating action

A defeat batch must be undoable as a whole, while manual deletes stay non-undoable. In `undo.ts`:

- `isReversible`: a `TokenDeleted` is reversible only when `reason === "defeated"` (a special case beside the `MapSet` one). `ReversibleEvent` includes that narrowed type.
- `inverseOf(TokenDeleted)` -> `[{ type: "TokenCreated", token: event.token }]`, listed beside `TokenCreated` among events with their own inverse. Because the inverses are applied in reverse order, the token is recreated (with its negative HP) first, and then the `TokenStatsSet` inverse restores `previous`. Invariant 5 holds: nothing is rewritten; undo is new events.
- `canUndo`: the "HP edit alone is not undoable" rule gains one more allowed companion, a defeat `TokenDeleted`, because a GM cannot just re-edit a token that is gone. This makes a plain `token.setStats` or `token.update` that removed a token undoable. Without the defeat, nothing changes.
- `undoConflict`: for a `TokenStatsSet` whose token was deleted in the same entry, skip the "current stats equal event.stats" check (the token is absent by design). For the defeat `TokenDeleted`, refuse when the token id already exists again (invalid: "Can't undo: <name> is already back") or a live token has taken its name. The name check uses the same normalisation as `uniqueTokenName`; if a clash is cheaper to handle by renaming, the implementer must instead raise it with the owner. Stats checks on other tokens in the batch stay as they are.
- `describeUndo`: "Undo: <name> defeated and removed" (and the plural for several).
- `tokenNames` in the history entry already records names for tokens created in an action; defeat entries should record the name from the deleted token so the conflict text can use it.
- Not restored by undo, as with a manual delete's undo of a create: the initiative order and groups were never touched, so they need nothing. `rolls` that mention the token kept `name` at roll time.
- Nuke: `MapNukeUndone` plays nothing and is unaffected; the extra `TokenCreated` events replay the token as a normal creation.

### 5. Visibility and who learns what

- `TokenDeleted` keeps its existing filter: redacted when `concealedFrom` (hidden or fogged for a player), otherwise passed with `tokenForViewer`. The `reason` field is not secret, so it passes through. A player never receives a `TokenDeleted` for a token they cannot see, so no death animation can be triggered for it and the preceding `TokenStatsSet` is already redacted the same way.
- `autoRemoveDefeated` itself is public.
- Owner resync: `filterEventForViewer` currently returns `resync` for `TokenDeleted` of a token the viewer owns (a sight origin vanished). A resync is a snapshot, which the board treats as non-live, so the **owning player would get no animation**. The implementation must keep sight correct and still deliver the event: either return the event and then a resync, or let the board take the pre-resync token from its previous snapshot when a snapshot lacks a token that had HP at 0 or below and `autoRemoveDefeated`. This is an open question for the ADR owner (see below); the specs only require that every viewer who sees the token sees the animation.

### 6. Setting on vs undo

Undo never calls the removal helper. An undo that restores an HP of 0 or below while the setting is on leaves the token present, as a re-edit would not apply. Likewise, flipping the setting on never removes a token retroactively; the next damage that leaves a token at 0 HP or below does.

### 7. Death animation (board only, Pixi only under `board/`)

- `effects.ts`: `attackEffectFor` gains a case for `TokenDeleted` with `reason === "defeated"`, returning `{ kind: "defeat", token }`. It reads the token from the **event** (the viewer's filtered copy: `after` no longer contains it), and returns null when the viewer is a player and `token.hidden` (a second guard behind the filter). Reduced motion and quality are decided in `attackPlan`/`defeatPlan`, a pure function like `attackPlan`: if `effectiveReducedMotion(state)` or `graphicsQuality === "low"`, `{ motion: false, durationMs: 250 }` (a plain alpha fade); otherwise a short effect (roughly 700 ms: the token greys, shrinks slightly and fades while a small dust puff plays from `fxParticles`, within `graphicsBudget()` particle limits). A cap of about 12 concurrent full animations (as `MAX_ATTACK_EFFECTS`) fades the rest, so a nuke killing 60 tokens cannot flood the GPU.
- `Board.tsx` already skips effects when `suppressLiveEffects` and for snapshots, so reloads, reconnects and replay show no animation.
- Keeping the sprite: `BoardView` holds a `dying: Map<tokenId, view>`. `syncTokens()` skips destroying a view whose id is in `dying` and does not `drawToken` it, so it keeps its last drawn frame, label and HP ring. `playAttackEffect({ kind: "defeat" })` marks the id as dying, runs the ticker animation on the view's container, and on completion destroys the view and removes the id. A hard timeout (animation length + 500 ms) and `BoardView.destroy()` and a full state replace (resync/scene switch) finish any outstanding ones at once, so a stuck sprite cannot survive.
- The damage number and hit effect that come from the preceding `TokenStatsSet` / `RollDamageApplied` play on the still-present token because those events are processed before the delete.
- If the token is selected or dragged when it dies, selection clears in `syncTokens()`'s existing missing-token path after the animation; interaction on a dying view is disabled (`eventMode = "none"`).
- React stays out of Pixi: the Settings menu only sends a command and reads `state.autoRemoveDefeated`.

### 8. Settings menu

`SettingsMenu` gets optional props `{ room?: { isGm: boolean; autoRemoveDefeated: boolean; setAutoRemoveDefeated(enabled: boolean): void } }`. `RoomMenu` (which knows the room, role and `RoomConnection.command`) passes it; `AccountPages` does not, so no room section appears there. When `room.isGm`, a fieldset **Table** (legend) shows the switch (`role="switch"`, as the other toggles) with its hint and a line "Shared with everyone in the room." The top line "Saved in this browser. Changes apply immediately." is adjusted so it does not claim this switch is browser-local (e.g. "Audio and graphics are saved in this browser."). The switch reflects `state.autoRemoveDefeated` from the room, not local state, and is disabled while a command is in flight. Per the user's standing rule for UI work, the implementer briefs the agent to use the `impeccable` and `design-taste-frontend` skills.

## Risks / Trade-offs

- [Player-owned tokens vanish, and a GM may not expect it] -> The hint says so, undo brings the token back, and the GM can turn the setting off.
- [A typo in an HP edit deletes a token] -> The edit is undoable (Decision 4) and the activity log shows it.
- [Undo of a defeat when a new token has taken the name] -> Refuse with a clear message rather than rename silently.
- [Owner resync loses the animation for the owner] -> Decision 5 and the open question; the owner is the player most likely to care.
- [Nuke kills many tokens at once] -> Animation cap and the existing particle budget; the removal itself is one batch.
- [Initiative order keeps a stale id] -> Same as manual deletion today; the combat UI must already tolerate it. If it does not, that is an existing bug and is flagged, not fixed here.
- [Schema change to `TokenDeleted` and `RoomState`] -> ADR 0049 and Real-Time Architecture owner review before the shared tasks merge.

## Migration Plan

No data migration. `autoRemoveDefeated` is absent in old snapshots and reads `true` (on); `reason` is optional on `TokenDeleted`, so old logs replay identically. Rollback: turn the setting off; the new event types stay in logs and are ignored harmlessly by older replay only if the code is kept, so the code is not removed after merge.

## Open Questions

- How to deliver the animation to a token's owner given the `resync` for owned-token deletions (Decision 5): event followed by resync, or reading the previous snapshot. Either way the specs and tasks stay the same; the Real-Time Architecture owner picks in the ADR review.
- Whether a defeat batch should also tidy `initiative.order`. This change follows existing deletion (no); a separate change can improve both.
