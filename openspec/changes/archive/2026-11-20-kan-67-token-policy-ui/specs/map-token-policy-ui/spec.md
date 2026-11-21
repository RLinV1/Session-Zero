## Purpose

Lets the GM choose how existing tokens are handled when a battle map is replaced, tells them how many tokens moved, and offers Undo in the same place.

## ADDED Requirements

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
