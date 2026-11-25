# Design

## Context

Today, "reduced" is one boolean that several call sites work out for themselves:

- `ui/motion.ts` `motionReduced()`: the client setting OR the OS. Used by CSS (`data-motion`), the panel collapse, fog drift, and the attack editor and home attack previews.
- `board/effects.ts` `effectiveReducedMotion(state)`: the OS OR the client setting OR `RoomState.reducedEffects`. Used by `Board.tsx`, `nukeHealth.ts` and `EffectsOverlay.tsx`.
- `boardView.reducedMotion`: the OS OR `tableReduced` OR the client setting. It's passed to `fx.ts`, `nukeFx.ts`, `defeatPlan`, `attackPlan`, `pingPulse`, `artStyleFor`, the slide, the camera focus, the fog and the sight loops.
- `ui/Die3D.tsx` `canAnimateDice()`: the client setting OR the OS.

Under today's reduced mode, dice already skip the board throw, and the RollCard appears without a slide because the global CSS rule stops it. That's exactly what both new levels want for dice. The home page attack tile already swaps to a still image under `motionReduced()`.

## Goals / Non-Goals

**Goals:**
- One source of truth for the level, read live, with the OS rule built in.
- Split Reduced from None only where the specs say they differ: strikes, the hit and miss ring, damage numbers, the nuke, token slides and defeat.

**Non-Goals:**
- Removing `RoomState.reducedEffects` or `room.setReducedEffects` from `packages/shared`. Leaving the contract alone avoids an ADR, and old event logs keep replaying.
- Changing the "Attack animations" (All / Current turn / None) filter. It stays a separate filter applied on top.
- Changing the dice tray, the RollCard, pings, conditions, fog or CSS. Reduced and None both keep today's reduced behaviour for these.

## Decisions

**1. `animationLevel()` in `ui/motion.ts` is the single source.** It returns `"none"` when the OS asks for reduced motion, and the saved `clientSettings.animationLevel` otherwise. `motionReduced()` becomes `animationLevel() !== "full"`, so every existing boolean caller (CSS attribute, fog, panel collapse, pings, conditions, sight fade, dice) keeps today's reduced behaviour at both levels without being edited. `effects.ts` exports a matching `watch` helper that fires on an OS change or a settings change, replacing `watchReducedMotion` for components that need the level live. *Alternative:* two booleans (`reduced`, `none`). Rejected because the two can contradict each other, and a single union keeps the switch statements exhaustive.

**2. The room flag is dropped on the client.** `effectiveReducedMotion` loses its `state` parameter. `boardView.tableReduced`, the `EffectsOverlay` `tableReduced` argument, and `AttackEditorEnv.reducedEffects` are removed. The schema field stays, and nothing reads it.

**3. Split points read the level, not the boolean.**
- `boardView.playStrikeFx`: below Full, draw nothing. Still call `playFxSound(def, true)` for the one soft cue, unless the "Attack animations" filter has already stopped the effect. `boardView.focusStrike` returns early below Full, so the camera never moves for an attack, and the old instant-jump branch in `focusFight` is removed.
- `boardView.playAttackEffect` hit shake: only at Full. This is already true, because it returns early when reduced.
- `boardView.playNukeFx`: Reduced uses today's `nukeFx.ts` still marker. None draws nothing, calls `onImpact` at once and plays the soft cue.
- `EffectsOverlay`: `Hit` and `Miss` take the level. At Reduced they render `<Marker>` with no `label`, and at None they render `null`. `Damage` at Reduced renders today's still number, and at None `null`. The `attackPlan` durations are unchanged, so entries still expire.
- `boardView.slide`: jumps only at None.
- `defeatPlan`: takes the level. Reduced gives today's 200 ms fade, and None gives `durationMs: 0`, so the token is removed in the same frame.
- `nukeHealth.ts`: below Full, applies HP at once, as today's reduced mode does.

**4. Previews.** `AttackPanel` renders the preview block only at Full. `AttackTile` already uses `motionReduced()`, so under Decision 1 it shows the still image at both levels. `animationPreview.ts` stops reading `motionReduced()` for the nuke screen shake, so the Animation Editor always plays in full, as `library-animations` now says.

**5. Settings storage and migration.** Add `animationLevel: "full" | "reduced" | "none"` with its own field check, and remove `reducedAnimations` from `ClientSettings`. In the parser, before the per-field checks run, a stored object with no valid `animationLevel` and `reducedAnimations === true` maps to `"reduced"`. Anything else falls back to `"full"`. The old key is dropped on the next write. The `clientSettings.ts:116` "graphics changed" check compares `animationLevel` instead.

**6. Settings UI.** The switch becomes a `<select>` labelled Animations with Full, Reduced and None, plus a hint. When the OS rule applies, the select is `disabled`, shows None, and shows a note that the device's setting is in effect. All text goes through `t()` with English and zh-TW entries, and terms are checked against `docs/GLOSSARY-zh-TW.md`.

## Risks / Trade-offs

- [Existing tests set `reducedEffects: true` in room state to get reduced visuals] → Rewrite them to set the client setting. Add one test showing the room flag has no effect.
- [None leaves no attack trace on the board, so it could look like a bug and get "fixed" later] → `animation-levels` has a scenario that pins this behaviour down, and the HP bar, RollCard and log still show the outcome.
- [The OS lock surprises a viewer who wants Full on a reduced-motion device] → This is a deliberate rule (the spec says it can't be overridden). The Settings note explains it.
- [In-flight change `auto-remove-defeated-tokens` still names the GM flag in its death-animation requirement] → A task reconciles its spec text before either change is archived.
- [ADR 0038's "effective reduced motion" sentence becomes out of date] → A task adds a short note to ADR 0038 pointing here. That's a doc note on the client rule only; no schema changes.

## Migration Plan

This is client-only and ships in one web deploy. Browsers migrate their saved setting the first time they read it. Rolling back means a browser that saved `animationLevel` falls back to the default `reducedAnimations: false`, because the old field check ignores unknown keys. That's acceptable.
