# room-participants Specification

## Purpose

Defines who is in a room and how each participant is identified to everyone else, so that the GM's per-person controls (ownership, participants list, revocation) always point at one unambiguous person.

## Requirements

### Requirement: Display names are unique within a room
Within one room, no two active participants SHALL have the same display name. Two names SHALL be the same when they are equal after trimming surrounding whitespace and ignoring letter case. The rule SHALL apply per room only. The same name MAY be in use in a different room. The server SHALL make this decision. A client-side check SHALL only be a hint.

#### Scenario: Names that differ only in case or surrounding spaces collide
- **WHEN** a room has an active participant named "Raymond"
- **THEN** "raymond", "Raymond " and "  RAYMOND" are all treated as the name already in use

#### Scenario: Same name in another room
- **WHEN** a guest joins room B as "Raymond" while room A has an active participant named "Raymond"
- **THEN** the join to room B succeeds

### Requirement: Joining with a name already in use is rejected
When a guest joins through an invite with a display name that an active participant in that room already has, the server SHALL reject the join. The rejection SHALL be an HTTP 409 response. Its `error` message SHALL name the conflict and tell the user to choose another name. A rejected join SHALL NOT add a participant to the room, SHALL NOT append any event, and SHALL NOT leave a stored credential behind.

#### Scenario: Duplicate join is rejected
- **WHEN** a room has an active participant named "Raymond" and a guest submits the join form with "raymond"
- **THEN** the server responds 409 with a message saying the name is taken in this room, and the participant list is unchanged

#### Scenario: Rejected join leaves no credential
- **WHEN** a join is rejected for a duplicate name
- **THEN** the guest token sent with that request does not authenticate a socket connection to the room

#### Scenario: Two guests race for the same name
- **WHEN** two guests submit joins to the same room with the name "Sam" at the same time
- **THEN** exactly one join succeeds, the other receives 409, and the room has exactly one participant named "Sam"

### Requirement: Renaming to a name already in use is rejected
When a participant sends `participant.rename` with a display name that another active participant in the room already has, the server SHALL reject the command before any event is emitted. The rejection SHALL use the existing command rejection reply with a message telling the user the name is taken. A participant SHALL be allowed to rename to a name that differs from their own current name only in case or surrounding whitespace.

#### Scenario: Rename collides with another participant
- **WHEN** participants "Alex" and "Sam" are in a room and Sam sends `participant.rename` with "ALEX"
- **THEN** the command is rejected, no `ParticipantRenamed` event is appended, and Sam's name stays "Sam"

#### Scenario: Changing the case of your own name
- **WHEN** a participant named "sam" renames to "Sam"
- **THEN** the rename is accepted and `ParticipantRenamed` carries `previous: "sam"`

### Requirement: Display names are trimmed and must not be blank
The server SHALL trim surrounding whitespace from a display name on room creation, join, and rename, and SHALL store the trimmed value. A display name that is empty after trimming SHALL be rejected. For a join, the rejection SHALL be HTTP 400.

#### Scenario: Surrounding spaces are removed
- **WHEN** a guest joins as "  Raymond  "
- **THEN** the participant's stored and broadcast display name is "Raymond"

#### Scenario: Whitespace-only name
- **WHEN** a guest joins with the display name "   "
- **THEN** the server responds 400 and no participant is added

### Requirement: Only active participants hold a name
Only active participants SHALL block a display name. A participant who has left the room or whose access was revoked SHALL NOT block another participant from taking that name. A returning guest who reconnects with their existing credential SHALL keep their own name, and the reconnect SHALL NOT be treated as a collision with themselves.

#### Scenario: Reconnecting guest keeps their name
- **WHEN** guest "Raymond" disconnects and reconnects to the room with the same stored credential
- **THEN** the reconnect succeeds, no join is performed, and the guest is still "Raymond"

#### Scenario: Revoked participant frees the name
- **WHEN** the room records that participant "Raymond" was revoked, and a new guest joins as "Raymond"
- **THEN** the join succeeds

#### Scenario: Departed participant frees the name
- **WHEN** participant "Raymond" leaves the table, and a new guest then joins as "Raymond"
- **THEN** the join succeeds as a new participant, and the departed participant's record is unchanged

### Requirement: Join form shows a name conflict inline
When a join is rejected because the name is taken, the join form SHALL show the server's message next to the name field. The form SHALL keep the name the user typed and stay usable, so the user can change the name and submit again without reloading the page.

#### Scenario: User picks another name after a conflict
- **WHEN** a guest submits "Raymond", gets the name-taken message, changes the name to "Ray" and submits again
- **THEN** the second submit joins the room without the page reloading

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

### Requirement: A room holds at most 32 players
A room SHALL hold at most 32 active players. The GM SHALL NOT be counted. A participant who has left
the room or been removed SHALL NOT be counted. When the room already has 32 or more active players,
the server SHALL refuse a join through the invite with HTTP 409 and the code `room_full`. Its
`error` message SHALL say that the room is full. This SHALL apply to guests and to signed-in people
alike. A refused join SHALL NOT add a participant, SHALL NOT append any event, SHALL NOT keep a seat
on an account, and SHALL NOT leave a stored credential behind. The server SHALL make this decision in
the same ordered step as the join itself, so joins arriving at the same moment cannot take more
seats than are free. A blank name SHALL still be refused with HTTP 400 first. A signed-in person who
already holds an active seat in the room SHALL still be told they are already a member.

The cap SHALL apply only to joins that add a new participant. Reconnecting with a stored credential,
opening a kept seat on another device and keeping a guest seat on an account SHALL work in a full
room. A room that already has more than 32 active players SHALL keep all of them and SHALL refuse
new joins until it has fewer than 32.

#### Scenario: The 33rd player is refused
- **WHEN** a room has the GM and 32 active players, and a guest joins through the invite
- **THEN** the server responds 409 with the code `room_full`, and the room still has 32 players

#### Scenario: A signed-in person is refused the same way
- **WHEN** a room has 32 active players, and a signed-in person with no seat there joins
- **THEN** the server responds 409 with the code `room_full`, and the person's Your rooms list does not show the room

#### Scenario: Refused join leaves nothing behind
- **WHEN** a join is refused because the room is full
- **THEN** no event is appended, and the token sent with that request does not open a connection to the room

#### Scenario: A player leaving frees a seat
- **WHEN** a room has 32 active players, one of them leaves, and a guest then joins
- **THEN** the join succeeds

#### Scenario: A removed player frees a seat
- **WHEN** a room has 32 active players, the GM removes one, and a guest then joins
- **THEN** the join succeeds

#### Scenario: Joins racing for the last seat
- **WHEN** a room has 31 active players and three guests join at the same moment
- **THEN** exactly one join succeeds, the other two receive 409 `room_full`, and the room has 32 players

#### Scenario: Players already in a full room can come back
- **WHEN** a room has 32 active players, and one of them reconnects with their stored credential or opens their kept seat on another device
- **THEN** they are back in the room as the same participant

#### Scenario: The GM is not counted
- **WHEN** a room has the GM and 31 active players, and a guest joins
- **THEN** the join succeeds

### Requirement: The join page explains a full room
When a join is refused because the room is full, the join page SHALL show the server's message, and
the message SHALL say to ask the GM for a seat. The page SHALL NOT mark the name field as the cause.
The form SHALL keep the name the user typed and stay usable, so the user can try again later without
reloading the page.

#### Scenario: Guest opens the link of a full room
- **WHEN** a guest submits the join form for a room with 32 active players
- **THEN** the page says the room is full, the name field is not marked invalid, and the Join button can be pressed again

### Requirement: The GM sees how many player seats are taken
The GM's participants list SHALL show how many player seats are taken out of 32, counting active
players only. The count SHALL be above the names, so it shows without scrolling when the list is
long. Players SHALL NOT see this line.

#### Scenario: GM checks the room's seats
- **WHEN** the room has the GM and 12 active players, and the GM opens the participants list
- **THEN** the list shows "12 of 32 player seats taken" above the names

#### Scenario: Player opens the list
- **WHEN** a player opens the participants list
- **THEN** the seat count is not shown
