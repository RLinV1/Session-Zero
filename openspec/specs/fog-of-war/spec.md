# fog-of-war Specification

## Purpose
Lets the GM conceal rectangular or polygonal regions of the map to control exploration (FR-GM-17), with the guarantee that what is under fog never reaches players (FR-GM-23).

## Requirements

### Requirement: The GM adds and removes fog regions
The GM SHALL be able to add and remove fog from the board during play with a Fog tool on the board's tool rail, without opening a dialog or the map editor. The Fog tool SHALL offer three modes. In Rectangle mode the GM adds a rectangular region by dragging. In Polygon mode the GM adds a polygonal region by clicking its corners and closing it on the first corner or with Enter; Backspace SHALL drop the last corner, and Escape SHALL abandon an unfinished polygon. In Reveal mode the GM removes the topmost region under a click. Each completed gesture SHALL change the room immediately for everyone, with no separate save step. Players SHALL NOT be able to add or remove fog, and SHALL NOT see the Fog tool, not even disabled. While the GM is viewing the room as a player, the Fog tool SHALL send nothing. A region with no area SHALL be refused. A room SHALL hold at most 100 regions.

#### Scenario: GM fogs a room of the dungeon
- **WHEN** the GM picks Fog › Rectangle on the tool rail and drags a rectangle on the board
- **THEN** a fog region covering that rectangle appears for everyone with no dialog or save, and the activity log reads "<GM> added a fog rectangle"

#### Scenario: GM draws a polygon
- **WHEN** the GM, in Polygon mode, clicks five corners and then clicks the first corner again
- **THEN** a five-sided fog region is added

#### Scenario: Polygon closed from the keyboard
- **WHEN** the GM, in Polygon mode, clicks four corners, presses Backspace, and presses Enter
- **THEN** a three-sided fog region is added

#### Scenario: Abandon a polygon
- **WHEN** the GM, in Polygon mode, clicks two corners and presses Escape
- **THEN** nothing is sent and the corners are gone

#### Scenario: GM reveals a region during play
- **WHEN** the GM picks Fog › Reveal and clicks inside a fogged region
- **THEN** that region is removed for everyone and what it covered is sent to players

#### Scenario: Players have no Fog tool
- **WHEN** a player looks at the board's tool rail
- **THEN** there is no Fog button

#### Scenario: A player cannot add fog
- **WHEN** a player sends `fog.add`
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Degenerate region
- **WHEN** the GM sends a polygon whose points lie on one line
- **THEN** the server refuses it as invalid

### Requirement: Players see fog masked, the GM sees it semi-transparent
Players SHALL see each fog region as an opaque mask over the map and grid. In the GM's normal view, each region SHALL be drawn semi-transparent with an outline, so the map and every token under it stay visible, including while the GM uses the Fog tool. The GM SHALL see fog opaque, as players do, only in a player view: viewing the room as a player, or the map editor's Player view.

#### Scenario: Two views of one region
- **WHEN** a fog region covers part of the map
- **THEN** the player's board shows that part fully masked, and the GM's board shows it tinted with its edge outlined and the map and tokens under it visible

#### Scenario: GM checks the player's view
- **WHEN** the GM views the room as a player
- **THEN** fog is drawn fully opaque, exactly as that player sees it

### Requirement: Content under fog is not sent to players
A token whose centre lies inside a fog region SHALL NOT be sent to any player who does not own it, in snapshots, live events, REST responses or ephemeral relays. A shared area template SHALL NOT be sent to any player other than the one who placed it when no part of it on the map lies outside every fog region and, with line of sight on, inside that player's sight. A part off the edge of the map SHALL NOT count as visible. Whether any part is visible SHALL be decided from points sampled over the area (its corners or rim, its centre or apex, and an interior lattice), so a visible sliver narrower than the sample spacing can be missed and its area not sent. An area the check finds visible to the player SHALL be sent whole, wherever its origin lies. Attack rolls SHALL blank a side whose token is under fog, and the turn order SHALL leave such tokens out, as for hidden tokens. When fog is added or removed, a token moves into or out of fog, or an area becomes visible or stops being visible to a player, each affected player SHALL receive a filtered snapshot.

#### Scenario: Monster under fog
- **WHEN** a goblin stands inside a fog region
- **THEN** no player's state, event stream or drag preview contains the goblin

#### Scenario: Revealing a region
- **WHEN** the GM removes the region over the goblin
- **THEN** players receive a snapshot that contains the goblin

#### Scenario: A token walks into fog
- **WHEN** the GM moves a visible token into a fog region
- **THEN** players receive a snapshot without it, and never receive its new position

#### Scenario: Owners keep their tokens
- **WHEN** a player's own token is inside a fog region
- **THEN** that player still sees and can move it, and other players do not see it

#### Scenario: Area wholly in fog
- **WHEN** the GM places a 10 ft circle entirely inside a fog region
- **THEN** no player's state, event stream or aim preview contains the circle

#### Scenario: Area reaching out of fog
- **WHEN** the GM places a cone whose apex is in fog and whose far end reaches into lit ground
- **THEN** players receive the cone, and the activity log tells them the GM placed it

#### Scenario: Area past the edge of a fogged map
- **WHEN** the map is fogged to its edges and the GM places a cone that pokes past the map's edge
- **THEN** no player receives the cone

#### Scenario: Fog covers the last visible part
- **WHEN** the GM adds a fog region over the only part of a player's circle that another player could see
- **THEN** that other player receives a snapshot without the circle

### Requirement: Fog changes are undoable
Adding and removing a fog region SHALL be undoable by the GM from the activity log, so an accidental reveal can be reversed. Undoing a removal SHALL restore the same region.

#### Scenario: Undo an accidental reveal
- **WHEN** the GM removes a region by mistake and then undoes it
- **THEN** the region is back, and what it covered is withheld from players again

### Requirement: Fog works without a pointer
The GM SHALL be able to add and remove fog using only the keyboard, from a Fog of war section in the GM panel: fog the whole map, fog a block of grid cells given by column and row, and reveal any listed region. Each listed region SHALL be named by the cells it covers, and each result SHALL be announced to screen readers. The section sends the same `fog.add` and `fog.remove` commands as the board's Fog tool.

#### Scenario: Fog a block of cells by keyboard
- **WHEN** the GM types From column 3, From row 2, To column 12, To row 9 and presses Enter
- **THEN** a rectangle covering exactly those cells is fogged, and the list shows "Rectangle · columns 3–12, rows 2–9"

#### Scenario: Reveal by keyboard
- **WHEN** the GM presses Reveal on a listed region
- **THEN** the region is removed, the result is announced, and focus moves to the next region's Reveal button, or to the list summary if none is left

#### Scenario: No map yet
- **WHEN** the room has no battle map
- **THEN** the section says to set a map first and offers no fog controls

### Requirement: Fog takes its colours from the map
The board SHALL draw fog in shades derived from the current map image, with banks only slightly darker than that colour and mist only slightly lighter. When the map colour cannot be read, the board SHALL use a default blue-grey. The colour SHALL be the same over every part of the map, so fog reveals nothing about what lies under it.

#### Scenario: Fog on a coloured map
- **WHEN** a map with stone, moss and rock is shown with a fog region
- **THEN** the fog reads as haze in that map's tones, not as flat grey

#### Scenario: Map colour unreadable
- **WHEN** the browser will not let the map image be read
- **THEN** the fog uses the default blue-grey

### Requirement: The GM's fog outline is subtle
The GM's view SHALL outline each fog region with a thin line in the fog's own tone. It SHALL NOT draw a bright frame around the region.

#### Scenario: GM sees fog
- **WHEN** the GM's view shows a fog region
- **THEN** its edge is a thin line in the fog's tone and the fill meets it without a visible frame

### Requirement: Fog looks like mist
In the players' view, and for a GM viewing as a player, fog SHALL look like drifting mist: pale and cloudy, with borders that fade outward into the map over about one grid cell while keeping the region's straight edges and corners. It SHALL NOT look like a flat textured rectangle or end in a hard line. The fade SHALL lie outside the region, so fog hides everything inside the region up to its border.

#### Scenario: Region border
- **WHEN** a fog region is drawn
- **THEN** its border fades outward over about one grid cell, with no bright or dark rim and no visible frame

#### Scenario: Region interior
- **WHEN** a fog region covers part of the map
- **THEN** the map under it is not visible, and the fog reads as cloud rather than a flat grey fill

### Requirement: Areas are clipped at fog and sight for viewers who may not edit them
A viewer who may not edit a placed area SHALL see it drawn only where it lies outside every fog region and, when the room uses line of sight, inside that viewer's sight. For a player, these are areas other participants placed. Its fill and outline SHALL NOT be drawn under fog or out of sight. The area's owner and the GM SHALL see the whole area. A GM viewing as a player SHALL see it as that player does. Another participant's live aim or edit preview SHALL be clipped the same way. When fog is added or removed, or the viewer's sight changes, the visible part SHALL update without a reload.

#### Scenario: Cone into fog
- **WHEN** one player places a cone whose apex is in lit ground and whose far end reaches into a fog region
- **THEN** another player sees only the part of the cone outside the fog, and the placing player and the GM see the whole cone

#### Scenario: Cone out of fog
- **WHEN** the GM places a cone whose apex is inside a fog region and whose far end reaches into lit ground
- **THEN** players see only the part of the cone in lit ground

#### Scenario: Own area
- **WHEN** a player places a circle that reaches into fog
- **THEN** that player sees the whole circle

#### Scenario: Out of sight
- **WHEN** line of sight is on and another player's line runs from inside a player's sight past a wall into the dark
- **THEN** the player sees the line only up to the edge of their sight

#### Scenario: GM viewing as a player
- **WHEN** the GM views as a player while a cone reaches from lit ground into fog
- **THEN** the GM sees the cone clipped at the fog edge, as that player does, and sees it whole again on returning to the GM view

#### Scenario: Fog revealed
- **WHEN** the GM removes the fog region a circle reaches into
- **THEN** other players see the rest of the circle without reloading

#### Scenario: Aim preview into fog
- **WHEN** a player aims a line from lit ground into fog
- **THEN** other players see the dashed preview only up to the fog edge
