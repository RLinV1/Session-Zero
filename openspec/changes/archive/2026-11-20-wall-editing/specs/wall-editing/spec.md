# Spec Delta

## Purpose

Lets the GM fix and extend a room's walls by hand, and show automatic detection what this map's walls look like, so a noisy detection is a starting point rather than all-or-nothing (FR-GM-09, FR-GM-11).

## ADDED Requirements

### Requirement: The GM draws walls by hand
The board SHALL offer the GM a Walls tool, and players SHALL NOT see it. In Draw mode, each click after the first SHALL add a wall from the previous point to this one. Points SHALL snap to the nearest grid corner, or to an existing wall end nearby, unless Alt is held. Escape, Enter or a right-click SHALL end the chain. A zero-length wall SHALL be refused, and so SHALL a wall beyond the room's wall limit.

#### Scenario: Chain three walls
- **WHEN** the GM clicks four grid corners in turn with the Walls tool in Draw mode
- **THEN** three connected walls are added, each one an undoable action in the activity log

#### Scenario: A player cannot add walls
- **WHEN** a player sends `wall.add`
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Degenerate wall
- **WHEN** a wall's two ends are the same point
- **THEN** the server refuses it as invalid

### Requirement: The GM erases single walls
In Erase mode, clicking on or right next to a wall SHALL remove that wall and no other. The removal SHALL be undoable.

#### Scenario: Remove one false wall
- **WHEN** the GM clicks a wall detection placed on a cliff ridge
- **THEN** that wall alone disappears, and tokens may stand there again

### Requirement: The GM guides detection with a sampled wall
In Detect like this mode, clicking a point on the map SHALL start wall detection for the room's map, using the colour around that point as the colour of walls. The result SHALL arrive in the Walls panel for review exactly as other detections do, and SHALL change nothing until the GM applies it. A point outside the map SHALL be refused.

#### Scenario: Grey walls on a grey map
- **WHEN** automatic detection missed walls and the GM clicks one of them in Detect like this mode
- **THEN** a new analysis runs, and its preview shows walls of that colour across the map

#### Scenario: Outside the map
- **WHEN** the detection request carries a point outside the map's bounds
- **THEN** the server answers 400 and no job is queued
