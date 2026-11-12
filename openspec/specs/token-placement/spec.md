# token-placement Specification

## Purpose
Lets the GM choose where a new token goes by pointing at the board, or place it without a pointer, before anything reaches the server or the players.

## Requirements

### Requirement: The GM chooses a new token's square on the board
After starting to place a token, from New Token, Saved Creatures or Duplicate, the GM SHALL choose where each token is created by pointing at the board. While choosing, the board SHALL show the token under the pointer, snapped to the square or squares it would occupy, and highlight them; when they would overlap another token (as the `token-no-stacking` capability defines), the board SHALL show them as blocked. Nothing SHALL be sent to the server, and players SHALL see nothing, until the GM places one. Placing SHALL repeat: each click creates one more token and the GM stays in placing mode, with the next token under the pointer, until they finish. The placement bar SHALL say how many have been placed so far. The GM's forms SHALL NOT ask how many tokens to place. A new token SHALL NOT be created overlapping another token, with or without Alt.

#### Scenario: Hover and click
- **WHEN** the GM fills in New Token for "Goblin", presses Choose a square, moves the pointer over a square and clicks
- **THEN** a faded Goblin follows the pointer square by square, and the click creates Goblin centred on that square

#### Scenario: Placing several
- **WHEN** the GM, placing "Goblin", clicks three empty squares
- **THEN** tokens "Goblin", "Goblin 2" and "Goblin 3" are created on those squares, and the board is still placing Goblin

#### Scenario: Free placement
- **WHEN** the GM holds Alt while clicking where no token is
- **THEN** the token is created exactly at the pointer, with no snapping

#### Scenario: An occupied square
- **WHEN** the GM, placing "Goblin", moves the pointer over the square of an existing token and clicks
- **THEN** the square is shown blocked, the click creates nothing, and the board shows "Another token is already there." and stays in placing mode

#### Scenario: Looking around first
- **WHEN** the GM drags or zooms the board while placing
- **THEN** the view pans or zooms and no token is created

### Requirement: Placing can be finished without a pointer, or abandoned
While placing, the board SHALL take keyboard focus and show the token at a keyboard position, starting at the square nearest the map's centre. The arrow keys SHALL move it one square at a time, staying on the map. Enter SHALL create one token there and stay in placing mode. Each move and each created token SHALL be announced to screen readers. The board SHALL NOT offer Place automatically. Esc, right-click, Cancel in the placement bar or picking a board tool SHALL end placing, keeping every token already created and creating no more.

#### Scenario: Keyboard only
- **WHEN** the GM submits New Token with Enter, presses the right arrow twice and Enter, then Esc
- **THEN** one token is created two squares right of the map's centre, and placing ends

#### Scenario: Cancel
- **WHEN** the GM places two goblins and presses Esc
- **THEN** the ghost disappears, the two goblins stay, and no more are created

#### Scenario: Rejected
- **WHEN** the server rejects a new token
- **THEN** the board stays in placing mode and shows the reason
