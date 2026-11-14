## Context

The home page demos are DOM and SVG built from the board's own pieces (`crops.ts`, `homeWalls.ts`, `sightDemo.ts`, `TokenChip`). The AI features are real: seats are described in `docs/AI-PLAYERS.md` (connector at `/mcp`, Share, Play with your AI) and drafts in `docs/AI-GAME-BUILDER.md` (AI builds in the library). Grid and wall detection are suggestions the GM previews in the map editor and applies or discards. `openspec/config.yaml` forbids tiered or paywalled features, which backs "free forever".

## Decisions

- **One new file, `DifferentiatorsSection.tsx`**, with two demos and two text tiles, in a 2-column grid (1 column on phones) in the required order.
- **Detection demo** draws the inn's plain walls (not doors or windows: the page does not claim door or window detection) the way `WallsPanel` does, dashed while suggested and solid once applied, with Apply and Discard buttons. After a choice, a "Detect again" button resets it.
- **AI seat demo** is a preview, labelled so: preset plain-language instructions move a token named Oswin (AI) on the goblin camp crop. No model runs. The token moves with a CSS transition only when motion is allowed.
- **No "plan" or "price" words.** The requirement to say usage counts against the GM's own AI app plan collides with "never mention a plan". The copy says "usage limits" instead. The inn map's alt text said "floor plan"; it now says "ground floor".
- **"MCP"** appears once, in parentheses. No other product is named; the repository link text is "View the source code".
- **Free fact first** in the facts row. `PING_TARGET_MS` and the benchmark-reading test go, since the page no longer states that figure.

## Risks

Hero height at 390x844: the heading carries "Free forever" so the claim is in the first screen even when the facts row falls below it.
