## ADDED Requirements

### Requirement: Room map editor supports extra terrain layers
The Terrain step of a room's map editor SHALL let the GM add, rename, remove and paint extra terrain layers, with at most 32 extra layers. Changes stay in the draft until Save. The library map editor SHALL remain base-terrain only.

#### Scenario: Add a layer in a room draft
- **WHEN** the GM opens a room's map editor, goes to Terrain, presses Add layer, enters "Ice" and confirms
- **THEN** an "Ice" layer appears and is selected for painting, and the room is unchanged until Save

#### Scenario: Layer limit
- **WHEN** the draft already has 32 extra layers
- **THEN** Add layer is disabled with the title "Layer limit reached (32)"

#### Scenario: Saving a draft applies its layers
- **WHEN** the GM saves a draft with a new, a renamed and a removed layer plus painted cells
- **THEN** the room gains those changes in one atomic save, and a refusal changes nothing

#### Scenario: Library editor
- **WHEN** the GM opens the Terrain step in the library map editor
- **THEN** no Add layer control is shown and a note says layers are for room maps
