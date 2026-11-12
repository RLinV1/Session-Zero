## Purpose

Says who can move the encounter's active turn and how: players ending their own token's turn, the GM stepping the turn back, the GM's initiative controls, and AI seats ending their turn (FR-GM-21).

## ADDED Requirements

### Requirement: Player ends their own turn
While an encounter is running, any owner of the active token SHALL be able to end that token's turn. The turn SHALL move on exactly as if the GM had clicked Next turn, wrapping to the next round after the last token. An end-turn request SHALL name the token whose turn it ends. The server SHALL refuse it when:
- there is no encounter running (invalid);
- the named token is not the active token, for example because the turn already moved on (invalid, and nothing changes);
- the sender does not own the named token (forbidden).

Pending rulings and an open Area Effect SHALL NOT prevent ending a turn, and SHALL stay pending afterwards. Players SHALL always be able to end their own turn; no room or table setting turns this off. The GM SHALL keep Next turn.

#### Scenario: Aria's owner ends the turn
- **WHEN** it is Aria's turn in round 2, Goblin is next, and Aria's owner ends the turn
- **THEN** it is Goblin's turn in round 2 for everyone

#### Scenario: End turn wraps the round
- **WHEN** Aria is last in the order and her owner ends her turn in round 2
- **THEN** it is the first token's turn in round 3

#### Scenario: End turn crosses Next turn
- **WHEN** the GM clicks Next turn and, before that reaches the player, Aria's owner ends Aria's turn
- **THEN** the turn moves on once, to the token after Aria, and the player's request is refused because Aria's turn already ended

#### Scenario: Not your token
- **WHEN** a player who doesn't own Goblin sends an end-turn for Goblin while it is Goblin's turn
- **THEN** the server refuses it as forbidden and the turn doesn't move

#### Scenario: Pending rulings stay
- **WHEN** Aria's to-hit roll is waiting for a ruling and her owner ends her turn
- **THEN** the turn moves on, and the roll is still in the GM's Rulings list

### Requirement: GM steps the turn back
Only the GM SHALL be able to step the turn back one. Stepping back from the first token in the order SHALL make it the last token's turn in the previous round. Stepping back SHALL be refused as invalid on the first turn of round 1, and when no encounter is running. A player's attempt SHALL be refused as forbidden. Stepping back SHALL move only the active turn; moves, rolls, HP changes and anything else done since SHALL stay. The activity log SHALL record it as a step back, naming the token whose turn it now is.

#### Scenario: Undo an accidental end turn
- **WHEN** Aria's owner ends her turn by accident, moving it to Goblin, and the GM clicks Previous turn
- **THEN** it is Aria's turn again in the same round, and the activity log says the GM stepped the turn back to Aria

#### Scenario: Back across a round
- **WHEN** it is the first token's turn in round 3 and the GM clicks Previous turn
- **THEN** it is the last token's turn in round 2

#### Scenario: First turn of the encounter
- **WHEN** it is the first token's turn in round 1 and the GM clicks Previous turn
- **THEN** the server refuses it and the turn doesn't move

#### Scenario: Players cannot step back
- **WHEN** a player sends a step-back request
- **THEN** the server refuses it as forbidden

#### Scenario: Hidden token
- **WHEN** the GM steps the turn back to a token hidden from players
- **THEN** players see that no visible token has the turn, and nothing about the hidden token reaches them

### Requirement: GM initiative controls
While an encounter is running, the GM's initiative controls SHALL show **Previous turn** and **Next turn** side by side at equal width, with Next turn as the primary, accent-colored action and Previous turn as a secondary action. When rulings are pending, the "N rulings pending" reminder SHALL show below those two buttons. **End encounter** SHALL be a secondary danger button of normal size on its own row below, aligned to the end of the row, with a small gap separating it from the row above. End encounter SHALL ask the GM to confirm before ending the encounter, and SHALL end it only on confirmation. Cancel SHALL be the default choice. Players SHALL NOT be shown these controls.

#### Scenario: Controls in order
- **WHEN** the GM opens the Play tab during an encounter with 2 rulings pending
- **THEN** they see Previous turn and Next turn side by side, "2 rulings pending" under them, and End encounter on its own row below

#### Scenario: Confirm ending
- **WHEN** the GM clicks End encounter and then Cancel
- **THEN** the encounter is still running with the same turn order

#### Scenario: Confirmed end
- **WHEN** the GM clicks End encounter and confirms
- **THEN** the encounter ends for everyone

### Requirement: AI seat ends its turn
An AI seat SHALL be able to end the turn of the token it controls when that token is active. It SHALL be held to the same checks as a player ending their own turn. A refusal SHALL tell the seat why: no encounter is running, it isn't that token's turn, or the seat doesn't control the token.

#### Scenario: AI seat hands the turn on
- **WHEN** an AI seat controls Aria, it is Aria's turn, and the seat ends its turn
- **THEN** the turn moves to the next token for everyone

#### Scenario: Not its turn
- **WHEN** an AI seat tries to end its turn while it is Goblin's turn
- **THEN** the seat is told it isn't its turn, and the turn doesn't move
