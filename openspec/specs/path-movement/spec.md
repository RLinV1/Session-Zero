# path-movement Specification

## Purpose
Costs token movement one grid step at a time under the room's Diagonals and Difficult terrain rules, shows the cheapest valid path when a token is dragged, and makes a move carry that path so the server checks the route the mover saw.

## Requirements

### Requirement: Step cost
Movement on the grid SHALL be costed one step at a time, where a step moves a token's footprint by one square in any of the eight directions. A step's base length SHALL come from the room's "Diagonals" rule:
- **Equal cost:** 1 square, straight or diagonal.
- **Alternating (1, 2):** 1 square straight; diagonal steps alternate 1, 2, 1, 2 … counted from the start of the move.
- **Euclidean:** 1 square straight, √2 squares diagonal.

The room's "Difficult terrain applies" rule SHALL decide whether the step costs twice its base length:
- **On entry:** when any square the footprint lands on is Difficult.
- **On exit:** when any square the footprint leaves is Difficult, including the squares the move starts on.
- **Both:** when either is true. The step SHALL cost twice its base length, never four times.

Layered Difficult terrain SHALL count once. A move's cost SHALL be the sum of its steps' costs, times the grid's units per square. A step whose landing footprint has any Blocked square SHALL NOT be taken. Every tool that shows movement cost (the token drag and the ruler) SHALL use this cost, so they agree for the same route.

#### Scenario: Crossing two Difficult squares
- **WHEN** a one-square token moves in a straight line from Normal square A, through Difficult squares D1 and D2, to Normal square B on a 5 ft grid
- **THEN** the cost is 25 ft under On entry, 25 ft under On exit, and 30 ft under Both

#### Scenario: Difficult to Difficult under Both
- **WHEN** "Difficult terrain applies" is Both and a token steps from one Difficult square to another
- **THEN** that step costs twice its base length, not four times

#### Scenario: Starting on Difficult under On exit
- **WHEN** "Difficult terrain applies" is On exit and a token starts on a Difficult square and steps onto Normal ground
- **THEN** that first step costs twice its base length

#### Scenario: Alternating diagonals
- **WHEN** "Diagonals" is Alternating (1, 2) and a token moves three squares diagonally over Normal ground on a 5 ft grid
- **THEN** the cost is 20 ft

#### Scenario: Large token
- **WHEN** "Difficult terrain applies" is On entry and a two-square token steps so that one of the four squares it lands on is Difficult
- **THEN** that step costs twice its base length

### Requirement: Diagonals and Difficult terrain are room rules
"Diagonals" and "Difficult terrain applies" SHALL be room rules set by the GM on the Settings Table tab, and SHALL be the same for every participant. The movement planner SHALL no longer offer a private Diagonals choice; each viewer's movement allowance SHALL stay personal to their browser. Line-of-sight range, area templates and the free-hand (Alt) ruler SHALL NOT change.

#### Scenario: Everyone sees the same cost
- **WHEN** the GM sets "Diagonals" to Alternating (1, 2) and two players drag their tokens three squares diagonally
- **THEN** both see a cost of 20 ft on a 5 ft grid

#### Scenario: Allowance stays personal
- **WHEN** a player sets their movement allowance to 25 ft
- **THEN** other participants' allowances are unchanged, and the planner shows no Diagonals choice

### Requirement: Cheapest-path drag
When a viewer drags a grid-snapped token whose size is a whole number of squares, without holding Alt, the board SHALL show the cheapest path from the token's square to the square under the pointer, using the step cost above, and the path's cost against the viewer's movement allowance. The path SHALL avoid Blocked terrain, walls, and closed or locked doors and windows that the viewer knows about: the GM knows every wall; a player knows the doors and windows they can see, and any walls the room sends them. Among paths of equal cost, the board SHALL prefer the one that stays closest to the straight line from start to end; if that path turns more often than a move may carry, the one with the fewest turns; if that also can't be carried, the straight drag. When part of the path crosses ground the viewer cannot see, that part SHALL be shown as uncertain and the cost as unknown, as today. When the board finds no path to the square (none exists for what the viewer knows, or the search gives up on a very long drag), it SHALL fall back to the straight drag, and dropping SHALL send the straight move for the server to decide. Otherwise dropping SHALL commit the path that was shown. A token that is free-placed, has a fractional size, or is dragged with Alt held SHALL keep the straight drag, showing straight-line distance without terrain cost.

#### Scenario: Around a Blocked patch
- **WHEN** a player drags their token to a square directly behind a Blocked patch they can see
- **THEN** the board shows a path around the patch with its cost, and dropping moves the token along it

#### Scenario: Cheaper detour
- **WHEN** the straight route crosses three Difficult squares and a route one square longer crosses none
- **THEN** the board shows the longer, cheaper route

#### Scenario: No way through
- **WHEN** a token is dragged to a square enclosed by Blocked terrain
- **THEN** the board shows a straight line marked blocked, and dropping is refused so the token stays where it was

#### Scenario: Very long drag
- **WHEN** a token is dragged further than the path search will look
- **THEN** the board shows the straight drag, and the server accepts or refuses it as it does today

#### Scenario: Equal costs hug the line
- **WHEN** a token is dragged four squares across and two down over open ground, where several routes cost the same
- **THEN** the board shows the route whose squares stay closest to the straight line between them

#### Scenario: Alt drag
- **WHEN** a viewer drags a token with Alt held
- **THEN** the board shows a straight line and its straight-line distance, with no path and no terrain cost

### Requirement: Moves carry their path
A move SHALL be able to carry the points where its path turns. The server SHALL check every leg between consecutive points with the same route checks as a straight move today (Blocked terrain, walls, closed or locked doors and windows, wall clearance) and SHALL refuse the whole move, recording nothing, if any leg fails or if the path is longer than its limit. Every point SHALL be on the map. A GM Reposition SHALL carry no path. Other participants' boards SHALL show every live move's token sliding from its start to its end, along its path or in a straight line, where they may see it. Undoing a move SHALL return the token to where it started without retracing the path.

#### Scenario: A leg crosses a hidden wall
- **WHEN** a player commits a path whose second leg crosses a wall their client didn't know about
- **THEN** the move is refused with "That move is unavailable." and the token stays where it was

#### Scenario: Others watch it travel
- **WHEN** the GM moves Goblin along a path with two turns in plain view
- **THEN** every player's board shows Goblin following that path to its new square

#### Scenario: Straight moves slide too
- **WHEN** a player moves their token three squares in a straight line
- **THEN** every other participant's board shows it sliding there, not jumping

#### Scenario: Forged path
- **WHEN** a client sends a move whose path has a point off the map
- **THEN** the server refuses it and nothing is recorded

### Requirement: Paths reveal nothing hidden
A path SHALL NOT reveal what lies where a player can't see. A player's path SHALL be computed only from what their client has received. When a move along a path is shown to a player, they SHALL receive only the stretches of the path that are outside fog and, with line of sight on, inside their sight; their board SHALL show the token travelling the visible stretches and jumping across the hidden ones, never drawing it inside fog. A detour taken entirely in view is shown as it happened. The server's private movement check for a dragging player SHALL still return only a status (clear, blocked or unknown) for the whole path, never which leg failed or why.

#### Scenario: Path through fog
- **WHEN** the GM moves a visible Goblin from one lit square to another along a path that dips under fog
- **THEN** players see Goblin travel the stretches outside fog and jump across the stretch under it, and receive no point of the path inside fog

#### Scenario: Detour in plain view
- **WHEN** the GM moves Goblin along a path that bends around a fogged patch without entering it
- **THEN** players see Goblin follow the bend

#### Scenario: Probing a hidden wall
- **WHEN** a player drags along a path whose middle leg would cross a wall under fog
- **THEN** their feedback is "unknown", the same as for any route into fog
