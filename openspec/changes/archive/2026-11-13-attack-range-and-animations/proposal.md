# Proposal

## Why

A named attack doesn't say how far it reaches. The target list shows every token from nearest to farthest, so nothing tells the attacker a longbow can reach the goblin and a dagger can't. When an attack has no animation picked, the board plays a slash up close and a randomly chosen ranged effect otherwise, so an unconfigured bow might fire a fireball. GMs also pick an animation from a list of names with no way to see it first.

## What Changes

- **Range on a named attack.** An attack's range is one of:
  - **None**: no limit. This is today's behaviour and the default for existing attacks.
  - **Melee**, with an optional **reach**: the reach field is pre-filled with one square's worth of the room's (or, in the library, the GM's default) distance per square. Left at that value, it is stored as "one square" and means one square on any map.
  - **Ranged `x`**: a number of the room's units.
  
  Ranges are stored as entered and never converted. Changing a room's unit label or distance per square doesn't change any attack's number. The field shows the room's unit label, or the GM's default label in the library.
- **In range.** Distance is the shortest distance between any cell the attacker occupies and any cell the target occupies, measured with the room's Diagonals rule. This matches the board ruler, and it covers tokens that occupy more than one cell.
  - A **melee** attack reaches a target whose footprint touches the attacker's (sides or corners), whatever the reach and the diagonal rule, and also any target within its reach.
  - A **ranged** attack reaches a target within its distance. It has no adjacency exception.
  - Exceptions particular to one game, such as Pathfinder's 10 ft diagonal reach, are not modelled.
- **Target list and picker.**
  - For an attack with a range, the target list shows in-range targets first, nearest first. Out-of-range targets are in a group below that starts collapsed and can still be chosen.
  - When the chosen target is out of range, the target picker turns red. While picking on the board, the targeting line and its distance label turn red over an out-of-range token. The same applies to multi-target checkboxes, one target at a time.
  - **Attacks are never blocked by range:** the roll is allowed and the server still does not check range (unchanged from `attack-rolls`).
  - The target list's distances now use the room's Diagonals rule. They currently always count diagonals as equal cost, which disagrees with the board ruler.
- **Automatic animation.** With no animation chosen:
  - a **melee** attack plays the **slash**;
  - a **ranged** attack plays the new **arrow**;
  - an attack with no range, or a custom roll, plays the slash when attacker and target are adjacent and the arrow otherwise. This replaces the current random pick of a ranged shape by roll id. Every viewer still sees the same animation.
- **Two new built-in animations.**
  - **Arrow**: a single large grey arrow. A new `arrow` shape that reuses the volley's drawing code with one arrow, and has its own default settings and a single-arrow sound.
  - **Pierce**: a melee thrust. A new `pierce` shape: a narrow streak that lunges into the target with a burst of sparks out the far side, a short recoil, and a stab sound.
  
  Both are offered wherever built-in animations are: the attack editor, the library animation editor's shape list, thumbnails and the reduced-motion fallback.
- **Animation preview in the attack editor.** Under the Animation picker, a preview stage (the existing `AnimationPreviewStage`) plays the chosen animation when it is chosen, and has a Play button to replay it. "Automatic" previews what the attack's Range choice would play: the slash for melee, the arrow for ranged or none. The stage sends nothing to the room.
- **Animation picker labels.** Built-in animations and "Automatic" have no tag. Animations from the GM's library, and an attack's saved copy no longer in the library, are tagged "(custom)". The old untranslated "(preset)", "(yours)" and "(animation)" tags are removed, and the new tag goes through `t()`.

## Capabilities

### New Capabilities

- `attack-range`: an attack's range kinds, how distance and "in range" are measured, how the target list, picker and multi-target list show range, and that range never blocks a roll.

### Modified Capabilities

- `attack-rolls`: distances shown while targeting are measured between the tokens' nearest squares with the room's Diagonals rule, and the list groups by range; the attack editor gains the animation preview and the new picker labels.
- `library-animations`: the list of shapes an animation may have gains `arrow` and `pierce`.
- `board-attack-effects`: the Automatic animation follows the attack's range (melee: slash, ranged: arrow, otherwise by adjacency) instead of a random ranged shape, removing "Varied automatic ranged attacks"; built-ins gain the arrow and pierce animations.

## Impact

- `packages/shared`:
  - `AttackPreset.range` (`attackPresets.ts`), an optional union `{ kind: "melee", reach? } | { kind: "ranged", distance }`;
  - `"arrow"` and `"pierce"` in `ANIMATION_SHAPES` (`animation.ts`);
  - `AttackContext.range` (`dice.ts`): melee or ranged, copied by `decide` from the named attack so every viewer plays the same Automatic animation;
  - shared helpers `attackDistance` (footprint to footprint, using the diagonal rule) and `isAdjacent` (footprints touch).
  
  These change existing schemas, so they need an ADR (`docs/adr/0067-attack-range-and-shapes.md`) and review by the Real-Time Architecture owner. A range's number stays with the named attack (GM and owners only); a roll carries only whether it was melee or ranged.
- `apps/web`:
  - `panels/AttackPanel.tsx`: Range field, preview stage, picker labels, grouped and red target list;
  - `panels/attackRoll.ts` (`targetsByDistance`);
  - `board/effects.ts` (`strikeAnimation`);
  - `board/effectPresets.ts`: arrow and pierce defaults;
  - `board/fxStrikes.ts`: pierce drawing, arrow reusing volley's;
  - `board/fxSoundRecipes.ts`;
  - the board targeting line's distance label;
  - creature and AI-builder attack editors (`DiceField` callers);
  - en and zh-TW catalogs.
- `apps/server`: no rule changes; integration tests that a range saves with an attack and reaches only the GM and owners, and that an out-of-range roll is accepted.
- `apps/mcp`: the AI builder's draft attack schema accepts a range.
- Builds on `flashy-attack-animations` (archived 2026-11-13), which introduced named-attack animations and the `library-animations` capability.
- Related: `gm-room-defaults` supplies the GM's default distance per square and unit label that the library's Range field shows.
