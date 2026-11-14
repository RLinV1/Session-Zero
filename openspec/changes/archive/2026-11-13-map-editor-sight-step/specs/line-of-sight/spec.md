## ADDED Requirements

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
