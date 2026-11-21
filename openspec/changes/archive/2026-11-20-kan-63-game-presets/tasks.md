## 1. Contract (packages/shared)

- [x] 1.1 Add `gamePresets.ts` (registry with `free`, `GamePresetId`, `DEFAULT_PRESET_ID`, `presetOf`) and export it; verify unit tests in `test/gamePresets.test.ts` cover registry order, unknown id rejection, and that a third registered preset is accepted by `GamePresetId`
- [x] 1.2 Add optional `preset` to `RoomCreated` and `CreateRoomRequest`, `RoomState.preset` (default `free`), reduce it; verify an old log without `preset` reduces to `free`
- [x] 1.3 Enforce features in `decide` (attack rolls, rulings, damage, attacks on tokens, conditions, AC) and strip disabled data in `encounter.apply`; verify one rejection test per command in Free Mode and that D&D rooms accept them as before
- [x] 1.4 Confirm `filterStateForViewer` passes `preset` to players (public); verify a visibility test

## 2. Server

- [x] 2.1 Create-room route: validate `preset`, put it in `RoomCreated`, append the preset's `GridSet` when it differs from the default grid; verify typecheck
- [x] 2.2 Include `preset` in the GM dashboard room summaries; verify typecheck
- [x] 2.3 Integration test (KAN-63): Free Mode room survives a reload with its preset; forged attack roll and condition are rejected; a D&D room created without `preset` behaves as before

## 3. Web

- [x] 3.1 Create room form: preset radio group from `GAME_PRESETS` with descriptions, D&D default, sent with the request (also from a template); verify a component test
- [x] 3.2 Hide attack section, rulings, conditions, AC and creature attack lists when the preset turns them off; verify component tests for a Free Mode state
- [x] 3.3 Preset badge in the room top bar and on dashboard room cards; verify a component test and phone-width layout

## 4. Docs and verification

- [x] 4.1 Write `docs/adr/0027-game-presets.md` and `docs/GAME_PRESETS.md` (how to add a preset: definition fields, features, grid defaults, tests to add); request Real-Time Architecture review
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [x] 4.3 Verify with Playwright: create a Free Mode room (badge shows, no attack section, no conditions/AC in the token editor, ruler in sq), reload and confirm it is still Free Mode; create a D&D room and confirm today's features; take screenshots
