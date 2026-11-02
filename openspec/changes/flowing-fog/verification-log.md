# Verification log: flowing-fog

2026-10-29, on branch `fix/ui-audit-blockers` (uncommitted).

## Environment touched

- Isolated dev servers from `.claude/launch.json`: `server-isolated` (port 3101, in-memory store, `SEED_DEV_ACCOUNT=1`) and `web-isolated` (port 5273). The user's own servers on 3001 and 5173 were not touched. Both isolated servers were stopped afterwards; the in-memory store went with them.
- A scratch GM account, `fog-check-edcefc96@example.test`, signed up on the isolated server only, with a random password that was not kept. Room `b3032494-…` ("Fog check"), invite `xckvewvhrm`. Gone with the server.
- Setup script (scratchpad, not in the repo): signs up, creates the room, sets the map to `/img/hero-map.webp` (3344 x 1882) with 96 px cells, and adds three fog regions: a rectangle over the east half (1700,220)-(3344,1700), an L-shaped polygon in the south-west, and a triangle in the north.
- The built-in browser joined the room as the player "Fog Player".
- `localStorage['vtt.ui.settings']` in that browser was set to turn on reduced animations, then removed again (it had no value before).

## Steps and results

1. Unit tests written first (`fogEdge.test.ts`, `fogPuffs.test.ts`, palette tests in `fogPalette.test.ts`); they failed (missing modules, old palette), then passed once the code was in.
2. Player view, fitted: fog in all three regions, grey with a hint of the map, blending in. The L and the triangle are opaque inside; their 2-cell fade outside makes small regions look softer than before.
3. Console: one Pixi warning, "Attribute aUV is not present in the shader". **Fixed**: the quad now uses a plain `Geometry` with only `aPosition`. After reloading, the warning no longer appears. A "WebSocket closed before the connection is established" warning shows on every page load and is not from this change.
4. Network: `fog-bank.webp` and all 12 puff and wisp pictures loaded (200).
5. Particles: patched `ParticleContainerPipe.execute` for 0.6 s in the page to count. The container rendered 18 times, with 193 particles, the art loaded and sensible poses.
6. First look, zoomed in: the body looked like swirled marble, and puffs and wisps were too faint to see, so the border read as a straight line. **Tuned**: bank tile 12 to 16 cells, warp 0.55/0.8 to 0.3/0.45, softer density contrast, lighter and stronger puffs (body peak 0.35-0.6, edge 0.5-0.75, wisps 0.55-0.8), edge puffs every 0.9 cells, wisps every 1.8. After that the fog reads as soft mist, with puffs billowing past the edges.
7. Flow: two captures 3 s apart over the east region changed by a mean of 8.4 grey levels per pixel.
8. Performance: 4 s of animation in the browser pane gave no long tasks (PerformanceObserver `longtask`). Display frames ran at 120/s; the fog updates at the quality's 30 fps.
9. Reduced motion (app setting): two captures 3 s apart are identical (mean change 0.0), with the full look.
10. `npm run lint`, `npm run typecheck` and `npm test` all pass: web 949 tests, server 488 (41 skipped), latency benchmark 2.

## Follow-up: GM board corrupted after viewing as a player

Reported by the user with a screenshot: after "View as" a player and "Back to GM view", panning drew the board as stretched triangles over a white field.

1. Reproduced on the isolated servers (fresh in-memory store, new scratch account `fog-check-…@example.test`, random password not kept). Room on the jungle map with three fog regions, tokens `g1`, `1` and `hidden`, and a player `P`. The GM seat's test credential was put in the browser's localStorage for port 5273 only, and removed afterwards. View as P, then back to GM, then pan: broken. A fresh GM page that never viewed as P panned fine.
2. Narrowed with temporary switches, since removed:
   - Particles off: still broken.
   - Fog shader body off: still broken.
   - Whole mist off: fine.
   - Stencil mask removed (and the clip rectangle hidden): fine.
   So the cause was the Graphics stencil mask (`fogClip`) on the fog layer, which is hidden for the GM.
3. Fix: no mask. `layoutFogPuffs` now sizes every puff to stay on the board (new test "keeps every puff on the board, with no clip to cut it off there", which failed first).
4. Rechecked: view as P, back, pan, zoom, pan: correct. Three more cycles, then pan and zoom: correct. No new console errors (the old "WebSocket connection failed" entries came from stopping the servers earlier).
5. `npm run lint`, `npm run typecheck` and `npm test` pass: shared 720, server 488 (41 skipped), web 950, benchmark 2.
6. Cleanup: isolated servers stopped (their in-memory rooms and the scratch account went with them). Removed every `vtt.credentials.*` and `vtt.invite.*` key from the browser's localStorage for `localhost:5273`: this room's, plus 11 older seats from earlier test sessions on that isolated port. Those pointed at in-memory rooms that were already gone once that server restarted.

## Not checked

- The GM's flat-tint view in the browser. Its code path (`fogEdgeGraphics`) is unchanged and the GM never gets the mist layer, but no GM session was opened.
- WebGL 1 and low-end GPUs. Only the desktop app's browser pane (WebGL 2) was used.
- The "low" quality setting with a large, fully fogged map.

## Cleanup

- Isolated servers stopped; the setup script stopped; the browser setting removed. Nothing left on the user's servers or database.
