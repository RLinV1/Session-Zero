## MODIFIED Requirements

### Requirement: Deleting a token asks first
Deleting a token from the token editor or from the board's token card SHALL ask for confirmation that names the token before anything is sent. The safe choice SHALL have focus when the confirmation opens. Choosing it, or dismissing the confirmation, SHALL send nothing. A confirmed delete SHALL be undoable from the activity log, which offers "Undo delete <name>" (ADR 0074).

#### Scenario: Confirmed delete
- **WHEN** the GM presses the delete button for Goblin 2 and confirms
- **THEN** Goblin 2 is deleted for everyone

#### Scenario: Kept
- **WHEN** the GM presses the delete button for Goblin 2 and chooses Keep
- **THEN** nothing is sent and the token stays

## ADDED Requirements

### Requirement: GM deletes several tokens at once
While the GM has tokens selected, the Tokens tab SHALL show one bar naming how many are selected, with **Delete N tokens** and a Clear control. Delete SHALL ask for confirmation that names the tokens (the first five, then "and N more") and says it can be undone, with Keep focused; Keep or dismissing SHALL send nothing. Confirming SHALL delete every selected token in one action and take each out of the turn order.

#### Scenario: Delete a wave
- **WHEN** the GM has five tokens selected, clicks Delete 5 tokens and confirms
- **THEN** all five leave the map for everyone in one action

#### Scenario: Kept
- **WHEN** the GM clicks Delete 5 tokens and chooses Keep
- **THEN** nothing is sent

### Requirement: Undoing a bulk delete
One "Undo delete of N tokens" in the activity log SHALL bring every token of a bulk delete back as it was, hidden ones still hidden, but not into the turn order. The server SHALL refuse a bulk delete, deleting nothing, for a player (forbidden) or when any token is missing (not found). A hidden or fogged token's deletion and return SHALL NOT reach players.

#### Scenario: Undo it
- **WHEN** the GM deleted five tokens and then chooses "Undo delete of 5 tokens" in the activity log
- **THEN** all five are back where they were, and the turn order is unchanged
