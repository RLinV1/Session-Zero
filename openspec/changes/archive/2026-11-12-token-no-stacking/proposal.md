# Proposal

## Why

Nothing stops two tokens from ending up on the same square. A snapped drag that lands on another creature, or a new token placed on an occupied square, stacks them. That hides one token under the other and makes clicks and turn order confusing (FR-TAC-02). Free placement and arrow-key nudges are deliberate, so they should still be allowed to overlap.

## What Changes

- **Snapped drag:** dropping a token (including a GM Reposition) where its squares would overlap another token's squares is refused in the browser. The drag ghost shows the square as blocked, no command is sent, and the token stays on its square, without sliding back, with a short notice. Alt-drag (free placement), arrow keys and the on-screen move pad are unchanged.
- **New tokens:** the server refuses `token.create` and `token.duplicate` at a position whose squares overlap another token, for click, keyboard and Alt placement alike. The placement ghost shows an occupied square as blocked. When several copies are spread out (a `count` above 1, or Duplicate with no square), they go only on empty squares; if there aren't enough, the command is refused instead of stacking the rest on the first square.
- **What "occupied" means:** another token whose square or squares overlap the token's own. Sharing an edge or corner isn't overlap. Tokens with HP 0 or below don't occupy their square. The moving token never blocks itself. Only the destination counts; paths may pass through other tokens.
- The drag check only uses tokens the viewer's client holds. Hidden and fogged tokens never block a player's drop, and a player can't tell an enemy is down when the room hides HP, so it still blocks them.
- **Behavior change, no schema change:** placement that used to succeed on an occupied square is now refused.

## Capabilities

### New Capabilities
- `token-no-stacking`: when a snapped drag or a new token may share squares with another token.

### Modified Capabilities
- `token-placement`: "The GM chooses a new token's square on the board": an occupied square is shown blocked and refused, including with Alt.
- `token-duplication`: "GM duplicates a token": copies go on empty squares only, and a request that can't fit them all is refused.

## Impact

- `packages/shared`: an occupancy helper in `geometry.ts`; `decide.ts` (`token.create`, `token.duplicate`, `createTokens`); `spreadPositions` (skip downed tokens; report when it runs out); two new rejection catalog entries (en, zh-TW).
- `apps/web`: `board/boardView.ts` (drop handler, drag preview, placement ghost), `board/movementRuler.ts` (`dragPlan` obstruction), `board/Board.tsx` (notice), new `t()` strings (en, zh-TW).
- Tests in `packages/shared/test`, `apps/server/test`, `apps/web/test`.
- Not covered: encounter templates, the AI builder and library-board placement, which use their own stored positions; undo restoring a token onto a now-occupied square; AI seats (MCP) moving tokens, which send `token.move` directly and so skip the client-only drag rule.
