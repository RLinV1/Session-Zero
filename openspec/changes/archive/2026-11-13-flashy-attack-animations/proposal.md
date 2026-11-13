## Why

Attacks on the board play one plain animation for every token: a generic strike line, then a flash. A sword swing, an arrow and a fireball all look the same, and nothing in the product lets a GM make a big dramatic moment. Flashier, readable effects make the table feel alive, and a GM-only "nuke" gives the GM a showpiece that also applies real area damage.

## What Changes

- **Attack styles.** An attack roll may carry a style: `melee`, `ranged` or `magic`. The attack panel uses the named attack's saved animation when present, otherwise it infers the effect from distance (adjacent target is melee, farther is ranged). Manual Melee/Ranged/Magic controls are omitted. Each style remains supported for existing rolls and other clients. Hit, miss and damage endings keep their current behaviour.
- **Pixi effects layer.** The strike part of an attack is drawn by a new `board/fx.ts` module inside the PixiJS board, using `Graphics` and Pixi's built-in `ParticleContainer`, with `pixi-filters` (`AdvancedBloomFilter`) for glow. The DOM `EffectsOverlay` keeps condition effects and the hit, miss and damage-number endings.
- **GM nuke.** A new GM-only command `nuke.detonate` (amount, epicenter) damages every token that has HP. It emits one `TokenStatsSet` per token (each carrying the stats it replaced) plus a new `MapNuked` event. Every viewer's board then plays a full-map blast: expanding shockwave (`ShockwaveFilter`), bloom, flash, screen shake and a floating damage number on each token the viewer can see.
- **Animations are data.** Every look is one plain, serializable `AnimationDef` (shape, colours, duration, size, particles, glow, shake, flash). The built-in styles and the nuke are `AnimationDef`s in `effectPresets.ts`, and one renderer in `fx.ts` plays any of them.
- **Library animations.** The asset library gets an Animations tab. A GM can save, rename, duplicate and delete their own animations, and create or edit one in a form editor with a live Play preview that runs the same renderer on a small stage.
- **Using a library animation.** A GM attaches a library animation to a named attack (on a creature or a token). The definition is copied into the attack, so players see it without library access and later library edits do not change a room. A rolled named attack carries that animation to every viewer; the nuke control can pick a blast animation the same way.
- **Undo.** The nuke is one undoable action: undo restores every token's HP. Undo does not replay the visual.
- **Dependency.** Add `pixi-filters` to `apps/web`. No other new dependency.
- **Schema change** in `packages/shared` (`AnimationDef`, `AttackContext.style` and `animation`, `AttackPreset.animation`, `nuke.detonate`, `MapNuked`, `MapNukeUndone`) and a Postgres migration for `library_animations`: needs an ADR (0038) and Real-Time Architecture owner review.

## Capabilities

### New Capabilities

- `gm-nuke`: the GM-only whole-map blast, its damage, its visibility rules, undo and reduced-motion behaviour.
- `library-animations`: GM-owned animations in the asset library, the editor with live preview, and how an animation is attached to an attack or the nuke.

### Modified Capabilities

- `board-attack-effects`: the attack animation is no longer one built-in default; it depends on the attack's style.
- `attack-rolls`: adds the optional attack style and its picker, and lets a named attack carry a library animation.

## Impact

- `packages/shared`: `dice.ts` (`AttackStyle`, `AttackContext.style`), `commands.ts` (`nuke.detonate`, style on the attack roll command), `events.ts` (`MapNuked`, `MapNukeUndone`), `decide.ts`, `reducer.ts`, `undo.ts`, `visibility.ts`, `activityLog.ts`.
- `apps/server`: library store (memory and Postgres), `/api/library/animations` routes, a Prisma migration, and `decide` attaching a named attack's animation to the roll. Integration tests added.
- `apps/web`: `board/effectPresets.ts`, `board/effects.ts` (`attackEffectFor` returns the style; add nuke effect), new `board/fx.ts`, `board/boardView.ts`, `EffectsOverlay.tsx` (strike moves out), attack panel automatic effects, GM nuke control, Animations library tab with editor and preview, `package.json`.
- Docs: `docs/adr/0038-attack-styles-nuke-and-animations.md`.
- Risk: `pixi-filters` on the whole world container is costly on weak GPUs, so the filters run only while a nuke plays.
