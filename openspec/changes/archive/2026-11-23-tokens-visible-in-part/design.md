# Design

## Context

See proposal.md for why. Current state:

- **One predicate decides token visibility.** `concealedFrom(c, token, viewer)` in `packages/shared/src/visibility.ts` tests `token.position` against fog (`isInFog`) and sight (`inSight`). Every path that sends tokens uses it:
  - snapshots (`filterStateForViewer`, and the turn order through `initiativeForPlayer`, which keeps only tokens the viewer was sent)
  - the `TokenCreated` / `TokenDeleted` / `TokenMoved` / `TokenOwnersSet` event filters
  - `decide`'s `not_found` answers
  - the ephemeral relay in `apps/server/src/domain/liveRoom.ts`, which also tests a drag preview at its new point
- **Fog blanks sides for good.** `fogConcealsSide(state, token)` asks whether a token is unowned with its centre in fog. Three places use it:
  - `decide` writes `hidden` onto attack-roll and group-roll sides.
  - `reduce`'s `concealFoggedSides` blanks existing rolls and area-effect targets after `FogAdded`, `MapSet`, `TokenMoved` and `TokenOwnersSet`.
- **ADR 0059 already did this for areas.** `areaVisibleTo(c, area, grid)` samples an `AreaGeometry` (circle: 16 rim points, the centre, and a half-cell interior grid capped at 4096 points), skips points off the map, and returns at the first point outside fog and inside sight.
- **The board draws tokens as discs.** The radius is `size × cellSize / 2 − 2`, repeated in `boardView.ts` for token views and remote drag ghosts.
  - For players, fog is layered **below** tokens (`layerFog(false)`), on the assumption that "players never have what is under fog". This change breaks that assumption.
  - The sight darkness layer is above tokens.
  - A visible-region mask texture (`makeVisibleRegionCanvas`: sight, or the whole board, minus fog) already clips other people's areas (`clippedAreas`) and aim previews (`clippedAims`).
  - Remote drag ghosts are drawn straight into `fxLayer`, unclipped.

## Goals / Non-Goals

**Goals:**
- One definition of a token's visible shape, shared by the server filters and the board.
- Token visibility, side blanking and the turn order all follow the same disc rule, so a token a player can see is never also an "Unknown" side.
- A partly visible token never shows its hidden part on a player's board, including its drag ghost.

**Non-Goals:**
- Exact circle and polygon intersection.
- Changing the square footprint used by movement and attack rules.
- Precomputing or caching per-token visibility across events.

## Decisions

### 1. `tokenDisc(token, grid)` in shared code
This is a pure function in `packages/shared/src/areas.ts`, next to `templateArea`. It returns `{ kind: "circle", center: token.position, radius: max(0, size × cellSize / 2 − 2) }`. The board's token views, hit-testing radius and drag ghosts use it in place of their inline formula.
- **Why:** the server rule is based on how the board draws tokens. If the two had separate formulas, a later change to the board's radius would quietly break visibility.
- **Alternative:** the square footprint (`footprintSquares`). Rejected because its corners are empty space on the board. A diagonal fog edge across a corner would send a token the player can't see at all.
- **Detection uses a slightly smaller disc.** `tokenDetectionDisc(token, grid)` shrinks the radius by a further `cellSize / 16`, and the filters sample that disc; the board draws the full one. A grid-snapped token whose square touches a grid-aligned fog edge from inside has detection rim points about 6 px into the fog (2 px plus 4.4 px on 70 px cells). That is well beyond `inFogRegion`'s 1 px edge allowance, so fog drawn a few pixels short of a grid line doesn't give the token away. The inset scales with the cell so the margin is the same at any map resolution.

### 2. `concealedFrom` uses `areaVisibleTo` on the disc
The order of checks is: GM → false, hidden → true, owner → false, then `!areaVisibleTo(c, tokenDisc(token, c.grid), c.grid)`. When `c.grid` is absent, it falls back to the current centre test (as `templateConcealedFrom` does).

Fast path: if the centre is on the map, outside fog and in sight, return visible before building samples. That is the common case for tokens in the open, so the extra cost lands only on tokens near fog or sight edges.
- **Alternative:** a dedicated circle–polygon intersection. Rejected for the same reason ADR 0059 gave: exactness isn't worth a geometry library, and a sliver narrower than the sample spacing is an accepted miss.

### 3. `fogConcealsSide` uses the disc against fog only
A token is fog-concealed when it is unowned and no sampled point of its detection disc on the map lies outside every fog region. Sight stays out of it, as today, because sight is per viewer and these blanks are permanent and shared.

This needs the grid, so the signature widens to `Pick<RoomState, "fog" | "scene">`. All callers (`decide`, `reduce`) already have the full state.
- **Alternative:** keep the centre here, so replay is unchanged. The user rejected this at the table: a player could target a goblin they can see while its roll reads "Unknown".

### 4. Replaying old logs under the new `reduce`
`concealFoggedSides` runs in `reduce`, so replaying an existing room's log uses the new rule:
- A side that was blanked only because the token's centre was in fog, while part of its disc was outside, is no longer blanked in rebuilt state.
- Sides written as `hidden` inside recorded `DiceRolled` events (computed in `decide`) do not change.

This is not a leak: such a token is now visible to players by this same rule. It does mean that a room rebuilt after deploy can show a name where players' screens once showed "Unknown". Rooms load by replaying their log, so every reader sees the same result, with no mix of stale and new states. The ADR records this, and it needs the Real-Time Architecture owner's review.
- **Alternative:** version the rule by event seq (centre before a cutover seq, disc after). Rejected: it adds a permanent branch to a pure function for a cosmetic difference in old rolls.

### 5. Move-before-rename ordering in `token.update`
`intoFog` becomes "after the move, the disc is wholly fog-concealed, and before it, it wasn't", using the same disc-against-fog test as `fogConcealsSide`. That way a rename never reaches players in the event that also hides the token.

### 6. Board: a masked container for tokens the viewer doesn't own
`tokenLayer` gets two children:
- `ownTokens`, unmasked
- `otherTokens`, masked by a third sprite of the existing visible-region texture

The texture is built in `createRegionMasks` alongside `areaMask` and `aimMask`. A token's view moves between the two containers when its owners change. For the GM (outside view-as-player) nothing is masked, and every token goes in `otherTokens` with no mask. Remote drag ghosts of tokens the viewer doesn't own are drawn inside `clippedAims` (or a sibling masked container), not straight into `fxLayer`.
- **Why a container mask, not fog over tokens:** raising fog over all tokens for players would cover their own tokens in fog, which the "Owners keep their tokens" requirement forbids.
- **Why not a mask per token:** a mask per token costs a render pass each. A shared mask costs one.
- **Trade-off:** tokens can no longer interleave their stacking order across the two groups. A player's own tokens always draw above tokens they don't own. Bring-to-front (`tokenLayer.addChild` at line ~3480) works within the token's own group.

### 7. Documentation
A new ADR, `docs/adr/0082-tokens-visible-in-part.md` (next free number when written):
- It amends ADR 0016's "Amended by" line, and adds a note to ADR 0059's Consequences that tokens now follow the same rule.
- It records the same trade-off as ADR 0059: the whole token is sent, including a hidden centre.
- It records the replay consequence from Decision 4.

No schema, command, event or protocol shape changes, so the CLAUDE.md "changes to existing schemas" rule doesn't apply. Review is still requested because this changes what players see and what `reduce` produces.

## Risks / Trade-offs

- **[Sloppy fog reveals slivers]** Fog drawn more than about 6 px (2 px plus a sixteenth of a cell) short of a grid line reveals a sliver of an adjacent snapped token. → Accepted, and recorded in the ADR. Snapping fog to the grid can follow as its own change.
- **[Whole token sent, including a hidden centre]** Developer tools can read the exact position of a partly visible token. → Accepted, as for areas. Most of the token's position is visible anyway.
- **[Filter cost]** About 20 samples per token near an edge, times sight-polygon tests, per viewer per snapshot. → The centre-first fast path, the early exit, and `npm run test:bench --workspace=@vtt/server` before and after.
- **[Stacking order changes]** Own tokens always draw above others. → Acceptable for players, and the GM view is unchanged. Note it in the PR.
- **[Tiny tokens]** A size so small that the radius clamps to 0 gives a single centre sample, which is the old behaviour. → Clamp the radius at 0.
- **[A token sees only fog while others see it]** A token whose centre is on a fog edge sees only fog, but other players can see it. → Intended, and written into the line-of-sight delta.

## Migration Plan

No data migration. Deploy server and web together. After deploy, each room's rebuilt state follows the new rule (Decision 4). Rollback is a redeploy of the previous build: old-rule replay restores the old blanks, and since nothing new was persisted, no cleanup is needed.
