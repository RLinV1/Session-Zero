# Spec Delta

## MODIFIED Requirements

### Requirement: Player turn notice
While the active token is one a player owns and the player has the room open, the room SHALL show that player a banner across the top of the screen. The banner SHALL name the token and the round, and SHALL offer **Show on board**, which centers the token, and **End turn**, which ends that token's turn. The banner SHALL stay for the whole turn and SHALL leave when the turn moves to a token the player doesn't own or the encounter ends. It SHALL show when the player loads the room during their turn. When the turn moves straight from one of the player's tokens to another, the banner SHALL name the new token. Screen readers SHALL announce the banner when it appears. The GM SHALL NOT get the banner unless they have turned on **Turn banner on every turn** (see "GM turn banner on every turn"). A player SHALL NOT get the banner while the active token is hidden from them.

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
- **WHEN** the turn moves to a token the player doesn't own
- **THEN** the player gets no banner

#### Scenario: GM
- **WHEN** the turn moves to any token and the GM has not turned on Turn banner on every turn
- **THEN** the GM gets no banner

## ADDED Requirements

### Requirement: GM turn banner on every turn
The Preferences tab of Settings SHALL offer the GM, and only the GM, a switch **Turn banner on every turn**, off by default, with a hint saying it shows the banner with End turn on every token's turn. While it is on, the GM SHALL get the turn banner on every token's turn in an encounter, whoever owns the token: it SHALL name the token and the round and SHALL offer **Show on board** and **End turn**, as a player's does. End turn SHALL end that token's turn. The banner SHALL follow the turn as it moves and SHALL leave when the encounter ends. The choice SHALL be saved in this browser and shared by every room. It SHALL NOT change what any player sees.

#### Scenario: Turned on
- **WHEN** the GM turns on Turn banner on every turn and the turn moves to Goblin in round 3
- **THEN** the GM sees a banner reading "It's Goblin's turn · Round 3" with Show on board and End turn

#### Scenario: GM ends a turn from the banner
- **WHEN** the GM, with the switch on, clicks End turn in the banner on Goblin's turn
- **THEN** the turn moves to the next token, and the banner names that token

#### Scenario: Off by default
- **WHEN** a GM who has never changed the switch runs an encounter
- **THEN** the GM gets no banner

#### Scenario: Players unaffected
- **WHEN** the GM has the switch on and the turn moves to a token a player doesn't own
- **THEN** that player gets no banner, and players never see the switch
