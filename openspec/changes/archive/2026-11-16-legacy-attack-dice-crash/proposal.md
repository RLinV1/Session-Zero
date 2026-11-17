# Proposal

## Why

A room can go permanently black for the GM. The page shows "Connecting…", then a black screen that takes no input; a reload doesn't help, and the browser's Back button no longer shows the library. It was found in Safari after "View as" on a player with no token, then "Back to GM view". Web Inspector traced it to `TypeError: undefined is not an object (evaluating 'e.terms.map')` in `formatExpression`. The value was `{ count: 1, sides: 20, modifier: … }`, a named attack's dice in the one-die shape used before mixed dice (ADR 0061).

ADR 0061 says old attack dice "keep loading with no migration" because the `AttackDice` schema upgrades them while parsing. Stored room history is never parsed, though: `PostgresRoomStore.loadEvents` only casts each payload's type (`r.payload as unknown as DomainEvent`), and so does the encounter template read. Old dice therefore reach `reduce`, then `RoomState.tokens[].attacks`, then the welcome snapshot, then the Attack section's `attackStats` / `presetSummary` / `attackExpression`, which throw. The room page has no error boundary, so React removes the whole app.

## What Changes

- **Old attack dice upgraded on load.** Room events and encounter templates read from storage have their named attacks' dice upgraded to the current `{ terms, modifier }` shape before anything uses them. Stored rows are never rewritten (events stay append-only). New events built from an old template are written in the current shape.
- **Attack formatters tolerate either shape.** The web helpers that read a token's named attacks (`presetsForToken`, `attackStats`, `presetSummary`, and the Attack form's roll paths) read dice through the existing `upgradeAttackDice`/`readPool` path. A token whose attack dice can't be read at all shows that attack as unavailable and doesn't crash.
- **Room page survives a render error.** A render error inside the room shows a short "Something went wrong" screen with Reload and Back to home, not a dead black page. The library and every other route keep working after browser Back.
- **ADR 0061 corrected.** An amendment records where the upgrade actually happens: on load, for events and encounter templates, as well as in the `AttackDice` schema.

Not in scope: why Firefox on the same room did not crash, which is probably a different default attacker in the Attack section. The fix removes the crash in every browser whatever the cause.

## Capabilities

### New Capabilities
- `room-error-recovery`: what the room page shows when part of it fails to render, and that navigation keeps working afterwards.

### Modified Capabilities
- `dice-pool`: "Named attacks hold mixed dice" gains the guarantee that attacks in stored room history and encounter templates load in the current shape, and that an unreadable attack never takes down the Attack section.

## Impact

- `packages/shared`: a pure helper that upgrades the named attacks inside a stored event or token (next to `upgradeAttackDice` in `attackPresets.ts`). No schema shape changes; `AttackDice` already accepts both shapes.
- `apps/server/src/store/postgresRoomStore.ts`: `loadEvents`, the first-event read (line ~466) and the encounter template read (`row.data`) pass payloads through the upgrade. `memoryRoomStore.ts` goes through the same function, so tests cover one path.
- `apps/web/src/panels/attackRoll.ts`, `AttackPanel.tsx`: dice read through `readPool`.
- `apps/web/src/pages/RoomPage.tsx` (or `main.tsx`): an error boundary with i18n text in the English and zh-TW catalogs.
- `docs/adr/0061-dice-pool-formulas.md`: amendment. Needs review by the Real-Time Architecture owner, since it changes how stored events are read.
- Tests: shared unit test for the upgrade, a server test that loads a pre-ADR-0061 `TokenCreated`/`TokenAttacksSet` and applies an old encounter template, and web tests for the Attack section with an old-shape attack and for the error screen.
