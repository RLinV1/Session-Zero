## Context

`apps/web/src/styles.css` already has phone rules (about 20 `max-width` queries, a 44px
touch-target rule under `pointer: coarse`), so this is gap-filling, not a redesign. The Playwright
audit at 390x844 (see proposal.md) found concrete gaps:

- Library `.tabs` (`styles.css:1379`) uses `overflow: hidden` with no wrap or scroll, so the
  fifth tab is clipped and "Token Art" wraps to two lines.
- `.tool-rail-wrap` (`styles.css:2394`) sits over the board's top-left and the rail scrolls
  internally (`overflow-y: auto`) when the board is only ~388px tall.
- `.chat-fab` floats over the board and over the scrolled side panels on a phone.
- The room page stacks board then panels; the board is about 388px of 844px.

Still to audit during implementation: room Tokens/Dice/Manage tabs, scene setup and settings
modals, map, animation and encounter editors, join page, policy pages, apartments demo.

Invariants in CLAUDE.md are untouched: this is presentation only. Pixi code stays in `board/`;
React components do not touch Pixi objects.

## Goals / Non-Goals

**Goals:**
- Fix every defect the audit finds, using the existing CSS tokens and breakpoints.
- Verify each screen at 360x740 and 390x844 with Playwright MCP, and re-check 1280x800.

**Non-Goals:**
- A native app, Steam build or PWA manifest.
- Touch-first redesign of the board (gestures, pinch-zoom changes) beyond what the audit shows
  is broken.
- Landscape-specific layouts, tablets, or new breakpoints beyond the existing ones.

## Decisions

1. **Fix in CSS first, markup only where CSS cannot.** Wrapping or scrolling tab strips,
   resizing the rail and repositioning the chat button are all CSS. Alternative: new mobile
   components, which duplicates logic and drifts from desktop.
2. **Tab strips scroll horizontally inside their own container** (`overflow-x: auto`,
   `white-space: nowrap`, hidden scrollbar), rather than wrapping. Wrapping makes a tall,
   uneven strip; scrolling keeps one row and matches the existing room tab bar.
3. **On phones the tool rail becomes a horizontal strip along the board's bottom edge**
   (`max-width: 760px`), not a vertical column at the left. A vertical rail needs board height
   the phone does not have; a horizontal one needs width, which it does. Option flyouts open
   above it. Alternative: collapse to a single toggle button, which hides the tools and adds a tap.
4. **Board gets a minimum height share on phones** (for example `min-height: 55svh`), using
   `svh` so mobile browser chrome does not push it off screen.
5. **Chat button moves clear of content**: it sits at the board's corner on phones and the
   panel area gets bottom padding equal to its size, so the last panel content can scroll above it.
6. **Dialogs**: cap `max-height` to `100svh` minus a margin and scroll the body inside, with the
   header (and close) fixed, via the shared `Modal` styles rather than per-dialog fixes.
7. **Verification is a Playwright sweep**, not unit tests: layout cannot be asserted in vitest
   jsdom. Per-route check: `scrollWidth <= innerWidth` plus a screenshot.

## Risks / Trade-offs

- [Moving the tool rail on phones changes muscle memory] → only under 760px; desktop untouched,
  checked at 1280x800.
- [`svh` unsupported on very old browsers] → fall back to `vh` declared first.
- [Fixes in shared classes (`.tabs`, `Modal`) ripple to desktop] → re-screenshot desktop for the
  library and one modal.
- [Playwright's emulated touch is not a real device] → note real-device testing as unverified
  in the final report.
