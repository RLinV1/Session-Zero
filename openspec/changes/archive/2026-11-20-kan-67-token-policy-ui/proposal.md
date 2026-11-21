## Why

PR #86 (KAN-66) adds `tokenPolicy` to `scene.setMap` and adjusts tokens when a map is replaced, but the GM has no way to choose a policy and no feedback that tokens moved (KAN-67). The command always uses its default, `scale`.

## What Changes

- The map Apply step (the "Prepare map" sheet, used for uploads and library maps) shows a radio choice, "Scale to fit", "Keep positions" or "Recenter", only when a map is already set and tokens exist. "Scale to fit" is selected first. The choice is sent as `tokenPolicy` on the same command.
- After Apply, the GM sees "N tokens adjusted" with an Undo button, using the committed `MapSet`'s `tokenChanges` for the count. Nothing shows when no token moved.
- A radio style rule next to the existing checkbox rule.
- No change to `packages/shared`, the server or any contract. Depends on PR #86.

## Capabilities

### New Capabilities
- `map-token-policy-ui`: the GM's choice, the confirmation and the Undo affordance on a map replacement.

### Modified Capabilities

## Impact

- `apps/web/src/pages/GmPanel.tsx`, `apps/web/src/pages/mapPrep.ts`, `apps/web/src/styles.css`, `apps/web/test/mapTokenPolicy.test.ts`.
- Stacked on `feat/kan-66-map-token-adjustment` (PR #86). It should be rebased onto `main` once #86 merges.
