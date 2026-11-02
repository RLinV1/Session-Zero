## Context

See proposal.md - Why. Today `makeFogMaskCanvas` strokes each region twelve times at 22% opacity and fills it, then roughens the result with noise; `boardView` shows two `TilingSprite`s of the `makeFogCanvas` tile through that mask (an alpha-mask filter) and slides them on a 20 fps loop. The fog's colours come from `fogPalette`, which pushes the map colour's hue further from grey (`CHROMA_LIFT`).

## Goals / Non-Goals

**Goals:** fog that flows (changes shape over time), a smooth border about two cells wide that billows, puffs and wisps as a particle texture, greyish fog that blends into the map, no slower than today.

**Non-Goals:** fog in the GM's tint view, the map editor's fog preview (`FogCanvas.tsx`), anything on the wire, WebGPU.

## Decisions

1. **A signed distance field instead of stacked strokes.** Rasterise the regions with a scanline fill at about eight samples per cell (capped at 1024 on the long side), then take the exact Euclidean distance transform (Felzenszwalb-Huttenlocher) of the inside and the outside. The signed distance in cells is packed into one 8-bit channel of a small texture, rebuilt only when fog or the grid changes. Pure TypeScript, so it is unit tested without a browser. Rejected: keeping the stroke stack with more steps (still uneven, and its width is fixed when baked).
2. **One shader instead of a mask and two tiling sprites.** A quad covering the part of the board on screen (as `driftFog` crops today) runs a GLSL fragment shader that reads the fog bank at two scales, bends both lookups by a third, slower lookup that drifts the other way, and maps the result between the bank and mist colours. Its opacity comes from the distance field: 1 inside the region, fading to 0 two cells out through `fogEdgeAlpha`, whose noise term is zero at both ends of the fade so the inside stays opaque and nothing shows past two cells. `fogEdgeAlpha` is written once in TypeScript (tested) and mirrored in GLSL. This drops the alpha-mask filter, which allocated a texture the size of what it masked. GLSL only: the board never asks Pixi for WebGPU.
3. **Puffs and wisps as particles.** Twelve painted sprites (eight puffs, four wisps) are packed at load into one atlas, their brightness turned into opacity, so one `ParticleContainer` draws them all. Layout is deterministic from the region coordinates: puffs on a jittered two-cell grid inside each region, smaller puffs along every edge, and wisps every two cells or so along the edge pointing outward. Edges on the board's border get none, and every puff is sized so it stays on the board. No mask clips them: a Graphics stencil mask on the fog layer corrupted the GM's board (stretched triangles, the map drawn white) once the GM switched back from viewing as a player, where the masked layer is hidden. Each particle fades in and out on its own 9-18 s cycle and moves to a nearby seat while invisible, drifts with a shared wind, turns slowly, and grows a little as it fades (wisps stretch outward). Positions come only from the fog regions, which players already have, so the particles reveal nothing.
4. **Budget.** `QUALITY` gains a fog particle cap (high 1200, balanced 700, low 300). When the layout would exceed it, spacing widens and sizes grow a little, so coverage holds with fewer particles. The fog loop runs at the quality's frame rate (30 or 24 fps) and only while players can see fog, the page is visible and motion is allowed.
5. **Grey that blends.** `fogPalette` keeps 30% of the map colour's hue (instead of lifting it 1.5x), so the fog is grey with a hint of the map; banks stay a little darker than the map and mist a little lighter, so its brightness sits with the map. The default blue-grey for an unreadable map is unchanged.

## Risks / Trade-offs

- [Players see map pixels through the fade] -> the fade lies wholly outside the region, as before; inside the fog is opaque for any noise (unit tested). Map pixels are not protected anyway (ADR 0016).
- [Too many particles on a large, fully fogged map] -> the cap above, thinning with the zoomed-out view left to the shader.
- [Shader fails on an old GPU] -> plain GLSL that Pixi's preprocessors also turn into WebGL 1 code; checked only on WebGL 2 (see verification-log.md). There is no fallback beyond that.
- [Painted textures not loaded yet] -> the shader uses the procedural fog tile until the bank arrives; particles appear when the atlas is ready.

## Migration Plan

None. Client-only visuals; revert the commit to roll back.
