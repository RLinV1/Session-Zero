## Context

Terrain is `{ base, effects[] }` (ADR 0046). Live edits use `terrain.effect.*` and `terrain.paint`. `MapDraft.terrain` holds only base runs, and `TerrainSetup` hides layer UI unless `live`. Library storage stays base-only.

## Decisions

1. **Draft holds full `Terrain`.** `MapDraft.terrain` becomes `Terrain` (base + effects). `applyToDraft` handles `terrain.paint` on any layer and `terrain.effect.create/rename/remove` (added to `DRAFT_COMMANDS`). Draft effect ids use the existing `draft:` prefix from `newId`.
2. **Client-chosen effect ids.** `decide` mints effect ids, so a save batch could not paint a layer it just created. Add optional `effectId` (`Id`) to `terrain.effect.create`; `decide` uses it when no current effect has that id, else `ctx.newId()`. `planDraftSave` sends a fresh id per new layer, never the `draft:` id. Rejected: a bulk `terrain.setEffects` command (larger schema surface); acting on the live room directly (stale draft terrain revision breaks Save).
3. **`planDraftSave` diffs per layer.** Match draft effects to room effects by id. Emit create (with `effectId`), rename, remove, then per-layer paint diffs (existing cell diff, parameterised by layerId). Revision increments continue across all terrain commands.
4. **Library editor unchanged in storage.** `libraryBoardDraft.ts` reads and writes `terrain.base` only. `TerrainSetup` gets a prop for layer support (true for the live modal and room draft, false for the library editor); the library editor shows a short note.
5. **UI.** One `TerrainSetup`; layer controls gate on that prop instead of `live`. The "available in a live room" note is replaced by the library-only note.

## Risks / Trade-offs

- Small shared amendment (`effectId`): needs an ADR in `docs/adr/` and Real-Time Architecture review (CLAUDE.md).
- Draft `terrainContext` revision must advance across effect commands and paints in one batch.
- Visibility: effects stay GM-only canonical state; no filter change expected.
