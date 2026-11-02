## Why

The players' fog slides instead of flowing. It is one baked cloud tile repeated in two layers that move in straight lines, so the clouds never change shape and read as scrolling wallpaper. Its border is baked once into a mask from stacked strokes: the fade is uneven, drops from about a fifth to nothing at exactly one cell out (a faint ring), and never moves. The user asked for fog that flows, with a softer, wider edge and a particle texture, in a grey that still blends into the map.

## What Changes

- The fog's body is drawn by one shader from a painted, seamless fog-bank texture whose swirls are bent by a second, slower layer of the same texture, so the clouds curl and fold instead of sliding.
- The border fades from the region's edge to nothing over about two grid cells, evenly, from a distance field of the regions; slow noise lets the fade billow in and out. Inside a region the fog stays fully opaque.
- Painted fog puffs and wisps (`public/img/fog`, generated for this project) drift, turn and fade in and out over the fog as particles: puffs over the body and along the border, wisps reaching out from the border.
- The fog is mostly grey, keeping only a hint of the map's hue, at about the map's own brightness, so it blends into the map instead of tinting it.
- Reduced motion freezes the fog in one frame. The GM's flat tint and outline are unchanged.
- No command, event, state or visibility change. Everything is drawn on each client from the fog regions and map image it already has.

## Capabilities

### Modified Capabilities
- `fog-of-war`: fog flows and fades over about two cells; fog is greyish and blends into the map.

## Impact

- `apps/web`: `board/fogTexture.ts` (distance field, edge fade, palette), new `board/fogPuffs.ts` (particle layout and motion), new `board/fogArt.ts` (loading the fog textures), new `board/fogShader.ts`, `board/boardView.ts` (fog layer), `ui/clientSettings.ts` (particle budget per quality).
- Assets: `apps/web/public/img/fog` with its `CREDITS.md`.
- Tests: `apps/web/test` for the distance field, edge fade, palette and particle layout and motion.
- No change to `packages/shared`, `apps/server`, or any ADR.
