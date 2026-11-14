# Tasks

## 1. Contract and storage

- [x] 1.1 `packages/shared/src/build.ts`:
  - `BuildChoices.aiTerrain` and `BuildChoicesChange`;
  - `DraftMapSetup.terrain` and `terrainGrid`, and `DraftMapSetupChange.terrain`;
  - `changesWalls`, `draftTerrainProblems`, `normalizeTerrain`, `terrainTally`, `sameTerrainGrid`, `draftTerrainState` and `footprintOnBlocked`.
  
  In `terrain.ts`: `cellOverlapsMap` and `runOnMap`. Verified by `packages/shared/test/buildTerrain.test.ts`.
- [x] 1.2 Store the choice: the migration `20261113180000_build_terrain_choice` (`ai_terrain`, default false), the Prisma field, `BuildRecord.aiTerrain`, `setBuildChoices`, and the `requireAiTerrain` guard through `assertChoicesAllow` in both stores. Verified on memory and on Postgres (an isolated container, migrated from scratch) by `apps/server/test/buildTerrain.test.ts` ("the build store's terrain choice").

## 2. Setup tools and routes

- [x] 2.1 `PUT /api/builds/:id/choices`: an omitted `aiTerrain` keeps the stored value. Start-build takes `aiTerrain`, and a pass's `allowed` includes it.
- [x] 2.2 `PUT /api/build/:id/maps/:key/setup`:
  - authorized by the parts sent, with a mixed refusal writing nothing;
  - omitting terrain keeps it, `[]` clears it, a list replaces it;
  - runs normalized; `terrainGrid` recorded;
  - each part validated only when sent;
  - the guard rechecked in the write, and the turned-off choice named on a refusal.
- [x] 2.3 `GET .../setup` returns `terrain` (runs, squares, `proposedOn`, state), `terrainSquares`, `allowed.terrain` and terrain problems. `view_file`'s overlay draws terrain (`mapOverlay`).
- [x] 2.4 The owner's `PUT /api/builds/:id/maps/:key/setup` keeps, clears, or accepts terrain sent back unchanged, compared regardless of key order. It refuses painting, never takes the page's `terrainGrid`, and checks walls only when they changed.
- [x] 2.5 MCP: the `save_map_setup` `terrain` argument, the tool descriptions, the server instructions, and the field guide's `settingUpMaps.terrain` (format, cropped edges, grid, uncertainty, tokens).

## 3. Review, placement and publication

- [x] 3.1 `checkBuild`: terrain waiting for a grid, on another grid, or off the map, in the AI's words and the owner's; tokens on Blocked terrain. `draftEncounterToTemplate` refuses Blocked footprints.
- [x] 3.2 `planPublish`: terrain needs a confirmed grid and its own `terrainGrid`. The board's `terrain` is set beside the built walls, and a map without terrain is published as before.
- [x] 3.3 Web:
  - the terrain choice and preset, and the card label;
  - `MapTerrain` (counts, the other-grid notice, Clear all terrain);
  - `TerrainCells` in `GridOverlay` and the encounter board;
  - "Remove everything your AI set" also clears terrain.
- [x] 3.4 Tests:
  - `apps/server/test/buildTerrain.test.ts` and `mapOverlay.test.ts`: choices, authorization, mixed refusal, revocation mid-save, edited and published locks, omit, clear and replace, invalid, overlapping, oversized and off-map runs, cropped edges, corrected grids, owner clear and round-trip, view_file, publication to library, encounter and room, Blocked footprints, and publication atomicity;
  - `apps/mcp/test/buildTools.test.ts`: the real room server and MCP stack;
  - `apps/web/test/buildPage.test.tsx` and `libraryBuildsTab.test.tsx`;
  - existing expectations updated for the third choice.

## 4. Records and verification

- [x] 4.1 `docs/adr/0071-ai-build-terrain.md` (Proposed; Real-Time Architecture review pending) and `docs/AI-GAME-BUILDER.md`.
- [x] 4.2 `npm run lint`, `npm run typecheck` and `npm test` all pass. `npm run build` passes. The server suite passes on a fresh isolated Postgres. `openspec validate ai-build-terrain --strict` passes.
- [x] 4.3 Local end-to-end on the dev servers (room server with Postgres, MCP server, web), on alternate ports with local-disk uploads:
  - get_build, a curl upload, save_map with detection's grid, get_map_setup, save_map_setup terrain (a mixed save refused), view_file and check_build (a Blocked token reported);
  - then in the browser: review, Clear all terrain on a second map (the AI's later save refused), moving the token, publishing, and starting a room that shows the terrain.
- [ ] 4.4 Real-Time Architecture owner review of ADR 0071. Pending.
- [ ] 4.5 Real AI-client qualification through a connector (the Claude app, ChatGPT, Claude Code's own `claude mcp add`). Pending. The end-to-end run in 4.3 was driven by Claude Code (Opus 5.5) through a scripted MCP client: one session judging terrain from `view_file` pictures. It is not a qualification of model accuracy.
