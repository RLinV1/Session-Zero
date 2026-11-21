## Why

The tabletop is built around Dungeons & Dragons: D&D 5e conditions, HP/AC, to-hit and damage rolls with GM rulings, and a 5 ft grid. A group playing another game, or no particular system, gets all of that whether they want it or not. Jira KAN-63 asks for a game preset chosen when the room is set up, starting with Free Mode (Dungeons & Dragons deferred, 2026-10-09), built so that more games can be added later without redesigning the flow.

## What Changes

- A **preset registry** in the shared package: each preset is one definition with an id, display name, short description, and its default configuration (which rules features are on, the condition list, default grid units). The create-room form and the server read the registry; neither names a preset in code.
- **Free Mode only, for now** (decided 2026-10-09): one preset, `free`, with every current tool on and a 5 ft grid, so rooms behave exactly as today. Game presets such as Dungeons & Dragons are added later as registry entries.
- The **Create room** form shows a game choice only once the registry holds more than one preset.
- The preset is **saved with the room**: recorded in `RoomCreated`, held in `RoomState.preset`, and restored on every reload and reconnect. Rooms created before this change are Free Mode.
- The active preset is **shown** in the room's top bar next to the room name and on each room card in the GM dashboard.
- The **server enforces** a preset's features: a future preset that turns off attacks, conditions or AC gets those commands rejected; the UI hides the controls as a hint only. Free Mode turns nothing off.
- A short **developer guide** `docs/GAME_PRESETS.md` explains how to add a preset.
- Out of scope: switching the preset of an existing room, presets for other games, per-preset character sheets.

## Capabilities

### New Capabilities
- `game-presets`: recording a preset at room creation, Free Mode as the only initial preset, persistence and display of the active preset, server enforcement, and extensibility.

### Modified Capabilities

## Impact

- `packages/shared`: new `gamePresets.ts` (registry, `GamePresetId`, `presetOf`), `RoomCreated.preset` (optional), `RoomState.preset` (default `free`), `CreateRoomRequest.preset` (optional), `decide` checks; tests `packages/shared/test/gamePresets.test.ts`.
- `apps/server/src/http/routes.ts`: create-room passes the preset into `RoomCreated` and the room's grid defaults; GM room list includes it. Integration test for persistence across reload and Free Mode rejections.
- `apps/web`: create-room form preset choice (`GmDashboardPage.tsx`), preset badge in `RoomPage` top bar and dashboard cards, panels hide attack/rulings/conditions/AC in Free Mode.
- New ADR `docs/adr/0027-game-presets.md` (changes `RoomCreated` and `RoomState`), and `docs/GAME_PRESETS.md`.
