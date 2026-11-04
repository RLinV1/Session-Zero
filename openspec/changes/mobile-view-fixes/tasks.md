## 1. Finish the audit

- [x] 1.1 With Playwright MCP at 390x844 and 360x740, check room tabs Tokens/Dice/Manage, scene setup and settings modals, join page, policy pages, apartments demo, and the map, animation and encounter editors; record each defect and verify the list is complete by listing every route in `router.ts` against the notes
- [x] 1.2 Check each route for `document.documentElement.scrollWidth <= innerWidth` and note failures, verified by a table of route and result

## 2. Library and shared tab strips

- [x] 2.1 Make the library `.tabs` strip scroll horizontally in its own container with no clipped label, and verify at 390px that all five tabs are reachable and "Token Art" stays on one line
- [x] 2.2 Check other `.tab`/`.tabs` users for the same clipping and verify with a screenshot at 360px

## 3. Room layout

- [x] 3.1 Give the board at least half the phone viewport height (`svh` with `vh` fallback) and verify the board is at least 420px tall at 390x844
- [x] 3.2 Rework the tool rail for max-width 760px as a horizontal strip over the board's bottom edge with flyouts above it, and verify it does not cover the empty-state "Choose a map" button and does not scroll internally
- [x] 3.3 Move the chat button clear of panel content and add bottom padding to the panel area, and verify the Area Effect panel heading is not covered after scrolling to the bottom
- [x] 3.4 Tidy the room header's two rows at phone width, and verify nothing wraps awkwardly or clips at 360px

## 4. Dialogs and remaining screens

- [x] 4.1 Cap shared `Modal` height to the viewport with an inner scroll and a fixed header, and verify the create-room and scene setup dialogs fit at 360x740
- [x] 4.2 Fix each defect found in task 1 for the join page, policy pages, editors and room tabs, and verify with a screenshot per screen

## 5. Verification

- [ ] 5.1 Re-run the Playwright sweep of every route at 360x740 and 390x844 and verify zero horizontal overflow and no overlapping controls
- [ ] 5.2 Re-check desktop at 1280x800 for the library, room and one modal and verify no visual regression
- [x] 5.3 Run `npm run lint && npm run typecheck && npm test` once and verify all pass
