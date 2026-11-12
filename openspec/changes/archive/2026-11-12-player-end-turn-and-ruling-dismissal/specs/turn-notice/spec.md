## MODIFIED Requirements

### Requirement: Player turn notice
While the active token is one a player owns and the player has the room open, the room SHALL show that player a banner across the top of the screen. The banner SHALL name the token and the round, and SHALL offer **Show on board**, which centers the token, and **End turn**, which ends that token's turn. The banner SHALL stay for the whole turn and SHALL leave when the turn moves to a token the player doesn't own or the encounter ends. It SHALL show when the player loads the room during their turn. When the turn moves straight from one of the player's tokens to another, the banner SHALL name the new token. Screen readers SHALL announce the banner when it appears. The GM SHALL NOT get the banner. A player SHALL NOT get the banner while the active token is hidden from them.

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
- **WHEN** the turn moves to any token
- **THEN** the GM gets no banner
