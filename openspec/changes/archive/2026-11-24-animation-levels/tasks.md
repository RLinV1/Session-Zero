# Tasks

## 1. Level setting

- [x] 1.1 In `ui/clientSettings.ts`, replace `reducedAnimations` with `animationLevel: "full" | "reduced" | "none"` (default `"full"`, own field check). Migrate a stored `reducedAnimations: true` to `"reduced"` when no valid `animationLevel` is saved, and update the graphics-changed comparison. Verify with unit tests: old on → reduced, old off → full, a saved level beats the old switch, an invalid level falls back alone.
- [x] 1.2 In `ui/motion.ts`, add `animationLevel()` (OS reduce → `"none"`, else the saved level) and a live `watch` helper, and make `motionReduced()` return `animationLevel() !== "full"`. Verify with unit tests covering OS on/off × each saved level, and a watcher firing on both OS and settings changes.
- [x] 1.3 Drop the room flag on the client: remove the `state` parameter from `effectiveReducedMotion` (or replace it with the level helper), remove `boardView.tableReduced`, the `EffectsOverlay` `tableReduced` argument, and `AttackEditorEnv.reducedEffects` (`attackEditorContext.ts`, `RoomPanel.tsx`). Verify `npm run typecheck` passes and `grep -rn reducedEffects apps/web/src` finds nothing.
- [x] 1.4 In `ui/SettingsMenu.tsx`, replace the switch with an Animations select (Full / Reduced / None, plus a hint). It is disabled and shows None with a device note while the OS rule applies. Add English and zh-TW strings, checking terms against `docs/GLOSSARY-zh-TW.md`. Verify with a settings component test (choose a level; locked under a mocked `matchMedia`) and with `npm run lint`.

## 2. Board effects

- [x] 2.1 In `board/EffectsOverlay.tsx`, make Hit, Miss and Damage level-aware. Reduced: an unlabelled still ring for hit and miss, and today's still damage number. None: nothing for hit, miss or damage, including area-effect and nuke numbers. Verify with overlay tests per level (no "Miss" text at Reduced, no nodes at None).
- [x] 2.2 In `board/boardView.ts`, `playStrikeFx` draws nothing below Full but still plays the one soft cue, and `focusStrike` does nothing below Full. Verify with a board test or `fxStrikes` test that no fx run starts, the sound is requested once, and the camera does not move at Reduced and at None.
- [x] 2.3 Nuke: Reduced keeps today's still centre marker. None draws nothing, calls `onImpact` at once and plays the soft cue. `nukeHealth.ts` applies HP at once below Full. Verify with `nukeFx` and `nukeHealth` tests per level.
- [x] 2.4 Token slide jumps only at None (`boardView.slide`). Verify with a slide test: Reduced slides, None jumps.
- [x] 2.5 `defeatPlan` takes the level: Full is the full effect, Reduced the 200 ms fade, None `durationMs: 0`, and the board removes the token in the same frame at None. Verify with `defeatPlan` unit tests and a board test that the sprite is gone at once at None.
- [x] 2.6 Confirm pings, conditions, fog, sight fade, dice (`canAnimateDice`) and the RollCard all follow `motionReduced()` at both levels, and change `canAnimateDice` to use the helper. Verify with existing ping, condition-loop and dice tests passing at Reduced and at None.

## 3. Previews

- [x] 3.1 In `panels/AttackPanel.tsx`, render the preview stage only at Full. Verify with an attack-editor test: no stage at Reduced or None, and saving still keeps the chosen animation.
- [x] 3.2 In `board/animationPreview.ts`, stop gating the nuke screen shake on `motionReduced()`, so the Animation Editor always plays in full. Verify with a preview test at None in which the nuke shake starts.
- [x] 3.3 Confirm `pages/home/AttackTile.tsx` shows its still image at Reduced and None through `motionReduced()`. Verify with a home tile test at each level.

## 3a. Fixes from the browser check

- [x] 3a.1 At Reduced, the result card draws each die as a flat outline of its shape, value inside, type under it (`ui/RollCard.tsx`, catalog id `dice.dieType`); None keeps numbers only. Verified by `animationLevelRolls.test.tsx`.
- [x] 3a.2 At None, an attack roll's target ping is not drawn: the roller's board skips its own (`AttackPanel.tsx`), and other boards at None match the incoming ping to the attack roll just received (`board/attackPings.ts`, `Board.tsx`). Verified by `animationLevelRolls.test.tsx`.

## 4. Tests, docs and wrap-up

- [x] 4.1 Rewrite existing web tests that set `reducedEffects: true` to get reduced visuals so they use the client setting, and add one test that a room with the flag on still plays at Full. Verify `npm test` passes.
- [x] 4.2 Add a short note to `docs/adr/0038-attack-styles-nuke-and-animations.md` saying the client no longer reads `reducedEffects` and pointing to `animation-levels`, and update the `auto-remove-defeated-tokens` change's death-animation requirement to defer to `animation-levels`. Verify `openspec validate animation-levels --strict` and `openspec validate auto-remove-defeated-tokens` pass.
- [x] 4.3 Run `npm run lint && npm run typecheck && npm test` and verify everything passes. Then check manually in `npm run dev`, at each level, an attack with hit, miss and damage, a nuke, a move, a defeat, a roll, the attack editor, and the Animation Editor.
