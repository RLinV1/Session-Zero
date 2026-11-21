## ADDED Requirements

### Requirement: The token choice is asked in a dialog when the map is applied
When the GM presses Apply map in a room that already has a map and at least one token, the editor SHALL open a dialog titled "Tokens already on the table" offering "Scale to fit", "Keep positions" and "Recenter", each with its one-line explanation, with "Scale to fit" selected. The dialog SHALL offer Apply map and Cancel. Apply map SHALL send the chosen policy with the same command that sets the map and grid. Cancel, Escape, or clicking outside SHALL close the dialog without sending anything and SHALL keep the draft map and grid. The choice SHALL NOT be shown in the editor outside this dialog. When the room has no map or no tokens, Apply map SHALL apply at once with no dialog and no policy. The dialog SHALL trap focus while open and return focus to Apply map when closed. If the server refuses the change, the dialog SHALL close and the editor SHALL show the server's message with the draft kept.

#### Scenario: Dialog on apply
- **WHEN** the GM prepares a replacement map in a room with a map and tokens and presses Apply map
- **THEN** a dialog asks what to do with the tokens already on the table, with "Scale to fit" selected

#### Scenario: Choice sent
- **WHEN** the GM selects "Recenter" in the dialog and presses Apply map
- **THEN** one command sets the map, grid and recenter policy, and the dialog closes

#### Scenario: Cancel keeps the draft
- **WHEN** the GM presses Cancel in the dialog
- **THEN** nothing is sent, and the editor still shows the draft map and grid

#### Scenario: No tokens, no dialog
- **WHEN** the room has no tokens and the GM presses Apply map
- **THEN** the map is applied at once with no dialog and no policy

#### Scenario: Not shown inline
- **WHEN** the GM is aligning the grid of a replacement map
- **THEN** no token choice appears in the Grid step
