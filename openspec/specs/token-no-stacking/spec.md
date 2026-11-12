# token-no-stacking Specification

## Purpose
Keeps tokens from being stacked on the same square by a snapped drag or by placing a new token, while still allowing deliberate overlap through free placement and keyboard nudges.

## Requirements

### Requirement: What occupies a square
A token SHALL occupy the squares its footprint covers (its size in squares, centred on its position). Two tokens SHALL overlap when their footprints share any area; sharing only an edge or a corner SHALL NOT count. A token whose HP is 0 or below SHALL NOT occupy any square. A token SHALL never count as overlapping itself.

#### Scenario: Side by side
- **WHEN** a token is dropped on the square directly beside another token
- **THEN** they do not overlap

#### Scenario: A Large token over a Medium one
- **WHEN** a Large token is dropped so that one of its four squares is the square of a Medium token
- **THEN** they overlap

#### Scenario: A downed token
- **WHEN** a token is dropped on the square of a token with 0 HP
- **THEN** they do not overlap

### Requirement: A snapped drag doesn't stack tokens
When a viewer drops a token they dragged without Alt (snapped to the grid), including a GM Reposition, and its footprint at the drop would overlap another token the viewer's board holds, the board SHALL NOT send the move. The token SHALL stay where it was without sliding back, and the board SHALL show a short notice that the square is taken. While dragging over such a square, the drag SHALL show it as blocked. A drag with Alt held, a move with the arrow keys and a move from the on-screen move pad SHALL NOT be checked and MAY end on another token. A path SHALL be allowed to pass through other tokens' squares; only where it ends is checked. The check SHALL use only the tokens and HP the viewer's board holds, so a token hidden from the viewer, or under fog, never refuses their drop.

#### Scenario: Dropping on an ally
- **WHEN** a player drags their token without Alt onto the square of another player's token
- **THEN** no move is sent, the token stays on its square without sliding, and the board says the square is taken

#### Scenario: Free placement still stacks
- **WHEN** a player Alt-drags their token onto another token
- **THEN** the move is sent and the tokens overlap

#### Scenario: Arrow keys still stack
- **WHEN** a player moves their token with the arrow keys onto the square of another token
- **THEN** the move is sent and the tokens overlap

#### Scenario: A hidden token there
- **WHEN** a player drags their token onto a square where a token hidden from them stands
- **THEN** the move is sent as usual

#### Scenario: Stepping over a downed enemy
- **WHEN** the GM drags a token onto the square of a goblin with 0 HP
- **THEN** the move is sent

#### Scenario: Shown while dragging
- **WHEN** a player drags their token over an occupied square
- **THEN** the drag shows that square as blocked before they let go

### Requirement: New tokens go on empty squares
The server SHALL refuse a new token, from `token.create` or `token.duplicate` at a chosen position, whose footprint would overlap any token in the room, hidden ones included, with "Another token is already there." This SHALL apply whether or not the position is snapped. When several tokens are created in one command, every one SHALL go on a square that overlaps no token and no earlier copy; if there aren't enough such squares nearby, the server SHALL refuse the whole command with "There's no empty square nearby." and create nothing.

#### Scenario: Clicking an occupied square
- **WHEN** the GM placing "Goblin" clicks the square of an existing token
- **THEN** the server refuses it with "Another token is already there.", nothing is created, and the board stays in placing mode

#### Scenario: Alt placement on a token
- **WHEN** the GM holds Alt and places a new token overlapping an existing one
- **THEN** the server refuses it with "Another token is already there."

#### Scenario: Placing on a downed token
- **WHEN** the GM places a new token on the square of a token with 0 HP
- **THEN** the token is created

#### Scenario: Not enough room
- **WHEN** a create command asks for 5 copies at a square on a map with room for only 3
- **THEN** the server refuses it with "There's no empty square nearby." and nothing is created
