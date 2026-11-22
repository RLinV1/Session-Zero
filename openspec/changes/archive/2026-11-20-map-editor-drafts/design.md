## Context

The map editor (`map-editor`, `map-editor-larger-view-and-fog`) sends `wall.*` and `fog.*` commands as the GM draws. The client never sees detected walls, only their count and a preview image, so a detection can only be applied whole with `wall.applyDetected`.

## Decisions

### D1. The draft lives in the editor, keyed to the map
The map section in `GmPanel` holds `{ mapUrl, walls, fog }`, copied from room state when the editor opens on an applied map. Draft walls keep their room id when they came from the room, and new ones get a local id prefixed `draft:`; the same for fog regions. Applying a new map resets the draft from the new room state.

### D2. Save is a diff, by geometry for walls and by id for fog
- Walls: a wall is identified by its endpoints, rounded to a tenth of a pixel, in either direction. Room walls whose geometry is not in the draft are removed; draft geometries not in the room are added. If the draft has no walls and the room has some, one `wall.clear`.
- Fog: matched the same way, by shape and corners. Draft regions not in the room are added; room regions not in the draft are removed. Matching by geometry, not id, means a saved draft agrees with the room again whatever ids the room gave.
- Order: fog adds, wall removes, wall adds, fog removes. Fog hides before it reveals.
- Batches: `wall.remove` at most `MAX_WALLS_PER_REMOVE`, `wall.add` at most `MAX_WALLS_PER_ADD` walls per command.
- Commands go one after another; the first refusal stops the save and is shown, and the draft is kept so the GM can retry. What already went through stays, each its own undoable action.
- The planner is a pure function, `planDraftSave(room, draft)`, unit-tested apart from the UI.

### D3. Detected walls are fetched, then edited
`GET /api/rooms/:roomId/wall-detection/walls?map=` (added alongside, for erasing detected walls on the preview) returns `{ walls: DetectedWall[] }` for the room's current map, GM only, 404 when there is no finished result. The editor drops the walls the GM erased on the preview (`exclude`) before loading the rest into the draft. These are the walls `wall.applyDetected` would commit, already validated by the server (`wallsFitMap`, `MAX_WALLS`). "Apply N walls" in the Walls step replaces the draft's walls with them; Save then sends them with `wall.add`. `wall.applyDetected` stays for other callers, but the editor no longer uses it.

### D4. Leaving asks
`requestClose` checks both drafts: the map/grid draft (the existing "Discard this map?") and the walls/fog draft. With unsaved walls or fog it asks **Save changes?** with Save, Discard and Keep editing. Save runs D2 and closes on success.

## Risks

- [A save is many commands] A 1,500-wall detection is 30 `wall.add` commands and 30 activity entries. Acceptable for setup; a single batch command would need an ADR of its own.
- [Room changes while editing] The diff is computed at save time against the room as it is then, so a change made elsewhere during editing is overwritten only where the draft differs from it.
