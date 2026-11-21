# map-token-policy-ui Specification

## Purpose
Lets the GM choose how existing tokens are handled when a battle map is replaced, tells them how many tokens moved, and offers Undo in the same place.

## Requirements

### Requirement: The GM chooses the token policy when applying a replacement map
The map Apply step SHALL show the choices "Scale to fit", "Keep positions" and "Recenter" only when a map is already set and at least one token exists. "Scale to fit" SHALL be selected first. The chosen policy SHALL be sent with the same command that sets the map. When the choice is not shown, no policy SHALL be sent.

#### Scenario: Choice offered
- **WHEN** the GM prepares a replacement map in a room that has a map and tokens
- **THEN** the three choices appear before Apply, with "Scale to fit" selected

#### Scenario: Choice hidden
- **WHEN** the room has no map, or has no tokens
- **THEN** no token choice appears and the command carries no policy

#### Scenario: Choice sent
- **WHEN** the GM selects "Recenter" and applies the map
- **THEN** the command is sent with the recenter policy together with the map and grid

#### Scenario: Server refuses
- **WHEN** the server rejects the replacement
- **THEN** the sheet stays open and shows the server message

### Requirement: The GM is told how many tokens moved and can undo
After a replacement map is applied with the choice shown, the interface SHALL say how many tokens were adjusted and SHALL offer Undo for that action. The count SHALL come from the committed map change. Nothing SHALL be shown when no token moved, or once the map change is no longer the latest undoable action.

#### Scenario: Confirmation with count
- **WHEN** the GM applies a replacement map and three tokens move
- **THEN** the GM sees "3 tokens adjusted" with an Undo control

#### Scenario: Nothing moved
- **WHEN** no token moves
- **THEN** no adjustment message appears

#### Scenario: Undo
- **WHEN** the GM presses Undo on the message
- **THEN** the map change is undone for everyone and the message disappears

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
