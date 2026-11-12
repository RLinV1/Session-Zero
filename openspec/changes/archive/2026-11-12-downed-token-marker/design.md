# Design

## Context

See proposal.md for why.

- Token art (body disc plus clipped image) sits in `TokenView.art`. Condition looks are applied there by `drawConditionLook`, using `artStyleFor(conditions, reducedMotion)` from `effects.ts`. Unconscious sets `greyscale: true`, which the board renders as `ColorMatrixFilter.greyscale(0.6)`.
- `drawToken` redraws only when its key changes; the key already includes `token.stats`, so an HP change triggers a redraw.
- A player's state has `stats.hp === null` for tokens they don't own when the room hides HP (`statsForViewer`, ADR 0057). The GM's "view as player" uses the filtered state, so it shows what the player would see.
- An auto-removed token keeps its sprite for the fall animation, which sets its own grey (`boardView.ts`, "A defeated token (ADR 0049) falls before it leaves").

## Goals / Non-Goals

**Goals:** a visual marker computed from state the viewer already holds, reusing the condition-look path.

**Non-Goals:** a public "downed" flag (option B: schema change, reveals hidden HP); changes to auto-remove, the roster, the token card or screen-reader text; making downed a condition.

## Decisions

### 1. Downed is derived, not stored
`isDowned(token) = token.stats.hp !== null && token.stats.hp <= 0`, a pure helper in `packages/shared/src/geometry.ts`, shared with `token-no-stacking` (downed tokens don't occupy squares) so both changes use one definition. It's derived from the viewer's own state, which gives the hidden-HP rule automatically (option A). No event or filter changes.
*Alternative:* a server-derived public flag. Rejected because it reveals what Hide HP is meant to conceal, and it needs an ADR.

### 2. Greyscale strength becomes a number
`ArtStyle.greyscale: boolean` becomes `grey: number` (0 = none, 0.6 = Unconscious, 0.75 = downed). `artStyleFor(conditions, reducedMotion, downed = false)` takes the maximum, so downed overrides Unconscious and other effects still combine as before. `drawConditionLook` applies `greyscale(style.grey)` when `grey > 0`. This keeps one filter per token and one place that decides the look.

### 3. The X is drawn in the token's decoration
`drawDecor` (or a sibling called from `drawToken`) draws two crossing strokes, about 45% of the radius, centered, red with a dark outline so they read on any art, above the art and below the condition badges and label. Strokes scale with the radius, like the other decorations. The X isn't added to the `art` container, so the Prone tilt and squash don't distort it.

### 4. The fall animation wins
While a token is in the defeat fall (`defeated` map), its existing animation look is left alone. The sprite is removed afterwards, so the X never needs to animate.

## Risks / Trade-offs

- **[Players can't see enemies go down when HP is hidden]** → Intended (option A). The GM can still apply Unconscious, which players see.
- **[Changing `ArtStyle.greyscale` touches existing tests]** → It's a web-only type. Update `apps/web/test` tests that build `ArtStyle`.
