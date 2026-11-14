# Spec Delta

## MODIFIED Requirements

### Requirement: Content under fog is not sent to players
A token whose centre lies inside a fog region SHALL NOT be sent to any player who does not own it, in snapshots, live events, REST responses or ephemeral relays. A shared area template SHALL NOT be sent to any player other than the one who placed it when no part of it on the map lies outside every fog region and, with line of sight on, inside that player's sight. A part off the edge of the map SHALL NOT count as visible. Whether any part is visible SHALL be decided from points sampled over the area (its corners or rim, its centre or apex, and an interior lattice), so a visible sliver narrower than the sample spacing can be missed and its area not sent. An area the check finds visible to the player SHALL be sent whole, wherever its origin lies. A terrain square SHALL be sent to a player when any part of it on the map lies outside every fog region and, with line of sight on, inside that player's sight, and SHALL NOT be sent otherwise. Whether any part is visible SHALL be decided from a lattice of points sampled inside the square, so a visible sliver narrower than the sample spacing can be missed and the square not sent. A square sent this way SHALL NOT make a player's movement route over it count as known: route feedback SHALL still treat a square that isn't wholly visible as unknown. Attack rolls SHALL blank a side whose token is under fog, and the turn order SHALL leave such tokens out, as for hidden tokens. When fog is added or removed, a token moves into or out of fog, or an area or terrain square becomes visible or stops being visible to a player, each affected player SHALL receive a filtered snapshot.

#### Scenario: Monster under fog
- **WHEN** a goblin stands inside a fog region
- **THEN** no player's state, event stream or drag preview contains the goblin

#### Scenario: Revealing a region
- **WHEN** the GM removes the region over the goblin
- **THEN** players receive a snapshot that contains the goblin

#### Scenario: A token walks into fog
- **WHEN** the GM moves a visible token into a fog region
- **THEN** players receive a snapshot without it, and never receive its new position

#### Scenario: Owners keep their tokens
- **WHEN** a player's own token is inside a fog region
- **THEN** that player still sees and can move it, and other players do not see it

#### Scenario: Area wholly in fog
- **WHEN** the GM places a 10 ft circle entirely inside a fog region
- **THEN** no player's state, event stream or aim preview contains the circle

#### Scenario: Area reaching out of fog
- **WHEN** the GM places a cone whose apex is in fog and whose far end reaches into lit ground
- **THEN** players receive the cone, and the activity log tells them the GM placed it

#### Scenario: Area past the edge of a fogged map
- **WHEN** the map is fogged to its edges and the GM places a cone that pokes past the map's edge
- **THEN** no player receives the cone

#### Scenario: Fog covers the last visible part
- **WHEN** the GM adds a fog region over the only part of a player's circle that another player could see
- **THEN** that other player receives a snapshot without the circle

#### Scenario: Terrain square partly under fog
- **WHEN** a fog region covers the right half of a Difficult square
- **THEN** players receive that square as Difficult, and it is drawn under the fog

#### Scenario: Terrain square wholly under fog
- **WHEN** a fog region covers all of a Blocked square
- **THEN** no player's state or event stream contains that square

#### Scenario: Terrain square touching fog only along an edge
- **WHEN** a fog region ends exactly on the edge of a Difficult square
- **THEN** players receive that square

#### Scenario: Partly visible square keeps movement feedback unknown
- **WHEN** a player drags a token along a route crossing a square that is partly under fog
- **THEN** the route feedback is the faint uncertain style, as before
