# Lantern Court

Open `/demos/apartments` (also linked in the home footer) to explore the fully isometric apartment lighting demo. Click an open street square, use arrow keys/WASD or the movement buttons, or start Walk demo. Rotation changes the camera without changing the world-space lighting. Time of day, torch height and foreground cutaways are adjustable.

The original courtyard follows the supplied visual reference: brick facades, warm lattice windows, cobblestones and striped market awnings. Buildings have actual heights in the lighting model; ray/box occlusion changes the ground and facade light as the torch moves or rises above roofs. A bounded pathfinder keeps the token out of solid buildings. The canvas scales for mobile and the controls remain available by touch.

This branch provides a local rendering demo and reusable projection/occlusion model. It does not yet add building editing, room synchronization, persisted 2.5D maps, interior navigation, or automatic conversion of flat map images. Existing room maps are unchanged.

Geometry regression tests cover inverse projection at all camera rotations, height occlusion, changing torch sides and paths around buildings. Playwright MCP exercises the live demo at desktop/mobile sizes, including movement, walking, rotation, time, height and overflow checks.
