## Why

The Lantern Court demo shows 2.5D (isometric) lighting, but a GM cannot say which maps are 2.5D. The Sight step of the map editor is where lighting is set up, so the choice belongs there.

## What Changes

- The Sight step gains a "Map style" choice: Flat (default) or 2.5D isometric.
- It follows the editor's draft model: private until Save changes, dropped by Discard.
- The flag is stored on the room's scene and defaults to flat, so existing rooms, maps and events are unchanged.

Non-goals: true 3D (README: out of scope); an in-room 2.5D board renderer (future work: only the flag is stored now); a library-map default (like line of sight, the library editor has no Sight step).

## Capabilities

### Modified Capabilities
- `map-editor`: Sight step has a Map style choice.

## Impact

- `packages/shared`: `Scene.isometric?: boolean`, command `scene.setIsometric`, event `IsometricSet { from, to }` with undo and activity log. ADR 0048. Needs Real-Time Architecture review.
- `apps/web`: draft field, `planDraftSave`, Sight step control.
