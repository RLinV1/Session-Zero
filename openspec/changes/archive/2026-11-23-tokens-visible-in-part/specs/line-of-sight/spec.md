# Spec Delta

## MODIFIED Requirements

### Requirement: A token in fog sees only the fog around it
With line of sight on, a token whose centre is in fog (inside a fog region, or within 1 board pixel of a fog region's edge) SHALL see only the fogged area around it. That area is the part of the union of all fog regions the token can reach without crossing a wall, a closed or locked door, or the fogged area's outer edge. Edges where fog regions overlap or share a border SHALL NOT block sight. The player's board SHALL show that area with the fog overlay and darken everything outside it. Nothing outside the fogged area SHALL be sent to the player on that token's account. Content inside the fog stays hidden by the fog rules, apart from the player's own tokens. Whether other players receive the token itself SHALL follow the fog rules for its detection disc, not its centre: a token in fog by this test can still be sent to other players when part of its detection disc lies outside the fog. A token outside fog SHALL see exactly what it would if the fog's inner edges didn't exist, which means fog still blocks its view as today. The player's other tokens SHALL each add their own sight as usual. With line of sight off, fog SHALL NOT limit what a token sees.

#### Scenario: Hiding in fog
- **WHEN** line of sight is on and the player's only token stands wholly inside a fog region in an open hall, and a goblin stands in the open 3 cells outside the fog
- **THEN** the player's board shows the fog overlay over the region around the token and darkness everywhere else, and the goblin is not sent to the player

#### Scenario: Fog painted in overlapping strokes
- **WHEN** the token stands in one of two overlapping fog regions
- **THEN** its sight covers both regions' combined area, with no dark seam along the edge of the region it isn't in

#### Scenario: Adjacent fog regions
- **WHEN** two fog regions share an edge and the token stands in one of them
- **THEN** its sight continues across the shared edge into the other region

#### Scenario: Walls inside fog
- **WHEN** a wall crosses the fogged area the token stands in
- **THEN** the token's sight stops at that wall, as it does outside fog

#### Scenario: On the fog's edge
- **WHEN** the token's centre lies on a fog region's edge or less than 1 px outside it
- **THEN** the token counts as in fog for its own sight and sees only the fogged area, while other players who can see the part of its disc outside the fog receive it

#### Scenario: Stepping out of fog
- **WHEN** the token moves from inside the fog to open ground
- **THEN** the player's sight returns to normal and fog edges again block its view into the fog

#### Scenario: One token in fog, one outside
- **WHEN** the player owns a token in fog and another in the open hall
- **THEN** the player sees the fogged area around the first token and the open hall the second can see

#### Scenario: Line of sight off
- **WHEN** line of sight is off and the player's token stands in fog
- **THEN** the player's board shows the whole map as today
