# Spec Delta

## MODIFIED Requirements

### Requirement: Players see the portals in front of them
A player's state SHALL contain every portal wall any part of which is visible to them (outside every fog region and, with line of sight on, inside their sight), whole, with its kind and state, and SHALL NOT contain portals wholly under fog or out of sight. It SHALL contain plain walls only as the visible pieces defined by the `visible-walls` capability, never a plain wall's unseen parts. When a change reveals or withdraws a portal for a player (a portal added, removed or designated, or fog added or removed), the player SHALL receive a fresh filtered state. A state change of a portal the player can see SHALL reach them as a live event.

#### Scenario: Doors but no walls
- **WHEN** a room has twenty walls, one of them a closed door outside fog and the rest entirely under fog, and a player joins
- **THEN** the player's state holds exactly that door

#### Scenario: A door half under fog
- **WHEN** fog covers a door's midpoint and one end, but not its other end
- **THEN** the player's state holds the whole door

#### Scenario: Fog lifts off a door
- **WHEN** the GM removes the fog over a door
- **THEN** the player's board shows the door

#### Scenario: Door opened in view
- **WHEN** the GM opens a door the player can see
- **THEN** the player's board shows it open without a full reload
