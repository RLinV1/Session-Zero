## ADDED Requirements

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
