# Lantern Court

Open `/demos/apartments` (also linked in the home footer) to explore the fully isometric apartment lighting demo. Click an open street square, use arrow keys/WASD or the movement buttons, or start Walk demo. Rotation changes the camera without changing the world-space lighting. Time of day, torch height and foreground cutaways are adjustable.

The original courtyard follows the supplied visual reference: brick facades, warm lattice windows, cobblestones and striped market awnings. Buildings have actual heights in the lighting model; ray/box occlusion changes the ground and facade light as the torch moves or rises above roofs. A bounded pathfinder keeps the token out of solid buildings. The canvas scales for mobile and the controls remain available by touch.

The demo provides a reusable projection/occlusion model. It does not add building editing, interior navigation, or automatic conversion of flat map images into building geometry.

Room maps also support an isometric view. When first applying a map, choose **Flat** or **Isometric** alongside its grid settings. For an existing map, use **Edit map → Map → Map view**, then **Save changes**. The Sight step offers the same choice with an interactive preview. This projects the image, grid, tokens, fog and effects onto a diamond-shaped plane; movement, walls and visibility still use the original map coordinates. The choice is saved with the scene and shared with players. Library assets themselves do not store a view preference.

For editable building height, upload a top-down map or floor plan, select **Isometric**, then choose **Outline buildings and add height**. In **Buildings**, click each footprint corner and finish the outline. **Height preview** shows the raised, textured roof: drag it vertically, use its arrow keys, or enter a height in the grid's units. Apply the map, or save changes on an existing map. The Buildings step and height commands are available only in Isometric mode. Switching to Flat preserves the scene's outlines for later, while rendering the original flat map.

Building geometry stays with the room scene and is tied to the uploaded image. It supplies visual height; prepare Walls separately for movement, doors and sight. A building containing a token cuts away during play. A player receives no concealed building outlines; partially fogged or partly out-of-sight buildings are withheld until fully visible.

Geometry regression tests cover inverse projection at all camera rotations, height occlusion, changing torch sides and paths around buildings. Playwright MCP exercises the live demo at desktop/mobile sizes, including movement, walking, rotation, time, height and overflow checks.
