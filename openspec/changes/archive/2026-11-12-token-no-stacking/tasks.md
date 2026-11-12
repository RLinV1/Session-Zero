# Tasks

## 1. Shared contract

- [x] 1.1 Add `footprintsOverlap`, `occupyingTokens` and `overlapsToken` to `packages/shared/src/geometry.ts` and refactor `spreadPositions` to use `footprintsOverlap` (design Decision 1). Verify with unit tests in a new `packages/shared/test/tokenStacking.test.ts` (FR-TAC-02): side-by-side and corner-touching don't overlap; Large over Medium does; an HP 0 token and an HP −3 token don't occupy; an HP `null` token does; `exceptId` excludes the token itself.
- [x] 1.2 Add `reject.squareOccupied` and `reject.noEmptySquare` to the shared rejection catalogs in en and zh-TW (design Decision 6). Verify the catalog parity test passes.

## 2. Decide

- [x] 2.1 Refuse `token.create` and `token.duplicate` with a `position` that overlaps an occupying token, hidden ones included, after the wall check (design Decision 4). Verify with `decide` tests: an occupied click is refused with "Another token is already there."; Alt (unsnapped) overlap is refused; a downed token's square is accepted; duplicating onto the original is refused.
- [x] 2.2 Make `createTokens` refuse with "There's no empty square nearby." when `spreadPositions` can't place every copy, instead of stacking on `origin`, and pass only occupying tokens to it. Verify with tests: 5 copies in a corridor with room for 3 are refused and nothing is created; 4 duplicates around a lone goblin still succeed (update `tokenDuplicate.test.ts` if any case relied on stacking).

## 3. Server

- [x] 3.1 Add an integration test in `apps/server/test` (e.g. `tokenStacking.test.ts`): a GM `token.create` on an occupied square is refused over the wire and no `TokenCreated` reaches either client; a player's `token.move` onto another token is still accepted (the server doesn't enforce the drag rule). Verify `npm test --workspace=@vtt/server` passes.

## 4. Web client

- [x] 4.1 Add `board.squareOccupied` to the web i18n catalogs (en, zh-TW). Verify lint (no literal UI text) passes.
- [x] 4.2 In `boardView.ts`'s drop handler, refuse a snapped (non-Alt) drop that `overlapsToken` with the viewer's held tokens before any slide or `moveToken` call: no slide back, end the previews, and call a new `dropRefused` callback that `Board.tsx` shows via the refusal notice (design Decision 2). Verify with a test in `apps/web/test` that a snapped drop onto another token sends no command, and that an Alt drop and an arrow-key move onto it do send one.
- [x] 4.3 Make `dragPlan` report `obstruction: "blocked"` for a non-free destination that overlaps a held token, including GM Reposition (design Decision 3). Verify with a `movementRuler` unit test: blocked over an ally, clear over a downed token, clear over a square where a token hidden from the player stands (absent from their state).
- [x] 4.4 Draw the placement ghost as blocked over an occupied square (design Decision 5). Verify in the browser: hovering a token while placing shows blocked, and clicking shows "Another token is already there." in the placement bar while staying in placing mode.

## 5. Wrap-up

- [x] 5.1 In the browser as a player: drag onto an ally (refused with notice), Alt-drag onto it (allowed), arrow-key onto it (allowed). As the GM: drag onto a 0-HP goblin (allowed).
- [ ] 5.2 Run the `visibility-auditor` agent on the diff (the drag check must use only the viewer's held tokens) and address its findings. Then run `npm run lint && npm run typecheck && npm test` and verify all pass.
