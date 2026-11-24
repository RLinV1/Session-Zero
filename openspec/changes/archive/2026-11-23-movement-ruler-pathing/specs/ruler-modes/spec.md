## MODIFIED Requirements

### Requirement: Movement mode
In Movement mode, each click SHALL place a stop, starting from the selected token or the first click, and the ruler SHALL draw a route from each stop to the next, plus a live route from the last stop to the square under the pointer. Each route between stops SHALL be the path a drag of the same footprint would show between those two squares: the cheapest path, under the room's "Diagonals" and "Difficult terrain applies" rules, that avoids Blocked terrain, the walls and closed or locked doors and windows the viewer knows of, and the map edge, preferring among equal costs the one that stays closest to the straight line. The route SHALL pass through every stop in the order placed. The footprint SHALL be the starting token's size when the ruler starts from a token, and one square otherwise. When the starting token is not snapped to the grid or its size is not a whole number of squares, each route SHALL be a straight run, as today. When no path exists for what the viewer knows, or the search gives up, that route SHALL be drawn as a straight run and the ruler SHALL be marked and labelled "Blocked". Each step SHALL be costed as a token drag is, with Alternating diagonals counted across the whole route, not restarted at each stop. The label SHALL show the route's movement cost as a plain distance, for example "30 ft", followed by the number of Difficult steps when there are any, and "Blocked" as described above. The ruler SHALL NOT check for tokens: a route ending on a square another token occupies SHALL NOT be marked Blocked for that reason. Enter SHALL finish the route, keeping it on screen until the next measurement, a tool change or Clear. Backspace SHALL remove the last stop. Escape SHALL cancel the route. A hint line SHALL say so.

#### Scenario: Route with a turn
- **WHEN** a viewer in Movement mode clicks three squares right of the start, then three squares down from there, on open ground with a 5 ft grid
- **THEN** the route reads "30 ft"

#### Scenario: Route across Difficult terrain
- **WHEN** "Difficult terrain applies" is On entry, the only way between two stops crosses two Difficult squares over three steps, and no cheaper route exists
- **THEN** the label counts 25 ft for that leg and notes "2 difficult"

#### Scenario: Around a wall
- **WHEN** a viewer places a stop on the far side of a wall they know of, with an opening two squares further along
- **THEN** the route bends through the opening, and the label shows that route's cost, the same as dragging the token there

#### Scenario: Around a Blocked patch
- **WHEN** a stop lies directly behind a Blocked patch the viewer can see
- **THEN** the route goes around the patch and is not marked Blocked

#### Scenario: Same as a drag
- **WHEN** a viewer selects their 2-square token, measures in Movement mode to a square with a single stop, and then drags the token to the same square
- **THEN** the ruler and the drag show the same route and the same cost

#### Scenario: Stops are kept
- **WHEN** a viewer places a stop off to one side of the straight line between the start and the end
- **THEN** the route passes through that stop

#### Scenario: Alternating diagonals across stops
- **WHEN** "Diagonals" is Alternating (1, 2) and a route takes one diagonal step to a stop and two more diagonal steps after it on a 5 ft grid
- **THEN** the route reads "20 ft"

#### Scenario: Blocked on the route
- **WHEN** a stop lies in a square enclosed by Blocked terrain the viewer can see, so no path reaches it
- **THEN** that leg is drawn straight and the route is marked and labelled "Blocked"

#### Scenario: Ending on a token
- **WHEN** a viewer measures in Movement mode to a square a goblin occupies, on open ground three squares away on a 5 ft grid
- **THEN** the route reads "15 ft" and is not marked Blocked

#### Scenario: Backspace and Escape
- **WHEN** a viewer has placed three stops and presses Backspace, then Escape
- **THEN** the last stop is removed, then the route is gone

### Requirement: Rulers reveal nothing hidden
Both modes SHALL use only the viewer's own copy of the room: the GM's full terrain and walls, a player's visible terrain and the walls, doors and windows the room sends them. Ground a player cannot see SHALL count as Normal ground, and a wall a player hasn't received SHALL NOT bend or block their route. Measuring SHALL send nothing to the server.

#### Scenario: Fogged Difficult ground
- **WHEN** a player's route crosses Difficult squares under fog
- **THEN** those steps cost as Normal ground and the label notes no Difficult steps for them

#### Scenario: Wall under fog
- **WHEN** a player measures a route across a wall that lies under fog and that their client hasn't received
- **THEN** the route runs straight through it, as their drag preview would
