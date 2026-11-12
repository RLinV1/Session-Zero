# Design

## Context

See proposal.md for the motivation and specs/ for the behavior. The current state that shapes the approach:

- `RoomMenu` (`apps/web/src/ui/RoomMenu.tsx`) owns the Settings dialog: it keeps `settingsOpen` and renders `<SettingsMenu>` next to its popover, and returns focus to the "More" button on close. `RoomPage` renders `RoomMenu` in `topbar-end` when `features.tableChrome` is set, and already has `compact` (`useCompactLayout`) to fold Share into "More" on phones.
- `clientSettings.ts` stores one object under `vtt.ui.settings` and validates it whole with `isClientSettings`. `readStored` returns the defaults when validation fails, so any missing field (as every existing browser will have once a field is added) resets every setting.
- Arrow-key movement is a separate `usePersistentState("vtt.ui.arrowKeyMove", true)` in `Board.tsx:251`, with its switch rendered by `TokenCard` only while a movable token is selected.
- Attack effects come from one pure function, `attackEffectFor(event, after, viewer)` in `board/effects.ts`. `Board.tsx` calls it for live committed events (then waits for dice before a strike) and for replay frames. Hit and miss effects carry only the target's id.
- A player's `initiative` is filtered: hidden tokens are removed from `order`, and when the active token is hidden `activeIndex` points past the end (`initiativeForPlayer`).

## Goals / Non-Goals

**Goals:**
- One Settings dialog instance per room page, opened by either the gear (desktop) or the "More" item (phone).
- Settings reads that tolerate missing and invalid fields, field by field.
- A single, pure, unit-tested decision for whether an attack effect plays under the viewer's choice.

**Non-Goals:**
- No server, shared-schema or event changes; the setting never leaves the browser.
- No change to dice throws, area-effect save dice, condition effects, or reduced-motion rendering.
- No new Guide tour step for the gear.

## Decisions

**1. The room page owns the Settings dialog; `RoomMenu` only asks to open it.**
`RoomMenu` gets an optional `onSettings` callback and lists Settings only when it is given (phones). `RoomPage` holds `settingsOpen`, renders a gear `tool-button` before `RoomMenu` when `!compact`, renders `<SettingsMenu room=...>` once, and remembers which control opened it so `onAfterClose` focuses that control.
*Alternative:* a self-contained `SettingsButton` with its own dialog, plus another inside `RoomMenu`. Rejected: two dialog instances whose `room` props can drift, and the phone path would still be tied to `RoomMenu`.

**2. Settings are read field by field over the defaults.**
`getClientSettings` parses the stored value and builds the result from `DEFAULT_CLIENT_SETTINGS`, taking each stored field only when that field alone is valid. `isClientSettings` stays as the whole-object guard in `setClientSettings`, so the app itself can never write a bad object. The `storage` event path uses the same reader.
*Alternative:* a version number with migrations. Rejected as heavier than needed: every change so far only adds fields, and per-field fallback also covers hand-edited or corrupt storage.

**3. New fields: `arrowKeyMove: boolean` (default `true`) and `attackAnimations: "all" | "turn" | "none"` (default `"all"`).**
On the first read where the stored settings have no valid `arrowKeyMove`, a valid boolean under `vtt.ui.arrowKeyMove` is used instead. The merged settings are written back and the old key is removed, so the carry-over happens once. `Board` reads `useClientSettings().arrowKeyMove`; `TokenCard` loses its `arrowKeys` prop and switch.

**4. The animation choice is a pure filter applied after `attackEffectFor`.**
A new `effectToPlay(effect, mode, state)` in `board/effects.ts` returns what of the effect should play, or null:
- `"all"`, or the `defeat` kind: the effect unchanged.
- `"none"`: null for every other kind (`strike`, `nuke`, `hit`, `miss`, `damage`, `damages`).
- `"turn"`: the effect unchanged when `state.initiative` is null. Otherwise the active id is `order[activeIndex]` (undefined when it is hidden from the viewer). `strike`, `hit` and `miss` play only when their attacker is the active id. `nuke` plays whole when the active id is undefined or its token has no owners; on a player's turn it becomes a `damages` effect carrying the same per-token numbers without the blast, since the spec keeps damage numbers on "Current turn". `damage` and `damages` always play.
It returns an effect rather than a yes/no so a nuke can keep its numbers and lose its blast.
`Board` calls it in the live committed handler before `focusStrike` and before queuing a strike for its dice, and in the replay path, with the same `after` state `attackEffectFor` used. The mode is read with `getClientSettings()` at that moment, so no re-render is needed and no listener is added.
*Alternative:* filter inside `attackEffectFor`. Rejected: that function is the visibility rule (FR-GM-23), and mixing a preference into it would blur what its tests guard.

**5. Hit and miss effects carry their attacker.**
`attackEffectFor` already resolves the roll for `RollRuled` (via `targetOf`). It will also set `fromId` on `hit`/`miss` from the roll's `attack.actor`, when that side is visible to the viewer. Without the attacker, "Current turn" cannot tell whose ruling it is. A ruling whose attacker is unknown to the viewer would have played no strike anyway, and under "Current turn" it plays nothing.

**6. The decision is made when the event arrives.**
The turn is checked against the state when the strike, ruling or damage is committed, not when the dice land. A ruling made after the turn has moved on is checked against the new turn, so it does not play under "Current turn". That matches "the token whose turn it is" at the moment the effect would appear.

## Risks / Trade-offs

- [A GM rules a hit late, after advancing the turn, and a "Current turn" viewer misses the hit effect] → Accepted. The roll and its verdict are still in the sidebar, and damage numbers still play.
- [Removing `vtt.ui.arrowKeyMove` breaks an older tab still open on the same browser] → That tab falls back to its own default until reloaded. This is minor and temporary.
- [The gear adds width to a crowded desktop top bar] → It is icon-only, and on phone widths it is not shown at all.
- [Per-field reading hides a broken write] → `setClientSettings` keeps validating the whole object, and `clientSettings.test.tsx` covers both paths.

## Migration Plan

This is client-only and needs no deployment step. The first load after release merges the stored settings over the defaults, carries over `vtt.ui.arrowKeyMove`, and writes the result. Rolling back leaves an object with extra fields, and the older `isClientSettings` still accepts it because it does not reject unknown keys. The only casualty is the arrow-key choice, which falls back to on.
