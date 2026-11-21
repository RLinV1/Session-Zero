## Purpose

Lets a room record which game mode it is set up for, applies that mode's default configuration, and keeps it with the room, through a preset system that new games can join without changing the selection flow. Free Mode is the only preset for now.

## ADDED Requirements

### Requirement: Rooms are created in a preset
Every room SHALL be created in a game preset from the preset registry. At first, the registry SHALL contain only Free Mode, and every new room SHALL be Free Mode. When the registry holds more than one preset, the Create room form SHALL offer each with its name and a one-line description, in registry order, with the first selected; with one preset it SHALL offer no choice. The server SHALL reject a preset id that is not in the registry.

#### Scenario: Only Free Mode for now
- **WHEN** the GM opens the Create room form and creates a room
- **THEN** the form shows no game choice and the room is in Free Mode

#### Scenario: Unknown preset
- **WHEN** a create-room request names a preset id that is not in the registry
- **THEN** the server rejects it and no room is created

### Requirement: Free Mode keeps the full tabletop
Free Mode SHALL turn every current tool on: maps, tokens with HP, AC and conditions, attack rolls with GM rulings and damage, dice, fog, initiative, pings, areas, checkpoints and undo, on a grid where one square is 5 ft. A room in Free Mode SHALL behave exactly as rooms did before presets existed.

#### Scenario: Free Mode room
- **WHEN** the GM creates a room
- **THEN** conditions, AC, attacks and rulings are available, and the ruler measures in ft

### Requirement: Server enforces a preset's features
A preset MAY turn off attacks, conditions or AC. In a room whose preset turns a feature off, the server MUST reject every command that uses it: an attack roll, a ruling, a damage application, named attacks on a token, setting a condition, or setting AC. Client-side hiding SHALL be only a hint.

#### Scenario: Forged attack where attacks are off
- **WHEN** a client sends an attack roll command in a room whose preset turns attacks off
- **THEN** the server rejects it as invalid and nothing is recorded

### Requirement: Preset is saved with the room
The preset SHALL be recorded when the room is created and SHALL be the room's preset after any reload, reconnect, server restart, checkpoint restore or encounter template apply. A room created before presets existed SHALL be Free Mode. The preset of an existing room SHALL NOT change.

#### Scenario: Reopen a room
- **WHEN** the GM creates a room, the server restarts, and the GM opens the room again
- **THEN** the room is still in Free Mode

### Requirement: Active preset is visible
Every participant SHALL see the room's preset name in the room's top bar. The GM dashboard SHALL show each room's preset on its room card. The preset SHALL be shown as text, not by colour alone.

#### Scenario: Player sees the preset
- **WHEN** a player joins a room
- **THEN** the top bar shows "Free Mode" next to the room name

### Requirement: New presets need no change to the selection flow
Adding a preset SHALL require only a new definition in the preset registry (id, name, description, configuration) and its documentation; the create-room form, the server's validation, persistence and display SHALL pick it up without code changes of their own. The repository SHALL document how to add a preset.

#### Scenario: Registry drives the form
- **WHEN** a second preset definition is registered
- **THEN** the create-room form offers both and the server accepts the new id without other changes
