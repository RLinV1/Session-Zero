## 1. Evaluate

- [x] 1.1 Run the current detector and the auto-wall port on the three bundled maps, auto-wall's cave sample, and two inked maps; compare counts and overlays (design.md).

## 2. Implement

- [x] 2.1 `services/vision/outlines.py` from the port, importing the shared helpers from `walls.py`; check its output matches the port's.
- [x] 2.2 `walls.py`: `style == "outlined"` runs it; automatic detection falls back under 20 cells of wall.
- [x] 2.3 `WallStyle` gains `"outlined"`; ADR 0029 amendment; the worker accepts it; the Walls step offers it.
- [x] 2.4 `THIRD_PARTY_NOTICES.md` with auto-wall's MIT licence; the Dockerfile copies it and `outlines.py`.

## 3. Verify

- [x] 3.1 Python tests: the outlined style finds a synthetic inked map's diagonal walls; the fallback applies there and not on a stone map; the worker accepts the style.
- [x] 3.2 `npm run lint && npm run typecheck && npm test` and the vision tests.
- [x] 3.3 In the running app: Inked outlines on an uploaded inked map.
