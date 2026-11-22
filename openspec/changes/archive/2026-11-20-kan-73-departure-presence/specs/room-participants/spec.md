## MODIFIED Requirements

### Requirement: Participants list shows active participants only
The room's participants count and the GM's player-seat count SHALL include only active participants. The participants list SHALL list active participants first. A participant who left on their own SHALL then appear in the list marked with the text "AFK", visually muted, and SHALL offer no actions. A participant who left SHALL NOT be counted and SHALL NOT be offered as a token owner in any owner picker.

#### Scenario: Departed player disappears from the list
- **WHEN** the room has the GM, Sam and Kim, and Sam leaves
- **THEN** every client's participants list shows the GM and Kim, then Sam marked "AFK", and the count is 2

#### Scenario: AFK entry has no actions
- **WHEN** the GM opens the participants list after Sam left
- **THEN** Sam's entry has no View as, Reset dice or Remove button

#### Scenario: Owner picker skips departed players
- **WHEN** the GM opens a token's owner choices after Sam left
- **THEN** Sam is not offered

### Requirement: Revoked participants are not listed or assignable
A revoked participant SHALL NOT appear in the room's participant list, SHALL NOT be marked AFK, and SHALL NOT be counted in it. A revoked participant SHALL NOT be offered in any owner picker. The server SHALL reject with `invalid` a command that creates a token or sets token owners when it names a revoked participant. Revoked participants SHALL stay in the room's history, so earlier activity log entries still show their name.

#### Scenario: Revoked player leaves the list
- **WHEN** the room has players "Sam" and "Alex" and the GM revokes Sam
- **THEN** the participants list shows the GM and Alex with no AFK entry, and the count drops by one

#### Scenario: Cannot give a token to a revoked player
- **WHEN** the GM sends `token.setOwners` naming a revoked participant
- **THEN** the command is rejected with `invalid` and the token's owners are unchanged

#### Scenario: History keeps the name
- **WHEN** Sam moved a token and was later revoked
- **THEN** the activity log still shows "Sam moved ..." for that entry, followed by "GM removed Sam from the room"
