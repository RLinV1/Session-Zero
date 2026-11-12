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
Deleting a token from the token editor or from the board's token card SHALL ask for confirmation that names the token before anything is sent. The safe choice SHALL have focus when the confirmation opens. Choosing it, or dismissing the confirmation, SHALL send nothing.

#### Scenario: Confirmed delete
- **WHEN** the GM presses the delete button for Goblin 2 and confirms
- **THEN** Goblin 2 is deleted for everyone

#### Scenario: Kept
- **WHEN** the GM presses the delete button for Goblin 2 and chooses Keep
- **THEN** nothing is sent and the token stays
