# Spec Delta

## ADDED Requirements

### Requirement: Detection does not implicitly edit saved map grids
The saved grid of a newly uploaded library map SHALL remain the room default grid until the GM explicitly saves a grid in Edit grid or saves the accepted room grid to the library. An automatic suggestion SHALL NOT alter the grid copied during placement. Existing maps SHALL NOT be backfilled.

#### Scenario: Analysis finishes before placement
- **WHEN** a newly uploaded map receives a suggestion and the GM places it without saving that suggestion
- **THEN** the room receives the map's default saved grid and no new analysis starts

#### Scenario: Editor closes without save
- **WHEN** the GM selects Use suggestion in Edit grid and dismisses the editor
- **THEN** the library map retains its previous saved grid
