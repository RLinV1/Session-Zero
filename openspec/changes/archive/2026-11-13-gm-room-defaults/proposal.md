# Proposal

## Why

Every new room starts with the same fixed table rules and a 5 ft square. A GM who always plays with, say, Euclidean diagonals, hidden HP and 1.5 m squares has to set the same seven things by hand in every room and on every new map. A GM should set their usual table once and have each new room and map start that way.

## What Changes

- **Room settings on the GM dashboard.** A new "Room settings" menu on `/gm-dashboard` holds the GM's defaults for new rooms. It offers every control the in-room Settings > Table tab offers, with the same labels and choices:
  - "Remove tokens at 0 HP" (All, Only NPC tokens, Off);
  - "Hide map from players without a token", "Hide HP from Players", "Hide AC from Players" (switches);
  - "Diagonals" (Equal cost, Alternating (1, 2), Euclidean);
  - "Difficult terrain applies" (On entry, On exit, Both);
  
  and two grid settings, shown as separate fields:
  - "Distance per square: `x` units": a positive number, shown followed by the unit label;
  - "Unit label: `___`", such as `ft` or `m`.
  
  A GM who never opens it gets today's defaults (All, switches off, Equal cost, On entry, 5 ft).
- **Saved per GM on the server.** The defaults belong to the GM's identity, not the browser, so they follow a signed-in GM to any device. They are read and written through a new authenticated `/api/gm/settings` route and validated with a zod schema from `packages/shared`.
- **New rooms start with them.** Creating a room, including from an encounter template, starts it with the GM's defaults. `RoomCreated` gains optional starting rules and starting grid units, so the room's first event already has them, and the activity log shows no list of rule changes. The GM's saved grid units take the place of the game preset's in a new room. Older `RoomCreated` events without the fields read as today's defaults.
- **New maps fill in from them.** When the GM sets up the grid of a library map that has none yet, "Units per square" and the unit label start from the defaults. Inside a room, a new map's grid step already starts from the room's own grid, and that grid now starts from the defaults. A map that already has a grid keeps its own.
- **Existing rooms are unaffected.** Changing a default never changes a room that already exists. Each room's own Table tab is still where its rules change.

## Capabilities

### New Capabilities

- `gm-room-defaults`: the GM's saved defaults for new rooms: what they hold, where they are kept, who may read and change them, and how a new room and a new map take them up.

### Modified Capabilities

- `gm-dashboard`: the dashboard gains the Room settings menu.
- `table-rules`: a new room's rules start from the creating GM's defaults instead of fixed values. The "Defaults in a new room" scenario changes; older rooms still read as today.
- `asset-library`: a library map with no saved grid starts grid setup with the GM's default units per square and unit label instead of the fixed default.

## Impact

- `packages/shared`: a `RoomDefaults` zod schema (protocol); optional starting rules and grid units on `RoomCreated` (`events.ts`) and the matching `reduce` case. This changes an existing event schema, so it needs an ADR (`docs/adr/0066-gm-room-defaults.md`) and review by the Real-Time Architecture owner.
- `apps/server`: a Prisma migration adding the defaults to `gm_identities`; memory and Postgres store methods; `GET`/`PUT /api/gm/settings`; room creation (`domain/roomLifecycle.ts`, called from `http/routes.ts`) reads the GM's defaults into `RoomCreated`. Integration tests: defaults round-trip, another GM cannot read or change them, a new room starts with them, an encounter-template room starts with them.
- `apps/web`: the Room settings menu on `GmDashboardPage.tsx`, reusing the Table tab's controls from `SettingsMenu.tsx`; the library map editor's grid fallback (`LibraryMapEditor.tsx`) reads the defaults; en and zh-TW catalog entries.
- No visibility change: the table rules were already public room state.
- Related: `attack-range-and-animations` shows the room's unit label next to attack ranges. The two changes can land in either order.
