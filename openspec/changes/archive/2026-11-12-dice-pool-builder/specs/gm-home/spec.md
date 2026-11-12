# Spec Delta

## MODIFIED Requirements

### Requirement: The home page demonstrates the product
The home page SHALL show what the product does using the product's own behaviour, not depictions of it. It SHALL NOT contain an interface built to look like a screenshot. It SHALL include at least one real battle map image. Tokens shown on its maps SHALL be drawn the way the board draws a token, including the token's art when it has some, and SHALL sit in the middle of a grid square.

#### Scenario: Grid alignment is operable
- **WHEN** a visitor drags the cell-size control in the grid demo
- **THEN** the app's grid resizes over a real map that shows its own faint squares, the current cell size is shown, and at the map's cell size the two grids coincide

#### Scenario: Visibility is shown from both sides
- **WHEN** a visitor switches between the GM view and the player view
- **THEN** a token marked hidden is present in one and absent from the other, and the caption states that its place in the turn order is withheld too

#### Scenario: Dice run the real engine
- **WHEN** a visitor builds a roll with the dice builder, e.g. 2 × d6 and a modifier of 3, and rolls
- **THEN** it is rolled by the same shared functions the table uses, every die is shown alongside the total grouped by die type, and the demo offers no text field for a formula

#### Scenario: Tokens are drawn as the board draws them
- **WHEN** a map on the home page shows a token that has character art
- **THEN** the art fills the token's disc, clipped to its circle, with its ring, hit-point bar and name kept; if the art fails to load, the token shows its coloured disc and initial instead

#### Scenario: Tokens sit in a square
- **WHEN** a map on the home page shows tokens
- **THEN** each token's centre is the centre of a grid square on that map's faint grid, on open floor rather than on a wall
