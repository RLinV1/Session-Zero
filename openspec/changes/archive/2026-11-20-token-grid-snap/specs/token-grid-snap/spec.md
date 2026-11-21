## ADDED Requirements

### Requirement: Grid changes keep aligned tokens in a cell
When the grid changes through `scene.setGrid`, or `scene.setMap` with a grid, every token that was snapped on the old grid SHALL move to the nearest snapped position on the new grid, as a `TokenMoved` event carrying its previous position. Tokens that were not snapped SHALL NOT move.

#### Scenario: Grid resized
- **WHEN** the GM changes the grid from 70 px cells to 64 px cells with an offset, and a size-1 token sits centred in a cell
- **THEN** the token moves to the centre of the nearest cell on the new grid

#### Scenario: Free token
- **WHEN** the GM changes the grid and a token sits off the grid
- **THEN** that token keeps its position

### Requirement: Size changes keep aligned tokens in a cell
When a snapped token's size changes through `token.configure` or `token.setAppearance`, the token SHALL keep its top-left cell and move to the snapped position for its new size, as a `TokenMoved` event. A `position` sent in the same `token.configure` SHALL take precedence. Tokens that were not snapped, and changes to or from a fractional size, SHALL NOT move the token.

#### Scenario: Size 2 to size 1
- **WHEN** the GM sets a size-2 token on an intersection to size 1
- **THEN** the token is centred in the cell that was its top-left cell

#### Scenario: Size 1 to size 2
- **WHEN** the GM sets a size-1 token in a cell to size 2
- **THEN** the token is centred on the intersection at that cell's bottom-right corner
