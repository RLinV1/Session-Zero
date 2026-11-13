# Design

## Context

See proposal.md for why. Relevant current state:

- **Table rules** are optional public fields on `RoomState`: `defeatRemoval`, `hideMapWithoutToken`, `hideHp`, `hideAc`, `diagonalRule`, `difficultTerrain`. Each is changed by its own `room.set*` command, and absent fields read through `defeatRemovalOf`, `diagonalRuleOf` and the like. The in-room Table tab is `TableSection` in `apps/web/src/ui/SettingsMenu.tsx`.
- **Room creation** (`apps/server/src/domain/roomLifecycle.ts`, `createRoomWithSeat`) appends one batch of system events: `RoomCreated { name, preset }`, then a `GridSet` when the game preset's grid units differ from `DEFAULT_GRID`, then `ParticipantJoined`, then `EncounterApplied` or `MapSet`. Encounter tables and prepared scenes get the preset's units through `withPresetGrid` and `{ ...room.scene.grid, ...preset.grid }`.
- **Accounts.** `POST /api/rooms` requires a signed-in account (`requireAccount`). The account's `ownerId` is a `GmIdentity` row, which already holds per-GM data (library, dice looks, animations, shipped-map seeding).
- **Library map editor.** `LibraryMapEditor.tsx` falls back to `DEFAULT_GRID` when an asset has no saved grid. In a room, a new map's grid draft starts from the room's current grid (`toGridDraft(state.scene.grid)` in `RoomPage.tsx`).

## Goals / Non-Goals

**Goals:**
- One validated `RoomDefaults` shape, used by the route, the store and room creation.
- A new room has its starting rules and grid units from its first event.
- Room settings reuse the in-room Table tab's controls, so the two cannot drift apart.

**Non-Goals:**
- Defaults for anything that isn't a Table tab rule or grid units, such as game preset, reduced effects, cell size, grid line style or fog.
- Changing existing rooms, or a "apply to all my rooms" action.
- Defaults for guests without an account. Room creation already requires one.

## Decisions

### D1. `RoomCreated` carries the starting rules and grid units (ADR 0066)
`RoomCreated` gains an optional `defaults` object holding the six rules plus `unitsPerCell` and `unitLabel`. `reduce` copies the rules onto `RoomState` and the units onto `scene.grid`. When `defaults` carries units, room creation no longer emits the separate preset `GridSet`.
- *Alternative:* append the existing `room.set*` events and a `GridSet` after `RoomCreated`. These go in the same `appendSystem` batch, so they would still be atomic, but they leave up to seven "changed …" lines at the top of every new room's activity log, and the user chose a clean log. A single event is also easier to replay and to filter.
- *Compatibility:* the field is optional. Old `RoomCreated` events reduce exactly as before, and an old room keeps its stored `GridSet`. All fields are public table state, so `filterEventForViewer` passes them unchanged; the visibility tests confirm this.

### D2. Saved grid units replace the preset's
The new room's grid units are: the GM's saved defaults if any, otherwise the preset's `grid` (today's behaviour). The same goes for the units applied to an encounter template's table and a prepared scene's grid. Only Free Mode exists today, at 5 `ft`, so the two never disagree yet. Temporary encounter- and map-editing rooms (ADR 0033) don't take the defaults: they edit a template or library map whose own units must survive being saved back, so they start as before. A GM who has saved a scale has made a personal choice, which should win over a game's generic default.

### D3. Storage: one JSON column on `gm_identities`
A nullable `room_defaults` JSONB column on `GmIdentity`, added by a Prisma migration, with matching memory-store support. Values are parsed with `RoomDefaults` on read; an unparseable stored value reads as never saved (null), so the built-ins apply. Null means never saved.
- *Alternative:* a separate table. That's not worth a join for one small object per GM.
- *Alternative:* browser storage. Rejected because the defaults should follow the account, and the library they apply to is already on the server.

### D4. Route: `GET`/`PUT /api/gm/settings`
Both use `requireAccount`, and both operate on `account.user.ownerId`, so a GM can only ever address their own row. `GET` returns the saved defaults merged over the built-ins. `PUT` takes a full `RoomDefaults`, validated with zod, and returns the stored value. A `400` leaves the stored value unchanged. Server text goes through catalog ids (ADR 0054).
- `RoomDefaults` lives in `packages/shared` (protocol) and reuses the existing enums (`DefeatRemoval`, `DiagonalRule`, `DifficultTerrainMode`) and `GridSpec`'s limits for `unitsPerCell` (> 0) and `unitLabel` (1–12 characters). `BUILTIN_ROOM_DEFAULTS` is exported next to it.

### D5. UI: share the Table tab's controls
Pull the controls out of `TableSection` into a component that takes a `value` and an `onChange`. In a room it sends the `room.set*` command for each change, as today. On the dashboard it edits a local draft, saved with Save. Room settings opens as a dialog from an icon-only gear in the header's right-hand row of settings-type controls (before the account, language and theme), with the Your rooms and Library tabs moved beside the brand on the left. The "Distance per square" field shows the current Unit label after the number, updating as the label is typed. Text goes through `t()` (en and zh-TW, terms from `docs/GLOSSARY-zh-TW.md`).

### D6. The library map editor reads the defaults
`LibraryMapEditor` takes the GM's defaults (fetched once by the library page) and uses `{ ...DEFAULT_GRID, unitsPerCell, unitLabel }` wherever it now falls back to `DEFAULT_GRID`. A map with a saved grid is unaffected. No change is needed in rooms: new maps already start from the room's grid, which D1 seeds.

## Risks / Trade-offs

- [Shared event schema change] → ADR 0066 and review by the Real-Time Architecture owner. The field is optional and additive, and tests replay an old `RoomCreated` log.
- [Defaults fetch fails at room creation] → The server reads them in the same request as room creation. A store error fails the creation the same way other store errors do today. An unparseable stored value falls back to the built-ins (D3) rather than blocking room creation.
- [A GM expects existing rooms to change] → Room settings says the settings apply to rooms created from now on.
- [Preset grid precedence (D2) once more presets exist] → Revisit if a future preset needs a fixed scale. Room settings could then show that the preset overrides it.

## Migration Plan

1. Prisma migration adding the nullable `room_defaults` column. No backfill is needed, since null means built-ins.
2. Deploy server and web together, as usual. `RoomCreated` is appended before anyone joins, so clients first see a new room through a snapshot that was reduced on the server, and a client that is a version behind still gets the right rules.
3. Rollback: the column can stay. Reverting the code makes rooms start with built-ins again. Rooms created in between keep their starting rules, because those rules are stored in their events.
