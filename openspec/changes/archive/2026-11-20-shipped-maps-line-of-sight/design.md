## Context

See proposal.md for motivation and specs/ for the requirements.

Current state:

- `packages/shared/src/shippedMaps.ts` holds the shipped catalog (`slug, name, url, width, height, grid`). The web client lists it as `builtin:<slug>` assets, and a room records a built-in map by URL with no asset id.
- Room wall detection (ADR 0029, ADR 0038) lives behind a server `walls` service used by `apps/server/src/http/routes.ts`: `POST /api/rooms/:roomId/wall-detection` starts a job (refused with 503 when `walls.available` is false), `GET .../wall-detection` returns status, `GET .../wall-detection/walls` returns `DetectedWallsResponse`, and `GET .../wall-detection/preview` returns a preview image. The web Walls step (`apps/web/src/pages/mapEditor/WallSetup.tsx`) enables Detect walls only when an availability check says `available`, shows the detected walls for review, and Apply walls sends the room's existing `wall.*` commands.
- ADR 0036 seeds each account with library rows for the shipped maps once per account (`gm_identities.shipped_maps_seeded_at`).

## Goals / Non-Goals

**Goals:**
- Stored walls reach a room only through Detect walls → review → Apply walls, so every existing check, undo entry and GM-only rule is reused.
- Stored walls are used only for the exact built-in map they belong to.
- Detection for built-in maps with stored walls works without the vision service; every other map keeps today's behaviour, including being unavailable when the service is down.

**Non-Goals:**
- Applying walls on map placement.
- Stored walls in the library map editor (detection stays room-scoped).
- Detect like this (sampled detection) for built-in maps; it keeps using the vision service.

## Decisions

### 1. Stored walls live in the shared catalog

`ShippedMap` gains `walls?: StoredWall[]`, where `StoredWall` is the same shape a detection result carries for one wall (`a`, `b`, optional `portal`). Each map's walls are a data module, `packages/shared/src/shippedWalls/<slug>.ts`. `storedWallsFor(map: { url, width, height })` returns the walls only when the URL names a shipped map and the width and height match exactly, otherwise `null`. A shared test checks every stored wall set: inside its map, two distinct ends, at most `MAX_WALLS`, and parses as a detection result.

*Alternative:* store walls on seeded library rows. Rejected: built-in maps are placed by URL without a row, and rows can be deleted.

### 2. The detection service short-circuits for stored walls

The server's `walls` service gets one entry point that checks stored walls first:

- `start(roomId, map, cell, request)`: if the request is a plain Detect walls (no `sample`) and `storedWallsFor(map)` is non-null, record a finished detection for `(roomId, map.url)` immediately, built from the stored walls, and return its status. Otherwise run the existing vision path unchanged.
- `status`, `detectedWalls` and `result` read that finished record like any other.
- The preview image for a stored result is the map image itself with the walls drawn by the client, so no image is produced on the server: the preview endpoint returns 404 for stored results and the web client already draws the detected walls as an overlay. If the Walls step requires the preview image, the server instead redirects to the map's own `/img/...` URL. The implementer picks whichever the client already supports and covers it with a test.
- Confidence values (ADR 0038) are set to the top of the scale, so stored walls are never pre-hidden by the confidence filter.

The `POST` route's `walls.available` 503 check moves after the stored-walls check, so a built-in map with stored walls is served even when the vision service is down.

### 3. Availability is per map

The availability check the Walls step calls takes the room's current map (it already knows the room). It answers available when the vision service is available, or when `storedWallsFor(currentMap)` is non-null, with no reason text in that case. For every other map it reports exactly what it reports today. The web client needs no logic beyond passing the room; `canDetect` already follows the answer. Detect like this keeps checking the vision service only.

### 4. The Sunken Crypt map

Slug `sunken-crypt`, name "Sunken Crypt", image `/img/map-crypt.webp`, 2800×1680 px, 70 px grid at offset (0, 0) (40×24 squares). It is rendered once from one layout definition by a committed script (`apps/web/scripts/renderCryptMap.html`, opened in a browser, saved with `canvas.toBlob("image/webp")`), which also prints the walls for `shippedWalls/sunken-crypt.ts`, so art and walls cannot drift. Layout: an entry hall with four pillars, a corridor with a closed door into a pillared chapel, a side vault behind a locked door, a guard room seen through a window, and a gallery whose bend hides its far end. Top-down, flat stone tones, grid-aligned walls, no figures, as the built-in rules require.

### 5. Tracing the painted maps

Walls for The Broken Span, Hollowfrost Keep and Temple of the Green Sun are traced in board coordinates. Where the vision service can run locally, its output is the starting point; otherwise they are traced by hand from the image. Each set is then checked by drawing it over the image and fixing every wall more than a quarter square off. Doorways become closed doors; open archways get no wall.

### 6. Per-map seeding

Migration 0017 adds `gm_identities.shipped_maps_seeded text[] not null default '{}'` and backfills the three original slugs for every row whose `shipped_maps_seeded_at` is set. Seeding inserts rows only for catalog slugs not yet in the list and appends them, in one transaction. Deleting a row never removes its slug, so a deleted map stays deleted. The memory store mirrors this with a per-owner set. `shipped_maps_seeded_at` is still set on first seeding.

### 7. ADRs

ADR 0029 gets an amendment for decisions 2 and 3 (stored walls bypass the vision service for built-in maps). ADR 0036 gets one for decision 6.

## Risks / Trade-offs

- [Hand-traced walls on painted art are approximate] → The quarter-square bar is checked with a rendered overlay per map, and the GM still reviews and can erase walls before applying. Stored walls are GM-only data like any detected walls.
- [A stored result could be mistaken for a vision result] → Stored results reuse the same status shape. The spec only promises the walls, and the preview shows them the same way.
- [Catalog wall data grows the shared package] → A few KB per map. Only the server and the shared test import `shippedWalls/`; the web client never needs the data.
- [Rate limits] → The existing per-room detection limit still applies to stored results, which keeps the endpoint's behaviour uniform.

## Migration Plan

Deploy the migration with the code. Rollback: old code ignores `shipped_maps_seeded` and stored walls; the extra Sunken Crypt library row is harmless.
