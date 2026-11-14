## MODIFIED Requirements

### Requirement: Place a built-in in a room
The room's "From library" pickers for maps and token images SHALL list the GM's own assets first, then the built-ins. Placing a built-in map SHALL set the room's map at that map's own size and apply that map's own saved grid, including its cell size and offset. Choosing a built-in token image SHALL use it for the new token. The room SHALL record the image URL without a library asset id. Save to library on a built-in map SHALL save a new map in the GM's own library and SHALL NOT change the built-in.

#### Scenario: Built-in map
- **WHEN** the GM picks Hollowfrost Keep from "From library"
- **THEN** the room shows that map at 3269×1882 with a 70 px grid offset 47 px right and 46 px down

#### Scenario: Saving a built-in map
- **WHEN** the GM presses Save to library while the room shows Hollowfrost Keep
- **THEN** the GM's library gains a new map with the room's grid and walls, and the built-in Hollowfrost Keep that every GM sees is unchanged

#### Scenario: Built-in token portrait
- **WHEN** the GM adds a token using a built-in portrait
- **THEN** the token is drawn with that portrait, and the library usage index records nothing for it
