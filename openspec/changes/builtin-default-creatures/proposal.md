## Why

A new GM opens Add token's "From creature" list to find it empty and must hand-build every monster (FR-TAC-07). A starter set lets them place a usable encounter immediately.

## What Changes

- Four default creatures ship with the app, one per piece of shipped enemy token art (Goblin Guard, Goblin Spearman, Human Mage, Human Swordsman), with HP, AC, colour, two attacks each and that art as their token image.
- They live in a static web list (`apps/web/src/net/builtinCreatures.ts`), like built-in token art: not library rows, no owner, no server storage, no migration.
- The library's Creatures tab shows them under "Included with the app", read-only, as a round art portrait with HP/AC/attack chips and no actions; GMs place them from "From creature" in any room.
- "From creature" in Add token lists them after the GM's own creatures.

No change to shared schemas, the server, or room data. Creatures only reach the signed-in GM's library UI and Add token, so no visibility filter applies (invariant 3 is about room payloads).

## Impact

`apps/web` only: `net/builtinCreatures.ts`, `pages/LibraryCreatures.tsx`, `pages/LibraryPage.tsx`, `test/builtinCreatures.test.tsx`.
