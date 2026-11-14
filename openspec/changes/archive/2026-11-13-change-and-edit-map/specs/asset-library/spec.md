## ADDED Requirements

### Requirement: Save a room's map to the library
A GM with a library SHALL see Save to library in the header of the editor opened with Edit map, on every step. It SHALL be offered on the live board and while preparing a scene privately. It SHALL NOT be offered in a temporary template-editing room, to a GM without a library, or to players. The server SHALL build what it saves from the board the GM is editing, as the room holds it: its grid, every wall (including doors, windows and portals, with their open or closed state), its fog regions exactly as they are now, and its terrain. Extra terrain layers left over from older rooms SHALL NOT be saved, and SHALL NOT be warned about. Nothing the browser sends SHALL be saved in their place. Saving SHALL NOT change anything on the board or in its history, other than linking the map as described below.

When the room's map came from a map in the GM's own library that is not a built-in map, Save to library SHALL completely replace that library map's grid, walls, fog and terrain with the room's. Anything the library map had that the room doesn't SHALL be removed. Its image, name and size SHALL stay the same. Encounter templates already saved on that map SHALL NOT change.

When the room's map has no such library map (it was uploaded straight into the room, it is a built-in map, or its library map was deleted), Save to library SHALL create a new map in the GM's library from the room's image, at the image's size, with the room's grid, walls, fog and terrain. It SHALL be named after the scene, or after the built-in map for a built-in map. The new map SHALL count towards the GM's upload allowance, and when the allowance is full nothing SHALL be created and the GM SHALL be told why. The room's map SHALL then be linked to the new library map, so the next Save to library replaces it instead of creating another. Linking SHALL change nothing anyone sees on the board, and SHALL NOT be offered as an undo.

When the editor has unsaved changes (walls, fog, sight or terrain not yet saved, or grid edits not yet applied), pressing Save to library SHALL first warn that those changes are not saved, and offer Save changes first, Save to library without them, and Keep editing. Save changes first SHALL save them to the room and then save to the library. If saving them fails, the library SHALL NOT change. Save to library without them SHALL save the room's board as it was before those changes, and keep them unsaved in the editor. Keep editing SHALL save nothing.

On success the editor SHALL show "Saved to library". On failure it SHALL show why, and the library and the room's link SHALL be as they were.

The server MUST accept Save to library only from the room's GM. It MUST write only to a library map that GM owns.

#### Scenario: Overwrite the map it came from
- **WHEN** the room's map is "Goblin Cave" from the GM's library, the GM draws three walls and a fog region and saves them in Edit map, then presses Save to library
- **THEN** the library's "Goblin Cave" has exactly the room's grid, walls, fog and terrain, and placing it in another room brings the three walls and the fog region

#### Scenario: Complete replacement
- **WHEN** the library's "Goblin Cave" has a fog region the room no longer has, and the GM presses Save to library in the room
- **THEN** that fog region is gone from the library map

#### Scenario: Fog as it is now
- **WHEN** the GM has removed two fog regions during play and presses Save to library
- **THEN** the library map's fog matches the room's fog, without those two regions

#### Scenario: Map uploaded straight into the room
- **WHEN** the room's map was uploaded without saving to the library, and the GM presses Save to library in the scene "Crypt"
- **THEN** the library has a new map named "Crypt" with the room's image, grid, walls, fog and terrain, and the room's board looks the same to everyone

#### Scenario: The next save overwrites the copy
- **WHEN** the GM saves that map to the library, draws another wall, saves it in Edit map and presses Save to library again
- **THEN** the same library map now has the new wall, and no second copy is created

#### Scenario: Built-in map
- **WHEN** the room shows the built-in Hollowfrost Keep, the GM adds walls and presses Save to library
- **THEN** the GM's library gains a new map named "Hollowfrost Keep" with those walls, the built-in Hollowfrost Keep is unchanged, and later saves from this room replace the new map

#### Scenario: Unsaved walls
- **WHEN** the GM has drawn a wall in the Walls step without saving it and presses Save to library
- **THEN** the editor warns that the changes are not saved and offers Save changes first, Save to library without them and Keep editing

#### Scenario: Save changes first
- **WHEN** the GM chooses Save changes first in that warning
- **THEN** the wall is saved to the room and then to the library map

#### Scenario: Without them
- **WHEN** the GM chooses Save to library without them
- **THEN** the library map gets the room's walls without the unsaved wall, and the wall is still unsaved in the editor

#### Scenario: Allowance full
- **WHEN** the room's map has no library map and the GM's upload allowance is full
- **THEN** Save to library shows why, no library map is created, and the room's map stays unlinked

#### Scenario: Templates keep their walls
- **WHEN** an encounter template was saved on "Goblin Cave" and the GM saves new walls to "Goblin Cave" from a room
- **THEN** applying that template still brings the walls it was saved with

#### Scenario: Not offered
- **WHEN** a player views the room, a guest GM without a library opens Edit map, or the GM edits a template in a temporary template-editing room
- **THEN** no Save to library control is shown

#### Scenario: Forged request
- **WHEN** a player, or a GM of another room, sends a request to save this room's map to the library
- **THEN** it is rejected and no library map or room changes

### Requirement: Export a library map as UVTT
The map editor the GM opens from a library map in the GM dashboard SHALL offer Export .uvtt. It SHALL download the library map's image, saved grid, walls, doors, windows and portals as a UVTT file. It SHALL say that UVTT does not carry door or window identity or locks when the map has portals. It SHALL export the map as last saved, and SHALL be unavailable, with the reason shown, while the editor has unsaved changes. It SHALL be unavailable, with the reason shown, for a map with no saved grid. Only the map's owner SHALL be able to export it. Rooms SHALL NOT offer Export .uvtt.

#### Scenario: Export from the dashboard
- **WHEN** the GM opens "Goblin Cave" from the library in the GM dashboard and presses Export .uvtt
- **THEN** a .uvtt file downloads with the map image, its saved grid and its walls

#### Scenario: Round trip from a room
- **WHEN** the GM prepares walls in a room, presses Save to library, then exports that map from the dashboard
- **THEN** the exported file has the room's walls

#### Scenario: Unsaved changes in the library editor
- **WHEN** the GM has moved a wall in the library map editor without saving
- **THEN** Export .uvtt is unavailable and says to save first

#### Scenario: Someone else's map
- **WHEN** a request exports a library map the caller does not own
- **THEN** it is refused as not found and nothing is sent

## REMOVED Requirements

### Requirement: Save grid to library
**Reason**: Replaced by "Save a room's map to the library", which saves the grid together with walls, fog and terrain, and also works for maps that were not placed from the library.
**Migration**: Use Save to library in the Edit map header. The board's "Save grid to library" control is removed.
