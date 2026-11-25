# Spec Delta

## MODIFIED Requirements

### Requirement: Content under fog is not sent to players
A token SHALL NOT be sent to any player who does not own it, in snapshots, live events, REST responses or ephemeral relays, when no part of its detection disc on the map lies outside every fog region and, with line of sight on, inside that player's sight. The drawn disc is the circle the board draws for the token: centred on its position, with a radius of half its size in cells times the cell size, less 2 board pixels. The detection disc is the drawn disc with its radius reduced by a further sixteenth of a cell, so a token is not sent for a sliver of its edge alone. Whether any part is visible SHALL be decided from points sampled over the detection disc (its rim, its centre and an interior lattice), so a visible sliver narrower than the sample spacing can be missed and the token not sent. A token the check finds visible to the player SHALL be sent whole, wherever its centre lies. A hidden token SHALL NOT be sent to any player, and a player's own tokens SHALL always be sent to them. A shared area template SHALL NOT be sent to any player other than the one who placed it when no part of it on the map lies outside every fog region and, with line of sight on, inside that player's sight. A part off the edge of the map SHALL NOT count as visible. Whether any part is visible SHALL be decided from points sampled over the area (its corners or rim, its centre or apex, and an interior lattice), so a visible sliver narrower than the sample spacing can be missed and its area not sent. An area the check finds visible to the player SHALL be sent whole, wherever its origin lies. A terrain square SHALL be sent to a player when any part of it on the map lies outside every fog region and, with line of sight on, inside that player's sight, and SHALL NOT be sent otherwise. Whether any part is visible SHALL be decided from a lattice of points sampled inside the square, so a visible sliver narrower than the sample spacing can be missed and the square not sent. A square sent this way SHALL NOT make a player's movement route over it count as known: route feedback SHALL still treat a square that isn't wholly visible as unknown. Attack rolls and area effects SHALL blank, for good, a side or target whose token is unowned and has no sampled point of its detection disc on the map outside every fog region, as for hidden tokens. A player's turn order SHALL leave out every token not sent to that player. When fog is added or removed, a token's detection disc enters or leaves the set of discs visible to a player, or an area or terrain square becomes visible or stops being visible to a player, each affected player SHALL receive a filtered snapshot.

#### Scenario: Monster under fog
- **WHEN** a goblin's whole disc lies inside a fog region
- **THEN** no player's state, event stream or drag preview contains the goblin

#### Scenario: Monster half out of fog
- **WHEN** a goblin stands with its centre inside a fog region and part of its disc on lit ground
- **THEN** players receive the goblin, and their boards draw only the part outside the fog

#### Scenario: Monster against a fog edge drawn on the grid
- **WHEN** a fog region's edge lies exactly on a grid line and a grid-snapped goblin stands inside the region with its square touching that edge
- **THEN** no player receives the goblin

#### Scenario: Fog drawn a few pixels short of the grid
- **WHEN** a fog region's edge lies 4 px short of a grid line and a grid-snapped goblin stands inside the region with its square reaching that grid line
- **THEN** no player receives the goblin

#### Scenario: Monster partly round a corner
- **WHEN** line of sight is on and a wall corner hides the centre of a goblin from the player's token, but part of its disc is inside the player's sight
- **THEN** the player receives the goblin, and their board draws only the part inside their sight

#### Scenario: Revealing a region
- **WHEN** the GM removes the region over the goblin
- **THEN** players receive a snapshot that contains the goblin

#### Scenario: A token walks into fog
- **WHEN** the GM moves a visible token until its whole disc is inside a fog region
- **THEN** players receive a snapshot without it, and never receive its new position

#### Scenario: A token steps partly into fog
- **WHEN** the GM moves a visible token so its centre enters a fog region while part of its disc stays on lit ground
- **THEN** players keep the token and receive its new position

#### Scenario: Owners keep their tokens
- **WHEN** a player's own token is inside a fog region
- **THEN** that player still sees and can move it, and other players do not see it

#### Scenario: Attacking a monster half out of fog
- **WHEN** a player attacks a goblin whose centre is in fog and part of whose disc is on lit ground
- **THEN** the roll names the goblin, and its side is not blanked

#### Scenario: A named side stays blanked
- **WHEN** an attack roll names a goblin, and the goblin later moves until its whole disc is inside fog
- **THEN** that roll's goblin side is blanked for players from then on, even after the goblin leaves the fog

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

## ADDED Requirements

### Requirement: Tokens are clipped at fog and sight for players who don't own them
A player SHALL see a token they do not own drawn only where it lies outside every fog region and, when the room uses line of sight, inside that player's sight. This covers its art, name label, markers and decorations. A player's own tokens SHALL be drawn whole, including inside fog. The GM SHALL see every token whole. A GM viewing as a player SHALL see tokens as that player does. Another participant's live drag preview of a token SHALL be clipped the same way. When fog is added or removed, or the player's sight changes, the visible part SHALL update without a reload.

#### Scenario: Half out of fog
- **WHEN** a goblin stands half inside a fog region
- **THEN** players see only the half on lit ground, with no part of the goblin or its label drawn over the fog

#### Scenario: Own token in fog
- **WHEN** a player's own token stands half inside a fog region
- **THEN** that player sees the whole token

#### Scenario: GM viewing as a player
- **WHEN** the GM views as a player while a goblin stands half inside a fog region
- **THEN** the GM sees only the half on lit ground, and sees the whole goblin again on returning to the GM view

#### Scenario: Fog revealed
- **WHEN** the GM removes the fog region a partly visible goblin stands in
- **THEN** players see the whole goblin without reloading
