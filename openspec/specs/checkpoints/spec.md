# checkpoints Specification

## Purpose
Gives the GM named restore points for the table, so any combination of mistakes can be undone at once by returning the board to a saved moment, without ever rewriting the room's history.

## Requirements

### Requirement: GM saves a named checkpoint
The GM SHALL be able to save the current table as a checkpoint with a name of 1 to 60 characters. A checkpoint SHALL record the table as it is at that moment: the map and grid, every token (hidden ones included), placed area templates, fog regions, and initiative. Players MUST NOT be able to create checkpoints.

#### Scenario: GM saves a checkpoint
- **WHEN** the GM saves a checkpoint named "Before the ambush"
- **THEN** it appears in the GM's checkpoint list with that name

#### Scenario: Player tries to save one
- **WHEN** a player sends a checkpoint save command
- **THEN** the server rejects it as forbidden and nothing is recorded

#### Scenario: Invalid name
- **WHEN** the GM saves a checkpoint with an empty name or a name over 60 characters
- **THEN** the server rejects it and no checkpoint is added

### Requirement: GM restores a checkpoint
The GM SHALL be able to restore any saved checkpoint. Restoring SHALL return the map and grid, tokens, area templates, fog and initiative to exactly what they were when the checkpoint was saved. Restoring MUST NOT change participants, chat, dice history or the activity log. Players MUST NOT be able to restore.

#### Scenario: Restore after many changes
- **WHEN** the GM saves a checkpoint, then moves tokens, adds a token, deletes another, changes the map and starts initiative, and then restores the checkpoint
- **THEN** every client's board shows the map, tokens, templates, fog and initiative exactly as they were at the checkpoint

#### Scenario: Chat survives a restore
- **WHEN** a player sends a chat message after a checkpoint and the GM then restores it
- **THEN** the chat message is still there

#### Scenario: Player tries to restore
- **WHEN** a player sends a restore command
- **THEN** the server rejects it as forbidden and the table is unchanged

### Requirement: Restore appends to history
A restore SHALL be recorded as a new entry at the end of the room's history. Earlier history MUST NOT be modified or removed. The activity log SHALL show who restored which checkpoint.

#### Scenario: History after a restore
- **WHEN** the GM restores a checkpoint
- **THEN** every event from before the restore is still in the log unchanged, and the activity log's newest entry says the GM restored that checkpoint by name

### Requirement: Checkpoints never reveal hidden information
Players MUST NOT receive the checkpoint list, checkpoint names, or any token or template that is hidden from them at the checkpoint or before the restore. After a restore, each player SHALL see the restored table filtered for them.

#### Scenario: Player's view of the checkpoint list
- **WHEN** the GM has saved checkpoints
- **THEN** no player's state or event stream contains a checkpoint id or name

#### Scenario: Restoring a checkpoint with a hidden token
- **WHEN** the GM restores a checkpoint in which a goblin token was hidden
- **THEN** players' boards do not show the goblin, and no message a player receives contains that token

### Requirement: A restore can be undone
The GM SHALL be able to undo a restore from the activity log, returning the table to what it was just before the restore.

#### Scenario: Wrong checkpoint restored
- **WHEN** the GM restores a checkpoint and then undoes that restore
- **THEN** the table returns to its state from just before the restore

### Requirement: Restore opens the checkpoint preview
In the checkpoint list, each checkpoint SHALL offer only Restore and Delete. Choosing Restore SHALL open the read-only preview of the saved board and SHALL NOT restore until the GM confirms with the preview's Restore button. The list MUST NOT offer a separate Preview button.

#### Scenario: Row actions
- **WHEN** the GM views the checkpoint list
- **THEN** each row has a Restore button and a Delete button, and no Preview button

#### Scenario: Restore opens the preview first
- **WHEN** the GM clicks Restore on a checkpoint
- **THEN** the read-only preview of that checkpoint opens and the live board is unchanged

#### Scenario: Confirm from the preview
- **WHEN** the GM clicks Restore in the open preview
- **THEN** the board is restored to the checkpoint and the preview closes
