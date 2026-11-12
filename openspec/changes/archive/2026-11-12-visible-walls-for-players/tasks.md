# Tasks

## 1. ADR

- [x] 1.1 Write `docs/adr/0056-visible-walls-for-players.md` amending ADR 0029 (design Decision 6), Status "Proposed — awaiting review by the Real-Time Architecture owner". Verify the file exists and the design links it.

## 2. Shared filter

- [x] 2.1 Add `wallPiecesForViewer` and `wallSeen` to `packages/shared/src/visibility.ts` using `visibleStretches` (design Decisions 1–2), and build a player's `walls` in `filterStateForViewer` from portals plus pieces. Verify with unit tests in `packages/shared/test/visibleWalls.test.ts` (FR-GM-23):
  - With no fog and line of sight off, all plain walls arrive.
  - A wall running into fog is cut at the fog edge.
  - With line of sight on, a wall behind another wall from every owned token is absent.
  - Under "Hide map from players without a token", no pieces arrive.
  - An open UVTT portal is not sent.
  - Pieces carry only `id`, `a` and `b`, with `seen:n` ids.
  - The GM's walls are unchanged.
- [x] 2.2 Change the `WallsAdded`, `WallsRemoved`, `WallUpdated` and `PortalChanged` arms of `filterEventForViewer` (design Decision 3). Verify with unit tests:
  - A wall drawn in view resyncs a player.
  - A wall drawn wholly under fog is redacted.
  - Removing a seen wall resyncs.
  - Turning a visible door into a plain wall resyncs.
  - A visible door opened in view still arrives live.
- [x] 2.3 Update `packages/shared/test/portals.test.ts` ("sends players portals outside fog and no plain walls") and any other test that expects players to hold no plain walls, to the new rule. Verify `npm test --workspace=@vtt/shared` passes.

## 3. Server

- [x] 3.1 Add `apps/server/test/visibleWalls.test.ts` over the wire:
  - A player's welcome holds the clipped pieces and no point of any wall inside fog.
  - Drawing a wall in view reaches them without reconnecting.
  - A wall drawn under fog reaches them only as a redacted step.
  - `/replay` frames carry no unseen part.
  - A player's path around a wall they can see is accepted, and one through it is never offered (`dragPlan` from their state).

  Then run the `visibility-auditor` agent on the diff and address its findings.
- [x] 3.2 Run `npm run test:bench --workspace=@vtt/server` and confirm the latency budgets still hold.

## 4. Web client

- [x] 4.1 Draw plain walls in `BoardView.syncWalls` only for the GM (design Decision 5). Verify with a unit test that a player's board draws no wall lines for pieces in their state, and in the browser that a player sees no wall lines while their drag routes around a visible wall.

## 5. Finish

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test` from the repo root and confirm all pass.
