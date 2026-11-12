# Tasks

## 1. Client settings storage

- [x] 1.1 In `apps/web/src/ui/clientSettings.ts`, add `arrowKeyMove: boolean` (default `true`) and `attackAnimations: "all" | "turn" | "none"` (default `"all"`) to `ClientSettings`, `DEFAULT_CLIENT_SETTINGS` and `isClientSettings`. Verify that `npm run typecheck` passes.
- [x] 1.2 Replace the whole-object read in `getClientSettings` and `storageChanged` with a field-by-field read over the defaults (design Decision 2), keeping `isClientSettings` as the guard in `setClientSettings`. Verify with new cases in `apps/web/test/clientSettings.test.tsx` (FR-TAC-06): saved Music volume 30 with no new fields reads back 30 with Attack animations `all`, and Sound effects 250 with Graphics Low reads back the default volume with Low.
- [x] 1.3 Carry over `vtt.ui.arrowKeyMove` once (design Decision 3): use it when the stored settings lack a valid `arrowKeyMove`, write the merged settings, and remove the old key. Verify with a test that a stored `false` under the old key reads back `arrowKeyMove: false` and that the old key is gone.

## 2. Settings dialog and top bar

- [x] 2.1 Add the Controls tab to `apps/web/src/ui/SettingsMenu.tsx`, after Graphics and before Table, with the "Arrow keys move selected token" switch. Verify with a `clientSettings.test.tsx` tab test that the tab order is Audio, Graphics, Controls (plus Table for the GM) and that arrow-key navigation still cycles through every tab.
- [x] 2.2 Add the "Attack animations" select (All, Current turn, None) to the Graphics tab. Verify with a test that choosing None saves `attackAnimations: "none"`.
- [x] 2.3 Change `apps/web/src/ui/RoomMenu.tsx` to take an optional `onSettings` and list Settings only when it is given; remove its own `settingsOpen` and `<SettingsMenu>`. Verify that `npm run typecheck` passes and that the More menu renders without Settings when `onSettings` is omitted.
- [x] 2.4 In `apps/web/src/pages/RoomPage.tsx`, hold `settingsOpen`, render an icon-only gear `tool-button` (accessible name "Settings", `GearSix`) directly before `RoomMenu` when `!compact`, pass `onSettings` to `RoomMenu` only when `compact`, render one `<SettingsMenu>`, and return focus to whichever control opened it. Verify in the browser at desktop and phone widths: the gear opens Settings and gets focus back on close; on a phone, More lists Settings and the gear is absent.

## 3. Arrow-key movement

- [x] 3.1 In `apps/web/src/board/Board.tsx`, replace the `vtt.ui.arrowKeyMove` persistent state with `useClientSettings().arrowKeyMove`, and stop passing `arrowKeys` to `TokenCard`. Verify that `npm run typecheck` passes.
- [x] 3.2 Remove the `arrowKeys` prop and the "Move with arrow keys" switch from `apps/web/src/board/TokenCard.tsx` (and its `.arrow-keys-switch` style if now unused). Update the token card tests (`apps/web/test/moveControl.test.tsx`, which covered the old switch) to assert that no arrow-key switch is shown for a movable token.

## 4. Attack animations filter

- [x] 4.1 In `apps/web/src/board/effects.ts`, add an optional `fromId` to the `hit`/`miss` effect, filled from the ruled roll's visible attacker in `attackEffectFor`. Verify with `apps/web/test/boardEffects.test.ts` that a ruling on a visible roll carries the attacker's id and existing visibility tests still pass.
- [x] 4.2 Add a pure `effectToPlay(effect, mode, state)` following design Decision 4. Unit test it in `boardEffects.test.ts`:
  - `all` plays everything.
  - `none` plays only `defeat`.
  - `turn` with no initiative plays everything.
  - `turn` plays the active token's strike, hit and miss, and skips another token's.
  - `turn` always plays `damage` and `damages`.
  - `turn` plays a nuke on an unowned or hidden active token, and keeps only its numbers on an owned one.
- [x] 4.3 Apply `effectToPlay` in `Board.tsx` in the live committed handler, before `focusStrike` and before a strike is queued for its dice, and in the replay path, reading the mode with `getClientSettings()`. Verify in the browser with two players: one on None sees no strike while the other on All does; on Current turn a non-active token's to-hit shows no strike or hit effect but its damage number rises; a defeated token still falls on None.

## 5. Finish

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test` from the repo root and confirm all pass. Lint, typecheck and every web and shared suite pass. One existing server test, `apps/server/test/uploadAllowance.test.ts` "counts UVTT imports into a room", fails only under full-suite load: a refused import's image is still on disk when the test checks. It is unrelated to this change (server code only, from 3156698) and is left to its own fix.
