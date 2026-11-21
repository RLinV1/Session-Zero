## MODIFIED Requirements

### Requirement: GM is notified when a player leaves
When a player leaves, every connected client's room page SHALL show a notice "<name> has left the room." announced through a polite live region, once per departure seen happening in that session. A client that loads or reloads after the departure SHALL NOT show a notice for it. The GM's notice SHALL offer "Review tokens" if the departed player owns any tokens; a player's notice SHALL NOT offer it. Every notice SHALL be dismissible without resolving anything. A player removed by the GM SHALL NOT produce a notice for players.

#### Scenario: GM sees the notice
- **WHEN** Sam, who owns a token, leaves while the GM is in the room
- **THEN** the GM sees "Sam has left the room." with a Review tokens action

#### Scenario: Player with no tokens leaves
- **WHEN** a player who owns no tokens leaves
- **THEN** the GM's notice names them and offers no Review tokens action

#### Scenario: Other players are told
- **WHEN** Sam leaves while Kim is connected
- **THEN** Kim sees "Sam has left the room." exactly once, with Dismiss and no Review tokens action

#### Scenario: Reload does not replay
- **WHEN** Sam left earlier and Kim reloads the page
- **THEN** Kim sees no departure notice

#### Scenario: Removal is not announced to players
- **WHEN** the GM removes Sam from the room
- **THEN** Kim sees no departure notice
