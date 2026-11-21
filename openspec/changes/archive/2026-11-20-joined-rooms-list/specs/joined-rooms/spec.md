## ADDED Requirements

### Requirement: Home page lists rooms joined in this browser
When this browser holds guest credentials for one or more rooms, the home page SHALL show a "Rooms you've joined" list above the invite field. Each available row SHALL show the room's name and link to `/r/<roomId>`. Credentials that are this browser's GM seats SHALL NOT appear in the list.

#### Scenario: Returning player
- **WHEN** a browser that joined room "Goblin Caves" as a guest opens `/`
- **THEN** the home page shows a row named "Goblin Caves" linking to `/r/<roomId>`

#### Scenario: GM seat excluded
- **WHEN** a browser holds GM credentials (with an invite code) for a room it created
- **THEN** that room does not appear in the joined list

#### Scenario: Nothing joined
- **WHEN** a browser holds no guest credentials
- **THEN** the home page renders without the joined list

### Requirement: Stored seats carry the room name
The room page SHALL record the room's current name on this browser's stored credentials whenever it receives room state, so the list shows names, not ids. A seat whose name is not yet known SHALL render as "A room you joined".

#### Scenario: Name recorded on first visit
- **WHEN** a guest joins a room and the room page receives its state
- **THEN** the stored credentials for that room include the room name

### Requirement: Dead seats are removed
When the server refuses the room page's credential with `unauthorized`, the room page SHALL forget the stored seat, so the list no longer shows it. A `not_found` refusal SHALL keep the seat.

#### Scenario: Room gone
- **WHEN** a guest opens a room whose credential the server no longer recognises, then returns to `/`
- **THEN** that room no longer appears in the list

#### Scenario: Room failed to load
- **WHEN** the server refuses the connection with `not_found`
- **THEN** the stored seat is kept

### Requirement: Storage failures leave the page unchanged
If reading localStorage throws, the home page SHALL render without the joined list and without an error.

#### Scenario: Private browsing
- **WHEN** localStorage access throws
- **THEN** the home page renders as it does for a browser with no joined rooms
