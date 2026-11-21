# Spec Delta

## Purpose

Walls and fog in the map editor are a private draft until the GM saves.

## ADDED Requirements

### Requirement: Walls and fog are edited as a draft
The editor SHALL copy the room's walls and fog into a draft when it opens on an applied map. Drawing, erasing, detecting, fogging and revealing in the editor SHALL change only the draft. No `wall.*` or `fog.*` command SHALL be sent until the GM saves.

#### Scenario: Players see nothing until save
- **WHEN** the GM draws fog and walls in the editor and has not saved
- **THEN** no command has been sent and the room's walls and fog are unchanged

### Requirement: Save sends the difference, hiding before revealing
Save SHALL send only what differs between the draft and the room: new fog first, then wall removals, then wall additions, then fog removals. Wall commands SHALL respect their per-command limits. A refused command SHALL stop the save, show the reason, and keep the draft.

#### Scenario: Save
- **WHEN** the draft adds one fog rectangle, removes one wall and adds two walls
- **THEN** `fog.add`, `wall.remove`, and one `wall.add` with two walls are sent in that order

### Requirement: Closing with unsaved changes asks
Closing the editor with unsaved walls or fog SHALL ask whether to save, discard, or keep editing.

#### Scenario: Discard
- **WHEN** the GM closes the editor with unsaved fog and chooses Discard
- **THEN** the editor closes, nothing is sent, and the next open starts from the room's fog

### Requirement: Detected walls can be edited before saving
Applying a finished detection SHALL put its walls in the draft, fetched from a GM-only endpoint, where the GM can erase or add walls before saving.

#### Scenario: Edit a detection
- **WHEN** the GM applies 81 detected walls, erases 3, and saves
- **THEN** the room has 78 walls
