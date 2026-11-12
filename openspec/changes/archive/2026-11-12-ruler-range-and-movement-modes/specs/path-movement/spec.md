# Spec Delta

## ADDED Requirements

### Requirement: Movement rules belong to the room
"Diagonals" and "Difficult terrain applies" SHALL be room rules set by the GM on the Settings Table tab, and SHALL be the same for every participant. The movement planner SHALL offer no private Diagonals choice and no personal movement allowance. Line-of-sight range, area templates and the free-hand (Alt) ruler SHALL NOT change.

#### Scenario: Everyone sees the same cost
- **WHEN** the GM sets "Diagonals" to Alternating (1, 2) and two players drag their tokens three squares diagonally
- **THEN** both see a cost of 20 ft on a 5 ft grid

#### Scenario: No movement budget
- **WHEN** a player picks the Measure tool
- **THEN** its options offer Range and Movement, with no Diagonals choice and no movement allowance to set

## REMOVED Requirements

### Requirement: Diagonals and Difficult terrain are room rules
**Reason**: The personal movement allowance it kept is removed; rulers and drags show length only. Replaced by "Movement rules belong to the room", which keeps the room-rule part.
**Migration**: None. A stored allowance in the browser is ignored.

## MODIFIED Requirements

### Requirement: Cheapest-path drag
When a viewer drags a grid-snapped token whose size is a whole number of squares, without holding Alt, the board SHALL show the cheapest path from the token's square to the square under the pointer, using the step cost above, and the path's cost as a plain distance, for example "25 ft", followed by " · N difficult" when it crosses Difficult squares. The label SHALL show length only: there is no movement allowance. The path SHALL avoid Blocked terrain, walls, and closed or locked doors and windows that the viewer knows about: the GM knows every wall; a player knows the doors and windows they can see, and any walls the room sends them. Among paths of equal cost, the board SHALL prefer the one that stays closest to the straight line from start to end; if that path turns more often than a move may carry, the one with the fewest turns; if that also can't be carried, the straight drag. The cost SHALL be that of the path shown, priced from what the viewer holds: for a player, fog, walls and terrain they cannot see SHALL NOT be counted, and the board SHALL NOT show the cost as unknown. When the board finds no path to the square (none exists for what the viewer knows, or the search gives up on a very long drag), it SHALL fall back to the straight drag, and dropping SHALL send the straight move for the server to decide. Otherwise dropping SHALL commit the path that was shown. A token that is free-placed, has a fractional size, or is dragged with Alt held SHALL keep the straight drag, showing straight-line distance without terrain cost.

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

#### Scenario: Drag label
- **WHEN** a viewer drags a token three squares across open ground on a 5 ft grid
- **THEN** the label reads "15 ft"
