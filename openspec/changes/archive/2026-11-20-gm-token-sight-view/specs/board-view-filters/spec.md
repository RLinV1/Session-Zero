## ADDED Requirements

### Requirement: The GM can view the board through the selected token's sight
While line of sight is on, the GM's Show menu SHALL include a "Token view" checkbox, unchecked by default, as a compact row like the other options. It SHALL NOT appear while line of sight is off.

#### Scenario: Row shown with line of sight
- **WHEN** line of sight is on and the GM opens Show
- **THEN** a "Token view" checkbox is listed

#### Scenario: Line of sight off
- **WHEN** line of sight is off
- **THEN** the Show menu has no Token view row

### Requirement: Token view darkens the GM's board outside the selected token's sight
While Token view is checked and the GM has a token selected, the GM's board SHALL be darkened outside that token's sight, including a hidden token's, using the sight computation and mask players receive. Tokens outside it SHALL be dimmed by that mask, not removed. It SHALL update as tokens, walls, doors or the range change, and SHALL be view-only: no command is sent and no other participant is affected. Unchecked, the board SHALL be fully lit.

#### Scenario: A token is selected
- **WHEN** Token view is checked and the GM selects a goblin that a wall separates from part of the map
- **THEN** that part is darkened on the GM's board only

### Requirement: Shift-click views several tokens together
While Token view is checked, clicking a token SHALL make that token the only one viewed, and Shift-clicking a token SHALL add it to the viewed tokens or, if already viewed, remove it, without otherwise changing the normal selection. The board SHALL show the union of the viewed tokens' sight and mark each viewed token with a dashed ring. A viewed token that is deleted SHALL drop out of the set. Unchecking Token view or turning line of sight off SHALL clear the set. No command SHALL be sent.

#### Scenario: Two tokens
- **WHEN** Token view is checked, the GM clicks one token and Shift-clicks another
- **THEN** the board is lit where either sees, both tokens carry a dashed ring

#### Scenario: Shift-click again
- **WHEN** the GM Shift-clicks a viewed token
- **THEN** it is no longer viewed

### Requirement: The active view is shown in the Show menu
While Token view is checked, the Show button SHALL be marked active (an accent dot) and the Token view row SHALL carry one muted line, "Shift-click to add tokens". With nothing viewed, the board SHALL show one quiet status pill at its bottom, clear of the tool rail, reading "Select a token to see its view". Token view SHALL turn off when line of sight is turned off, and SHALL be unavailable while the GM previews as a player.

#### Scenario: Nothing selected
- **WHEN** Token view is checked and no token is viewed
- **THEN** the board is not darkened and the pill is shown

#### Scenario: Previewing as a player
- **WHEN** the GM is viewing as a player
- **THEN** the Token view row is not shown
