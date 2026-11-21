## ADDED Requirements

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
