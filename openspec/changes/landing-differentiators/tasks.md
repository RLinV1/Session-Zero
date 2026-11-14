## 1. Copy

- [x] 1.1 Update hero and facts copy in `en/home.ts` and `zh-TW/home.ts`; add the `home.diff.*` keys; remove `home.facts.under` and `home.facts.ping`; change the inn map alt to avoid "plan".

## 2. UI

- [x] 2.1 Add `DifferentiatorsSection.tsx` (detection demo, AI seat preview demo, builder tile, open source tile) and styles in `styles.css`.
- [x] 2.2 Wire it as the first child of "Running a game" in `HomePage.tsx`; update `Hero.tsx` and `FactsRow.tsx` (drop `PING_TARGET_MS`).

## 3. Tests

- [x] 3.1 Update `homeFacts`, `homeHero`, `homePage`, `homeCopy`; add `homeDifferentiators.test.tsx` for the free text, item order, operable demos and forbidden words.
- [ ] 3.2 Orchestrator runs lint, typecheck and tests once, then checks both viewports for "Free forever".
