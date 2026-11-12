# Spec Delta

## Purpose

Splits the Measure ruler into a Range mode, for checking how far apart two points are, and a Movement mode, for planning a route with turns and seeing what it costs under the room's movement rules.

## ADDED Requirements

### Requirement: Two ruler modes
The Measure tool's options SHALL offer a choice between **Range** and **Movement**, with Range by default. The choice SHALL be remembered in this browser. Both modes SHALL start from the selected token when the viewer may move it, as the ruler does today, and otherwise from where the viewer first presses. Measurements SHALL stay private to the viewer and never be sent. Holding Alt SHALL keep the free-hand straight ruler in either mode, unchanged. There SHALL be no movement budget to set: rulers show length only.

#### Scenario: Default
- **WHEN** a viewer picks the Measure tool for the first time
- **THEN** Range is selected

#### Scenario: Remembered
- **WHEN** a viewer switches to Movement and reloads the room
- **THEN** Movement is still selected

### Requirement: Range mode
In Range mode, dragging SHALL measure one straight line from the start to the square under the pointer, as the ruler does today, counted in squares under the room's "Diagonals" rule and ignoring terrain entirely. The label SHALL show the plain distance, for example "25 ft", with no movement budget, no Difficult count and no Blocked marking.

#### Scenario: Range ignores terrain
- **WHEN** a viewer measures in Range mode three squares straight across two Difficult squares on a 5 ft grid
- **THEN** the label reads "15 ft"

#### Scenario: Range follows the Diagonals rule
- **WHEN** "Diagonals" is Alternating (1, 2) and a viewer measures three squares diagonally in Range mode
- **THEN** the label reads "20 ft"

### Requirement: Movement mode
In Movement mode, each click SHALL place a point, starting from the selected token or the first click, and the ruler SHALL draw a straight run of squares from each point to the next, plus a live run from the last point to the square under the pointer. It SHALL NOT search for another route. Each step SHALL be costed as a token drag is, under the room's "Diagonals" and "Difficult terrain applies" rules, with Alternating diagonals counted across the whole route. The label SHALL show the route's movement cost as a plain distance, for example "30 ft", followed by the number of Difficult steps when there are any, and "Blocked" when the route steps onto a Blocked square the viewer knows of. Enter SHALL finish the route, keeping it on screen until the next measurement, a tool change or Clear. Backspace SHALL remove the last point. Escape SHALL cancel the route. A hint line SHALL say so.

#### Scenario: Route with a turn
- **WHEN** a viewer in Movement mode clicks three squares right of the start, then three squares down from there, on open ground with a 5 ft grid
- **THEN** the route reads "30 ft"

#### Scenario: Route across Difficult terrain
- **WHEN** "Difficult terrain applies" is On entry and the route crosses two Difficult squares over three steps
- **THEN** the label counts 25 ft for that run and notes "2 difficult"

#### Scenario: Backspace and Escape
- **WHEN** a viewer has placed three points and presses Backspace, then Escape
- **THEN** the last point is removed, then the route is gone

#### Scenario: Blocked on the route
- **WHEN** a placed run steps onto a Blocked square the viewer can see
- **THEN** the route is marked and labelled "Blocked"

### Requirement: Rulers reveal nothing hidden
Both modes SHALL use only the viewer's own copy of the room: the GM's full terrain, a player's visible terrain. Ground a player cannot see SHALL count as Normal ground.

#### Scenario: Fogged Difficult ground
- **WHEN** a player's route crosses Difficult squares under fog
- **THEN** those steps cost as Normal ground and the label notes no Difficult steps for them
