# Spec Delta

## Purpose

Wall detection handles maps drawn in inked outlines.

## ADDED Requirements

### Requirement: Inked outlines style
Wall detection SHALL offer an "outlined" wall style that finds walls from the inked outlines of buildings, caves and rooms, including diagonal and curved walls, using a pipeline adapted from ThreeHats/auto-wall with its MIT licence kept in the service.

#### Scenario: A cave map
- **WHEN** the GM detects walls on an inked cave map with the Inked outlines style
- **THEN** walls follow the cave's outline, including its diagonal and curved sides

### Requirement: Automatic detection falls back to outlines
Automatic detection (no style) SHALL try the outline pipeline when the stone search finds less than 20 cells of wall, and use its result only when it finds at least four times as much wall. Otherwise automatic detection SHALL be unchanged.

#### Scenario: Bundled painted maps
- **WHEN** the GM detects walls automatically on a bundled painted map
- **THEN** the result is the stone search's, as before

#### Scenario: Stone search finds almost nothing
- **WHEN** the GM detects walls automatically on an inked cave map where the stone search finds almost nothing
- **THEN** the outline pipeline's walls are returned
