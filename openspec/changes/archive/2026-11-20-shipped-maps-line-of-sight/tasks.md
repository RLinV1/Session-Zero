Implementation note: implement with Sonnet 5.5 subagents. After group 1, groups 2, 3 and 4 can run in parallel.

## 1. Catalog

- [x] 1.1 Add `walls?: StoredWall[]` to `ShippedMap`, the `shippedWalls/` data folder and `storedWallsFor(map)` (exact URL, width and height match); add a shared test that checks every stored wall set (inside the map, distinct ends, at most `MAX_WALLS`, parses as a detection result) and that `storedWallsFor` returns null for a size mismatch and for an uploaded map

## 2. Detection uses stored walls

- [x] 2.1 In the server `walls` service, return a finished detection built from stored walls for a plain Detect walls on a built-in map with stored walls, before the vision service and its availability check; verify with a server test that runs with no vision service: POST succeeds, status is done at once, `/walls` returns the stored walls with doors, and the room's walls are unchanged until `wall.add`
- [x] 2.2 Make the availability check per map (available for a built-in map with stored walls even when the vision service is down; unchanged for every other map) and keep Detect like this on the vision service; verify with server tests for both maps, with the service down
- [x] 2.3 Make the web Walls step use the per-map availability and show stored results in the usual preview (whatever preview path the client supports); verify with a web test of the availability call and with Playwright in 4.x

## 3. Sunken Crypt

- [x] 3.1 Write `apps/web/scripts/renderCryptMap.html` (one layout definition drawing the art and printing the walls); render `apps/web/public/img/map-crypt.webp` at 2800×1680 and verify it is top-down with no figures
- [x] 3.2 Save its walls as `packages/shared/src/shippedWalls/sunken-crypt.ts`, add the catalog entry (70 px grid, offset 0,0), and verify the catalog test and the grid scenario pass

## 4. Painted maps

- [x] 4.1 Trace walls and doors for Temple of the Green Sun; verify with a rendered overlay that each wall is within a quarter square of the art
- [x] 4.2 Same for Hollowfrost Keep
- [x] 4.3 Same for The Broken Span

## 5. Seeding

- [x] 5.1 Add migration 0017 (`shipped_maps_seeded text[]`, backfill) and per-map seeding in the Postgres and memory stores; verify store tests: Sunken Crypt seeded once for an old account, a deleted map not re-added, other rows untouched
- [x] 5.2 Amend ADR 0029 (stored walls) and ADR 0036 (per-map seeding)

## 6. Verify

- [x] 6.1 Run `npm run lint && npm run typecheck && npm test`
- [x] 6.2 Playwright demo with the vision service off: GM places Sunken Crypt, Detect walls fills the preview at once, Apply walls, Sight on; the player tab shows pillar shadows, hidden rooms behind doors and the window view; on an uploaded map Detect walls stays disabled; screenshots
