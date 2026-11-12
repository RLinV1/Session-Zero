# Spec Delta

## ADDED Requirements

### Requirement: Areas are clipped at fog and sight for viewers who may not edit them
A viewer who may not edit a placed area SHALL see it drawn only where it lies outside every fog region and, when the room uses line of sight, inside that viewer's sight. For a player, these are areas other participants placed. Its fill and outline SHALL NOT be drawn under fog or out of sight. The area's owner and the GM SHALL see the whole area. A GM viewing as a player SHALL see it as that player does. Another participant's live aim or edit preview SHALL be clipped the same way. When fog is added or removed, or the viewer's sight changes, the visible part SHALL update without a reload.

#### Scenario: Cone into fog
- **WHEN** one player places a cone whose apex is in lit ground and whose far end reaches into a fog region
- **THEN** another player sees only the part of the cone outside the fog, and the placing player and the GM see the whole cone

#### Scenario: Cone out of fog
- **WHEN** the GM places a cone whose apex is inside a fog region and whose far end reaches into lit ground
- **THEN** players see only the part of the cone in lit ground

#### Scenario: Own area
- **WHEN** a player places a circle that reaches into fog
- **THEN** that player sees the whole circle

#### Scenario: Out of sight
- **WHEN** line of sight is on and another player's line runs from inside a player's sight past a wall into the dark
- **THEN** the player sees the line only up to the edge of their sight

#### Scenario: GM viewing as a player
- **WHEN** the GM views as a player while a cone reaches from lit ground into fog
- **THEN** the GM sees the cone clipped at the fog edge, as that player does, and sees it whole again on returning to the GM view

#### Scenario: Fog revealed
- **WHEN** the GM removes the fog region a circle reaches into
- **THEN** other players see the rest of the circle without reloading

#### Scenario: Aim preview into fog
- **WHEN** a player aims a line from lit ground into fog
- **THEN** other players see the dashed preview only up to the fog edge

## MODIFIED Requirements

### Requirement: Content under fog is not sent to players
A token whose centre lies inside a fog region SHALL NOT be sent to any player who does not own it, in snapshots, live events, REST responses or ephemeral relays. A shared area template SHALL NOT be sent to any player other than the one who placed it when no part of it on the map lies outside every fog region and, with line of sight on, inside that player's sight. A part off the edge of the map SHALL NOT count as visible. An area of which any part is visible to the player SHALL be sent whole, wherever its origin lies. Attack rolls SHALL blank a side whose token is under fog, and the turn order SHALL leave such tokens out, as for hidden tokens. When fog is added or removed, a token moves into or out of fog, or an area becomes visible or stops being visible to a player, each affected player SHALL receive a filtered snapshot.

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
