## ADDED Requirements

### Requirement: A token's name label scales with the token
The board SHALL draw a token's name label at a font size proportional to the token's drawn radius, which is the token's size in cells times the grid's cell size. The font size SHALL NOT go below a floor that keeps small tokens readable, nor above a ceiling. The label SHALL resize when the token's size or the grid's cell size changes.

#### Scenario: Larger token, larger label
- **WHEN** the GM changes a token's size from 1 to 2 cells
- **THEN** its name label is drawn about twice as large

#### Scenario: Tiny token keeps a readable label
- **WHEN** a token is 0.25 cells on a 40px grid
- **THEN** its name label is drawn at the floor size

### Requirement: Condition markers sit below the name label
The board SHALL draw a token's condition markers below the rendered bottom of its name label, with a gap, so the label never covers a marker's shape, colour or abbreviation at any token size.

#### Scenario: Large token with a condition
- **WHEN** a 2-cell token on a 100px grid has the Prone condition
- **THEN** the top of the Prone marker is below the bottom of the token's name label
