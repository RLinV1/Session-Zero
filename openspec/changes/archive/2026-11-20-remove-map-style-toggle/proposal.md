## Why

The Sight step offers a "Map style" control (Flat or 2.5D isometric). The flag is saved and synced (ADR 0048), but board rendering for 2.5D does not exist yet and nothing reads it, so the control changes nothing visible.

## What Changes

- Remove the "Map style" radio group from the map editor's Sight step until board rendering for 2.5D exists.
- Keep `Scene.isometric`, `scene.setIsometric`, the `IsometricSet` event, the reducer, undo and activity-log support, and the draft plumbing (`mapDraft`, `draftConnection`, `libraryBoardDraft`) unchanged. Event logs are append-only and old rooms may already contain `IsometricSet`; drafts and saved scenes keep their stored value.
- Remove the web test that clicked the control. Draft-logic tests of the flag stay.
- The separate "Explore isometric lighting" demo page is untouched.

This supersedes the UI part of `openspec/changes/map-2-5d-lighting-toggle`; that change's files are not edited.

## Impact

- **`apps/web`:** `pages/mapEditor/SightSetup.tsx`, `test/sightStep.test.tsx`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
