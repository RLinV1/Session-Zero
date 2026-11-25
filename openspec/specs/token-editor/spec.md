# token-editor Specification

## Purpose
How the token editor commits changes: saving applies at once with no extra confirmation, and only deleting a token asks first.

## Requirements

### Requirement: Saving a token applies at once
When the GM or a token's owner presses **Save** in the token editor, or submits the form with Enter, the client SHALL send the changes immediately, with no confirmation step between Save and sending. Save SHALL stay disabled while nothing has changed or while art is uploading. A save the server refuses SHALL keep the editor open with its values and show the server's message.

#### Scenario: Save sends the change
- **WHEN** the GM changes Goblin's HP from 7 to 3 in the token editor and presses Save
- **THEN** the change is sent at once, everyone in the room sees Goblin at 3 HP, and no "Save changes?" prompt appears

#### Scenario: Enter saves
- **WHEN** an owner types a new AC and presses Enter in the field
- **THEN** the change is sent at once, the same as pressing Save

#### Scenario: Nothing changed
- **WHEN** the token editor is open and no value differs from the token
- **THEN** Save is disabled and nothing is sent

#### Scenario: Refused save
- **WHEN** the server refuses the save
- **THEN** the editor stays open with the typed values and shows the server's message

### Requirement: Deleting a token asks first
Deleting a token from the token editor or from the board's token card SHALL ask for confirmation that names the token before anything is sent. The safe choice SHALL have focus when the confirmation opens. Choosing it, or dismissing the confirmation, SHALL send nothing. A confirmed delete SHALL be undoable from the activity log, which offers "Undo delete <name>" (ADR 0074).

#### Scenario: Confirmed delete
- **WHEN** the GM presses the delete button for Goblin 2 and confirms
- **THEN** Goblin 2 is deleted for everyone

#### Scenario: Kept
- **WHEN** the GM presses the delete button for Goblin 2 and chooses Keep
- **THEN** nothing is sent and the token stays

### Requirement: Rarely used token fields start collapsed
The token editor SHALL always show the token's name, to the GM and to the token's owners, and its HP, Max HP and AC. The remaining fields SHALL sit in sections that start closed every time the editor opens:
- **Conditions**: the condition picker.
- **Control & visibility** (GM only): who controls the token, and whether it is hidden from players.
- **Advanced** (GM only): board X, board Y, size, rotation and the token image.

Opening or closing a section SHALL NOT change the draft or send anything.

#### Scenario: Editor opens condensed
- **WHEN** the GM opens a token's editor
- **THEN** the name and HP, Max and AC fields are visible, and the Conditions, Control & visibility and Advanced sections are closed

#### Scenario: Advanced holds position, size, rotation and image
- **WHEN** the GM opens the Advanced section
- **THEN** it shows Board X, Board Y, Size, Rotation and the image controls, and no other section shows them

#### Scenario: Player sees only what they can edit
- **WHEN** a player opens the editor of a token they own
- **THEN** they see the name, HP, Max and AC and a closed Conditions section, and no GM-only sections

#### Scenario: Player renames from the editor
- **WHEN** a player changes their token's name in the editor and presses Save
- **THEN** only the new name is sent, the editor closes, and the token's name changes for everyone

### Requirement: A closed section summarises its value
A closed section's header SHALL show a short summary of its current draft value, so the GM can read it without opening the section.

#### Scenario: Conditions count
- **WHEN** a token has two conditions and the Conditions section is closed
- **THEN** the header shows "Conditions" with the count 2

#### Scenario: Advanced summary
- **WHEN** a 2-cell token with rotation 0 and no image is in the editor
- **THEN** the Advanced header shows "2 cells · 0° · no image"

### Requirement: Section fields line up
Inside a section, fields and buttons laid out side by side SHALL share one column gutter, so the image buttons line up with the field columns above them.

#### Scenario: Image buttons align with fields
- **WHEN** the GM opens the Advanced section of a token with an image
- **THEN** the left edge of "From library" lines up with the left edge of the Board Y field

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
