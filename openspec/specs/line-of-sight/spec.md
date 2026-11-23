# line-of-sight Specification

## Purpose
TBD - created by archiving change map-editor-sight-step. Update Purpose after archive.

## Requirements

### Requirement: The room can limit how far tokens see
The GM SHALL be able to set the room's sight range to Unlimited or to a positive distance in the grid's units, at most 1000 squares' worth. A new room and a room whose history predates this feature SHALL be Unlimited. With a range set and line of sight on, a player's sight from each owned token SHALL extend no further than that distance from the token's centre, as well as stopping at walls, closed or locked doors, fog edges and the map edge. Content beyond the range SHALL be withheld from players exactly as content outside sight is. The distance SHALL be converted to board pixels from the room's grid (cell size and units per cell), so a later grid change keeps the same distance in feet. Players SHALL NOT be able to change the range. Setting the range it already has SHALL be refused. Each change SHALL be one undoable action, SHALL appear in the activity log, and every player SHALL receive a fresh filtered state.

#### Scenario: Torchlight
- **WHEN** the range is 30 ft on a 5 ft grid and a goblin stands 40 ft from the player's only token in an open hall
- **THEN** the goblin is not sent to the player, and the player's board is dark beyond 30 ft

#### Scenario: Walls still block
- **WHEN** the range is 60 ft and a goblin is 20 ft away behind a wall
- **THEN** the goblin is not sent to the player

#### Scenario: Unlimited
- **WHEN** the GM sets the range back to Unlimited
- **THEN** sight again reaches the walls and the map edge

#### Scenario: A player cannot change it
- **WHEN** a player sends the command to set the sight range
- **THEN** the server refuses it as forbidden

### Requirement: Sight follows walls as drawn, wherever they cross or overlap
With line of sight on, a player's sight from each owned token SHALL be exactly the area reachable from the token's centre without crossing any blocking line: plain walls, closed or locked doors, and the outer edge of the fogged area (see "A token in fog sees only the fog around it"). This SHALL hold however the blocking lines are drawn: lines that cross part-way along their length, a line ending on the middle of another, exact or reversed duplicates, lines that partly overlap on the same line, a door drawn on top of a plain wall, and lines a fraction of a pixel apart. No visible point SHALL be darkened or withheld because two lines cross, and no point behind a blocking line SHALL be revealed through a gap where lines meet or overlap. Zero-length lines SHALL have no effect. Sight SHALL NOT reveal the position or direction of any wall end or crossing the token cannot see. Players, the GM's view as a player, the map editor's Sight step and the AI seat's map image SHALL all show the same sight for the same room.

#### Scenario: A door overshoots one corridor wall
- **WHEN** a closed door sits inside a corridor mouth, its upper end on the top corridor wall and its lower end 6 px past the bottom corridor wall, and the player's token stands one cell in front of the doorway
- **THEN** the doorway floor up to the door is lit with no slanted dark wedge, and a goblin standing in that doorway is sent to the player

#### Scenario: A door overshoots both corridor walls
- **WHEN** a closed door runs 5 px past both corridor walls and the player's token stands one cell in front of the doorway
- **THEN** the doorway floor up to the door is lit, and the area beyond the door stays dark

#### Scenario: Walls lying on top of each other
- **WHEN** a corridor wall is drawn twice, once in each direction, and a second wall partly overlaps it on the same line
- **THEN** the player's sight is the same as with the corridor wall drawn once, and nothing behind it is lit

#### Scenario: A door drawn over a plain wall
- **WHEN** a closed door is drawn on top of a longer plain wall
- **THEN** sight stops at that line, with no gap at the door's ends and no false shadow beside them

#### Scenario: Walls a fraction of a pixel apart
- **WHEN** two parallel walls 0.01 px apart both cross a closed door
- **THEN** the floor in front of the door is lit as if only one of those walls were drawn

#### Scenario: A fog edge crossing a wall
- **WHEN** a fog region's edge crosses a wall in front of a player's token, and the token stands outside that fog region
- **THEN** the floor in front of both is lit up to where either one blocks, with no dark wedge from their crossing

#### Scenario: A crossing behind a wall stays hidden
- **WHEN** two walls cross in a room the player's token cannot see into
- **THEN** the player's sight is the same as if those walls did not cross, and reveals nothing about where they meet

### Requirement: A token in fog sees only the fog around it
With line of sight on, a token whose centre is in fog (inside a fog region, or within 1 board pixel of a fog region's edge) SHALL see only the fogged area around it. That area is the part of the union of all fog regions the token can reach without crossing a wall, a closed or locked door, or the fogged area's outer edge. Edges where fog regions overlap or share a border SHALL NOT block sight. The player's board SHALL show that area with the fog overlay and darken everything outside it. Nothing outside the fogged area SHALL be sent to the player on that token's account. Content inside the fog stays hidden by the fog rules, apart from the player's own tokens. Whether other players receive the token itself SHALL follow the fog rules for its detection disc, not its centre: a token in fog by this test can still be sent to other players when part of its detection disc lies outside the fog. A token outside fog SHALL see exactly what it would if the fog's inner edges didn't exist, which means fog still blocks its view as today. The player's other tokens SHALL each add their own sight as usual. With line of sight off, fog SHALL NOT limit what a token sees.

#### Scenario: Hiding in fog
- **WHEN** line of sight is on and the player's only token stands wholly inside a fog region in an open hall, and a goblin stands in the open 3 cells outside the fog
- **THEN** the player's board shows the fog overlay over the region around the token and darkness everywhere else, and the goblin is not sent to the player

#### Scenario: Fog painted in overlapping strokes
- **WHEN** the token stands in one of two overlapping fog regions
- **THEN** its sight covers both regions' combined area, with no dark seam along the edge of the region it isn't in

#### Scenario: Adjacent fog regions
- **WHEN** two fog regions share an edge and the token stands in one of them
- **THEN** its sight continues across the shared edge into the other region

#### Scenario: Walls inside fog
- **WHEN** a wall crosses the fogged area the token stands in
- **THEN** the token's sight stops at that wall, as it does outside fog

#### Scenario: On the fog's edge
- **WHEN** the token's centre lies on a fog region's edge or less than 1 px outside it
- **THEN** the token counts as in fog for its own sight and sees only the fogged area, while other players who can see the part of its disc outside the fog receive it

#### Scenario: Stepping out of fog
- **WHEN** the token moves from inside the fog to open ground
- **THEN** the player's sight returns to normal and fog edges again block its view into the fog

#### Scenario: One token in fog, one outside
- **WHEN** the player owns a token in fog and another in the open hall
- **THEN** the player sees the fogged area around the first token and the open hall the second can see

#### Scenario: Line of sight off
- **WHEN** line of sight is off and the player's token stands in fog
- **THEN** the player's board shows the whole map as today
