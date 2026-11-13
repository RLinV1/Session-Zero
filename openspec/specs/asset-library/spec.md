# asset-library Specification

## Purpose
Lets a GM store, browse and manage map and token art before a session, place it into rooms, and delete it safely, without revealing library details to players.

## Requirements

### Requirement: Library ownership and access
Every library asset SHALL belong to exactly one GM identity. All library endpoints SHALL be GM-only, and every one MUST authorize on the server. A GM MUST NOT be able to list, read metadata of, rename, re-grid or delete another GM's assets.

#### Scenario: Another GM's asset
- **WHEN** GM B requests rename, delete or usage for an asset owned by GM A
- **THEN** the server responds 404 and the asset is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a library endpoint carries only a room guest credential
- **THEN** the server responds 401

### Requirement: Upload to library
A GM SHALL be able to upload a PNG, JPEG or WebP image of up to 25 MB as either a map or a token, with a display name. The server SHALL record the image's pixel width and height. Stored object names MUST be random identifiers that do not contain the display name or original filename.

#### Scenario: Upload a map
- **WHEN** a GM uploads a 2048x1536 PNG named "Goblin Cave" as a map
- **THEN** the library lists a map "Goblin Cave" with size 2048x1536 and no saved grid, and opens grid setup

#### Scenario: Unsupported file
- **WHEN** a GM uploads a GIF or a file over 25 MB
- **THEN** the upload is rejected with a clear message and nothing is added to the library

#### Scenario: Object name reveals nothing
- **WHEN** a GM uploads "beholder.png" as a token named "Beholder"
- **THEN** the image URL contains neither "beholder" nor "Beholder"

### Requirement: Browse and search the library
The library page (`/library`) SHALL show the GM's library in separate Maps, Token Art and Creatures tabs. Maps and Token Art SHALL show the GM's assets as thumbnails with name and pixel size. Creatures SHALL show the GM's creatures as described in `library-creatures`. Each tab SHALL filter by a case-insensitive name search. The GM SHALL be able to rename an asset.

#### Scenario: Tabs separate kinds
- **WHEN** a GM with two maps, three pieces of token art and one creature opens the Token Art tab
- **THEN** exactly the three pieces of token art are shown

#### Scenario: Search by name
- **WHEN** the GM types "gob" in the search field on the Maps tab
- **THEN** only maps whose name contains "gob", case-insensitively, are shown

### Requirement: Map assets carry a grid
Map assets MAY store a grid definition: cell size, offsets, and units per cell with a label. New uploads SHALL start without saved grid metadata. Grid setup SHALL begin with the room default grid and persist metadata only when the GM saves, including when the saved values equal that default. In the library, the default grid's units per square and unit label SHALL be the GM's room defaults (see `gm-room-defaults`), or 5 and `ft` when the GM has saved none; its other values are unchanged. Token assets SHALL store only the image, its size and a name.

#### Scenario: Unconfigured map on upload
- **WHEN** a map is uploaded
- **THEN** its stored grid is empty and the shared setup editor opens with the default values

#### Scenario: Explicitly save the default grid
- **WHEN** the GM saves an unconfigured map's grid without changing the default values
- **THEN** the map stores that explicit grid and future placements reuse it without opening setup

#### Scenario: Grid setup uses the GM's units
- **WHEN** a GM whose room defaults are 1.5 per square and `m` opens grid setup for a library map that has no saved grid
- **THEN** "Units per square" shows 1.5 and the unit label shows `m`

#### Scenario: A saved grid keeps its units
- **WHEN** the same GM opens grid setup for a library map saved with 5 `ft`
- **THEN** the editor shows 5 and `ft`

### Requirement: Place a library asset in a room
In a room, the GM SHALL be able to set the map or add a token from their library as well as by uploading a new image. Placing a configured map SHALL set the room's map and **copy** the asset's grid into the room in a single undoable action. A successful placement or upload without saved grid metadata SHALL open the shared setup editor; the accepted room grid remains authoritative until Apply succeeds. Placing a token SHALL create a token that shows the asset's image. The room SHALL record which library asset each map or token came from.

#### Scenario: Map placement copies the grid
- **WHEN** the GM places library map "Goblin Cave" whose grid cell size is 64
- **THEN** the room's map is that image and the room's grid cell size is 64, committed together

#### Scenario: Undo map placement
- **WHEN** the GM undoes a library map placement
- **THEN** both the previous map and the previous grid are restored

#### Scenario: Later library edits do not change the room
- **WHEN** the GM changes the library grid of a map after placing it in a room
- **THEN** the room's grid is unchanged

### Requirement: Save grid to library
When the room's current map came from the GM's library, the GM SHALL be able to save the room's current grid back to that library asset. This happens only as an explicit action. Nothing in the room changes.

#### Scenario: Save a corrected grid
- **WHEN** the GM corrects the grid in a room and chooses "Save grid to library"
- **THEN** the library map's grid equals the room's grid, and later placements of that map use it

#### Scenario: Map not from the library
- **WHEN** the room's map was uploaded directly rather than placed from the library
- **THEN** "Save grid to library" is not offered

### Requirement: Edit a map's grid in the library
From the asset library, the GM SHALL be able to edit the grid of any map they own without opening a room. Rooms and the library SHALL use the same focused sample editor: click or tap A and then B at opposite corners of one square or a 3×3 or 5×5 sample, check the grid across the whole image, then select A to translate the sample or B to change spacing. Labeled A/B selection controls SHALL remain usable for small or overlapping samples. Hover previews SHALL remain inside the editor without updating the draft. Stationary releases within 6 CSS pixels SHALL place anchors; swipes SHALL pan, and two fingers SHALL pan and zoom without placing anchors. Pending A and completed samples SHALL survive blur, cancellation, zoom, pan, Fit map, and viewport resizing. Enter SHALL place A at the view center and confirm B after arrow adjustment. Start over SHALL clear placement while retaining the last valid draft, camera, sample count, units, and style. Changing sample count SHALL reinterpret the same bounds after validation. Numeric geometry edits SHALL invalidate anchors, while units and style edits SHALL preserve them. Placement and pointer resizing SHALL snap cell size to 0.5 image-pixel increments; holding Shift SHALL preserve freeform fractional placement. Anchor placement and adjustment SHALL also snap X/Y offsets to 0.5 image pixels, with Shift preserving freeform offsets. Offset snapping SHALL translate the whole sample to the nearest fitting grid phase while respecting image bounds and preserving spacing; converting a freeform sample MAY slightly shift A when resizing B. Zoom, pan, Fit map, touch, and keyboard adjustment SHALL be supported. Units per square and the unit label SHALL remain visible and editable; cell size, offsets, nudges, and line style SHALL be under Advanced. The editor SHALL offer the same draft validation in rooms and the library. It SHALL open with the map's saved grid, with the cell size raised to the smallest drawable size if the saved value is below it, or with the default grid when metadata is empty. Saving SHALL replace the library map's grid and preserve the original image dimensions. Cancelling or dismissing the editor SHALL leave the saved grid unchanged. Failed saves SHALL retain the editor and its draft for retry. Built-in example maps and token assets SHALL NOT offer grid editing.

The server MUST reject a saved grid whose cell size is too small for its lines to be drawn on that map at its stored pixel size, and MUST leave the stored grid unchanged. This is the same limit that applies to a room's grid.

Editing a library grid SHALL NOT change any room. It only affects later placements of the map.

During valid provisional placement or anchor repositioning, the Advanced cell-size and X/Y fields SHALL display the editor's live geometry, including snapping and Shift freeform input, without changing the confirmed draft, save eligibility, or sending a request. Confirmation SHALL update only the local draft; Save grid SHALL persist only confirmed values. Cancellation, capture loss, pointer departure, blur, navigation, resizing, Start over, and invalid previews SHALL restore confirmed values while preserving recoverable anchors. Numeric field or nudge focus SHALL clear the temporary preview and take precedence; hover or modifier changes SHALL NOT overwrite typed text, including incomplete or invalid values. Accessible help SHALL identify temporary preview values.

Normal B keyboard arrows SHALL change each cell by 0.5 image pixels at every sample count; Shift SHALL retain freeform 10-image-pixel sample-side steps. Advanced offsets SHALL match the grid and explain wrapping within one cell when resizing around A. Keyboard adjustment SHALL select the focused anchor. Enter from the map, an anchor handle or A/B control SHALL confirm a valid visible candidate or retain the latest keyboard adjustment, deselect the anchor and focus the map, without saving or resnapping confirmed freeform geometry. An invalid candidate SHALL keep selection for retry. Subsequent hover SHALL leave geometry unchanged until selection resumes; Save grid SHALL persist the confirmed keyboard-adjusted draft.

Pending B keyboard adjustment SHALL start from the visible candidate or the recoverable sample after interruption. Count changes SHALL preserve pending and completed sample bounds. Enter SHALL preserve exact pending keyboard/count geometry, including after Shift release and while Pan is enabled. Enter on a focused unselected handle or A/B control SHALL leave selection cleared and focus the map.

Replacing or reopening the editor SHALL reset its draft, anchors, error and save lock. A response from an obsolete editor MAY refresh the saved asset in the library list, but SHALL NOT close the current editor, display an error there, or change its save lock, including when the same asset is reopened.

#### Scenario: Upload replaces an editor during save
- **WHEN** a delayed upload opens setup while another map's grid save is pending
- **THEN** setup starts with its own editable default draft, and the old response cannot dismiss or unlock a subsequent save

#### Scenario: Reopen an asset before its old save responds
- **WHEN** the GM reopens the original asset after an upload replaced its pending editor
- **THEN** the obsolete response may update the library list but leaves the new editor and its draft intact

#### Scenario: Finish keyboard calibration in the library
- **WHEN** the GM adjusts B with arrows, presses Enter and moves the pointer toward Save grid
- **THEN** the anchor is deselected, the displayed spacing and offsets stay unchanged, no PATCH is sent until Save grid, and that request retains the keyboard-adjusted geometry

#### Scenario: Inspect temporary library geometry
- **WHEN** the GM places A or selects an anchor and previews new geometry
- **THEN** the Advanced fields match the editor preview without sending a PATCH request or changing any saved map or room grid

#### Scenario: Numeric focus clears library readouts
- **WHEN** the GM focuses and edits a geometry field during a provisional preview
- **THEN** the field first returns to the confirmed draft, keeps subsequent typed text despite map hover, and uses the existing validation and explicit Save grid path

#### Scenario: Edit and save a map's grid
- **WHEN** the GM opens Edit grid on their map "Goblin Cave", sets the cell size to 64 and saves
- **THEN** the library shows "Goblin Cave" with a 64 px grid, and no room was opened or changed

#### Scenario: Preview before saving
- **WHEN** the GM changes the offset in the editor without saving
- **THEN** the preview shows grid lines at the new offset over the map, and the library map's saved grid is unchanged

#### Scenario: Cancel discards the draft
- **WHEN** the GM changes the cell size and then cancels or dismisses the editor
- **THEN** the library map keeps its previous grid

#### Scenario: Invalid draft cannot be saved
- **WHEN** a field is blank, an offset is not less than the cell size, or the cell size is below the map's minimum drawable size
- **THEN** saving is disabled and the editor explains what to change

#### Scenario: Server rejects an undrawable grid
- **WHEN** a request saves a grid with cell size 0.1 to a 4000×3000 library map
- **THEN** the server responds 400 and the map's stored grid is unchanged

#### Scenario: No grid editing for built-in maps or tokens
- **WHEN** the GM views a built-in example map or any token in the library
- **THEN** no Edit grid action is offered

#### Scenario: Rooms keep their grid
- **WHEN** the GM edits the library grid of a map that is currently placed in room "Crypt"
- **THEN** the grid in "Crypt" is unchanged, and the next placement of that map in any room uses the edited grid

### Requirement: Warn before deleting an asset in use
An asset is **in use** when the current state of any room owned by its GM references it as the map or as a token's image. Hidden tokens count. Before deleting, the library SHALL show the names of the rooms using the asset and require confirmation. For token art, the confirmation SHALL also name the GM's creatures that use it as their image, and say that they will lose their image. An asset not in use by any room or creature SHALL still require a plain confirmation. Past references in a room's history do not count as in use.

#### Scenario: Deleting an asset in use
- **WHEN** the GM deletes a token asset used by tokens in rooms "Goblin Cave" and "Crypt"
- **THEN** a confirmation names both rooms and says they will show a generic token, and nothing is deleted until the GM confirms

#### Scenario: Deleting token art used by creatures
- **WHEN** the GM deletes token art used by the creatures "Goblin" and "Goblin Boss"
- **THEN** the confirmation names both creatures and says they will lose their image, and nothing is deleted until the GM confirms

#### Scenario: Reference removed from the board
- **WHEN** the only token using an asset is deleted from its room
- **THEN** the asset is no longer reported as in use by that room

#### Scenario: Confirmed deletion
- **WHEN** the GM confirms deletion
- **THEN** the asset disappears from the library and its image is no longer retrievable, rooms that referenced it fall back as described in `board-asset-fallback`, and creatures that used it have no image

### Requirement: Library details stay private
Library names, tags, the in-use listing, and the fact that an image comes from the library SHALL NOT be sent to player clients. Hidden tokens stay fully withheld from players under the existing visibility rules. A player MAY be able to load an image URL they already have. Nothing a player receives SHALL name the asset or reveal which assets a GM owns.

#### Scenario: Visible library token
- **WHEN** a player receives a visible token placed from the library
- **THEN** the token carries its image URL and an opaque asset identifier, but not the library name, and no endpoint available to the player resolves that identifier

#### Scenario: Hidden library token
- **WHEN** the GM places a hidden token from the library
- **THEN** players receive nothing about it, including its image URL and asset identifier

### Requirement: Browsing the library does not create an owner
Opening the asset library MUST NOT create a GM identity. A browser with no GM identity SHALL see an empty library and an invitation to upload, and SHALL make no request for its assets. The first upload SHALL create the GM identity, which then owns the uploaded asset.

#### Scenario: Browsing without an identity
- **WHEN** a browser with no GM token opens the asset library
- **THEN** an empty state and the upload action are shown, no request for library assets is made, no GM token is stored, and no identity is created on the server

#### Scenario: First upload creates the owner
- **WHEN** a browser with no GM token uploads a map to the library
- **THEN** a GM identity is created, the map is owned by it, and it is listed in the library afterwards
