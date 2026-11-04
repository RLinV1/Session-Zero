## MODIFIED Requirements

### Requirement: Apply a template to an existing room
The GM of a room SHALL be able to apply a template to it. Applying SHALL replace the room's whole board (map, grid, tokens, fog) with the template's, end any running encounter, and clear area templates. It MUST go through the command pipeline as `encounter.apply`, authorised in `decide` as GM only. The event SHALL carry the applied board and the board it replaced, so it can be undone. The room's participants, chat, rolls, checkpoints and name SHALL be untouched. The web client SHALL ask for confirmation before sending the command. Players MUST NOT receive the event; they SHALL receive a fresh filtered snapshot, so hidden tokens and fog-concealed content stay hidden.

When the room's current map is the same library map as the template's, the command MAY carry `keepMapSetup`. With it, the applied board SHALL take the template's tokens but keep the room's current walls and portals, fog, terrain, and scene lighting and sight settings (line of sight, isometric, sight range) instead of the template's. `keepMapSetup` MUST be rejected as invalid when the room's map is not the template's map, and the board MUST be unchanged. The web client SHALL offer the option only when the room's map is the template's map.

#### Scenario: Replace a board
- **WHEN** the GM applies "Goblin ambush" to a room with other tokens and an active initiative order
- **THEN** the room shows the template's board, the initiative order is cleared, and chat and participants are unchanged

#### Scenario: Undo an apply
- **WHEN** the GM undoes the apply
- **THEN** the previous board returns exactly, including its tokens' owners

#### Scenario: Player cannot apply
- **WHEN** a player sends `encounter.apply`
- **THEN** the command is rejected as forbidden and the board is unchanged

#### Scenario: Players see no hidden content
- **WHEN** the GM applies a template that holds a hidden token and a fog region
- **THEN** each player gets a resync with the hidden token absent and concealed content withheld, and no event naming either

#### Scenario: Forged or foreign template
- **WHEN** an `encounter.apply` names a template the sender's account does not own, or one that does not exist
- **THEN** it is rejected with the same message and the board is unchanged

#### Scenario: Keep the map's setup on the same map
- **WHEN** the room is on the template's map, has walls, a portal, fog, terrain and line of sight on, and the GM applies the template with `keepMapSetup`
- **THEN** the board has the template's tokens and the room's own walls, portal, fog, terrain and line-of-sight setting

#### Scenario: Option hidden for a different map
- **WHEN** the room's map differs from the template's map
- **THEN** the apply confirmation shows no keep-setup option

#### Scenario: Forged keep flag on a different map
- **WHEN** a client sends `encounter.apply` with `keepMapSetup` for a template whose map differs from the room's
- **THEN** it is rejected as invalid and the board is unchanged

#### Scenario: Undo a keep-setup apply
- **WHEN** the GM undoes an apply that used `keepMapSetup`
- **THEN** the previous board returns exactly
