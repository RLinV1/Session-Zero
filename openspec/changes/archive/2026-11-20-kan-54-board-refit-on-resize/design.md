# Design

## Context

Findings from `apps/web/src/board/boardView.ts` on this branch:

- `autoFit` (default `true`) is set to `true` by `resetView()` (the Fit button) and by `syncMap()` when the map URL changes. It is set to `false` by `focusToken`, by `onPointerMove` while `this.pan` is set, by `onTouchMove` (pinch), and by `onWheel`.
- `fitToScreen()` scales the map to 95% of the canvas and centres it, and returns early when the canvas is 0 by 0.
- `update()` calls `fitToScreen()` on every state update while `autoFit` is true.
- `init()` creates the Pixi app at the host's initial size (`autoStart: false`, no `resizeTo`) and registers a `ResizeObserver` on the host. The observer callback only marks `pendingSize` and schedules a frame. `renderFrame` runs `settleResize()`, which waits until `host.clientWidth/Height` is unchanged between two frames, then calls `app.renderer.resize()`. That emits Pixi's `resize`, whose handler calls `fitToScreen()` if `autoFit`, otherwise `recenterOnResize()` to keep the centre point stable.
- `destroy()` already cancels the animation frame and calls `hostObserver.disconnect()`.
- `pan` is armed in `onBackgroundDown` for a plain press on the map, for placement mode and for attack pick mode. `onPointerMove` then does `autoFit = false` before applying the delta, with no movement threshold.
- Rotation on a phone also changes the room layout (`styles.css` uses `100dvh` and a narrow layout), so the host box changes size and the observer fires. The remaining suspect for the iPhone symptom is therefore the over-eager `autoFit = false` on taps and wheel events, not a missing observer. This must be confirmed by reproduction (see tasks) before assuming it is the whole story.

## Goals / Non-Goals

Goals:

- Refit on canvas resize (rotation, window resize, sidebar collapse) when the camera is still automatic.
- Keep a deliberately positioned camera on resize.
- Fit still resumes auto-fit.
- No flash or jump on desktop resize.

Non-goals:

- No new persisted or shared state. The camera stays a per-viewer, in-memory, client-only value. No `Command`, `DomainEvent`, schema, visibility filter, server or ADR change, and nothing is sent to other clients (FR-TAC-01 keeps viewports independent).
- No change to zoom limits, fit padding (95%), or the sidebar layout.
- No new dependency.

## Decisions

### 1. Keep the existing ResizeObserver and settle logic

The host observer and one-frame settle already coalesce resize bursts through `requestAnimationFrame`, and the board background colour covers the gap while the canvas waits. That is the answer to the "no flash or jump" criterion, so it is not replaced. The reproduction task checks it. Only if it fails is a change made. Today the renderer resize, the refit and `app.render()` already happen in one `renderFrame`, so the resized canvas and the refit land in the same frame.

Alternative rejected: Pixi `resizeTo` or a window `resize` listener. They fire per event without settling, resize the canvas on every sidebar frame, and miss host-only changes.

### 2. Define "manual camera" as an actual camera change

A camera is manual when the viewer changed it on purpose:

- Pan: cumulative screen movement of a drag reaches a threshold (`PAN_THRESHOLD_PX`, 4 CSS pixels, above touch jitter and below a deliberate drag). Movement below the threshold does not clear `autoFit`. Once past the threshold the pan behaves as today: the world position is set from the full delta, so there is no visible dead zone. Only the auto-fit flag waits.
- Zoom: a wheel or pinch step clears `autoFit` only if it changes the clamped scale. A wheel event at the zoom limit that changes nothing keeps auto-fit.
- Two-finger pan: a two-finger gesture also clears `autoFit` once its midpoint moves past `PAN_THRESHOLD_PX` from where the fingers came down, even at constant spread (unchanged scale), via `pinchIsManual`. Otherwise a deliberate two-finger pan would be undone by the next resize.
- Focus: `focusToken` still clears `autoFit`, since it deliberately moves the camera.
- Not manual: taps, double-click ping, placement clicks, attack picks, tool gestures on the map, hover.

Fit (`resetView`) and a map change (`syncMap`) still set `autoFit = true`, unchanged.

Alternative rejected: making the resize path set or clear the flag. The flag stays a pure record of viewer intent, and the resize path only reads it.

### 3. Extract a pure helper for the decisions

`apps/web/src/board/viewFit.ts` (no Pixi imports) exports:

- `PAN_THRESHOLD_PX`.
- `exceedsPanThreshold(start, current)`, the pan test above.
- `resizeAction(autoFit, oldSize, newSize)` returning `"refit"`, `"recenter"` or `"none"`: refit when automatic and the new size is non-empty and different; recenter when manual; none when the size is unchanged or empty.
- `zoomChangesScale(before, after)` (epsilon compare) for the wheel and pinch tests.

`boardView.ts` calls these from its handlers and from the renderer `resize` handler. Pixi objects stay in `board/`, and React does not touch them (CLAUDE.md convention). Existing `recenter.ts` is reused as is.

### 4. Disposal

`destroy()` already disconnects the observer and cancels the pending frame. The implementation keeps that and checks that `settleResize` and the `resize` handler are inert after `destroy()` (`initialized` is false), so a late observer callback cannot touch a destroyed renderer.

### 5. Only if reproduction shows a gap: rotation timing

If phone-sized emulation shows the host reporting a transient size right after rotation, the settle window (one stable frame) is the place to lengthen, for example two stable frames only when the aspect ratio flipped. This stays a conditional task so the change does not add a timer the evidence does not justify.

## Risks / Trade-offs

- The threshold delays the point at which a pan disables auto-fit. The world still moves with the pointer immediately, and 4 px is imperceptible.
- Taps no longer stick the camera as manual, so a viewer who taps and then rotates gets a refit. That matches the ticket ("has not manually panned or zoomed").
- A viewer who panned and later wants the map fitted again presses Fit, unchanged.
- Real iPhone Safari cannot be driven here. Mobile verification uses Playwright viewport emulation (portrait to landscape). That exercises the same host-size path but not Safari's own toolbar behaviour. The limitation is recorded in the QA notes.

## Migration Plan

None. Client-only, no stored data, no protocol change, safe to roll back by reverting the web bundle.

## Open Questions

- Whether the reproduction shows the flag bug is the whole cause, or the rotation-timing task 3.4 is also needed. Resolved during implementation by the Playwright checks.
