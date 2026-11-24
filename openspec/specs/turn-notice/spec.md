# turn-notice Specification

## Purpose
Tells a player, on their own screen, that one of their tokens has the turn in an encounter (FR-GM-21).

## Requirements

### Requirement: Player turn notice
While the active token is one a player owns and the player has the room open, the room SHALL show that player a banner across the top of the screen. The banner SHALL name the token and the round, and SHALL offer **Show on board**, which centers the token, and **End turn**, which ends that token's turn. The banner SHALL stay for the whole turn and SHALL leave when the turn moves to a token the player doesn't own or the encounter ends, unless the player has turned on **Turn banner on every turn** (see "Turn banner on every turn"). It SHALL show when the player loads the room during their turn. When the turn moves straight from one of the player's tokens to another, the banner SHALL name the new token. Screen readers SHALL announce the banner when it appears. The GM SHALL NOT get the banner unless they have turned on **Turn banner on every turn**. A player SHALL NOT get the banner while the active token is hidden from them.

#### Scenario: Aria's turn starts
- **WHEN** the GM clicks Next turn and the turn moves from Goblin to Aria, owned by the player, in round 3
- **THEN** the player sees a banner at the top reading "It's Aria's turn · Round 3" with Show on board and End turn

#### Scenario: Banner stays for the turn
- **WHEN** Aria's turn started a minute ago and her owner hasn't ended it
- **THEN** the banner is still showing

#### Scenario: Reload mid-turn
- **WHEN** Aria's owner reloads the room during Aria's turn
- **THEN** the banner shows again

#### Scenario: End turn from the banner
- **WHEN** Aria's owner clicks End turn in the banner
- **THEN** the turn moves to the next token and the banner leaves

#### Scenario: Someone else's turn
- **WHEN** the turn moves to a token the player doesn't own and the player has not turned on Turn banner on every turn
- **THEN** the player gets no banner

#### Scenario: GM
- **WHEN** the turn moves to any token and the GM has not turned on Turn banner on every turn
- **THEN** the GM gets no banner

### Requirement: Turn banner on every turn
The Preferences tab of Settings SHALL offer everyone in a room, GM and players alike, a switch **Turn banner on every turn**, off by default, with a hint saying it shows the banner on every token's turn, with End turn when the turn is theirs to end. While it is on, the viewer SHALL get the turn banner on every token's turn in an encounter that they can see, whoever owns the token: it SHALL name the token and the round and SHALL offer **Show on board**. The banner SHALL offer **End turn** only when the viewer may end that token's turn: the GM on every turn, and a player only on the turn of a token they own. End turn SHALL end that token's turn. The banner SHALL follow the turn as it moves and SHALL leave when the encounter ends. A player SHALL NOT get the banner while the active token is hidden from them. The choice SHALL be saved in this browser and shared by every room. It SHALL NOT change what anyone else sees.

#### Scenario: GM turns it on
- **WHEN** the GM turns on Turn banner on every turn and the turn moves to Goblin in round 3
- **THEN** the GM sees a banner reading "It's Goblin's turn · Round 3" with Show on board and End turn

#### Scenario: GM ends a turn from the banner
- **WHEN** the GM, with the switch on, clicks End turn in the banner on Goblin's turn
- **THEN** the turn moves to the next token, and the banner names that token

#### Scenario: Player sees another token's turn
- **WHEN** a player turns on Turn banner on every turn and the turn moves to Goblin, which they don't own, in round 3
- **THEN** the player sees a banner reading "It's Goblin's turn · Round 3" with Show on board and no End turn

#### Scenario: Player's own turn with the switch on
- **WHEN** a player with the switch on has the turn move from Goblin to Aria, which they own
- **THEN** the banner names Aria and offers Show on board and End turn

#### Scenario: Hidden token's turn
- **WHEN** a player with the switch on is in an encounter and a token hidden from them has the turn
- **THEN** the player gets no banner

#### Scenario: Off by default
- **WHEN** a GM or player who has never changed the switch is in an encounter
- **THEN** they get the banner only as "Player turn notice" describes: a player on their own tokens' turns, the GM never

#### Scenario: Others unaffected
- **WHEN** one player turns the switch on
- **THEN** no other player's or the GM's banner changes
