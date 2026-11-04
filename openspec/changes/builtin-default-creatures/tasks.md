## 1. Implementation

- [x] 1.1 Add `BUILTIN_CREATURES` (4 creatures matching the shipped enemy token art, ids `builtin:<slug>`, art at `/img/tokens/enemies/<slug>.svg`) validated against `CreateCreatureRequest`
- [x] 1.2 Library Creatures tab: "Included with the app" section, round art portrait + HP/AC/attacks chips only (no actions: no Edit, Delete or Duplicate)
- [x] 1.3 Add token "From creature" picker lists the defaults after the GM's own

## 2. Tests

- [x] 2.1 Every default validates as a creature, HP <= Max HP, has an attack, unique ids/names
- [x] 2.2 Built-in card shows the art and shows the art and offers no actions

## 3. Verification

- [ ] 3.1 `npm run lint && npm run typecheck && npm test`
- [ ] 3.2 Browser check of the Creatures tab and Add token (Playwright)
