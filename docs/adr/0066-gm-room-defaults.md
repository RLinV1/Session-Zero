# ADR 0066: A GM's defaults for new rooms

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0027` (game presets) · **Relates to:** `docs/adr/0055` (diagonals and difficult terrain), `docs/adr/0057` (table rules)
**Change:** `openspec/changes/gm-room-defaults`

## Context

A room's table rules (`defeatRemoval`, `hideMapWithoutToken`, `hideHp`, `hideAc`, `diagonalRule`, `difficultTerrain`) start absent and read as fixed defaults. Each one changes only through its own `room.set*` command. A new room's grid units come from its game preset: `createRoomWithSeat` appends a `GridSet` after `RoomCreated` when the preset's units differ from `DEFAULT_GRID`. A GM who always plays with the same rules has to set them again in every room.

## Decision

- **`RoomDefaults`** (`packages/shared/src/roomDefaults.ts`) holds the six rules and the grid's `unitsPerCell` and `unitLabel`. It reuses the rule enums and `GridSpec`'s limits. `BUILTIN_ROOM_DEFAULTS` are the values a room had before this ADR: `all`, the three switches off, `equal`, `entry`, 5 `ft`.
- **Stored per GM.** A nullable JSONB `room_defaults` column on `gm_identities`, where null means never saved. It is read and written only by the signed-in account, through `GET`/`PUT /api/gm/settings`, both scoped to `account.user.ownerId` and validated with `RoomDefaults`. A stored value that no longer parses reads as null.
- **`RoomCreated.defaults?: RoomDefaults`.** Room creation puts the creator's saved defaults on the room's first event. `reduce` copies the rules onto `RoomState` and the units onto `scene.grid`, so a room starts with them and no rule-change events appear in its log. When `defaults` is present, no preset `GridSet` is appended. A GM with no saved defaults gets a `RoomCreated` without the field, and exactly the events a room got before this ADR.
- **Precedence.** A GM's saved units replace the preset's for the new room and its encounter template's table. A personal choice wins over a game's generic default.
- **Temporary editing rooms** (ADR 0033) don't take the defaults. They edit an encounter template or a library map whose own units must survive being saved back.
- **Visibility.** Every field is public table state, so `RoomCreated` passes through `filterEventForViewer` unchanged, as before.

## Consequences

- `RoomCreated` gains an optional field. Old logs replay unchanged.
- Rolling back leaves the stored rules in rooms created in the meantime, because their `RoomCreated` holds them. Older code would drop the field when parsing and those rooms would read with the built-in rules. Roll forward instead.
- Changing defaults never touches an existing room.
