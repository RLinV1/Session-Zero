## Context

`attackEffectFor` (`board/effects.ts`) already maps live events to a small `AttackEffect` per viewer under the FR-GM-23 visibility rules. `EffectsOverlay.tsx` draws it as DOM (framer-motion, tsparticles) above the Pixi canvas. HP damage today is `roll.applyDamage` → `TokenStatsSet` + `RollDamageApplied`. Batches containing `TokenStatsSet` are undoable only if they also contain `RollDamageApplied` (`undo.ts: canUndo`). The attack roll has no notion of weapon style.

## Goals / Non-Goals

**Goals:** distinct, flashy melee / ranged / magic strikes; a GM-only map-wide nuke with real damage; animations as plain data a GM can create, preview and keep in the library; all within the event pipeline and visibility rules.

**Non-Goals:** a timeline or keyframe editor, user-uploaded sprites or video, sound, sharing animations between GMs.

## Decisions

1. **Add `pixi-filters`, nothing else.** It supplies `ShockwaveFilter` and is compatible with Pixi v8. Glow is a blurred additive copy of the effect (Pixi `BlurFilter` on a `Graphics` sharing the same context); `AdvancedBloomFilter` was dropped because it left a faint grey box over its bounds. Slashes, projectiles and bursts use `Graphics` and Pixi's built-in `ParticleContainer` (documented as experimental, so the particle code sits behind one small helper in `fx.ts`). Rejected: `@pixi/particle-emitter` (v8 support unverified), more tsparticles presets (not suited to a board-wide blast), GSAP (the Pixi ticker and existing framer-motion cover tweening).

2. **New `board/fx.ts` inside the Pixi board.** Filters apply to Pixi display objects, not DOM, so strikes and the nuke must live in Pixi. `BoardView` owns it, which also honours "Pixi code stays in `board/`". The DOM overlay keeps conditions, hit/miss and damage numbers. Tradeoff: the strike moves from DOM to Pixi, and its tests move with it.

3. **One `AnimationDef`, one renderer.** `AnimationDef` (zod, in `packages/shared`, because the server validates it) is flat and bounded: `shape` (`slash`, `claw`, `projectile`, `fireball`, `meteor`, `bolt`, `beam`, `nuke`), `duration` (0.2–4 s), `colors` (primary, secondary as hex), `size` (0.5–3), `particles` (0–120), and `glow`, `shake`, `flash` (each 0–1). `effectPresets.ts` exports the built-ins as `AnimationDef`s (`ATTACK_STYLE_PRESETS: Record<AttackStyle, AnimationDef>`, `NUKE_PRESET`). `fx.ts` is the only interpreter, so the editor needs no engine change and the preview is the real thing.

4. **Style is an optional field on `AttackContext`.** `style: AttackStyle.optional()` is backward compatible with stored events. The roll command's attack field gains the same optional field. When absent, `attackEffectFor` infers melee or ranged from distance in grid cells (≤ 1.5 is melee). Rejected: guessing from the attack label (fragile), a per-creature attack preset field (wider change, not requested).

5. **Nuke is a command, not an ephemeral relay.** `nuke.detonate { amount, origin }` → `decide` (GM only; `presetRefusal` for attacks) → one `TokenStatsSet` per damaged token + `MapNuked { amount, origin }`. HP is computed in `decide` from current HP and floored at `MIN_HP`. Invariants 1–3, 5, 6 hold: `reduce` treats `MapNuked` as a log-only event, and each `TokenStatsSet` carries `previous`. Two nukes are two separate actions by design.

6. **`MapNuked` names no token.** Like `RollDamageApplied`, it can then pass through `filterEventForViewer` unchanged. Hidden tokens' `TokenStatsSet` are already withheld from players by the existing filter. The client builds damage numbers from the viewer's own token copies by comparing HP before and after the batch, so a hidden token never gets a number.

7. **Undo.** Add `MapNuked` to `REVERSIBLE_EVENT_TYPES` with inverse `MapNukeUndone` (new, carries the same amount and origin). Extend `canUndo` so a batch with `TokenStatsSet` is also undoable when it contains `MapNuked`. The existing stale-value conflict check covers a later HP edit. The client plays no effect for `MapNukeUndone`.

8. **Performance.** Filters are attached to the board's world container only while a blast plays (about 1.5 s) and removed on finish. Concurrent attack effects stay capped by `MAX_ATTACK_EFFECTS`; one blast at a time. Particle counts come from the preset and are clamped by a constant.

9. **Reduced motion** reuses `prefersReducedMotion` / `watchReducedMotion` from `effects.ts`: static markers for strikes, a static tint plus numbers for the nuke.

## Library animations

10. **Stored like other library entities.** New `library_animations` table (id, owner_gm_id, name, def JSONB, created_at) with a Prisma migration, `LibraryStore` methods in the memory and Postgres stores, and GM-only routes `GET/POST /api/library/animations`, `PATCH/DELETE /api/library/animations/:id`, scoped by owner (another GM's id answers 404, as for creatures). The server parses `def` with `AnimationDef` on every write. A cap of 100 animations per GM.
11. **Copy, not reference.** Players have no library access, so a library animation is copied into the attack: `AttackPreset.animation?: AnimationDef`. This matches how a creature's attacks are copied into a token and keeps "later library edits do not change the room". Rejected: a room-level animation table (more state and commands for no gain).
12. **Server attaches it; the client cannot forge it.** In `decide` for `dice.roll`, when the actor token has a named attack matching the label, its `animation` is copied into `AttackContext.animation`. The client sends no animation on an attack roll. The nuke is GM-only, so `nuke.detonate` may carry an `animation` (shape must be `nuke`), copied into `MapNuked`.
13. **Editor and preview.** A form editor (no timeline) on the library Animations tab edits one `AnimationDef`: shape, two colours, duration, size, particles, glow, shake, flash. A Play button runs `fx.ts` on a small preview stage (`board/animationPreview.ts` owns the Pixi app; the React component only mounts it) with a stand-in attacker and target. The preview honours reduced motion like the board. Built-ins can be duplicated into the library as a starting point.
14. **Precedence.** The animation shown for an attack is the roll's `animation` if set, else the built-in for its `style`, else the style inferred from distance.

## Risks / Trade-offs

- Whole-map filters can drop frames on weak GPUs → short duration, removed immediately, no looping.
- `ParticleContainer` is experimental in Pixi → isolated in one helper; fall back to plain `Sprite`s if it breaks.
- Moving the strike from DOM to Pixi changes the existing `board-effects-react-overlay` seam → keep `attackEffectFor` and `attackPlan` as the pure contract and port only the drawing.
- The nuke is one click and powerful → confirm dialog before sending; undo available.
- Schema changes need ADR 0038 and architecture-owner review before merge.

## Migration Plan

Additive only: new optional field, new command, new events. Old events replay unchanged. Rollback = revert the commits; stored `MapNuked` events would then fail to parse, so ship the shared schema first and keep it once any room has used it.

## Open Questions

- Should the nuke show a preview of tokens that would fall to the floor? Assumed no for v1: a plain confirm dialog.
- Should players see who detonated? Assumed no: the activity log reads "GM detonated a nuke (12)".
