# Verification log: library-organize

Date: 2026-11-16. Branch `feat/library-organize`, worktree `.claude/worktrees/library-organize`, based on `origin/main` `8c4f82a1`.

## Environment touched

| What | Detail | Cleanup |
|---|---|---|
| Isolated server | `npm --prefix <worktree> run dev --workspace=@vtt/server`, `PORT=3311`, `SEED_DEV_ACCOUNT=1`, memory store | Stopped after the check |
| Isolated web | `npm --prefix <worktree> run dev --workspace=@vtt/web -- --port 5411`, `VTT_SERVER=http://127.0.0.1:3311` | Stopped after the check |
| Main checkout `.claude/launch.json` | Two temporary entries (`server-lib-organize`, `web-lib-organize`) to start the above | Removed by name once the servers were up; file byte-identical to its earlier copy |
| Account | Seeded dev account `t@gmail.com` (from `devAccount.ts`), memory store only | Gone with the server |
| Scratch Postgres | Docker container `libfolders-scratch-pg`, `127.0.0.1:55611`, database `vtt_scratch` | Removed (`docker rm -f`) |

The user's own servers (3001/5173) and `vtt-postgres-1` were not touched. Browser checks used `http://127.0.0.1:5411` (localhost cookies are shared across ports).

## Steps and results

1. Seeded 13 creatures through the API: 6 in "Cairnkeepers", 3 in "Lanternfall", 4 with no folder. **Pass:** list returned each folder.
2. Creatures tab: chips All 13, Cairnkeepers 6, Lanternfall 3, No folder 4, New folder; sections by folder; Newest first; Select. **Pass.**
3. Select, click "Ice-crawler Swarm", Shift-click "Tor Breck". **Fail, fixed:** only the first card was chosen. Cause: the Shift-click anchor was read inside the React state updater, which ran after the anchor moved. Fix in `ui/selection.ts` (read the anchor before `setSelected`); unit test added. **Re-run: pass**, 4 chosen.
4. Move to folder → A new folder "Frost Peaks". **Pass:** Frost Peaks 4, Cairnkeepers 2; the 4 stayed chosen.
5. Edit 4 creatures: placeholders "Mixed" for differing values; AC 12. **Pass:** all four AC 12, sizes and Max HP unchanged.
6. Escape stops selecting. **Pass.**
7. Lanternfall chip → folder view with Rename folder / Remove folder. Rename to "frost peaks". **Fail, fixed:** typed text did not reach the field; the native dialog focused its Close button because `autoFocus` runs before `showModal()`. Fix: dialogs pass the field to `Modal`'s `initialFocus`. **Re-run: pass**, merged into "Frost Peaks" (7), Lanternfall gone, view on Frost Peaks.
8. Sort Name A–Z. **Pass:** "Goblin 2" before "Goblin 10"; `localStorage["vtt.ui.librarySort"]` = `{"creature":"nameAsc"}`.
9. New folder "Bosses" with nothing chosen → select mode with "Choose the creatures to put in “Bosses”." → chose Ogre and The Cairn-Taker → Move to "Bosses". **Pass:** Bosses folder opened with 2.
10. New creature inside Bosses: Folder field "Bosses", suggestions Bosses, Cairnkeepers, Frost Peaks. **Pass.**
11. No folder view, choose Goblin 2 and Goblin 10, Delete: dialog "Delete 2 creatures?", names listed, Cancel focused; confirm. **Pass:** 11 creatures on the server.
12. Uploaded 3 token images through the API and linked one to "Storm Clock". Token Art: chose two, Delete: "Used by 1 creature: Storm Clock. It will lose its image." Confirmed. **Pass:** one image left.
13. Phone (375 px), dark, zh-TW. **Changed:** chips took three rows and the bar's close button a row of its own; chips now scroll in one row on phones and the close button sits by the count. No horizontal page scroll (scrollWidth 375). Text in Traditional Chinese throughout.

Screenshots in the pane lagged the DOM at times (known), so states were confirmed from the DOM.

## Automated

- `npm run lint && npm run typecheck && npm test`: pass. Shared 1898, MCP 271, server 1073 (59 Postgres-only skipped), web 1967, latency bench 2. Lint and web tests re-run after the last LibraryPage edit (sort bar above the empty-search message): pass.
- `DATABASE_URL=… vitest run test/libraryStore.test.ts test/postgresStore.test.ts` on the scratch Postgres: 92 passed, including the bulk store cases on Postgres.

## Second round: folders on every tab (2026-11-16)

Asked: "Why does creature only have the folder function, should allow all to have". Folders moved into one shared list component used by Maps, Token Art, Creatures, Encounters and Animations, with one server endpoint for filing any kind.

Same isolated setup as above (servers on 3311/5411 started from the worktree through two temporary `launch.json` entries, removed once up; file byte-identical afterwards). Fresh memory store, seeded with the same 13 creatures, 3 token images, 3 maps (uploaded from token portraits) and 2 animations.

1. Maps: chips All 3 and New folder, Sort, Select. New folder "Frost Peaks" → chose Ice Cave and Frozen Pass → Move to "Frost Peaks". **Pass:** chips All 3, Frost Peaks 2, No folder 1; folder view with Rename/Remove; "Included with the app" hidden in the folder view; `GET /api/library` shows both maps with folder "Frost Peaks".
2. Token Art: no "Frost Peaks" chip (its own folders). Chose two images → Move to folder → "A new folder" preselected and focused → Tab, typed "Cairnkeepers", Enter. **Pass:** server shows both images in "Cairnkeepers".
3. Animations: chose both → Move to a new folder "Spells". **Pass:** server shows both in "Spells". Then Delete → "Delete 2 animations?" naming both → confirmed. **Pass:** none left, empty state shown, selection closed.
4. Creatures after the refactor: chose Goblin 2 and Goblin 10 → Edit: placeholders 1, 7, 15 (shared values), focus on Size → AC 14. **Pass:** both AC 14 on the server.
5. A test found the New folder hint inside the field's label (it became part of the field's name). **Fixed:** the hint sits after the label as the field's description.

Not checked in the browser: Encounters (making a template needs a prepared room). Covered by `apps/server/test/libraryFolders.test.ts` (filing a template keeps its `updatedAt`) and by the shared list component the other tabs use.

### Automated

- `npm run lint && npm run typecheck && npm test`: pass. Shared 1900, MCP 271, server 1077 (60 Postgres-only skipped), web 1973, latency bench 2.
- Scratch Postgres (`libfolders-scratch-pg`, removed afterwards): `prisma migrate deploy` applied `20261117090000_library_folders`; `libraryStore.test.ts` and `postgresStore.test.ts` 94 passed, including `moveToFolder` on Postgres.


## Dev database migrated by the earlier draft (2026-11-16)

The user's own `npm run dev:db` in the worktree (22:56) applied the first draft's migration, `20261117090000_creature_folders` (creature column only), to their dev Postgres. The migration was later renamed to `20261117090000_library_folders` and widened to four tables, so that database had `folder` on `library_creatures` only (checked read-only), and rerunning `dev:db` would have failed on the existing column. Fix: the migration uses `ADD COLUMN IF NOT EXISTS`. Replayed on a scratch Postgres: old migration, then this branch (adds the three missing columns), again (no-op), then `origin/main`'s migrations (no-op, no error). Fresh database: applies, store tests 94 passed. The user's database was not changed by me; its stale `_creature_folders` row is harmless to `migrate deploy`.
