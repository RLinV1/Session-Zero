# ADR 0066: Editable building height in isometric scenes

**Status:** Proposed — architecture review required for the additive shared contract.

## Decision

The GM uploads a top-down map, selects Isometric during initial setup, outlines each building, and drags its textured roof upward. A numeric height field offers the same edit in the grid's distance units. Flat mode exposes no building editor and renders no raised geometry. Existing building data remains available if the GM switches back to Isometric.

`Scene.isometricBuildings?` contains a map URL and up to 100 named building footprints. A footprint has 3–32 map-pixel vertices and a height of 0.25–20 grid cells. Outlines must have a nonzero area, must not cross themselves, and must stay inside the active image. The map URL prevents geometry from being applied to a replacement image.

The strict GM-only command `scene.setBuildings { expectedMapUrl, buildings }` requires Isometric mode and the same active map. It emits `BuildingsSet { from, to }`. Both complete values are recorded for undo; the reducer alone changes persisted state. The command also participates in atomic map-preparation saves and private scene preparation. An editor draft stays local until Apply map or Save changes.

Rendering uses the existing map artwork as a clipped roof texture. Roofs move vertically in the isometric projection; shaded faces connect the footprint to its roof. The board camera includes the vertical extent when fitting the map. Buildings occupied by a visible token cut away so interiors remain playable. These are visual structures; movement, doors and sight continue to use the existing wall system.

## Player visibility

Players receive only buildings fully outside fog and fully contained in one of their sight polygons. Partially concealed buildings are withheld conservatively rather than exposing their hidden footprint. Dormant geometry and geometry in Flat mode are also withheld. Building and view changes resynchronize the filtered scene, so raw `from`/`to` outlines never reach a player.

## Compatibility and scope

The scene field is optional, so historical scenes and events continue to parse. Existing images, grids and board coordinates keep their current meanings. Library assets retain their existing schema: building geometry belongs to the room scene. This implements uploaded artwork plus manually outlined geometry; it does not infer editable height from pixels or introduce generated scene imports.
