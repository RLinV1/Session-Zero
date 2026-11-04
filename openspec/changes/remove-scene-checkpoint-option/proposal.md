## Why

Creating a scene should start from the current map, an encounter template, or a map. Offering "restore a checkpoint" there mixes recovery with scene setup (FR-GM-25, ADR 0045).

## What Changes

- The "Prepare scene" modal no longer shows a Checkpoint choice or checkpoint list.
- Backend `scene.prepare` + `checkpoint.restore` behaviour is unchanged; only the UI entry point is removed.
- ADR 0045 and the browser scene spec are updated to match.

## Impact

- `apps/web/src/panels/SceneSetupModal.tsx`, `apps/web/test/sceneSetupModal.test.tsx`, `browser/scenes.spec.ts`, `docs/adr/0045-persistent-room-scenes.md`.
