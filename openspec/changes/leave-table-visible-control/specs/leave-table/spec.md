## MODIFIED Requirements

### Requirement: Players can leave the table
The room page SHALL give every player a "Leave table" control in the room sidebar, on the row that says who they are and separate from that text. At rest it SHALL look like a button in the shared neutral style: small, unfilled, with a visible boundary and an icon. It SHALL turn the danger colour only when hovered. It SHALL be reachable by keyboard, SHALL NOT be the panel's primary control, and SHALL be available on both wide and narrow layouts, where a long display name SHALL NOT push it out of view. It SHALL NOT be shown to the GM.

#### Scenario: Player finds Leave table
- **WHEN** a player is in a room
- **THEN** the sidebar shows a "Leave table" button beside "You are …" that looks like a button before it is hovered, and can be reached with Tab and activated with Enter or Space

#### Scenario: Long name on a phone
- **WHEN** a player with a long display name is in a room on a narrow layout
- **THEN** the name truncates and the "Leave table" button stays fully visible

#### Scenario: GM has no Leave table
- **WHEN** the GM is in their room
- **THEN** no "Leave table" control is shown, and the Home link remains their way out
