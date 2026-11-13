# board-palette Specification

## Purpose
Defines the colours and two-tone drawing of walls, portals and terrain, so each reads clearly and differently on any map, on the board and in the map editor alike.

## Requirements

### Requirement: Board elements use distinct two-tone colours
The board SHALL draw each of these in its own colour family: plain walls green; doors orange; windows light blue; Difficult terrain purple; Blocked terrain red. No two of them SHALL share a colour family. Each SHALL be drawn two-tone: a dark outline beneath a bright stroke or fill, so it stays visible on light and dark maps. Terrain squares SHALL have a two-tone outline on every edge and SHALL be told apart by colour and pattern alone: Difficult squares SHALL be single-hatched (parallel diagonal lines running one way) and Blocked squares crosshatched (diagonal lines running both ways), each hatch drawn two-tone. Terrain squares SHALL NOT carry a glyph such as "×2" or a prohibition sign. Squares on an extra terrain layer SHALL keep their corner marker, in the same colours.

#### Scenario: Wall, door and terrain side by side
- **WHEN** the GM's board shows a wall with a door in it next to a Difficult square
- **THEN** the wall is green, the door orange and the Difficult square purple, each with a dark outline

#### Scenario: Pale map
- **WHEN** a Difficult square lies on a light sandy part of the map
- **THEN** its square outline and its hatching are still clearly visible

#### Scenario: Difficult and Blocked told apart without glyphs
- **WHEN** a Difficult square sits next to a Blocked square
- **THEN** the Difficult square is purple with single hatching, the Blocked square red with crosshatching, and neither shows "×2" or a prohibition sign

### Requirement: The map editor uses the board's colours
The map editor's Terrain step, the live terrain dialog and the map editor's wall and portal drawing SHALL use the same colours and two-tone drawing as the board, so a square or wall looks the same in the editor and on the table.

#### Scenario: Editor matches board
- **WHEN** the GM paints a Difficult square in the map editor and then looks at the board
- **THEN** the square has the same purple colour, hatching and outline in both
