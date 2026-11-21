## Why

Walls and fog drawn in the map editor reach the room at once: players watch fog appear rectangle by rectangle while the GM sets up, and there is no way to try something and back out. The GM asked for the editor to work like a document: edit freely, then save or discard.

## What Changes

- **Drafts.** Opening Edit map copies the room's walls and fog into a private draft. The Walls and Fog steps edit the draft only; nothing reaches the room until Save.
- **Save and Discard.** The editor header shows when there are unsaved changes and offers **Save changes** and **Discard**. Closing with unsaved changes asks: Save, Discard, or Keep editing.
- **Saving uses existing commands.** Save compares the draft with the room and sends the difference: `fog.add` for new fog first, then wall removals and additions, then `fog.remove` (hide before reveal, so players never glimpse a room mid-save). Wall commands are batched within their limits, and `wall.clear` is used when every wall goes.
- **Detected walls join the draft.** Applying a detection loads its walls into the draft, where the GM can erase or add to them before saving. The GM's browser fetches them with a new GM-only `GET /api/rooms/:roomId/wall-detection/walls?map=`.
- **Fog whole map and Reveal** in the Fog step edit the draft too.

## Non-goals

- No new commands or events. A save is several commands, so it is several activity-log entries and undo steps.
- The Map and Grid steps keep their existing draft (KAN-59) and its Discard prompt.
- No autosave, and no draft that survives a page reload.

## Capabilities

### Modified Capabilities
- `map-editor`: walls and fog are edited as a draft and saved together.

## Impact

- `packages/shared`: `DetectedWallsResponse` in `wallDetection.ts`, a new response schema (ADR 0029 amendment).
- `apps/server`: the GM-only detected-walls route, with an integration test.
- `apps/web`: a draft model and save planner in `pages/mapEditor/`; `WallSetup`, `FogSetup`, `FogCanvas` and `FogControls` read and write the draft; `GmPanel` owns the draft, the header actions and the close prompt; unit tests for the save planner and editor tests for the prompt.
