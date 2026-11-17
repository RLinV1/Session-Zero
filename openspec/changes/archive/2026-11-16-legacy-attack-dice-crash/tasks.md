# Tasks

## 1. Shared upgrade helper

- [x] 1.1 Add `upgradeStoredAttacks(value)` to `packages/shared/src/attackPresets.ts` (export it from `index.ts`). It upgrades `toHit` / `damage` in every token's `attacks` and in `TokenAttacksSet` `attacks` / `previous`, and returns the same reference when nothing changes. Verify with new cases in `packages/shared/test/tokenAttacks.test.ts` (`describe("… (FR-TAC-09)")`): an old `TokenCreated`, an old `TokenAttacksSet` with old `previous`, a saved-scene table holding tokens, a modern event returned by reference (`toBe`), and input left unmutated.
- [x] 1.2 Add a shared test that reduces an old-shape `TokenCreated` after `upgradeStoredAttacks` and checks that `attackDiceProblems`/`formatExpression` work on the resulting token's attacks (`1d20+4`). Verify with `npm test --workspace=@vtt/shared`.

## 2. Server read paths

- [x] 2.1 Pass each payload through `upgradeStoredAttacks` in `PostgresRoomStore.loadEvents` (`postgresRoomStore.ts:320`) and the first-event summary read (`:466`). Verify with a case in `apps/server/test/postgresStore.test.ts` that inserts a raw pre-ADR-0061 payload row and gets `terms` back from `loadEvents`. (Written; it runs only with `DATABASE_URL` set, which this machine lacks.)
- [x] 2.2 Pass the encounter template's `data` through `upgradeStoredAttacks` in the encounter mapper (`postgresRoomStore.ts:1541`) and the memory store's equivalent. Verify with a case in `apps/server/test/encounters.test.ts`: applying a template seeded with `{ count: 1, sides: 6, modifier: 2 }` damage commits an event whose token attack has `terms: [{ count: 1, sides: 6 }]`.
- [x] 2.3 Route `MemoryRoomStore.loadEvents` through the same helper, so tests can seed old-shape events. Verify with an integration test in `apps/server/test` (name includes "legacy attack dice"): a room seeded with an old `TokenCreated` loads, the GM's welcome snapshot carries `terms`, and rolling the attack via `dice.roll` with its formula succeeds.
- [x] 2.4 Undo an old `TokenAttacksSet` and check that the compensating event's `attacks` use the current shape. Verify with a test in the same file.
- [x] 2.5 List other `as unknown as` reads of stored JSON in `apps/server/src/store/` that skip parsing, as a note in this change's design.md (Risks). This records follow-up candidates only; no fix here.

## 3. Web resilience

- [x] 3.1 Make `presetsForToken` (`apps/web/src/panels/attackRoll.ts`) read each preset's `toHit` / `damage` through `readPool`, using `null` when unreadable. Verify with web unit tests: old shape gives `1d20+4`, garbage gives `null`, and `attackStats` / `presetSummary` don't throw.
- [x] 3.2 Check `AttackPanel.tsx`'s roll paths (`attackExpression(chosen.damage!)`, preset roll and damage follow-up) against a preset with `null` dice. Verify with a render test of the Attack section using a token with one old-shape and one unreadable attack: it renders, the old one shows its formula, and the unreadable one has no formula and no roll control.

## 4. Room failure screen

- [x] 4.1 Add `RouteErrorBoundary` (`apps/web/src/ui/RouteErrorBoundary.tsx`) and wrap the route element in `App.tsx`, keyed by the current path. The room fallback shows the failure screen (heading focused, Reload, Back to home, `console.error` log, no error details). Add text ids to the English and zh-TW catalogs per `docs/GLOSSARY-zh-TW.md`. Verify `npm run lint` passes with no literal UI text.
- [x] 4.2 Add a web test: a room child that throws shows the failure screen (no error text). Navigating to `/` afterwards renders the home page, and a different room id renders normally. Verify with `npm test --workspace=@vtt/web`.

## 5. Docs and checks

- [x] 5.1 Add an "Amendment: where old dice are upgraded" section to `docs/adr/0061-dice-pool-formulas.md` (load-time upgrade of events and encounter templates; writers from stored data emit the current shape). Flag it for the Real-Time Architecture owner's review. Verify the ADR file has the amendment.
- [x] 5.2 Re-run the scratchpad Playwright repro in WebKit against a room seeded with an old-shape attack: the GM view loads, View as a tokenless player then Back to GM view works, and Back from the room reaches the library. Then run `npm run lint && npm run typecheck && npm test`, and verify all pass.
