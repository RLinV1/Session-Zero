# token-duplication Specification

## Purpose
Lets the GM copy a token already on the board, once or several times in one action, instead of filling in Add token again, and take that action back with undo.

## Requirements

### Requirement: GM duplicates a token
The GM SHALL be able to duplicate any token, including a hidden one. Duplicate SHALL start placing copies of that token: each click on the board, or Enter on the keyboard position, SHALL create one copy on that square as its own action, until the GM ends placing. A copy SHALL NOT be placed on a square another token occupies, as the `token-no-stacking` capability defines. Each copy SHALL have the original's image, size, rotation, colour, stats, conditions, named attacks, owners and hidden state, and a new id. Copy names SHALL follow the room's unique-name rule. When the original is in a group, each copy SHALL join that group in the same action that creates it. All connected clients SHALL see the copies, each filtered for the viewer as any other token. The duplicate command SHALL also accept 1 to 20 copies with no square, placing them on the nearest empty squares next to the original; when there aren't enough empty squares nearby, the command SHALL be refused and nothing created. Duplicate SHALL NOT ask for a count.

#### Scenario: Duplicate once
- **WHEN** the GM presses Duplicate on "Goblin" (HP 7/7, AC 15, Poisoned) and clicks an empty square
- **THEN** a token "Goblin 2" with HP 7/7, AC 15 and Poisoned appears on that square on every client, and the board is still placing copies

#### Scenario: Copies join the group
- **WHEN** "Goblin" is in "Gate guards" and the GM places two copies of it
- **THEN** "Goblin 2" and "Goblin 3" are in "Gate guards", and each undo removes one of them

#### Scenario: Hidden original
- **WHEN** the GM duplicates a hidden token
- **THEN** the copies are hidden and no player receives them

#### Scenario: Duplicate several
- **WHEN** a duplicate command with no square asks for 4 copies of "Goblin" in a room with only that goblin
- **THEN** "Goblin 2" to "Goblin 5" appear on empty squares around it, as one action

#### Scenario: Duplicate onto the original
- **WHEN** the GM, duplicating "Goblin", clicks the square "Goblin" stands on
- **THEN** the server refuses it with "Another token is already there." and nothing is created

#### Scenario: No room for the copies
- **WHEN** a duplicate command with no square asks for 4 copies of a token boxed in with room for only 2
- **THEN** the server refuses it with "There's no empty square nearby." and nothing is created

#### Scenario: Count out of range
- **WHEN** a duplicate command asks for 0 or 21 copies
- **THEN** the server rejects the command and nothing is created

### Requirement: Only the GM duplicates
The server MUST reject a duplicate command from a player, including one naming a token the player owns. A player asking to duplicate a token hidden from them SHALL get the same answer as for a token that does not exist.

#### Scenario: Forged player command
- **WHEN** a player sends a duplicate command for their own token
- **THEN** the server rejects it as forbidden and nothing is created

### Requirement: Token creation can be undone
Creating tokens (Add token, adding several copies, placing a library creature, or duplicating) SHALL be one undoable action in the GM's activity log. Undoing it SHALL remove every token the action created. The undo MUST be refused, removing nothing, when any of those tokens was changed or deleted after it was created.

#### Scenario: Undo a duplicate
- **WHEN** the GM duplicates "Goblin" three times and then undoes that action
- **THEN** "Goblin 2", "Goblin 3" and "Goblin 4" are removed from every client and "Goblin" remains

#### Scenario: Undo after a copy moved
- **WHEN** the GM duplicates "Goblin", moves "Goblin 2", and then undoes the duplicate
- **THEN** the undo is refused with a message saying the token has changed, and both tokens remain

### Requirement: Duplicate is offered wherever the GM finds a token
Duplicate SHALL be offered in three places: the token editor, each row of the sidebar's token list, and the card that opens when a token is selected on the board. Every one of them SHALL be labelled "Duplicate". Pressing any of them SHALL start placing copies of that token, exactly as the editor's Duplicate does. Duplicate SHALL be shown only to the GM, including on hidden tokens, and SHALL NOT be shown to a player, even on a token they own.

#### Scenario: Duplicate from the token list
- **WHEN** the GM presses Duplicate on the "Goblin" row in the sidebar's token list and clicks two empty squares
- **THEN** "Goblin 2" and "Goblin 3" are created on those squares, and the board is still placing copies of Goblin

#### Scenario: Duplicate from the board card
- **WHEN** the GM clicks "Goblin" on the board, presses Duplicate on its card, and clicks an empty square
- **THEN** "Goblin 2" is created on that square, and the board is still placing copies of Goblin

#### Scenario: Ending placement
- **WHEN** the GM presses Duplicate on a roster row, places one copy, and presses Esc
- **THEN** placing ends with the one copy kept and no more created

#### Scenario: Not for players
- **WHEN** a player views the token list and selects their own token on the board
- **THEN** neither the row nor the card shows Duplicate

### Requirement: The board token card offers Edit
The card that opens when a token is selected on the board SHALL show an Edit button to the GM and to the token's owners, and SHALL NOT show it to any other player. Edit SHALL open the same token editor as the sidebar's token list. The sidebar SHALL switch to the Tokens tab to show it, opening first if it is collapsed. Edits SHALL be sent only when saved in the editor, as with the token list's Edit.

#### Scenario: GM edits from the board
- **WHEN** the GM, with the sidebar on the Play tab, selects "Goblin" on the board and presses Edit on its card
- **THEN** the sidebar shows the Tokens tab with the "Edit Goblin" editor open

#### Scenario: Collapsed sidebar
- **WHEN** the GM has hidden the sidebar and presses Edit on a token's card
- **THEN** the sidebar opens on the Tokens tab with that token's editor open

#### Scenario: Owner edits their token
- **WHEN** a player selects a token they own on the board
- **THEN** its card shows Edit and not Duplicate

#### Scenario: Someone else's token
- **WHEN** a player selects a token they do not own
- **THEN** its card shows neither Edit nor Duplicate

#### Scenario: Token removed while editing
- **WHEN** the token being edited is deleted by another client
- **THEN** the editor closes and nothing is sent
