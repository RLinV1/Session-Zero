## Why

The home page sells only what every virtual tabletop has: fog, walls, dice, templates and undo. What sets Session Zero apart is that it is free forever, suggests the grid and walls for a map, lets a GM's own AI app take a player seat, and lets that AI fill a private game draft. A visitor should meet those first.

## What Changes

- The hero heading and body lead with free forever, grid and wall suggestions, the GM's own AI app taking a player seat, and players joining from a link with no account.
- The facts row gains "Free forever: every feature, no paid tier" in place of the ping-latency fact. The ping figure and its benchmark-linked test are removed from the page.
- A differentiators section becomes the first section under "Running a game": grid and wall detection (operable demo: apply or discard), AI player seats (operable preview demo), the AI game builder (text tile) and open source (text tile, linking to the repository).
- Every AI item states that Session Zero does not run an AI itself, that use counts against the GM's own AI app's usage limits, and that a person is still the GM.
- English and zh-TW catalogs are updated; the unused ping keys are removed.

**Non-goals**: changing "Both paths in the first screen"; any price, trial, upgrade or paid tier wording; naming any other product.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `gm-home`: adds requirements for the free statement, the differentiating hero, the differentiators section and the accuracy of its claims.

## Impact

- `apps/web/src/pages/home/` (Hero, FactsRow, a new differentiators section), `HomePage.tsx`, both `home.ts` catalogs, `styles.css`, and the `home*` tests.
- No schema, server or shared changes. The user-accounts change edits "Both paths in the first screen"; this change does not touch that requirement.
