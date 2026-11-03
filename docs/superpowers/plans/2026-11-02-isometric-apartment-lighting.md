# Isometric apartment lighting
Build a playable isometric apartment courtyard matching the supplied raised-brick, warm-window reference. Reuse the tabletop palette and UI controls. Keep the new projection/height occlusion model isolated from the existing top-down room renderer.

1. Add pure isometric projection, ray/height occlusion and collision-aware pathfinding, with tests.
2. Add an original apartment/market scene and a reusable canvas renderer. Torch position/height, sun direction and building cutaways respond to movement.
3. Add a discoverable demo route with keyboard, pointer and touch controls, plus a guided walk and reduced-motion-aware behavior.
4. Verify geometry, route/theme integration, types/build and actual Playwright MCP screenshots/video.

This branch provides a working isometric lighting demo and reusable rendering model. Existing room uploads remain top-down; converting arbitrary raster maps into 3D building geometry is not inferred or attempted.
