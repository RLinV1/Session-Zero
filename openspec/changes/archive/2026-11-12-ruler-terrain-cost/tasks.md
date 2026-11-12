> Superseded by `ruler-range-and-movement-modes`: task 3.2 checks a ruler that no longer exists (single-line terrain cost now lives in Movement mode), so it is closed by that change's browser check.

## 1. Shared
- [x] 1.1 Add `rulerPathCost` (pure, deterministic) to `movement.ts` with unit tests (FR-TAC-03)

## 2. Web
- [x] 2.1 `boardView.ts` measure mark uses filtered terrain for cost, difficult count and Blocked label

## 3. Verification
- [x] 3.1 `npm run lint && npm run typecheck && npm test`
- [ ] 3.2 Browser check of the ruler over painted terrain (not done)
