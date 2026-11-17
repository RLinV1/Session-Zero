## ADDED Requirements

### Requirement: GM moves the selection to a group
When the room has groups and the GM has tokens selected, the Tokens tab's selection bar SHALL offer **Move N to group**, listing every group and Ungrouped. Choosing one SHALL move the selected tokens that aren't already there in one undoable action. An entry every selected token is already in SHALL be disabled.

#### Scenario: Move two
- **WHEN** Moth 1 is in Pack, the GM selects Moth 1 and Moth 2 and moves them to Pack
- **THEN** only Moth 2 moves, in one action

#### Scenario: Already there
- **WHEN** every selected token is in Pack
- **THEN** Pack is disabled in the menu
