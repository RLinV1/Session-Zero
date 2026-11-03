## MODIFIED Requirements

### Requirement: Content under fog is not sent to players
A token whose centre lies inside a fog region SHALL NOT be sent to any player who does not own it, in snapshots, live events, reconnects, replay, REST responses or ephemeral relays, even where sight overlaps manual fog. A shared area template whose origin lies inside a fog region SHALL NOT be sent to any player other than the one who placed it. Attack rolls SHALL blank a side whose token is under fog, and the turn order SHALL leave such tokens out, as for hidden tokens. When fog is added or removed, or a token moves into or out of fog, each affected player SHALL receive a filtered snapshot. Manual fog alone SHALL NOT refuse ordinary movement: authorized players SHALL be able to move their owned, unhidden tokens into, entirely within, across thin strips between clear endpoints and out of fog. Ordinary GM movement SHALL also pass through fog. GM placement or new fog over an owned token SHALL NOT immobilize it. Ownership, hidden-token restrictions, revocation, Blocked terrain, swept walls, closed/locked portals, destination checks, wall clearance, starting-wall escape and proportional Difficult cost SHALL remain enforced. Blocked terrain SHALL NOT gain an escape exception. Movement SHALL NOT modify fog or automatically enable Reposition or a new client permission flag. Reposition SHALL retain its GM-only one-attempt route bypass and wall- and Blocked-free destination checks. Positional configuration SHALL retain its permissions and hide-first/reveal-last ordering. Sight boundaries SHALL still block sight except for regions containing the sight token's centre; range, walls/windows/doors and combined owned-token sight SHALL remain unchanged. Only committed positions SHALL supply sight origins.

#### Scenario: Monster under fog
- **WHEN** a goblin stands inside a fog region
- **THEN** no player's state, event stream or drag preview contains the goblin

#### Scenario: Revealing a region
- **WHEN** the GM removes the region over the goblin
- **THEN** players receive a snapshot that contains the goblin

#### Scenario: A token walks into fog
- **WHEN** the GM ordinarily moves a visible token into a fog region
- **THEN** players receive a snapshot without it, and never receive its new position

#### Scenario: Owners keep their tokens
- **WHEN** a player's own token is inside a fog region
- **THEN** that player still sees and ordinarily moves it while it remains concealed from other players under fog

#### Scenario: GM placement and fog over an owner
- **WHEN** the GM moves an owned token into fog or adds fog over it
- **THEN** its authorized owner can ordinarily move it within and out of fog without GM rescue, and fog remains unchanged

#### Scenario: Thin fog strip and concealed feedback
- **WHEN** an owner previews and commits an otherwise legal route across a thin fog strip between clear endpoints
- **THEN** movement succeeds while local feedback and full cost remain unknown; private server feedback stays unknown with or without concealed physical obstacles

#### Scenario: Concealed monster movement and rename
- **WHEN** the GM moves or positionally configures an unowned monster within fog, or renames it while moving into or out of fog
- **THEN** players receive no concealed token, position, name or drag ghost, and edit events hide first and reveal last
