## Why

With line of sight on, the GM's board is always fully lit, so the GM cannot check what a token actually sees without using view-as-player on a participant.

## What Changes

- The GM's Show menu gains a "Token view" checkbox, shown only while line of sight is on.
- Checked, the GM's board shows dynamic lighting from the token the GM has selected: darkened outside that token's sight, using the same computation and mask players get.
- A chip "Token view: <token>" (or a hint "Select a token to see its view") with a clear button shows it is active.
- View-only in this browser: no command, no event, no shared or server change.

## Impact

`apps/web` only: `board/BoardFilters.tsx`, `board/Board.tsx`, new `board/gmSightView.ts`, styles. Spec: `board-view-filters`.
