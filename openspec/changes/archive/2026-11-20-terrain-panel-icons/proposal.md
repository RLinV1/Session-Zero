## Why

The terrain panel is text-heavy: long intro, keyboard help, three full-width paint buttons and a separate "new effect" form. A compact icon toolbar and a painting-app layers list is easier to scan (FR-TAC-03).

## What Changes

- Tools and paint types become icon buttons (tooltip + aria-label carry the full names).
- The Layer select becomes a layers list (temporary effects on top, Base terrain pinned at the bottom); a "+" in its header reveals an inline name input (Enter creates via `terrain.effect.create`, Esc cancels, disabled at 32).
- Intro and keyboard text move into a "Guide" popover opened from an icon button in the panel header.
- Web only: no shared schema, command, or server change. Layers have no visibility state, so no eye toggle.

## Impact

- `apps/web/src/pages/mapEditor/TerrainSetup.tsx`, `apps/web/src/styles.css`, `apps/web/test/terrain.test.tsx`, `browser/terrain.spec.ts`.
