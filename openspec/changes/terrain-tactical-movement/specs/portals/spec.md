## MODIFIED Requirements

### Requirement: Portal state controls movement
A closed or locked portal SHALL block the token's swept square footprint for ordinary GM and player movement, using wall clearance and the existing starting-wall escape exception. No destination footprint SHALL cross a closed/locked portal. An open portal SHALL NOT block tokens; all other route restrictions SHALL still apply. Permitting ordinary owner and GM movement through fog SHALL NOT bypass portal collision. Only GM Reposition SHALL bypass a portal along the route, while retaining destination collision checks. Refusals SHALL use generic movement text without identifying a concealed obstacle or its location.

#### Scenario: Walk through an open door
- **WHEN** a player moves their token straight through an open door
- **THEN** the move is accepted when otherwise legal

#### Scenario: A closed door is in the way
- **WHEN** a player moves their token straight through a closed door
- **THEN** the server refuses it with "That move is unavailable."

#### Scenario: Locked blocks like closed
- **WHEN** a player moves their token straight through a locked window
- **THEN** the server refuses it with "That move is unavailable."

#### Scenario: Owner or GM crossing a portal under fog
- **WHEN** an owner or the GM ordinarily moves through fog across a closed or locked portal
- **THEN** the physical collision still refuses the move with generic movement text
