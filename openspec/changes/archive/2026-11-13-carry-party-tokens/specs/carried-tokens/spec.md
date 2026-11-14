# Spec Delta

## Purpose

Lets the GM bring chosen tokens, usually the party's, from the live board onto the next board when applying an encounter template or switching scenes, and place them with one click, so player tokens persist through a session without being recreated.

## ADDED Requirements

### Requirement: The GM chooses which tokens to carry
When the GM applies an encounter template to the live board, or switches the room to another scene, the confirmation SHALL show a "Carry to the new board" checklist of every token on the live board and every staged token. Every token with at least one owner, and every staged token, SHALL be ticked by default; all others SHALL be unticked. The GM SHALL be able to tick or untick any token. Tokens whose owners have left the room SHALL be listed by the same rule. A switch made without a confirmation SHALL carry the default selection. The checklist SHALL NOT be offered when applying a template inside a private scene preparation, or in a temporary template-editing room; those apply with nothing carried.

#### Scenario: Default selection
- **WHEN** the live board holds Aria (owned by P1), Borin (owned by P2) and a barkeep with no owner, and the GM opens Apply on "Goblin ambush"
- **THEN** the checklist lists all three with Aria and Borin ticked and the barkeep unticked

#### Scenario: Leave one behind
- **WHEN** the GM unticks Borin and switches to "Crypt"
- **THEN** Aria is carried to Crypt and Borin stays on the outgoing scene's board

#### Scenario: Departed owner
- **WHEN** P2 has left the room and the GM opens the switch confirmation
- **THEN** Borin is still listed and ticked

#### Scenario: Private preparation
- **WHEN** the GM applies a template to a scene they are preparing privately
- **THEN** no carry checklist is shown and no token leaves the live board

### Requirement: Carried tokens move, unchanged
A carried token SHALL keep its id, name, look, size, owners, hidden flag, stats, conditions, attacks and saved initiative score. It SHALL be removed from the outgoing board, including that board's initiative order and token groups. If the incoming board already holds a token with the same id, the carried token SHALL replace it. The server MUST accept only ids of tokens on the live board or staged on it; a request naming any other id SHALL be rejected and change nothing. Only the GM SHALL be able to carry tokens.

#### Scenario: Stats survive the switch
- **WHEN** Aria has 7 of 18 HP and the Poisoned condition and is carried to "Crypt"
- **THEN** in Crypt, after placement, Aria has 7 of 18 HP, is Poisoned, and P1 can still move her

#### Scenario: Gone from the old scene
- **WHEN** Aria, who was in the Tavern initiative order, is carried to "Crypt" and the GM later switches back to "Tavern" carrying nothing
- **THEN** Tavern has no Aria and its initiative order does not list her

#### Scenario: Same id already there
- **WHEN** "Crypt" was made with Copy current board, so it holds an older copy of Aria with the same id, and the GM carries Aria there
- **THEN** Crypt holds one Aria, the carried one

#### Scenario: Forged id
- **WHEN** a carry request names a token id that is not on the live board or staged
- **THEN** the command is rejected and nothing changes

#### Scenario: Player cannot carry
- **WHEN** a player sends a scene switch or template apply with tokens to carry
- **THEN** it is rejected as forbidden

### Requirement: Carried tokens wait staged until placed
Carried tokens SHALL arrive staged: on the new board but with no place on the map. A staged token SHALL NOT be drawn on the map, give sight, block movement, take a turn, or be the target of an attack, area effect or move. A request to move, attack or target a staged token SHALL be rejected. Staged tokens SHALL survive reloads and reconnects until placed. The GM SHALL see every staged token. A player SHALL see only the staged tokens they own that are not hidden, in a tray that says they are waiting for the GM to place them; other staged tokens MUST NOT reach that player in snapshots or events.

#### Scenario: No vision while staged
- **WHEN** Aria is staged in "Crypt", which uses line of sight
- **THEN** P1 sees no part of the Crypt map through Aria

#### Scenario: Player's waiting tray
- **WHEN** Aria and Borin are staged
- **THEN** P1 sees Aria in the waiting tray and nothing of Borin, and the GM sees both

#### Scenario: Staged hidden token
- **WHEN** a hidden token owned by nobody is carried
- **THEN** no player receives anything about it

#### Scenario: Move refused
- **WHEN** P1 sends a move for Aria while she is staged
- **THEN** the move is rejected and Aria stays staged

### Requirement: The GM places staged tokens with one click
When a transition leaves the board with staged tokens, the GM's board SHALL enter placement mode once, right after it, for every staged token. One click on the board SHALL place every token being placed: the first on the clicked square, the rest on the nearest free squares around it, each square fitting the token's size, never overlapping another token or crossing a wall, and on the map. Positions SHALL be decided by the server, not the client. The keyboard SHALL be able to choose the square as when placing a new token, and Enter SHALL place. Esc SHALL leave placement mode with the tokens still staged; the GM SHALL be able to resume placement from the waiting list. Placed tokens SHALL be visible to players by the usual rules. Placement SHALL be undoable, returning the tokens to staged. Only the GM SHALL be able to place staged tokens.

#### Scenario: One click
- **WHEN** Aria and Borin are staged in "Crypt" and the GM clicks an empty square
- **THEN** Aria is on that square, Borin on an adjacent free square, and both players see their tokens on the map

#### Scenario: Crowded spot
- **WHEN** the GM clicks next to a wall with a goblin on the neighbouring square
- **THEN** no carried token overlaps the goblin or crosses the wall

#### Scenario: Not enough space
- **WHEN** the GM clicks a square another token occupies, or a spot too cramped for every staged token to fit
- **THEN** nothing is placed, the board shows "Not enough space", and the board stays in placement mode

#### Scenario: Large token
- **WHEN** a staged token is two squares wide
- **THEN** it is placed where its whole two-by-two footprint is free and on the map

#### Scenario: Not yet
- **WHEN** the GM presses Esc in placement mode
- **THEN** the tokens stay staged, the waiting list shows them, and Place selected resumes placement

#### Scenario: Player cannot place
- **WHEN** a player sends a request to place staged tokens
- **THEN** it is rejected as forbidden and the tokens stay staged

### Requirement: The GM can see and place staged tokens later
While the board has staged tokens, the GM SHALL see a "Waiting to be placed" list on the board naming each staged token, its owners, and whether it is hidden, with every token ticked by default. The list SHALL stay available after leaving placement mode, reloading or reconnecting, until no token is staged, and SHALL then disappear. Place selected SHALL enter placement mode for the ticked tokens only; one click SHALL place them by the rules of one-click placement, and the unticked tokens SHALL stay staged and listed. Place selected SHALL NOT be available with nothing ticked. Reloading SHALL NOT start placement mode by itself. "Not enough space" SHALL consider only the tokens being placed. The server MUST reject a placement that names a token that is not staged, and place nothing.

#### Scenario: After a reload
- **WHEN** the GM switches to "Crypt" carrying Aria and Borin, reloads the page before placing them
- **THEN** the board is not in placement mode, the waiting list shows Aria and Borin, and Place selected then one click places both

#### Scenario: Split the party
- **WHEN** Aria, Borin and Wren are staged and the GM unticks Wren, chooses Place selected and clicks a square, then ticks Wren, chooses Place selected and clicks a square across the room
- **THEN** Aria and Borin are placed around the first square and Wren on the second

#### Scenario: Nothing ticked
- **WHEN** the GM unticks every token in the waiting list
- **THEN** Place selected is unavailable

#### Scenario: Everything placed
- **WHEN** the last staged token is placed
- **THEN** the waiting list disappears

#### Scenario: Forged token id
- **WHEN** a placement request names a token that is on the map, or that does not exist
- **THEN** it is rejected and nothing is placed

### Requirement: Staged tokens follow the next transition
If the GM applies a template or switches scenes again while tokens are staged, the staged tokens SHALL appear ticked in the checklist. Unticked staged tokens SHALL stay staged on the board they were carried to.

#### Scenario: Switch twice before placing
- **WHEN** the GM carries Aria to "Crypt" and, before placing her, switches to "Vault" with the default selection
- **THEN** Aria is staged in Vault and not in Crypt

### Requirement: Select and place when applying a new map
When applying a new map to a live board that has tokens on it, the "Tokens already on the table" confirmation SHALL offer Select and place beside Scale to fit, Keep positions and Recenter, for both a plain map change and a UVTT import. Choosing it SHALL show a checklist of the tokens on the map, player tokens listed first and ticked, other tokens under a collapsed "Other tokens" dropdown, unticked. Applying SHALL change the map and, in the same action, send the ticked tokens to wait off the map, unchanged, and remove every unticked token on the map. Tokens already waiting SHALL be untouched. The GM's board SHALL then start placement for the ticked tokens, as after carrying. Undoing the map change SHALL restore the old map and every token where it stood. Tokens that leave the map this way SHALL leave the turn order. Select and place SHALL NOT be offered in a private scene preparation or a temporary template-editing room. The server MUST reject a request naming a token that is not on the map.

#### Scenario: Keep the party, clear the rest
- **WHEN** the map has Aria (Alice's), Borin (Bob's) and a goblin, and the GM applies a new map with Select and place, ticking Aria and Borin
- **THEN** the new map has no tokens on it, Aria and Borin wait to be placed with their HP and owners, the goblin is gone, and placement starts

#### Scenario: Undo
- **WHEN** the GM undoes that map change before placing anyone
- **THEN** the old map returns with Aria, Borin and the goblin where they stood

#### Scenario: Nothing ticked
- **WHEN** the GM unticks every token and applies
- **THEN** every token on the map is removed

#### Scenario: Not at a table
- **WHEN** the GM changes the map of a private scene they are preparing
- **THEN** the confirmation offers only Scale to fit, Keep positions and Recenter
