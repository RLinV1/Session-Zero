## 1. Geometry

- [x] 1.1 Add `apps/web/src/board/tools.ts` with the `BoardTool` type, `snapToCellCenter`, `snapToIntersection`, `measure`, and `areaShape` as in design §5; verify `npm run typecheck` passes
- [x] 1.2 Add `apps/web/test/boardTools.test.ts` (`describe("board tools (KAN-69, FR-TAC-03/04/06)")`) covering: snapping with a grid offset, 5-cell straight = `25 ft`, 3×3 diagonal = `15 ft`, free 1.5 cells = `7.5 ft`, cone length and far-edge width, box side and rotation, circle radius from size in units; verify `npm test --workspace=@vtt/web` passes

## 2. BoardView

- [x] 2.1 Add `markLayer` between `tokenLayer` and `fxLayer`, plus `setTool`, `clearMarks`, the marks list (cap 100), and a reused preview `Graphics`; verify typecheck
- [x] 2.2 Route input by tool: `onTokenDown` yields when the tool isn't Select, `onBackgroundDown` starts a tool gesture on button 0, move/up drive the preview and commit, and a two-finger touch cancels a gesture; verify in the browser that Select still drags tokens, pans, pings, and pinches
- [x] 2.3 Draw measure (line + counter-scaled label), draw marks (line/rect/circle), and area marks (translucent fill + stroke) with zoom-independent stroke widths; redraw marks on zoom and grid change and call `invalidate()` on every change; verify in the browser that marks stay put while panning and zooming and after another client moves a token

## 3. Rail UI

- [x] 3.1 Add `apps/web/src/ui/ToolRail.tsx`: a vertical `role="toolbar"` with Select/Measure/Draw/Area (`aria-pressed`), Clear, and an options flyout (draw shape + colour swatches, area shape + size 5–60); verify it is keyboard operable in the browser
- [x] 3.2 Wire it into `Board.tsx`: tool state, `view.setTool` on change, `clearMarks`, an Escape handler that ignores text inputs, and a per-tool hint line ("Only you can see these marks" for Draw/Area); verify Escape returns to Select and typing in the dice box does not change the tool
- [x] 3.3 Add rail styles to `styles.css` (left edge, under the top-left toolbar, icon-only with 40px targets below 640px, no backdrop filter); verify at 375px and desktop widths that the rail doesn't overlap the top-left controls or cause page scroll

## 4. Verification

- [x] 4.1 With two browsers in one room (GM and player), confirm that marks on one never appear on the other and that no socket message is sent while measuring, drawing, or placing areas (check the network panel)
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and confirm all pass

## 5. Follow-ups from review

- [x] 5.1 Add a freehand brush to Draw (default shape) as a `stroke` mark; verify with a brush hit test and in Playwright
- [x] 5.2 Size areas by dragging (snapped to whole cells, Alt free) with a live size label; a click keeps the preset size; the box starts at the origin; verify with `areaSizeFromDrag` tests and in Playwright
- [x] 5.3 Add an Eraser tool (click or drag over marks) with `hitMark`, and rename Clear to Clear all; verify with hit-test unit tests and in Playwright
- [x] 5.4 Give Measure, Draw, Area, and Eraser their own SVG cursors; verify the canvas cursor is the tool's in Playwright
- [x] 5.5 Let presses beside the rail reach the board (`pointer-events` on the rail wrapper); verify drags starting next to the rail draw
- [x] 5.6 Label the rail buttons under their icons (icon-only on phones), matching the reference layout; verify in Playwright at desktop and 375px
- [x] 5.7 Add a hide/show control to the rail, remembered per browser; verify in Playwright that the active tool still works while hidden and the choice survives a reload
