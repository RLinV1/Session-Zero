# Proposal

## Why

Token drags are about to show the cheapest valid path (change `path-movement`), but a player's client has no walls to route around. Plain walls are GM-only (ADR 0029) because walls under fog would outline rooms players haven't explored. The walls a player can already see on the map, though, are no secret, so the player's client can be given those without revealing anything new.

## What Changes

- A player's state SHALL contain the parts of plain walls they can currently see, **clipped on the server** where a wall crosses into fog or out of their line of sight. A partly visible wall arrives as its visible pieces only; the unseen parts never leave the server.
  - Without line of sight, visible means outside every fog region.
  - With line of sight, it also means inside the player's sight polygons.
- Players' boards still do not draw plain walls. The pieces are used only to compute movement paths and previews.
- Wall changes (`WallsAdded`, `WallsRemoved`, `WallUpdated`) that touch a player's visible area resync that player instead of being redacted. Fog changes and line-of-sight moves already resync, and the clipped walls come with those snapshots.
- Doors and windows are sent whole when any part of them is visible (outside fog and, with line of sight on, in sight), replacing the midpoint rule. They are concealed only when all of them is hidden.
- Wall events may leak some information about walls to players (for example, a resync when the GM re-splits a partly visible wall around a door under fog). This is accepted.
- No edge index at first. The measured cost is under 0.3 ms per snapshot on typical shipped maps and about 5 ms on Broken Span (627 walls, four sight origins). An index is added only if `npm run test:bench` shows it's needed.
- **Visibility change:** amends ADR 0029 with a new ADR. Needs a visibility-auditor pass and review by the Real-Time Architecture owner.

## Capabilities

### New Capabilities
- `visible-walls`: which pieces of plain walls a player receives (clipped to what they can see), when they are refreshed, and that they are never drawn for players.

### Modified Capabilities
- `portals`: "Players see the portals in front of them" says a player's state SHALL NOT contain plain walls; it changes to allow the clipped visible pieces defined by `visible-walls`.

## Impact

- `packages/shared/src/visibility.ts`: the `walls` projection in `filterStateForViewer` gains clipped plain-wall pieces; the wall event arms in `filterEventForViewer` resync when a change touches visible pieces.
- `packages/shared/src/sight.ts` / `geometry.ts`: segment clipping against fog and sight polygons.
- Clipped pieces need ids that don't reveal the hidden rest of a wall; the design settles this.
- `apps/web/src/board/boardView.ts`: keep drawing plain walls for the GM only.
- `docs/adr/`: a new ADR amending 0029.
- Tests: shared unit tests for clipping (fog, sight, both, partial walls), server integration tests that no unseen wall part reaches a player in snapshots, events, replays or reconnects.
- Interacts with the in-flight `dynamic-line-of-sight` and `wall-editing` changes; reconcile wall-visibility wording when they are archived.
