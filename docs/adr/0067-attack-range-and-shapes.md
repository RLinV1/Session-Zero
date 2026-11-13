# ADR 0067: Attack range, the range kind on rolls, and the arrow and pierce shapes

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0038-attack-styles-nuke-and-animations.md`, `docs/adr/0055` (diagonals) · **Relates to:** `docs/adr/0010` (attack rolls and hidden tokens), `docs/adr/0061` (named attack dice)
**Change:** `openspec/changes/attack-range-and-animations`

## Context

A named attack (`AttackPreset`) holds a name, dice and an optional animation, but no reach. The attack panel lists every target nearest first and measures centre to centre with "equal" diagonals, while the board ruler uses the room's Diagonals rule. With no animation chosen, the board plays a slash within 1.5 squares and otherwise a ranged shape picked by hashing the roll id. Other players never receive a token's named attacks (`visibility.ts`), so their boards can't see anything about the attack except what the roll carries.

## Decision

- **`AttackPreset.range?`** is `{ kind: "melee"; reach?: number } | { kind: "ranged"; distance: number }`, with numbers `> 0` and `≤ 9999`. Absent means no limit. Melee with no reach means one square on whatever map. The number is stored as typed and never converted when a room's distance per square or unit label changes. It is part of the named attack, so it reaches only the GM and the token's owners.
- **`AttackContext.range?: "melee" | "ranged"`.** `decide` copies the kind, never the number, from the actor's matched named attack, next to the animation copy, and ignores any client value. Every viewer of the roll receives it, so every board plays the same Automatic animation. It reveals what the animation shows anyway.
- **Measurement in shared.** `footprintSquares`, `attackDistance`, `isAdjacent` and `inRange` live in `packages/shared/src/attackRange.ts`. Distance runs between the nearest occupied squares of the two tokens, using the room's diagonal rule. The diagonal step formula moves to shared (`diagonalSteps`), and the board ruler's `measure` uses it too, so the ruler, the target list and the in-range check always agree. Range never changes what the server accepts.
- **Automatic animation**: the roll's animation, else its style, else `range` (melee: slash, ranged: arrow), else slash when the footprints touch and arrow otherwise. The roll-id hash is removed.
- **Shapes.** `"pierce"` (after `slash`) and `"arrow"` (after `projectile`) join `ANIMATION_SHAPES`; the nuke stays last. Definitions are stored by shape name, so the order only sets how lists show them.

## Consequences

- Every new field is optional, so old attacks, creatures, AI drafts and rolls parse unchanged and old rolls play the new Automatic animation.
- Rolling back is safe for `range` (zod strips unknown keys). A stored animation using `arrow` or `pierce` would no longer parse on older code, so roll forward once GMs have used them.
- The target list's distances change for rooms using Alternating or Euclidean diagonals, and for tokens larger than one square, to match the ruler.
