# Spec Delta

## MODIFIED Requirements

### Requirement: Save a room's board as a template
A signed-in GM SHALL be able to save an owned room's live board as a named template. The server SHALL require an owned library map, a trimmed name of 1 to 60 characters and fewer than 50 templates. It SHALL save the map reference, grid, tokens, fog, walls, portal states and permanent Base terrain. Saved tokens SHALL retain appearance, placement, size, hidden state, stats, conditions and attacks, with no owners or initiative score. The template SHALL belong to that GM.

#### Scenario: Save a prepared board
- **WHEN** the GM of a room with a library map, a grid, three tokens (one hidden) and one fog region saves it as "Goblin ambush"
- **THEN** the library lists "Goblin ambush", and applying it later restores that map, grid, three tokens (the hidden one still hidden) and the fog region

#### Scenario: Owners and initiative are not saved
- **WHEN** a template is saved from a room where a player owns a token and an encounter is running
- **THEN** the template's tokens have no owners and no initiative scores

#### Scenario: Walls are not saved
- **WHEN** the GM applies a legacy template whose format omitted walls and portals
- **THEN** the board applies with no saved walls or portals from that template

#### Scenario: Saved walls and portals
- **WHEN** the GM saves a room with walls, a locked portal and permanent terrain as a template and later applies it
- **THEN** the applied board has the saved walls, locked portal and Base terrain.

#### Scenario: Not the GM of that room
- **WHEN** a signed-in user who does not own the room, or a player, asks to save it as a template
- **THEN** the server responds 404 and stores nothing

#### Scenario: Map not in the library
- **WHEN** the GM saves a room whose map was uploaded directly and is not a library map, or that has no map
- **THEN** the server responds 400, says the map must be in the library first, and stores nothing

#### Scenario: Blank name or too many templates
- **WHEN** the GM saves with a blank name, or already holds 50 templates
- **THEN** the server responds 400 and stores nothing

## ADDED Requirements

### Requirement: A Studio publication creates a native encounter template

The server SHALL compile the owner-approved Studio encounter from the pinned map and creature dependencies and validate it with the native encounter schema. A room created from the template SHALL use the reviewed map alignment, walls, portal states, permanent terrain and token placements. Native GM defaults or the room preset SHALL determine measurement units. The server SHALL filter the applied board for each viewer and give the GM credential only to the existing website room flow.

#### Scenario: Units differ from the template

- **WHEN** an owner starts a room from a published Studio encounter whose reviewed grid uses a different unit label from the owner's defaults
- **THEN** the template retains the reviewed grid and the room uses the same geometry with the normal measurement defaults
