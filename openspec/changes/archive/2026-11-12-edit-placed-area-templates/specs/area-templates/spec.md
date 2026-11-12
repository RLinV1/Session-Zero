# Spec Delta

## ADDED Requirements

### Requirement: A click places a 2-cell area
The Area tool SHALL have no size field. Clicking without dragging SHALL place an area 2 cells in size, in the room grid's unit: a circle with a 2-cell radius, or a cone, a line or a square 2 cells long or wide. It SHALL point right. Dragging SHALL set the size as it does today. A line placed by a click SHALL take its width from the width field.

#### Scenario: Click a circle on a 5 ft grid
- **WHEN** a player clicks a cell corner with the circle shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft circle centred on that corner

#### Scenario: Click on a metric grid
- **WHEN** the GM clicks with the cone shape chosen on a grid of 1.5 m cells
- **THEN** every client shows a 3 m cone pointing right

#### Scenario: Click a line
- **WHEN** the width field shows 2 and a player clicks with the line shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft line, 10 ft wide, pointing right

#### Scenario: No size field
- **WHEN** a participant opens the Area tool
- **THEN** it offers shape, color and, for lines, width, but no size

## MODIFIED Requirements

### Requirement: Square areas are placed by their centre
A square area's placed point SHALL be its centre. Without Alt, the centre SHALL snap to the nearest half cell. The square SHALL turn around its centre to face the aim point. When sized by dragging, its side SHALL be twice the distance from the centre to the pointer, snapped to whole cells unless Alt is held. A square placed by a click SHALL be 2 cells on a side. A square placed before this change SHALL be drawn centred on its stored point. It moves by half its side, and nothing in the log is rewritten.

#### Scenario: Click a square's centre
- **WHEN** a player clicks the centre of a cell with the square shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft square centred on that cell

#### Scenario: Click a cell corner
- **WHEN** a player clicks a cell corner with the square shape chosen on a 5 ft grid
- **THEN** every client shows a 10 ft square covering exactly the four cells around that corner

#### Scenario: Drag to size
- **WHEN** a player presses on a cell's centre and drags 1.5 cells to the right
- **THEN** a 15 ft square is centred on that cell and faces right

#### Scenario: Old square
- **WHEN** a room has a 10 ft square placed before this change
- **THEN** it is drawn centred on its stored point, 5 ft from where it was drawn before
