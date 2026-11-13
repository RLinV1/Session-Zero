# Spec Delta

## MODIFIED Requirements

### Requirement: Board elements use distinct two-tone colours
The board SHALL draw each of these in its own colour family: plain walls green; doors orange; windows light blue; Difficult terrain purple; Blocked terrain red. No two of them SHALL share a colour family. Each SHALL be drawn two-tone: a dark outline beneath a bright stroke or fill, so it stays visible on light and dark maps. Terrain SHALL be drawn as areas: an area is a group of squares of one kind (Difficult or Blocked) that share a side, and squares touching only at a corner SHALL belong to separate areas. Each area SHALL have one two-tone outline drawn along its boundary, and no outline SHALL be drawn between two squares of the same area. A side of a terrain square SHALL be outlined when the square beyond it lies outside the map, or when the viewer can see that square and it is not the same kind. Where a Difficult area meets a Blocked area, each SHALL be outlined along the shared edge in its own colours. A side whose neighbouring square the viewer cannot see SHALL NOT be outlined, and whether a side is outlined SHALL depend only on what the viewer can see, never on terrain the viewer cannot see. Terrain SHALL be told apart by colour and pattern alone: Difficult squares SHALL be single-hatched (parallel diagonal lines running one way) and Blocked squares crosshatched (diagonal lines running both ways), each hatch drawn two-tone. Terrain squares SHALL NOT carry a glyph such as "×2" or a prohibition sign. Squares on an extra terrain layer SHALL keep their corner marker, in the same colours.

#### Scenario: Wall, door and terrain side by side
- **WHEN** the GM's board shows a wall with a door in it next to a Difficult square
- **THEN** the wall is green, the door orange and the Difficult square purple, each with a dark outline

#### Scenario: Pale map
- **WHEN** a Difficult square lies on a light sandy part of the map
- **THEN** its area outline and its hatching are still clearly visible

#### Scenario: Difficult and Blocked told apart without glyphs
- **WHEN** a Difficult square sits next to a Blocked square
- **THEN** the Difficult square is purple with single hatching, the Blocked square red with crosshatching, and neither shows "×2" or a prohibition sign

#### Scenario: One outline around an area
- **WHEN** the GM paints a 3-by-2 block of Difficult squares on open ground
- **THEN** the board shows one purple outline around the block's perimeter and no outline between any two of its squares

#### Scenario: Difficult next to Blocked
- **WHEN** a row of Difficult squares shares an edge with a row of Blocked squares
- **THEN** they are two areas, and the shared edge carries both a purple and a red outline

#### Scenario: Squares touching only at a corner
- **WHEN** two Blocked squares touch only at a corner
- **THEN** each is outlined on all four sides as its own area

#### Scenario: Area running into fog
- **WHEN** a player sees part of a Difficult area whose next square lies under fog
- **THEN** the side facing the fogged square has no outline, and the visible part is outlined everywhere else

#### Scenario: Fog edge reveals nothing
- **WHEN** a player sees a Difficult square whose neighbour under fog is plain ground, and another whose neighbour under fog is Difficult
- **THEN** neither side facing the fog is outlined, so the two look the same

#### Scenario: Area at the map edge
- **WHEN** a Blocked area reaches the edge of the map
- **THEN** its outline is drawn along the map edge, for the GM and for players alike

### Requirement: The map editor uses the board's colours
The map editor's Terrain step, the live terrain dialog and the map editor's wall and portal drawing SHALL use the same colours and two-tone drawing as the board, so a square or wall looks the same in the editor and on the table. The map editor's Terrain step and the encounter preview SHALL outline terrain by area, as the board does. While a terrain stroke is being dragged, or is waiting for the room to accept it, on the board or in the map editor, its preview SHALL still outline each square it covers.

#### Scenario: Editor matches board
- **WHEN** the GM paints a Difficult square in the map editor and then looks at the board
- **THEN** the square has the same purple colour, hatching and outline in both

#### Scenario: Editor outlines areas
- **WHEN** the GM paints a 2-by-2 block of Blocked squares in the map editor's Terrain step
- **THEN** the block shows one red outline around its perimeter, as on the board

#### Scenario: Stroke preview stays per square
- **WHEN** the GM drags a Difficult brush stroke across three squares
- **THEN** the preview outlines each of the three squares, until the room's terrain shows the stroke
