# Spec Delta

## Purpose

Lets the AI propose a draft map's permanent Difficult and Blocked squares with the existing setup tools, in the room's own terrain format, checked against the map and its grid.

## ADDED Requirements

### Requirement: The AI proposes permanent terrain with the setup tools
When the owner allows terrain, `save_map_setup` SHALL accept a map's permanent Base terrain as runs `{ row, start, end, kind }`, with `kind` Difficult or Blocked, in the same squares as marks and encounter tokens. Squares not listed SHALL be Normal. Leaving terrain out SHALL keep it, an empty list SHALL clear it, and a list SHALL replace all earlier terrain on that map. Runs SHALL be stored with next-door runs of one kind joined. `get_map_setup` SHALL return the runs, how many squares of each kind, the grid they were proposed on, their state, and the range of squares terrain can cover.

#### Scenario: Terrain with walls off
- **WHEN** the owner allows terrain but not walls, and the AI saves terrain alone
- **THEN** it is saved, and reading the map's setup returns it

#### Scenario: Other parts left out
- **WHEN** the AI saves openings and marks without terrain
- **THEN** the terrain saved before stays as it was

#### Scenario: Cleared
- **WHEN** the AI saves `terrain: []`
- **THEN** the map has no terrain, and its walls, doors and marks are unchanged

### Requirement: A save is allowed by the parts it sends
Openings, lines and marks SHALL need the walls choice, and terrain SHALL need the terrain choice. A save that includes any part the owner doesn't allow SHALL write nothing, and its message SHALL name the choice and say that nothing was saved. The store SHALL check, inside the write, the choices the save needs, the version the AI read, and the edited and published locks.

#### Scenario: A mixed save with walls off
- **WHEN** the owner allows terrain but not walls, and the AI saves openings and terrain together
- **THEN** the save is refused, saying nothing was saved, and the map is unchanged

#### Scenario: An edited or published map
- **WHEN** the AI saves terrain on a map the owner edited, or one already published
- **THEN** it is refused, and nothing changes

### Requirement: Terrain fits the map and the limits
Terrain SHALL need a grid. Runs SHALL be ordered by row and then column, SHALL NOT overlap, and SHALL total at most 10,000 squares. Every square SHALL overlap the map by some area, by the terrain editor's own rule: a square the map's edge crops counts, and one that only touches the edge doesn't. A refusal SHALL name the run.

#### Scenario: A cropped edge
- **WHEN** a map's grid has an offset, and the AI saves terrain in column -1 and row -1
- **THEN** it is saved

#### Scenario: Off the map
- **WHEN** a run reaches past the last square that overlaps the map
- **THEN** the save is refused, naming the run, and the terrain saved before stays

### Requirement: Terrain stays on the grid it was proposed on
Terrain SHALL be stored with the grid it was proposed on. When the map's grid later differs from that grid (any square edge under the terrain moving more than a quarter of a square, measured at its farthest squares, with offsets compared without wrapping), `get_map_setup` and `check_build` SHALL report it. The terrain SHALL NOT be used to check tokens, and SHALL NOT be published, until it is saved again on the new grid or cleared.

#### Scenario: A grid correction
- **WHEN** the AI proposed terrain on 70-pixel squares and the map's grid is now 50-pixel squares
- **THEN** `check_build` reports that the terrain was proposed on another grid

### Requirement: Tokens don't stand on Blocked terrain
`check_build` SHALL report a draft token whose footprint lies on Blocked terrain, by the room's own movement rule. A token on Difficult terrain SHALL be allowed.

#### Scenario: A goblin on a pillar
- **WHEN** an encounter's token stands on a Blocked square
- **THEN** the check names the token, its square, and that it couldn't move

### Requirement: The AI sees and is told how to judge terrain
`view_file`'s overlay SHALL draw Difficult and Blocked squares, distinguishably and in the board's colours, within the region shown. The field guide SHALL explain the run format, cropped edges, and what happens when the grid changes. It SHALL say that water, shadow, darkness, colour or texture alone don't make a square Blocked, and that a square the AI can't judge stays Normal, with a mark or a flag.

#### Scenario: Looking at its terrain
- **WHEN** the AI views a map with overlay after saving terrain
- **THEN** the picture shows the Difficult and Blocked squares over the map
