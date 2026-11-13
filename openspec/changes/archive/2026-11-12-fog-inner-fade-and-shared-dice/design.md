# Design

## Context

- **Fog.** The players' mist is a shader quad (`fogShader.ts`) that reads a signed distance field (`fogDistanceField` in `fogTexture.ts`, positive inside a region). `edgeAlpha` / `fogEdgeAlpha` (kept identical in GLSL and TS) is opaque for `d >= 0` and fades over `-FOG_FEATHER_CELLS < d < 0`, with `FOG_FEATHER_CELLS = 2`, a smoothstep, and a noise "billow" term. `fogPuffs.ts` places puffs over the body and wisps along the edges pointing *out*, reaching up to `0.97 * FOG_FEATHER_CELLS` past the border.
- **Darkness.** `sightMask.ts` paints a small canvas: dark everywhere, sight polygons cleared, then a blurred stroke clipped *inside* each polygon (`SIGHT_BAND_CELLS = 0.35`), skipping edges on the map border.
- **Rolls.** `RoomPage.tsx` `onRolled` picks an aim as `drops.take(roll) ?? (mine ? board.centreAim() : null)`. A null aim lands the roll at once. Attack rolls send no dice drop, and ADR 0014 chose "everyone else shows only the result card". `diceThrow.ts` already has `centreThrow`, `throwStart`, `clampToMap`, `crowdedOffset` and a hand-throw reach of `MAX_CELLS = 3`.

## Goals / Non-Goals

**Goals:**
- A fog fade narrow enough that the dragged area is the hidden area, still not a ruled line.
- A darkness edge with no fade that stays clean at any zoom and with any number of owned tokens.
- Attack throw aims computed purely from each viewer's filtered state, with no new message.

**Non-Goals:**
- No change to the GM's own fog look (tint and outline), the fog distance field's resolution, or which tokens are withheld.
- No new ephemeral payload. No change to the dice-drop pairing, the result card, or the roll-control hold.
- No identical landing spot across boards for Roll-button rolls.

## Decisions

### 1. The fog fade narrows to `FOG_FEATHER_CELLS = 0.25`, still outside the border
`fogEdgeAlpha(d, n)` stays opaque for `d >= 0` and fades out over `-0.25 < d < 0`, with the same billow noise and smoothstep; the shader mirrors it and discards past `-FEATHER`. Fog therefore hides everything inside the region up to its border, and the mist past it is about 17 px on a 70 px grid.

The billow moves the half-opaque line between about 0.3 and 0.7 of the way across the band, so a straight border wavers by about 0.1 cells. The shader's edge noise is sampled every 1.5 cells, not 4, so the waver repeats every cell or two.
- *History:* the fade was first moved inside the region (1 cell, then 0.3, then 0.15). Inside, it showed some of the hidden map, so it went back outside, and 0.25 cells was settled on after trying 0.15.

### 2. Puffs and wisps stay inside
Wisps point *inward* from edges, and every puff and wisp keeps its rim a little inside the region (`BORDER_GAP`). Only the fog's own narrow fade reaches revealed map.

### 3. Darkness is drawn as merged vector shapes
`darknessShapes` takes the map rectangle minus every sight polygon in one `polygon-clipping` difference, which merges overlapping sight from several owned tokens, and the board draws the result as Pixi `Graphics`: each dark area filled, with lit islands cut out. With the renderer's antialiasing, the edge is crisp and smooth at any zoom, with no fade on either side. The crossfade between old and new darkness is unchanged.

- **Robustness.** Sight corners are rounded to whole map pixels before merging: at full float precision the clipper's sweep failed on nearly collinear edges (seen with 10 tokens on The Broken Span); rounding moves the edge by under a pixel. Identical sight (tokens on one square) is merged once.
- **Cost.** Measured on The Broken Span (largest map, about 600 walls): 3 tokens 0.8 ms, 10 tokens about 2 ms. Crowds of 30–50 tokens with heavy overlap made the merge slow (up to 150 ms), so past `MAX_MERGED_SIGHT_CORNERS` (800 corners) the board draws the canvas mask instead (`makeSightMaskCanvas`: dark fill, sight polygons cleared), which handles any overlap at a flat cost. Under the cap, the worst merge measured was about 15 ms. The same canvas fallback covers the clipper ever throwing.
- *Alternatives:* a higher-resolution canvas (more memory, still steps when zoomed in); a 1–2 px screen-space feather (a fade, which was ruled out); lit shapes on an erasing layer without merging (blend-mode trickery, and a stencil mask once corrupted the GM's board).
- *History:* a fade on the dark side, built from a distance field, first shipped at one cell and then at 0.3 cells with a wobble. Both showed too much of the map out of sight and were removed.

### 4. Throw aim order: drop → attack → centre, for every viewer
`RoomPage` computes `aim = drops.take(roll) ?? attackAim(roll, state, scene) ?? board.centreAim()`, with no `mine` check.

`attackAim` is a new pure helper in `diceThrow.ts`:
- It takes `roll.attack.actor` and `roll.attack.target`. Both must be non-null; the viewer filter blanks a concealed side (`hideAttackSides`). Both tokens must be present in the viewer's state.
- Landing point: one cell short of the target along the line from the attacker. If the tokens are closer than two cells, the landing point is the midpoint. It is clamped to the map.
- Start point: back along the line toward the attacker, at most the hand-throw reach (3 cells) from the landing point, and never past the attacker.

The existing seed (roll id plus the two points) makes the path identical on every board that sees both tokens.
- *Alternative: the roller sends a `diceDrop` for attacks.* That needs no new client logic for other viewers, but the sender must avoid sending a hidden target's position: a GM's attack on a hidden token would leak it. Rejected.
- *Alternative: land on the target itself.* That collides with the strike effect (`board-attack-effects`) and hides the token. Rejected.

### 5. A missed drop falls back to the centre
Because the fallback no longer depends on `mine`, a viewer who missed a drop gets a centre throw. This is the `shared-roll-throws` behaviour, not a separate change.

### 6. ADR 0014 gets an amendment note
Its race (one shared "roll in the air" slot) is gone: rolls are tracked per id in `airborne`/`onBoard`. Only a short "Amended by `fog-inner-fade-and-shared-dice`" note and the replaced bullet are needed. Commands, events, state and filters are untouched, so no new ADR is needed.

## Risks / Trade-offs

- **[Mist a quarter cell over revealed map]** → Accepted by the user; nothing inside the fog shows.
- **[Merge cost or a clipper failure on unusual sight]** → Capped at 800 corners and wrapped in a fallback to the canvas mask (Decision 3); tests cover 3–50 owned tokens, clustered and spread, on every shipped map.
- **[New dependency]** → `polygon-clipping` 0.15.7 (MIT), last released 2023. It is used in one pure function, so it can be swapped for another clipper without touching the board.
- **[A busy table throws many dice at once]** → Several attacks in a row now throw on everyone's board. `crowdedOffset` already spreads concurrent throws, and dice fade after a few seconds. Other people's dice never hold your controls.
- **[`board-dice-throw` is unarchived]** → Archive `throw-dice-on-board` before or with this change so the main specs read in order.
