# Spec Delta

## MODIFIED Requirements

### Requirement: Moves carry their path
A move SHALL be able to carry the points where its path turns. The server SHALL check every leg between consecutive points with the same route checks as a straight move today (Blocked terrain, walls, closed or locked doors and windows, wall clearance) and SHALL refuse the whole move, recording nothing, if any leg fails or if the path is longer than its limit. Every point SHALL be on the map. A GM Reposition SHALL carry no path. Every board SHALL show every move's token sliding from its start to its end, along its path or in a straight line, where that viewer may see it: other participants' boards, the mover's own board and their other tabs and devices, and replays, as the `token-slide` capability defines. Undoing a move SHALL return the token to where it started without retracing the path.

#### Scenario: A leg crosses a hidden wall
- **WHEN** a player commits a path whose second leg crosses a wall their client didn't know about
- **THEN** the move is refused with "That move is unavailable." and the token stays where it was

#### Scenario: Others watch it travel
- **WHEN** the GM moves Goblin along a path with two turns in plain view
- **THEN** every player's board shows Goblin following that path to its new square

#### Scenario: Straight moves slide too
- **WHEN** a player moves their token three squares in a straight line
- **THEN** every board, the player's own included, shows it sliding there, not jumping

#### Scenario: Forged path
- **WHEN** a client sends a move whose path has a point off the map
- **THEN** the server refuses it and nothing is recorded
