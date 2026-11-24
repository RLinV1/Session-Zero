## MODIFIED Requirements

### Requirement: Token names are unique within a room
Within one room, no two existing tokens SHALL have the same name, except where a player's rename of their own token made them match (see "A player's rename is kept as typed"). Two names SHALL be the same when they are equal after trimming surrounding whitespace and ignoring letter case. Hidden tokens SHALL count when the GM creates or renames a token. The rule SHALL apply per room only. The same name MAY be used in a different room. The server SHALL make this decision. A client-side check SHALL only be a hint.

#### Scenario: Names that differ only in case or surrounding spaces collide
- **WHEN** a room has a token named "Goblin"
- **THEN** "goblin", "Goblin " and "  GOBLIN" are all treated as the name already in use

#### Scenario: Same name in another room
- **WHEN** room A has a token named "Goblin" and the GM of room B creates a token named "Goblin"
- **THEN** the room B token is named "Goblin"

#### Scenario: Hidden tokens hold their name
- **WHEN** a room has a hidden token named "Goblin" and the GM creates a visible token named "Goblin"
- **THEN** the new token is named "Goblin 2"

## ADDED Requirements

### Requirement: A player's rename is kept as typed
A token's owner SHALL be able to rename that token. The server SHALL trim the new name, SHALL reject it when it is blank after trimming, and SHALL limit it to 60 characters, as for any token name. The server SHALL NOT number a player's rename, and SHALL NOT reject it because another token, hidden or visible, has the same name. Nothing the player receives in reply SHALL depend on the names of tokens hidden from them. A player SHALL NOT be able to rename a token they don't own. The GM's renames SHALL keep being numbered against every token in the room, hidden ones included.

#### Scenario: Owner renames their token
- **WHEN** Aria's owner renames her to "Aria the Bold"
- **THEN** everyone in the room sees the token named "Aria the Bold"

#### Scenario: Name of a hidden token
- **WHEN** the GM has a hidden token named "Dragon" and a player renames their token "Dragon"
- **THEN** the player's token is named "Dragon", with no number added, and the player's reply is the same as in a room with no hidden token

#### Scenario: Name of a visible token
- **WHEN** a room has a visible token named "Goblin" and a player renames their own token "Goblin"
- **THEN** the player's token is named "Goblin", and the room has two tokens named "Goblin"

#### Scenario: Blank name
- **WHEN** a player renames their token to "   "
- **THEN** the rename is refused and the token keeps its name

#### Scenario: Someone else's token
- **WHEN** a player tries to rename a token they don't own
- **THEN** the rename is refused and the token keeps its name

#### Scenario: GM rename is still numbered
- **WHEN** a room has a hidden token named "Dragon" and the GM renames another token "Dragon"
- **THEN** that token is named "Dragon 2"
