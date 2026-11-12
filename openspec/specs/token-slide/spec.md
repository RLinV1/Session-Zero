# token-slide Specification

## Purpose

Makes every token move visible as a slide along its path, on the mover's own screen as well as everyone else's, and in replays, so the table can follow where a token went and what route it took.

## Requirements

### Requirement: The mover drags a faded copy
While a viewer drags a token they may move, the token SHALL stay on its square and a faded copy of it, showing its art at about half opacity, SHALL follow the pointer, with the path line and cost label as today. Other participants SHALL keep seeing their existing marker of the drag. A press that stays put SHALL remain a click that selects the token and moves nothing.

#### Scenario: Dragging your own token
- **WHEN** a player presses on their token and drags it three squares
- **THEN** the token stays on its square, a faded copy of it follows the pointer, and the path and its cost are shown

#### Scenario: A click
- **WHEN** a player presses on their token and releases without moving the pointer
- **THEN** the token is selected and neither moves nor leaves a copy behind

### Requirement: The mover's token slides on drop
When the viewer drops the token on a new square, the faded copy SHALL disappear and the token SHALL at once slide from its square along the path the move sends, or in a straight line for a straight move, without waiting for the server. If the server refuses the move, the token SHALL slide back to the square it started from. If the server accepts it, the token SHALL end on the square the room says it is on.

#### Scenario: A path around an obstacle
- **WHEN** a player drags their token around a Blocked patch and drops it
- **THEN** their own board shows the token sliding along that path to the new square

#### Scenario: Refused
- **WHEN** a player drops their token and the server refuses the move
- **THEN** the token slides back to where it started and stays there

### Requirement: Every board shows a move sliding
Every board that may see a live move SHALL show the token sliding along the stretches of its path that viewer may see, including the mover's own other tabs and devices, not only other participants' boards. A board already sliding that token for its own drop SHALL NOT start the slide again. Visibility rules for paths and fog SHALL be unchanged.

#### Scenario: A second tab
- **WHEN** a player has the room open in two tabs and moves their token in one
- **THEN** the other tab shows the token sliding to its new square, not jumping

#### Scenario: Under fog
- **WHEN** a token's path runs under fog for a player
- **THEN** that player's board shows it sliding along the visible stretches and jumping across the hidden one, as today

### Requirement: Slides start slowly
Every slide SHALL start from rest and reach its usual pace within about a quarter of a second, then keep that pace. A live slide's pace SHALL be set so that a 6-square move takes just under 1 s, and its time SHALL grow with the move's length, with no fixed cap. A live slide SHALL have travelled less than a third of a square in its first 100 ms, so a refused move barely shows.

#### Scenario: Early refusal
- **WHEN** a player drops their token three squares away and the refusal arrives 100 ms later
- **THEN** the token had moved less than a third of a square before sliding back

#### Scenario: Six squares
- **WHEN** a token moves 6 squares in a straight line in plain view
- **THEN** its slide takes just under 1 s

#### Scenario: A long move
- **WHEN** a token moves 12 squares in a straight line in plain view
- **THEN** its slide takes about twice as long as a 6-square move

### Requirement: Replays slide
When a replay steps forward one step and that step is a token move, the board SHALL slide the token along the path the viewer may see, as a live move does, fitted into the replay's auto-play step. Stepping back, jumping on the slider or stepping again before a slide ends SHALL show the new step at once, cutting any slide short. A replay SHALL show no move the viewer could not see live.

#### Scenario: Playing a replay
- **WHEN** a player plays a replay in which Goblin moves along a path with two turns in plain view
- **THEN** their board shows Goblin following that path, and the slide ends before the next step

#### Scenario: Scrubbing
- **WHEN** a viewer jumps the replay slider past a move
- **THEN** the token appears where that step left it, without sliding

### Requirement: When a move jumps instead
A move SHALL jump straight to its square, with no slide, when the viewer has reduced motion turned on, and when the token moves less than one square. Alt and Reposition drags SHALL slide in a straight line.

#### Scenario: Reduced motion
- **WHEN** a viewer with reduced motion drops their token
- **THEN** the token appears on its new square without sliding

#### Scenario: A nudge
- **WHEN** a token is moved half a square with Alt held
- **THEN** it appears there without sliding
