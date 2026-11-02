# Fog textures

Greyscale textures for the players' fog of war (FR-GM-17): eight puffs, `fog-puff-1` to
`fog-puff-8`, four wisps, `fog-wisp-1` to `fog-wisp-4`, and one repeating fog bank, `fog-bank`.
Grey on pure black, without alpha, like the effect textures in `../fx`: black is no fog and
brighter is denser, so the board can use a texture's brightness as its opacity and tint it with
the fog's own colours, which come from the map.

All four sheets were generated for this project with ChatGPT's built-in image generation on
2026-10-29, one after another in a single conversation so they share one look. They are generated
illustrations, not works attributed to a human artist. No other project artwork was reused for them.

Each sheet came back at 1254 px and was processed the same way: converted to greyscale, values up
to 10 of 255 set to exact black, cut into its separate shapes (the wisps by row,
since their frayed ends nearly touch), each shape given a margin whose border fades fully to black,
and resized to webp: puffs 384 px square, wisps 768 px wide. The fog bank was made seamless by
blending it with a copy of itself shifted by half its size, the shifted copy taking over towards
the borders, and resized to 512 px.

## Prompt set

Shared direction, given with the first sheet: "Every image in this set must share one look.
Shared direction for all of them: seen from directly above, on a pure black background, white and
light grey only (no colour), where black means no fog and brighter means denser fog; stylized
hand-painted game VFX with a light touch of realism; soft volumetric mist with gentle internal
shading and fine wispy detail; edges that feather out fully to black, no hard outlines; no text,
frame, grid lines or watermark; square image."

- Puffs, first sheet (`fog-puff-1` to `4`): a 2x2 sheet of four separate soft fog puffs, each one
  well inside its own quarter with black space all around it, each a different shape (one round,
  one oval, one lumpy with three lobes, one thin and patchy).
- Puffs, second sheet (`fog-puff-5` to `8`): keeping exactly the same style, brightness, softness
  and level of detail, four more: one wide flat bank, one small dense puff, one curling crescent,
  one loose cluster of small clumps.
- Wisps (`fog-wisp-1` to `4`): four long wisps of drifting mist stacked in four horizontal rows,
  each thick, soft and rounded at its left end, then thinning, curling slightly and fraying into
  fine strands that fade to nothing at its right end, in different lengths and curl shapes.
- Fog bank (`fog-bank`): a seamless tileable texture of a thick fog bank filling the entire
  square edge to edge, no black border and no single central shape, mostly mid to light grey mist
  with brighter dense swirls and a few darker thin patches, evenly spread so no area stands out.
