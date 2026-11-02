## Why

The map editor has five steps with many controls each. A GM opening it for the first time has no quick way to learn what each one does. The app already has a guided tour for the room; the editor should have one per step.

## What Changes

- A compact Guide icon button overlaid on the top-right of the map area (flush in the corner, zoom controls to its left) starts a short tour of the current step: each control is highlighted in turn with a one- or two-sentence card, with Next, Back and Done, and Escape to close.
- Applies to every step of the room editor (Map, Grid, Walls, Fog, Sight) and to the library map editor's steps.
- Controls not on screen in the current state are skipped.
- The existing app guide component accepts an explicit step list and a CSS selector per step.

Non-goals: remembering that a tour was seen, auto-starting it, tours outside the editor.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `map-editor`: a Guide button per step.

## Impact

`apps/web` only: `ui/guide.ts`, `ui/GuideTour.tsx`, new `pages/mapEditor/EditorGuide.tsx` and `mapEditorGuides.ts`, `data-guide` hooks in `GmPanel.tsx` and `FogControls.tsx`, a small style. No shared, server or schema changes.
