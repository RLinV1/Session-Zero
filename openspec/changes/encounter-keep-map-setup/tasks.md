## 1. Shared contract

- [x] 1.1 Add optional `keepMapSetup` to the `encounter.apply` schema in `packages/shared/src/commands.ts`
- [x] 1.2 In `decide.ts` `encounter.apply`: when set, reject `invalid` unless map (asset id, else URL) and grid geometry match; otherwise overlay the room's walls, fog, terrain and scene flags onto the applied table
- [x] 1.3 Add `docs/adr/0050-encounter-keep-map-setup.md`

## 2. Web

- [x] 2.1 Expose the template's map asset id and grid to the Encounter panel if `EncounterSummary` lacks them
- [x] 2.2 Show the "Keep this map's walls, fog, terrain and lighting" checkbox in the apply confirmation only when the room's map and grid are the template's; send `keepMapSetup` when checked

## 3. Tests

- [x] 3.1 `packages/shared/test/encounterApply.test.ts` (FR-GM-13): same map keeps setup; different map rejects; different grid rejects; undo restores
- [x] 3.2 `apps/server/test/encounters.test.ts` (FR-GM-13): keep flag over the wire, forged flag on a different map, player still gets a filtered resync
- [x] 3.3 Playwright check: option visible for same map, absent for different map
- [x] 3.4 Run `npm run lint && npm run typecheck && npm test` once
