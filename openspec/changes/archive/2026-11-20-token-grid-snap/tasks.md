## 1. Shared

- [x] 1.1 Add `isSnapped` and `resizedTokenCenter` to `packages/shared/src/geometry.ts`.
- [x] 1.2 In `decide`, emit `TokenMoved` for snapped tokens on `scene.setGrid` / `scene.setMap` with a grid, and on size changes in `token.configure` / `token.setAppearance`.
- [x] 1.3 Unit tests in `packages/shared/test/tokenGridSnap.test.ts` (FR-TAC-02).

## 2. Verification

- [x] 2.1 Browser (Playwright MCP): place a token, change the grid in the GM panel, the token is centred in a cell; set a size-2 token to size 1, it lands in a cell.
- [x] 2.2 `npx openspec validate token-grid-snap`, then `npm run lint && npm run typecheck && npm test`.
