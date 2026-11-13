# Tasks

## 1. Decision record

- [x] 1.1 Write `docs/adr/0064-shared-drawings.md` covering the schema, commands and events, limits, no undo, public visibility and the `TableState` change (design.md Decisions 1–7). Add an "Amended by 0064" note to ADR 0007's "Drawings and measurements stay local" line. Verify: the ADR is in `docs/adr/` and ADR 0007 links to it.
- [ ] 1.2 Request review of ADR 0064 from the Real-Time Architecture owner. Verify: the review is recorded in the ADR's Status line before merge.

## 2. Contract (`packages/shared`)

- [x] 2.1 Add `DrawColor`, `Drawing`, `MAX_DRAWINGS`, `MAX_DRAWING_POINTS` and `MAX_STROKE_POINTS` to `state.ts`, plus optional `drawings` on `TableState` and `RoomState`, and include it in `tableOf`. Verify: `npm run typecheck`, and a test that a `TableState` without `drawings` still parses.
- [x] 2.2 Add the `drawing.add` and `drawing.remove` commands and the `DrawingAdded` and `DrawingRemoved` events, with zod limits on integer coordinates and stroke length. Verify: schema tests reject odd-length, over-1000-entry and non-integer `points`, and accept a 2-point line.
- [x] 2.3 Handle both commands in `decide`: active-participant check, `can.removeDrawing` (GM or owner), map bounds (no map rejects), and the count and point budgets with `reject.tooManyDrawings` and `reject.drawingOffMap` catalog ids. Verify: `describe("shared drawings (FR-TAC-04)")` unit tests cover each rejection and the owner/GM/other-player removal cases.
- [x] 2.4 Reduce both events. Keep them out of `REVERSIBLE_EVENT_TYPES`. Start new scene, draft scene and encounter tables with `drawings: {}`. Verify: reducer tests cover add/remove, a scene switch round trip, a checkpoint restore, and an empty undo history after drawing.
- [x] 2.5 Pass drawings through `filterStateForViewer` and `filterEventForViewer` explicitly. Verify: visibility tests show a player receives the GM's drawing over fog, in a snapshot and as an event.
- [x] 2.6 Add activity log lines (English and `sentences.zh-TW`) and the rejection messages in both catalogs, using `docs/GLOSSARY-zh-TW.md` terms. Verify: activity log tests for "drew", "erased their" and "erased X's", plus the i18n catalog completeness test.

## 3. Server

- [x] 3.1 Add a multi-client integration test in `apps/server/test`: A draws, and B and the GM receive it. A reconnects and still sees it. B's forged removal of A's drawing is rejected. The GM's removal reaches everyone. A forged 5000-point stroke is rejected. Verify: `npm test --workspace=@vtt/server -- -t "drawings"` passes.

## 4. Web

- [x] 4.1 Add a pure `simplifyStroke(points, tolerancePx)` (RDP with integer rounding and tolerance doubling to fit 500 points). Verify: unit tests that a straight line collapses to 2 points, a circle keeps its shape within the tolerance, and a 2000-point scribble comes out at 500 points or fewer.
- [x] 4.2 Make the Draw tool send `drawing.add` through `RoomConnection.command` on release: shapes as is, strokes simplified at the current zoom. Show a pending copy until the event arrives, and drop it with the rejection message on failure. Verify: a web test with a fake connection that a released rectangle and stroke each send one command, and a rejection removes the pending copy.
- [ ] 4.3 Render `state.drawings` in `markLayer`, above fog and sight and not clipped, mapping `DrawColor` to shades. Remove local `draw` and `stroke` marks, keeping measure and route marks. Verify: two-browser manual check (`npm run dev`) that a drawing over fog and over darkness shows for the other player.
- [x] 4.4 Extend `eraseAt` so drawings the viewer may remove send `drawing.remove` once per sweep, and others' drawings are skipped for players. Verify: a web test that a player's sweep over their own and another player's drawing sends exactly one removal, for their own.
- [x] 4.5 Route any new UI text through `t()` in English and zh-TW. Verify: `npm run lint` passes (it enforces no literal text).

## 5. Docs and wrap-up

- [x] 5.1 Update the README's FR-TAC-04 row (freehand included) and `docs/DESIGN.md` §6, §7 and the FR table (FR-TAC-04 built, the open decision resolved). Verify: `grep -n "FR-TAC-04" README.md docs/DESIGN.md` shows the updated text.
- [ ] 5.2 Run the sync-reviewer and visibility-auditor agents on the diff and address their findings. Verify: both report no violations.
- [x] 5.3 Run `npm run lint && npm run typecheck && npm test`. Verify: all pass.
