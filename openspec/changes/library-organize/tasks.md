## 1. Contract and server

- [x] 1.1 `LibraryFolder`, `folder` on creature create/update, `BulkCreaturePatch`, `BulkUpdateCreaturesRequest`, `BulkDeleteCreaturesRequest`, `LibraryCreature.folder` in `packages/shared/src/protocol.ts`; ADR 0075
- [x] 1.2 Prisma `folder` columns and migration `20261117090000_library_folders`; `folder` on creature records in both stores
- [x] 1.3 `updateCreatures` (all or none, one transaction on Postgres) and `deleteCreatures` in `LibraryStore`, memory and Postgres
- [x] 1.4 `PATCH /api/library/creatures/bulk` and `POST /api/library/creatures/bulk-delete`, registered before `/:id`
- [x] 1.5 Published build creatures filed under the build name (`buildFolder`)
- [x] 1.6 Tests: `packages/shared/test/libraryFolders.test.ts`, `apps/server/test/creatureFolders.test.ts`, store cases in `libraryStore.test.ts`, folder on publish in `buildPublish.test.ts`, pass refusal on the bulk routes in `build.test.ts`
- [x] 1.7 Folders on every kind: `folder` on assets, templates and animations (schema, records, both stores, wire), `MoveToFolderRequest` and `POST /api/library/move-to-folder` with `moveToFolder` in both stores; publish files maps, art and templates under the build name; `apps/server/test/libraryFolders.test.ts`

## 2. Web

- [x] 2.1 `librarySort.ts` (locale-aware sort, per-tab preference) and `ui/selection.ts` (selection rules and hook)
- [x] 2.2 `LibraryListTools.tsx`: `ListBar`, `SelectableCard`, `SelectionBar`, `BulkDeleteDialog`
- [x] 2.3 `LibraryFolders.tsx` and `LibraryCreaturesTab.tsx`: folder chips and sections, New/Rename/Remove folder, Move to folder, bulk Edit, bulk Delete
- [x] 2.4 Sort and selection on Maps, Token Art and Encounters (`LibraryBulkDelete.tsx`), sort on Animations; Folder field in the creature form
- [x] 2.5 en and zh-TW catalog entries; glossary rows for folder, select and sort
- [x] 2.6 Styles: list bar, folder chips (one scrolling row on phones), card boxes, selection bar
- [x] 2.7 Tests: `apps/web/test/libraryOrganize.test.ts`, `apps/web/test/libraryCreaturesTab.test.tsx`
- [x] 2.8 One `FolderedList` for every tab (Maps, Token Art, Creatures, Encounters, Animations); uploads, new creatures and new animations go in the folder shown; animation bulk delete; `apps/web/test/libraryFolderedList.test.tsx`

## 3. Verification

- [x] 3.1 `npm run lint && npm run typecheck && npm test`
- [x] 3.2 Store tests on Postgres (scratch container)
- [x] 3.3 Browser check on an isolated server: see `verification-log.md`
- [ ] 3.4 Review by the Real-Time Architecture owner (ADR 0075)
