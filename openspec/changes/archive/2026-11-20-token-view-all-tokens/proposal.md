## Why
Token view (gm-token-sight-view) showed nothing until a token was clicked. The GM wants the Show-menu filter to show everything every token sees, and a per-token view from the token card.

## What Changes
- Show-menu "Token view" on: the board shows the union of every token's sight on the map (hidden tokens included; GM only, view-only). The "Select a token to see its view" pill and the "Shift-click to add tokens" hint are removed. With no tokens on the map the pill reads "No tokens on the map to see through".
- Clicking a token only opens its card; it no longer changes which sight is shown. Shift-click keeps building the Area Effect group.
- The token card has an eye button ("View as <name>" / "Stop viewing as <name>", aria-pressed) that narrows Token view to that token. Eye again or closing the card returns to all tokens; if the eye alone turned Token view on, it turns Token view off instead.
- Token card: Edit becomes an icon button; the caption under "Move with arrow keys" is removed.
