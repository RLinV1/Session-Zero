# Spec Delta

## Purpose

Gives each player's client the parts of the room's walls they can already see on the map, so their token drags can route around them, while never sending any part of a wall that lies under fog or out of their sight.

## ADDED Requirements

### Requirement: Players receive the walls they can see
A player's state SHALL contain the pieces of each plain wall that blocks movement which lie where the player can currently see: outside every fog region and, with line of sight on, inside their sight. A wall that is partly visible SHALL arrive as its visible pieces only, cut where it crosses into fog or out of sight; its unseen parts SHALL NOT be sent in any payload (snapshots, events, reconnects, replays). Walls that don't block movement (an open imported portal) SHALL NOT be sent as wall pieces. Doors and windows SHALL follow the `portals` capability: sent whole when any part is visible. A piece SHALL carry only its two ends: no imported metadata, and an id that doesn't name or link it to the wall it came from or to the wall's other pieces. The GM SHALL receive every wall as today.

#### Scenario: No fog, no line of sight
- **WHEN** a room has twelve walls, no fog and line of sight off, and a player joins
- **THEN** the player's state holds all twelve walls as pieces

#### Scenario: A wall running into fog
- **WHEN** a wall runs from open ground into a fog region
- **THEN** the player receives only the stretch outside the fog, ending at the fog's edge

#### Scenario: Out of sight
- **WHEN** line of sight is on and a wall lies entirely behind another wall from every token the player owns
- **THEN** the player receives no piece of it

#### Scenario: Nothing to see
- **WHEN** "Hide map from players without a token" is on and the player owns no visible token
- **THEN** the player receives no wall pieces

### Requirement: Wall pieces follow what the player sees
A player's wall pieces SHALL change whenever what they can see changes, without a reload: when fog is added or removed, when their line of sight changes, and when the GM adds, removes or edits a wall, or turns a portal into a plain wall or back, in a way that changes any piece they could see before or can see after. A wall change the player can't see any part of, before or after, SHALL reach them only as a redacted step. A wall event MAY reveal to a player that the GM changed walls they can partly see (for example a resync when a partly visible wall is re-split around a door under fog), but never the geometry of an unseen part.

#### Scenario: A wall drawn in view
- **WHEN** the GM draws a wall across open ground the player can see
- **THEN** the player's state gains it without a reload

#### Scenario: A wall drawn under fog
- **WHEN** the GM draws a wall entirely inside a fog region
- **THEN** the player receives only that a step happened, and no wall

### Requirement: Players' boards never draw plain walls
A player's board SHALL NOT draw plain walls or wall pieces; they SHALL be used only to plan token paths and previews. The GM's board SHALL draw plain walls as today. The GM previewing as a player SHALL see what that player sees, with no plain walls drawn.

#### Scenario: Player's board
- **WHEN** a player's state holds wall pieces
- **THEN** their board shows the map with no wall lines

### Requirement: Player paths avoid the walls they can see
When a player drags their token, the cheapest path SHALL route around the wall pieces they hold, as it routes around Blocked terrain and doors, so a path through a wall in view is never offered.

#### Scenario: Around a visible wall
- **WHEN** a player drags their token to a square on the far side of a wall they can see
- **THEN** the board shows a path around the wall, and dropping moves the token along it
