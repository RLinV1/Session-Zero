# Spec Delta

## Purpose

Defines how walls and closed or locked portals limit where a token may stand and how it may move, so that a token is stopped only by walls that actually stand between its center and where it is going.

## ADDED Requirements

### Requirement: Walls are tested against a small clearance circle
Walls, and closed or locked doors and windows, SHALL be tested against a clearance circle whose diameter is one tenth of a grid square, never against the token's whole square. The circle's size SHALL NOT depend on the token's size. A wall touching the circle SHALL count as blocking it; a wall that stays outside it SHALL NOT. Open doors and windows SHALL NOT block. Blocked terrain SHALL keep its own rule, by whole squares, and is not part of this requirement.

#### Scenario: A wall stub in the corner of a square
- **WHEN** a player moves their Medium token to an empty square whose corner has a short wall reaching a third of the way toward its center, and nothing lies between the two centers
- **THEN** the move is accepted

#### Scenario: A wall through the middle of the square
- **WHEN** a player moves their Medium token to a square with a wall crossing its center
- **THEN** the server refuses it with "That move is unavailable."

#### Scenario: A wall on the square's edge
- **WHEN** the GM places a Medium token on a square that has a wall along one edge
- **THEN** the token is created

### Requirement: Tokens stand clear of walls
Creating, duplicating, moving, repositioning or resizing a token SHALL be refused when a wall touches the clearance circle at any of the token's sample points where it would end. A token's sample points SHALL be:
- one point at its center, for a token of size 1 square or less;
- otherwise `ceil(size)` points along each side, `ceil(size)²` in all, spaced evenly so that the outermost sit half a square inside the token's edge. For a whole-number size these are the centers of the squares it covers.

Creating or duplicating SHALL be refused with "That spot is blocked by a wall."; moving, repositioning or resizing with "That move is unavailable.", as today. When several copies are spread onto nearby squares, a square where a copy could not stand SHALL be skipped.

#### Scenario: A Large token straddling a wall on a grid line
- **WHEN** the GM moves a Large token so that a thin wall runs along the grid line between its left and right squares
- **THEN** the move is accepted, because no square's center is touched

#### Scenario: A Large token with one square on a wall
- **WHEN** the GM places a Large token where a wall crosses the center of its lower-right square
- **THEN** the server refuses it with "That spot is blocked by a wall."

#### Scenario: A size 1.5 token
- **WHEN** the GM places a token of size 1.5 where a wall passes through its own center but a quarter square away from each of its four sample points
- **THEN** the token is created

### Requirement: Moves sweep the clearance circle
A move that is not a GM Reposition SHALL be refused when, for any of the token's sample points, the clearance circle travelling in a straight line from that point's start to its end touches a wall. A move along a path SHALL check each leg this way. Walls that touch the clearance circle at any sample point where the token starts SHALL be ignored for that move, so a token a wall was drawn over can move off it. Refusals SHALL keep their current messages, and a player's refusal SHALL read the same whether or not they can see the wall.

#### Scenario: Through a gap of one square
- **WHEN** a player moves their Medium token straight through a one-square gap between two walls
- **THEN** the move is accepted

#### Scenario: A Large token at a one-square doorway
- **WHEN** a player moves their Large token straight through a one-square gap between two walls
- **THEN** the move is refused, because one of its sample points runs into a wall

#### Scenario: A crack in a detected wall
- **WHEN** a player moves their token straight across a wall line where two detected segments leave a gap of 4 pixels on a 70-pixel grid
- **THEN** the move is refused

#### Scenario: Starting on a wall
- **WHEN** the GM draws a wall through the center of a player's token and the player moves the token one square away from it
- **THEN** the move is accepted

### Requirement: Path search and previews agree with the server
The board's cheapest-path search and its drag preview SHALL use the same clearance rule as the server for the walls the viewer holds, so a path the board offers is never refused for a wall the viewer knows about, and a square the board marks blocked by a wall is one the server would refuse.

#### Scenario: Around a corner stub
- **WHEN** the GM drags a token to a square whose corner holds a short wall stub
- **THEN** the board shows a path ending on that square and the move is accepted on drop
