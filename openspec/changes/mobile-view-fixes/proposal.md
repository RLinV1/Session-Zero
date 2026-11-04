## Why

The web app was built desktop-first. A Playwright audit at a 390x844 phone viewport found
screens that are clipped, overlapped or cramped: the Library tab strip cuts off "Animations",
the room's tool rail overlaps a 388px-tall board, and the chat button covers the Area Effect
panel. Players are told to join from "your phone or laptop" (home page), so the room has to be
usable on a phone, not just load.

## What Changes

- Every screen fits a 360px-wide viewport with no horizontal page scroll and no clipped or
  overlapping controls: home, sign in/up, GM dashboard, library (all tabs), join, room, policy
  pages, and the map, animation and encounter editors.
- Library tab strip scrolls or wraps instead of clipping its last tab.
- Room: the tool rail no longer covers the board's centre or scrolls inside a short board; the
  chat button no longer overlaps panel content; the header uses its two rows deliberately.
- Room tabs (Play, Tokens, Dice, Manage), modals and popovers fit the viewport and keep their
  actions reachable.
- Touch targets are at least 44px on coarse pointers (already partly done in `styles.css`).
- No change to server, shared schemas, commands or events.

## Capabilities

### New Capabilities
- `mobile-layout`: Phone-width layout contract for all screens: no horizontal overflow,
  no overlapping controls, reachable actions, usable room board.

### Modified Capabilities

## Impact

- `apps/web/src/styles.css` and component CSS/markup under `apps/web/src/` (library tabs,
  `ToolRail`, chat button, room header, modals, editors).
- No changes to `packages/shared`, `apps/server`, ADRs or any invariant.
- Verified with Playwright MCP at 360x740 and 390x844, plus a desktop regression check.
