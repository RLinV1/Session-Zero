# Spec Delta

## MODIFIED Requirements

### Requirement: Map assets carry a grid
Map assets MAY store a grid definition: cell size, offsets, and units per cell with a label. New uploads SHALL start without saved grid metadata. Grid setup SHALL begin with the room default grid and persist metadata only when the GM saves, including when the saved values equal that default. In the library, the default grid's units per square and unit label SHALL be the GM's room defaults (see `gm-room-defaults`), or 5 and `ft` when the GM has saved none; its other values are unchanged. Token assets SHALL store only the image, its size and a name.

#### Scenario: Unconfigured map on upload
- **WHEN** a map is uploaded
- **THEN** its stored grid is empty and the shared setup editor opens with the default values

#### Scenario: Explicitly save the default grid
- **WHEN** the GM saves an unconfigured map's grid without changing the default values
- **THEN** the map stores that explicit grid and future placements reuse it without opening setup

#### Scenario: Grid setup uses the GM's units
- **WHEN** a GM whose room defaults are 1.5 per square and `m` opens grid setup for a library map that has no saved grid
- **THEN** "Units per square" shows 1.5 and the unit label shows `m`

#### Scenario: A saved grid keeps its units
- **WHEN** the same GM opens grid setup for a library map saved with 5 `ft`
- **THEN** the editor shows 5 and `ft`
