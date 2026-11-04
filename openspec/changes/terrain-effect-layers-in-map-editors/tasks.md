## 1. Shared contract

- [ ] 1.1 Add optional `effectId` to `terrain.effect.create`; honour it in `decide` when unused
- [ ] 1.2 Write ADR in `docs/adr/` (next free number) amending ADR 0046
- [ ] 1.3 Unit tests in `packages/shared/test` (create with and without `effectId`, duplicate id falls back)

## 2. Web

- [ ] 2.1 `MapDraft.terrain` becomes `Terrain`; update `draftFrom`, `applyToDraft`, `draftCommandProblem`
- [ ] 2.2 Add `terrain.effect.*` to `DRAFT_COMMANDS` in `draftConnection.ts`
- [ ] 2.3 `planDraftSave`: per-layer create/rename/remove/paint diffs with fresh effect ids
- [ ] 2.4 `libraryBoardDraft.ts`: use `terrain.base` only
- [ ] 2.5 `TerrainSetup.tsx`: replace `live` gate with a layers prop; library editor passes false and shows a note (impeccable + design-taste-frontend)
- [ ] 2.6 Tests in `apps/web` for draft diff (FR IDs in `describe`)

## 3. Verify

- [ ] 3.1 Playwright: in a room's map editor add, rename, remove, paint a layer; save and reload
- [ ] 3.2 `npm run lint && npm run typecheck && npm test`
