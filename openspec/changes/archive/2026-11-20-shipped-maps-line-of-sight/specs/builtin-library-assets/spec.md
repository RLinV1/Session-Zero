## MODIFIED Requirements

### Requirement: Built-in maps are top-down battle maps with their own grid
Every built-in map SHALL be drawn from directly overhead, with no visible wall or building sides, and SHALL contain no creatures, people or animals, including statues shaped like them. Each built-in map SHALL carry its own grid, measured from its art, so that its grid lines roughly follow the drawn floor tiles and walls across the whole map. A built-in map SHALL be at least 2600 px wide, so it is usable as a table map at about 70 px per square.

#### Scenario: Grid follows the art
- **WHEN** a built-in map's saved grid is drawn over it
- **THEN** grid lines fall along the drawn paving and walls, and no line is more than about half a square from the tile edge it should follow anywhere on the map

#### Scenario: Each map has its own grid
- **WHEN** the built-in catalogue is read
- **THEN** The Broken Span has a 69.4 px grid offset (10, 31), Hollowfrost Keep a 70 px grid offset (47, 46), Temple of the Green Sun a 70 px grid offset (21, 36), and Sunken Crypt a 70 px grid offset (0, 0), each with its own image size

## ADDED Requirements

### Requirement: Built-in maps have stored walls
Each built-in map SHALL have stored walls that follow its drawn architecture, so that no stored wall lies more than about a quarter of a square from the drawn wall it stands for, and no drawn solid wall that would block sight is left without one. Drawn doorways SHALL be stored as closed doors, drawn windows as windows. The stored walls SHALL respect the room limits on walls. Stored walls SHALL belong to one specific map and SHALL NOT be applied to a room by placing the map; they reach a room only through Detect walls and Apply walls.

#### Scenario: Placing a map adds no walls
- **WHEN** the GM places Temple of the Green Sun in a room with no walls
- **THEN** the room still has no walls

#### Scenario: Stored walls follow the art
- **WHEN** a built-in map's stored walls are applied and drawn over it
- **THEN** each wall runs along a drawn wall, and each drawn doorway has a door

### Requirement: A built-in map made for line of sight
The catalog SHALL include "Sunken Crypt", a built-in map made to demonstrate line of sight: separate rooms joined by doors, pillars that cast shadows, a window between two rooms, one locked door, and a corridor whose bend hides its far end. Its stored walls SHALL match its drawn walls exactly.

#### Scenario: Demo in one click
- **WHEN** the GM places Sunken Crypt, presses Detect walls, applies the walls, gives a player a token in the entry hall and turns line of sight on
- **THEN** the player sees the entry hall with shadows behind the pillars, does not see the rooms behind closed doors, and sees into the guard room through the window

### Requirement: Existing libraries pick up new built-in maps once
A GM whose library already received the shipped maps SHALL receive a library row for each shipped map added later, once. A shipped map the GM deleted SHALL NOT be added back, and the GM's other maps SHALL NOT change.

#### Scenario: New map reaches an existing GM
- **WHEN** a GM who signed up before Sunken Crypt shipped opens their library
- **THEN** Sunken Crypt is available to save an encounter with, and their other maps are unchanged

#### Scenario: Deleted map stays deleted
- **WHEN** a GM deleted Hollowfrost Keep from their library before this change
- **THEN** it is not added back
