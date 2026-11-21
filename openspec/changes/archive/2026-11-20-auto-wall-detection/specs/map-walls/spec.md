# Spec Delta

## Purpose

Keeps a room's walls as authoritative board geometry the GM applies and clears, and uses them to stop tokens being placed inside walls or walked through them (FR-GM-09 data model, FR-GM-11).

## ADDED Requirements

### Requirement: The GM applies and clears walls
The GM SHALL be able to apply a completed detection result as the room's walls, replacing any walls already there, in one action. The GM SHALL be able to remove chosen walls or clear them all. Players SHALL NOT be able to change walls. A room SHALL hold at most 1500 walls.

#### Scenario: Apply detected walls
- **WHEN** the GM presses Apply walls on a result with 42 walls
- **THEN** the room holds exactly those 42 walls and the activity log reads "<GM> added 42 walls"

#### Scenario: Clear walls
- **WHEN** the GM presses Clear walls
- **THEN** the room holds no walls

#### Scenario: A player cannot change walls
- **WHEN** a player sends a wall command
- **THEN** the server refuses it as forbidden and nothing changes

### Requirement: Wall changes are undoable
Applying, removing and clearing walls SHALL each be one undoable action in the activity log. Undo SHALL restore exactly the walls the action replaced.

#### Scenario: Undo an apply
- **WHEN** the GM applies detected walls over three existing walls and then undoes it
- **THEN** the room holds the original three walls again

### Requirement: Walls belong to their map
Changing the room's map SHALL remove its walls in the same action. Restoring a checkpoint SHALL restore the walls the board had at that checkpoint. Applying an encounter template SHALL leave the room without walls.

#### Scenario: New map
- **WHEN** the GM applies a different map to a room with walls
- **THEN** the room has no walls afterwards

#### Scenario: Checkpoint
- **WHEN** the GM restores a checkpoint saved before walls were applied
- **THEN** the room has no walls

### Requirement: Walls are GM-only
Walls SHALL NOT be sent to players in snapshots, events or REST responses. The GM's board SHALL draw walls over the map. A player whose move is refused because of a wall SHALL see why.

#### Scenario: Player snapshot
- **WHEN** a player joins a room with walls
- **THEN** their state contains no walls and their event stream shows wall changes only as redacted seqs

### Requirement: Tokens cannot stand in a wall
Creating, moving or repositioning a token SHALL be refused when the token's footprint, inset by a tenth of its width on each side, crosses a wall. This applies to the GM and players alike. A token in a cell beside a wall on a cell edge SHALL NOT be refused.

#### Scenario: Drop onto a wall
- **WHEN** anyone drops a token so its footprint crosses a wall
- **THEN** the server refuses the move as invalid with "That spot is blocked by a wall." and the token stays where it was

#### Scenario: Beside a wall
- **WHEN** a one-cell token stands in the cell next to a wall drawn along that cell's edge
- **THEN** the move is accepted

#### Scenario: Placing several copies
- **WHEN** the GM places five goblins next to a wall
- **THEN** each copy goes to a free square whose footprint does not cross a wall

### Requirement: Players cannot move tokens through walls
A player's move SHALL be refused when the straight line from the token's current centre to its destination crosses a wall. The GM's moves SHALL NOT be checked for crossing.

#### Scenario: Player drags through a wall
- **WHEN** a player drags their token from one room to the next across the wall between them
- **THEN** the server refuses the move as invalid with "A wall is in the way." and the token stays where it was

#### Scenario: GM repositions across a wall
- **WHEN** the GM drags a token across a wall into an open cell
- **THEN** the move is accepted
