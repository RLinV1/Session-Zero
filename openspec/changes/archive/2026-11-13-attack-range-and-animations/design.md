# Design

## Context

See proposal.md for why. Relevant current state:

- **Named attacks.** `AttackPreset` (`packages/shared/src/attackPresets.ts`) holds `name`, `toHit`, `damage`, optional `animation` and `maxTargets`. It is used on tokens, library creatures (a JSON column) and the AI builder's drafts. Named attacks reach only the GM and the token's owners (`visibility.ts`).
- **Rolls.** `decide` matches a roll's label to the actor's named attack (`namedAttackFor`) and copies its `animation` onto `AttackContext`. A client cannot supply one. `AttackContext` reaches every viewer of the roll.
- **Distances.** `measure()` (`apps/web/src/board/tools.ts`) defaults its diagonal rule to `"equal"`. Both `targetsByDistance` (`panels/attackRoll.ts`) and the board's attack line (`boardView.ts` `drawAttackLine`) call it without the room's rule, and both measure centre to centre. Token `size` is in squares (`> 0`, `≤ 10`, may be fractional).
- **Automatic animation.** `strikeAnimation()` (`board/effects.ts`) plays the slash within 1.5 squares, measured as a raw centre-to-centre distance, and otherwise hashes the roll id into one of six ranged shapes. That behaviour comes from `flashy-attack-animations`, which isn't archived yet; its `board-attack-effects` delta ("Varied automatic ranged attacks") is what this change replaces.
- **Animations.** `ANIMATION_SHAPES` (`packages/shared/src/animation.ts`) is a zod enum. `SHAPE_DEFAULTS`, `BUILTIN_ANIMATIONS`, the `animation.builtin.<shape>` catalog ids, `fxSoundRecipes`, the thumbnails and the reduced-motion fallback are all keyed by shape. `volley` (`fxStrikes.ts`) already draws one centred arrow when `count` is 1.
- **Preview.** `ui/AnimationPreviewStage.tsx` wraps `AnimationPreview` (360×200 Pixi stage) with a Play button. The library editor and the home page use it.

## Goals / Non-Goals

**Goals:**
- One measurement, `attackDistance`, used by the target list, the board line and the in-range check, so they always agree.
- Every viewer plays the same Automatic animation, without receiving private attack data.
- New shapes added the same way every existing shape was.

**Non-Goals:**
- Enforcing range on the server, or line of sight or cover.
- Game-specific reach exceptions (Pathfinder's 10 ft diagonal).
- Long or short range bands, and disadvantage.

## Decisions

### D1. `AttackPreset.range` is an optional discriminated union (ADR 0067)
```
range?: { kind: "melee"; reach?: number } | { kind: "ranged"; distance: number }
```
Absent means None. `reach` absent means one square. Numbers are `> 0`, `≤ 9999` and are stored as entered, never converted. Making it optional keeps every stored attack (token events, creature JSON, AI drafts) valid with no migration. The editor's "leave Reach at one square → store no reach" rule is client-side: the editor compares the field to its pre-filled value.
- *Alternative:* store cells. Rejected by the user: a range is the number the GM typed.
- *Alternative:* a single number with an adjacency rule for small values. Rejected because it left a 5 ft melee reading red diagonally under Euclidean.

### D2. The roll carries the range kind, set by `decide`
`AttackContext` gains `range?: "melee" | "ranged"`. In `decide`, alongside the animation copy, `named?.range?.kind` is copied onto it, and any client value is dropped. Players don't receive named attacks, so this is the only way their boards can play the same Automatic animation. It reveals only melee vs ranged, which the animation shows anyway, never the number. It goes through `filterEventForViewer` like `animation`; the visibility tests cover it.
- *Alternative:* set the existing `style` instead. Rejected because `style: "ranged"` plays the projectile, while Automatic ranged must play the arrow, and `style` keeps its meaning for older and other clients.

### D3. `attackDistance` and `isAdjacent` live in `packages/shared`
- `footprint(token, grid)`: the squares whose centres lie inside the token's square (side = `size` squares, centred on `position`). A token smaller than one square, or one whose square holds no cell centre, gets the single square containing its centre.
- `attackDistance(a, b, grid, rule)`: footprints are axis-aligned rectangles of squares, so the minimum over square pairs reduces to `dx`, `dy`: the column and row differences between the nearest squares of the two rectangles (0 on an axis where they overlap). That pair goes through the same diagonal formula as `measure` (equal: `max`; alternating: `max + floor(min/2)`; euclidean: `hypot`), times `unitsPerCell`. The cost is O(1) per pair.
- `isAdjacent(a, b, grid)`: the footprints overlap or touch at a side or corner, i.e. `dx ≤ 1 && dy ≤ 1`. It ignores the rule.
- `inRange(range, a, b, grid, rule)` implements the attack-range spec.

They live in shared because the web panel, the board and `strikeAnimation` all need the same answer, and shared has unit tests. The diagonal formula is moved out of `measure` into shared, and `measure` calls it, so the ruler and range can't drift apart.

### D4. Automatic animation: `strikeAnimation`
The order is: `attack.animation`, then `attack.style` (unchanged), then `attack.range` (`melee` → `SHAPE_DEFAULTS.slash`, `ranged` → `SHAPE_DEFAULTS.arrow`), then `isAdjacent` → slash, else arrow. `rangedAnimationFor`, `RANGED_ATTACK_SHAPES` and the 1.5-square rule are removed. Positions come from the viewer's copy of the room when the roll plays, as today.

### D5. New shapes `arrow` and `pierce` (ADR 0067)
Both join `ANIMATION_SHAPES`, `pierce` after `slash` and `arrow` after `projectile`, with the nuke still last; shapes are stored by name, so this is additive: stored definitions stay valid, and a client that is a version behind would refuse a roll carrying a new shape, but web and server deploy together.
- **arrow**: `ShapeSpec` reuses volley's `make` (`count` 1, `spread` 0) with its own default: greys `#9ca3af` / `#e5e7eb` / accent `#f8fafc`, `size` ≈ 1.8, `arc` ≈ 0.35, few particles, a light shake. It has its own sound recipe ("one longbow loosing, a thunk on impact") and the soft fallback `SOFT_HIT`.
- **pierce**: a new `make` in `fxStrikes.ts`: a narrow streak lunges from the attacker's rim through the target's centre to just past its far rim (ease-out), a cone of shard particles bursts out the far side, then a brief recoil and fade. It has steel colours (like the dagger), the `SOFT_BLADE` fallback, and the sound "a spear thrust punching through mail".
- Both get en and zh-TW `animation.builtin.*` names, thumbnails (generated from the shape list) and reduced-motion markers.

### D6. Attack editor: Range field and preview
- **Range** is a segmented control (None, Melee, Ranged) with a numeric field and a unit-label suffix. The unit context comes from the room when the editor is inside one, and from `GET /api/gm/settings` (`gm-room-defaults`) in the library. Until that change lands, the library falls back to `DEFAULT_GRID`'s 5 `ft`.
- **Preview** mounts `AnimationPreviewStage` lazily, the way `AttackStage` loads it, under the picker. Its `def` is the chosen animation, or for Automatic the slash or arrow based on the Range choice. It replays when `def` changes. On narrow layouts the stage scales to the container width, keeping its aspect ratio. Reduced motion follows the existing `effectiveReducedMotion`.
- **Labels**: `SearchablePicker` options drop `detail` for Automatic and built-ins. Library entries and the saved copy get `detail: t("attack.custom")`.

### D7. Target list: grouping in `targetsByDistance`
`targetsByDistance(state, attackerId, range?)` returns `{ inRange, outOfRange }`, each nearest first, using `attackDistance` with the room's rule. The single-target `Picker` gets a collapsible group section, which starts closed every time the list opens; the multi-target popover uses the same grouping. The red state is a class on the picker plus a visually hidden "Out of range" text. The board's targeting label switches to `attackDistance` too.

### D8. The board's targeting line knows the chosen attack's range
Pick on board already passes the attacker to the board, which goes React → `Board.tsx` → `BoardView`, with no Pixi objects in React. That call also passes the chosen named attack's `range`, or none when the custom builder is in use. `drawAttackLine` runs `inRange` for the hovered token and, when it's out, draws the line and label in the theme's danger colour with "· Out of range" appended to the label (`board.outOfRange`, read with `t()` as the board's other labels are; the decision is the pure `attackAim` in `board/attackAim.ts`). The colour is a token from the board palette, so it follows the light and dark themes. Changing the chosen attack while targeting updates the range on the board.

## Risks / Trade-offs

- [Builds on `flashy-attack-animations`, which isn't archived yet] → Archive it before this change. The `board-attack-effects` delta is written against its post-archive text, and "Varied automatic ranged attacks" only exists after it.
- [Shared schema changes: `AttackPreset.range`, `AttackContext.range` and two shapes] → ADR 0067, review by the Real-Time Architecture owner. All are optional or additive; tests replay old rolls and load old attacks.
- [Diagonal rule moves into shared] → `measure` keeps its signature. The existing ruler tests must pass unchanged.
- [Preview stage on small screens or without WebGL] → It scales to the container width. When the stage reports unavailable, a message is shown and saving still works (`AnimationPreviewStage` already reports `unavailable`).
- [Footprint for fractional sizes, e.g. 1.5] → "Squares whose centres lie inside", with a single-square fallback. Unit tests pin 0.5, 1, 1.5, 2 and 3.
- [Removing variety from Automatic ranged] → This is intended: an unconfigured bow plays the arrow. Variety stays available by attaching an animation.

## Migration Plan

No data migration: every new field is optional. Deploy web and server together. Rollback: older code ignores `range` on stored attacks and rolls (zod strips unknown keys on `AttackPreset`, which is an object schema). A stored animation using `arrow` or `pierce` would fail to parse on older code, so rollback after GMs have attached those needs a revert of those attacks, or must be rolled forward.
