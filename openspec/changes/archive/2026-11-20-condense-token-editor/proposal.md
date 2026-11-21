## Why

The token editor shows every field at once: name, board X/Y, size, rotation, image, HP/Max/AC, all conditions, owner and visibility. The GM has to scroll past fields they rarely touch to reach HP. The GM asked for a more condensed editor, with the rarely used fields in sections that start closed.

A token's name label on the board is a fixed 14px. On a large token or a fine grid it is too small to read. The label should scale with the token.

## What Changes

- The token editor keeps Name and HP/Max/AC always visible.
- Conditions, Control & visibility, and Advanced (board X/Y, size, rotation and image) move into collapsible sections that start closed.
- Fields and buttons inside a section share one column gutter so they line up.
- A closed section's header shows a short summary of its value (for example the condition count, or "Aria · hidden" for control and visibility) so the GM can read the state without opening it.
- The board draws a token's name label at a size proportional to the token's on-board radius, with a floor so small tokens stay readable.

## Capabilities

### New Capabilities
- `token-editor`: which token editor fields are always visible and which start collapsed.
- `token-labels`: how big a token's name label is drawn on the board.

### Modified Capabilities
- None.

## Impact

- `apps/web/src/panels/TokenRoster.tsx` (the token editor) and `apps/web/src/styles.css`, with a render test `apps/web/test/tokenEditor.test.tsx`.
- `apps/web/src/board/boardView.ts` and a new pure helper `apps/web/src/board/tokenLabel.ts`, with a unit test.
- No contract, server or schema change.
