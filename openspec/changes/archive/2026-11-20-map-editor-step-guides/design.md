## Context

`GuideTour` spotlights `[data-tour=...]` targets from `guideSteps(role)` and skips steps whose target has no box.

## Decisions

1. **Reuse `GuideTour`.** It gains an optional `steps` prop (stable reference) used instead of `guideSteps(role)`, and `GuideStep` gains an optional `selector` used instead of the `data-tour` lookup. The app guide is unchanged.
2. **Escape.** The tour now handles Escape in the capture phase and stops it, so the editor dialog around it does not also close.
3. **Placement.** `EditorGuide` renders an icon button overlaid on the map (`HudLayout` and the Map step stage host it, anchored by `--hud-width` zoom controls shift left of it) and portals the tour into the editor `<dialog>`, since a modal dialog makes everything outside it inert.
4. **Targets.** One list per step in `mapEditorGuides.ts`, selectors scoped to `.map-editor`, using existing aria-labels and classes; `data-guide` only where none existed (Map step buttons, Fog whole map).
5. **Skipping.** Free from `GuideTour`: a control not rendered (no fogged regions, no detection in the library editor) drops out; a tour with nothing on screen closes.
