## ADDED Requirements

### Requirement: Player turn notice
When the active turn moves to a token a player owns, and the player has the room open, the room SHALL show that player a notice over the board naming the token, with a control to show the token on the board and a control to dismiss the notice. The notice SHALL hide itself after 6 seconds, and the next turn change SHALL replace or clear it. The GM SHALL NOT get the notice. Loading the room during the player's turn SHALL NOT show it.

#### Scenario: Aria's turn starts
- **WHEN** the GM clicks Next turn and the turn moves from Goblin to Aria, owned by the player
- **THEN** the player sees "It's Aria's turn." with Show on board and Dismiss

#### Scenario: Someone else's turn
- **WHEN** the turn moves to a token the player doesn't own
- **THEN** the player gets no notice

#### Scenario: GM
- **WHEN** the turn moves to any token
- **THEN** the GM gets no turn notice
