## Why

Opening a room's map editor and going to the Terrain step gives no way to add extra terrain layers: **Add layer** is shown only in the live terrain modal. A GM editing a room's map cannot create layers (ice, rubble) there.

## What Changes

- The room map-editor draft carries extra terrain layers. The Terrain step shows Add / Rename / Remove layer and per-layer painting, capped at 32.
- Saving the draft creates, renames, removes and paints layers in the same atomic `scene.savePreparation` batch.
- `terrain.effect.create` accepts an optional client-chosen `effectId` so one save batch can paint the layer it just created (small amendment to a shared schema: ADR needed).
- The library map editor stays base-only, and library boards and drafts still store base terrain only (ADR 0046 unchanged for storage). The Terrain step there keeps a short note that layers are for room maps.

## Capabilities

### New Capabilities

### Modified Capabilities
- `map-editor`: the room map editor's Terrain step supports extra layers.

## Impact

- `packages/shared`: `commands.ts`, `decide.ts` (create with `effectId`), new ADR in `docs/adr/`.
- `apps/web`: `TerrainSetup.tsx`, `mapDraft.ts`, `draftConnection.ts`, `libraryBoardDraft.ts` (uses `terrain.base`), `GmPanel.tsx`, `LibraryMapEditor.tsx`.
- No server, DB or library schema change.
