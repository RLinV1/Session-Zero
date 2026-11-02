## 1. Edge and colour

- [x] 1.1 Add unit tests in `apps/web/test` for the signed distance field (exact distances to a rectangle's sides and corners, union of overlapping regions, cells as the unit) and for `fogEdgeAlpha` (opaque inside for any noise, zero past two cells, monotonic, no step), and verify they fail first
- [x] 1.2 Add `fogDistanceField` and `fogEdgeAlpha` to `board/fogTexture.ts` in place of `makeFogMaskCanvas` and `fogMaskAlpha`; verify the tests pass
- [x] 1.3 Change `fogPalette` to keep a hint of the map's hue (greyish fog); update its tests first

## 2. Particles

- [x] 2.1 Add unit tests for the puff layout (deterministic, puffs inside or within the border band, wisps pointing out, none on the board's border, within the budget) and motion (fades to nothing at each reseat, stays within its band), and verify they fail first
- [x] 2.2 Add `board/fogPuffs.ts`; verify the tests pass
- [x] 2.3 Add `board/fogArt.ts` to load the fog bank and pack the puffs and wisps into one atlas

## 3. Board

- [x] 3.1 Add `board/fogShader.ts` and draw the players' fog with it and a `ParticleContainer` in `boardView.ts`, in place of the mask and tiling sprites
- [x] 3.2 Add the fog particle cap to `QUALITY` and run the fog loop at the quality's frame rate
- [x] 3.3 (GM tint view not opened in the browser; see verification-log.md) Verify in the browser as a player (or GM viewing as a player) on a real map: the fog flows, the border fades over about two cells, inside is opaque, no console errors, the GM's tint view is unchanged, and reduced motion holds still

## 4. Done

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass
