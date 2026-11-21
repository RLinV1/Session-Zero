# Tasks

## 1. Reproduce first

- [x] 1.1 Start the app (`npm run dev`) and, with Playwright MCP at a desktop viewport, load a room with a map. Record whether the existing observer already refits an untouched camera on resize, and whether a plain click on the map (no drag) stops it from refitting. This confirms which of design decisions 2 and 5 are needed. Finding: untouched camera already refits on resize (1440x900 to 1100x800: fit ratio 0.999). A plain click on the map (down, zero-delta move, up) then a resize did NOT refit (map stayed at 73% of fit scale), confirming the eager `autoFit = false` in `onPointerMove` (decision 2) is the cause; the observer exists and works.

## 2. Pure decision helper

- [x] 2.1 Add `apps/web/src/board/viewFit.ts` (no Pixi imports) exporting `PAN_THRESHOLD_PX`, `exceedsPanThreshold`, `resizeAction` and `zoomChangesScale` as in design.md; verify `npm run typecheck` passes.
- [x] 2.2 Add `apps/web/test/viewFit.test.ts` with vitest cases referencing FR-TAC-01: zero and sub-threshold movement is not manual and movement past the threshold is; `resizeAction` returns refit when automatic and the size changed, recenter when manual, and none for unchanged or empty sizes; a zoom that clamps to the same scale is not a change. Verify `npm test --workspace=@vtt/web` passes.

## 3. Wire into the board

- [x] 3.1 In `boardView.ts`, clear `autoFit` on pan only once `exceedsPanThreshold` is true (keep moving the world from the full delta), and on wheel and pinch only when the clamped scale changed; keep `focusToken` clearing it. Verify taps, placement clicks and attack picks leave auto-fit on.
- [x] 3.2 In the renderer `resize` handler, use `resizeAction` to choose refit or recenter, keeping `recenterOnResize` for the manual case; verify Fit and map change still set auto-fit.
- [x] 3.3 Confirm `destroy()` disconnects the observer and cancels the frame, and that a resize callback after destroy does nothing; add a test or a guard if any path can still touch the destroyed renderer. Note: `destroy()` already disconnects the observer and cancels the frame; `renderFrame` is guarded by `initialized`; added an `initialized` guard to the renderer `resize` handler. No test added (Pixi needs a canvas).
- [x] 3.4 Only if task 1.1 or 4.2 shows a gap in rotation timing, adjust the settle window as in design decision 5; otherwise record that it was not needed. Note: not needed. Rotation (390x844 to 844x390 and back) refit correctly with the existing one-frame settle.

## 4. Browser verification (Playwright MCP)

- [x] 4.1 Desktop, untouched camera: resize the viewport several times (for example 1440x900, 1100x800, 1440x900) and confirm the map refits each time, with no blank or stretched frame in screenshots taken during and after the resize. Note: pass. 1440x900, 1100x800, 1440x900 each refit (fit ratio 0.998 to 1.000); screenshot right after resize showed no blank or stretched frame.
- [x] 4.2 Mobile, untouched camera: emulate a phone in portrait (390x844), tap the map once, then switch to landscape (844x390) and back; confirm the map refits each time with no letterboxed dead space beyond the fit margin. Note: pass. 390x844, tap with 1px jitter, 844x390, back to 390x844: fit ratio 0.998 to 1.010 each time, map centred.
- [x] 4.3 Desktop and mobile, manual camera: zoom with the wheel (desktop) or a wheel or pinch event (mobile emulation), then resize or rotate; confirm the zoom level and centre point are kept. Repeat after a drag pan. Note: pass. Wheel zoom then 1440x900 to 1100x800: feature size and offset from canvas centre kept (bridge span 325px to 320px, centre offset within 3px); same after a drag pan and after resize back; mobile size wheel zoom kept scale on rotation (map height 262px to 261px, refit would give 306px). Pinch touch events not emulated; wheel path used.
- [x] 4.4 After manual zoom, press Fit, then resize or rotate; confirm the board refits (auto-fit resumed). Note: pass. Zoom, Fit, then rotate 844x390 to 390x844: fit ratio 0.998.
- [x] 4.5 Check the console for errors, and confirm through the network or websocket log that resizing sends no command or message. Record that real iPhone Safari was not available and that emulation was used. Note: pass. Resizes 1100x800, 390x844, 844x390 sent no WebSocket frame or fetch (send/fetch counters stayed empty). Console errors seen were 401 on `/api/gm/rooms` (guest GM dashboard, unrelated) and a socket.io handshake abort from a dev server restart; none from resize. Real iPhone Safari not available; Playwright viewport emulation used (mouse events, not touch, and no Safari toolbar behaviour).

## 5. Quality gates and review

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test` and fix any failures. Note: `npm run lint` reports 3 errors only in an untracked `.claude/worktrees/stoic-payne-ab68c0/apps/web/scripts/home-maps.mjs` (pre-existing, not part of this change); all tracked source lints clean.
- [x] 5.2 Run `openspec validate kan-54-board-refit-on-resize --strict`.
- [x] 5.3 Run a security review of the change (`/security-review`); it should confirm no new input surface, no server or shared-package change, and no data leaving the client. Note: no findings; diff is web-only camera logic (pure helper plus autoFit gating), no network, DOM injection or shared/server change.
