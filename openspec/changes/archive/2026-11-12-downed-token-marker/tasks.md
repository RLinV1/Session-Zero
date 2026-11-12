# Tasks

## 1. Look

- [x] 1.1 Add `isDowned` and change `ArtStyle.greyscale` to a numeric `grey`, with `artStyleFor(conditions, reducedMotion, downed)` taking the strongest grey (design Decisions 1–2). Verify with unit tests in `apps/web/test` (FR-TAC-07): HP 0 and −4 are downed; HP `null` and HP 5 aren't; downed plus Unconscious gives grey 0.75; Unconscious alone gives 0.6; downed plus Prone keeps the tilt.
- [x] 1.2 Apply the numeric grey in `boardView.ts` `drawConditionLook` and pass `isDowned(token)` from `drawToken`. Verify `npm run typecheck` passes and existing condition-look tests still pass.

## 2. Marker

- [x] 2.1 Draw the X over downed tokens in the token decoration, scaled to the radius and kept out of the tilted `art` container, and leave tokens in the defeat fall untouched (design Decisions 3–4). Verify with a board test in `apps/web/test` (like `tokenDisc.test.tsx`) that a token at 0 HP has the X and the downed grey, and that healing it removes both.

## 3. Visibility

- [x] 3.1 Add a test that builds a player's filtered state with "Hide HP from Players" on, using `filterStateForViewer`, and confirm an enemy at 0 HP isn't downed for the player, while their own 0 HP token and the GM's view of the enemy are. Verify the test passes.

## 4. Wrap-up

- [x] 4.1 In the browser, with auto-remove defeated off: damage a goblin to 0 (grey and X on the GM's and players' boards), turn on Hide HP (players' marker disappears, GM's stays), heal it (marker gone). Then run `npm run lint && npm run typecheck && npm test` and verify all pass.
