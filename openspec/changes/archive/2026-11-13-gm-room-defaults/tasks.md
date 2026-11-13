# Tasks

## 1. Contract (packages/shared)

- [ ] 1.1 Write `docs/adr/0066-gm-room-defaults.md` covering `RoomDefaults`, the optional `RoomCreated.defaults`, the preset precedence (design D1, D2) and the `room_defaults` column; get Real-Time Architecture owner sign-off. Verify the ADR file exists and is linked wherever `docs/DESIGN.md` lists ADRs.
- [x] 1.2 Add `RoomDefaults` (six rules + `unitsPerCell` + `unitLabel`, reusing `DefeatRemoval`, `DiagonalRule`, `DifficultTerrainMode` and `GridSpec` limits) and `BUILTIN_ROOM_DEFAULTS` to the protocol, and export them. Verify with unit tests in `packages/shared/test` that accept the built-ins and reject `"hex"`, `0`, `-5` and an empty or 13-character label.
- [x] 1.3 Add optional `defaults: RoomDefaults` to `RoomCreated` in `events.ts`, and in `reduce` copy the rules onto `RoomState` and the units onto `scene.grid`. Verify with reducer tests: a `RoomCreated` with defaults yields those rules and units; one without yields exactly today's state; an old event log replays unchanged.
- [x] 1.4 Confirm `filterEventForViewer` and `filterStateForViewer` pass the new fields to players unchanged (all public). Verify with a visibility test that a player's filtered `RoomCreated` keeps `defaults`.

## 2. Server (apps/server)

- [ ] 2.1 Add a Prisma migration for a nullable `room_defaults` JSONB column on `gm_identities`, and `getRoomDefaults`/`setRoomDefaults` on the memory and Postgres stores. Unparseable stored values read as `null` and are logged. Verify with store tests on both adapters, and that `npm run dev:db` migrates cleanly.
- [x] 2.2 Add `GET`/`PUT /api/gm/settings` (`requireAccount`, scoped to `account.user.ownerId`, zod-validated, catalog-id errors). Verify with integration tests: a round trip; GM B gets only their own (or built-in) defaults; no account → refused; a forged `"hex"` or `-5` → 400 and stored value unchanged.
- [x] 2.3 In `createRoomWithSeat`, read the creator's defaults and put them on `RoomCreated`. Use the saved units in place of the preset's for the starting grid, the encounter table and the prepared scene, and skip the preset `GridSet` when `defaults` carries units. Verify with integration tests that a new room and an encounter-template room start with the GM's rules and units and have no rule-change activity entries, and that a GM with no defaults gets exactly today's starting events.
- [x] 2.4 Verify changing defaults leaves existing rooms alone: an integration test creates a room, changes the defaults, reloads the room and finds its original rules.

## 3. Web (apps/web)

- [x] 3.1 Extract the Table tab's controls from `TableSection` in `SettingsMenu.tsx` into a component taking `value`/`onChange`, keeping the in-room tab sending `room.set*` per change. Verify the existing Table tab tests still pass and the tab looks and behaves as before.
- [x] 3.2 Add `getRoomDefaults`/`saveRoomDefaults` to `net/api.ts`. Verify with a unit test that a parse failure surfaces as an error.
- [x] 3.3 Add Room settings to `GmDashboardPage.tsx`: a header control opening a dialog with the shared rule controls, "Distance per square: [x] <label>", "Unit label", a note that the settings apply to new rooms, Save and Cancel. Show a sign-in message, with no request, when not signed in; on a refused save, keep the form and show the error; return focus to the control on close. Verify with component tests for each of these and the gm-dashboard scenarios.
- [x] 3.4 Make `LibraryMapEditor.tsx` fall back to `{ ...DEFAULT_GRID, unitsPerCell, unitLabel }` from the GM's defaults instead of `DEFAULT_GRID`. Verify with a test that an unconfigured map opens with the GM's units and a saved map keeps its own.
- [x] 3.5 Add en and zh-TW catalog entries for every new string, using `docs/GLOSSARY-zh-TW.md`. Verify `npm run lint` reports no literal UI text.

## 4. Verification

- [ ] 4.1 In the running app (`npm run dev:db`), save defaults on the dashboard, create a room and an encounter-template room, and check the Table tab, the ruler's units and the activity log; open an unconfigured library map's grid setup and check its units.
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and verify all pass.
