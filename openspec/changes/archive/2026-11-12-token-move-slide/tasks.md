# Tasks

## 1. Slide timing

- [x] 1.1 Add a pure `slideDistance(t, length, duration)` and the duration rule (design Decision 3) in `apps/web/src/board/`, and verify with unit tests in `apps/web/test/tokenSlide.test.ts`:
  - A 3-square live slide on a 70 px grid has gone under a third of a square (about 10 px) after 100 ms.
  - A 6-square live slide takes just under 1 s, and a 12-square one about twice as long, with no cap.
  - The distance reaches the full length exactly at the duration.
  - With the 700 ms replay cap, a 30-square slide ends at 700 ms.
  - Speed never decreases.
  - A slide shorter than the 250 ms speed-up still ends on time.
- [x] 1.2 Turn `animateTokenPath` into `slide(tokenId, points, gaps, { capMs, own })` using that curve, jumping under reduced motion or for visible lengths under one square, plus `stopSlides()` (design Decisions 3, 5, 6). Verify with `BoardView` unit tests built as in `apps/web/test/movementPreview.test.ts`: the token is drawn along the curve at set times, a sub-square move and reduced motion leave it in place, and `stopSlides()` puts every token where state says.

## 2. The mover's drag and drop

- [x] 2.1 Draw a faded copy of the dragged token that follows the pointer while the token stays on its square, and destroy it on drop, cancel, tool change and token removal (design Decision 1). Verify with `BoardView` unit tests: a drag moves the copy and not the token, a click creates no copy, and every exit path leaves no copy behind.
- [x] 2.2 Start the slide on drop along the plan's points, rest at the pending square, and slide back to the origin on refusal (design Decision 2). Verify with `BoardView` unit tests: after a drop the token slides along `plan.points`, a refusal at 100 ms slides it back from under a third of a square, and an accepted move ends on the room's square.

## 3. Every board, and replays

- [x] 3.1 Slide every live `TokenMoved` in `Board.tsx` unless this board is already sliding or holding that token, and move the path-cutting into a shared `slidePointsFor(moved, viewer, state)` (design Decision 4). Verify with unit tests of `slidePointsFor` (GM uncut, player path cut at fog, player straight move cut by fog and sight) and of the skip rule (own slide skipped, the same account's other board slides).
- [x] 3.2 On each replay frame, stop slides, then slide a `TokenMoved` event frame with a 700 ms cap (design Decision 5). Verify with a `Board` test using a mocked `BoardView`, as in `apps/web/test/movementRulerBoard.test.tsx`: a forward step slides with the cap, and a slider jump only stops slides.

## 4. Finish

- [x] 4.1 Add a note to `docs/adr/0055-path-movement.md` that the mover's board, their other tabs and replays slide too, and that every slide starts slowly. Verify the note is present.
- [x] 4.2 Verify in the browser:
  - Dragging your own token shows a faded copy while the token stays put, then the token slides along the path on drop.
  - A refused move barely moves before sliding back.
  - A second tab sees the move slide.
  - A replay slides each move inside its step.
  - Reduced motion jumps.
- [x] 4.3 Run `npm run lint && npm run typecheck && npm test` from the repo root and confirm all pass.
