# initiative-turns Specification

## Purpose
Says who can move and edit the encounter's turn order and how: players ending their own token's turn, the GM stepping the turn back, the GM's initiative controls, the GM adding and removing tokens mid-encounter, deleted tokens leaving the order, and AI seats ending their turn (FR-GM-21).

## Requirements

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
While an encounter is running, the GM's initiative controls SHALL show **Previous turn** and **Next turn** side by side at equal width, with Next turn as the primary, accent-colored action and Previous turn as a secondary action. When rulings are pending, the "N rulings pending" reminder SHALL show below those two buttons. **End encounter** SHALL be a secondary danger button of normal size on a row below, aligned to the end of the row, with a small gap separating it from the row above. **Add to encounter** SHALL be a secondary button at the start of that same row. End encounter SHALL ask the GM to confirm before ending the encounter, and SHALL end it only on confirmation. Cancel SHALL be the default choice. Each entry in the GM's turn order SHALL offer **Remove from order**, labelled with the token's name for assistive technology. **Add to encounter** opens a dialog that works like the Start encounter dialog. It lists every token on the board that is not in the order, each with an include checkbox, its color, its name, its rolled result and a score field pre-filled with its saved score. No token SHALL be checked when the dialog opens. Above the list it SHALL show a checkbox for each group and a **Players' tokens** checkbox. Ticking a group SHALL check that group's tokens that are not in the order; ticking Players' tokens SHALL check the tokens owned by an active player that are not in the order. The GM SHALL be able to check or uncheck any single token by hand. The same dice builder and Roll as the Start encounter dialog SHALL roll for the checked tokens. Submitting SHALL add every checked token that has a score in one action, using the same score checks and messages as the Start encounter dialog. When every token on the board is already in the order, the dialog SHALL say so instead of showing the list. Players SHALL NOT be shown these controls.

#### Scenario: Controls in order
- **WHEN** the GM opens the Play tab during an encounter with 2 rulings pending
- **THEN** they see Previous turn and Next turn side by side, "2 rulings pending" under them, and a row below with Add to encounter at the start and End encounter at the end

#### Scenario: Confirm ending
- **WHEN** the GM clicks End encounter and then Cancel
- **THEN** the encounter is still running with the same turn order

#### Scenario: Confirmed end
- **WHEN** the GM clicks End encounter and confirms
- **THEN** the encounter ends for everyone

#### Scenario: Add reinforcements by group
- **WHEN** the GM clicks Add to encounter, ticks the "Orcs" group (Orc 1 and Orc 2), clicks Roll, and then Add
- **THEN** both orcs join the order by their scores for everyone, in one action

#### Scenario: Only tokens outside the order are listed
- **WHEN** Aria, Goblin and Wolf are in the order and Orc and Bat are on the board but not in it, and the GM clicks Add to encounter
- **THEN** the dialog lists only Orc and Bat, neither checked

#### Scenario: Players see no edit controls
- **WHEN** a player opens the Play tab during an encounter
- **THEN** they see no Remove from order or Add to encounter controls

### Requirement: AI seat ends its turn
An AI seat SHALL be able to end the turn of the token it controls when that token is active. It SHALL be held to the same checks as a player ending their own turn. A refusal SHALL tell the seat why: no encounter is running, it isn't that token's turn, or the seat doesn't control the token.

#### Scenario: AI seat hands the turn on
- **WHEN** an AI seat controls Aria, it is Aria's turn, and the seat ends its turn
- **THEN** the turn moves to the next token for everyone

#### Scenario: Not its turn
- **WHEN** an AI seat tries to end its turn while it is Goblin's turn
- **THEN** the seat is told it isn't its turn, and the turn doesn't move

### Requirement: GM adds tokens to a running encounter
While an encounter is running, the GM SHALL be able to add one or more tokens (up to 60) that are not in the turn order in one action, each with a score (a whole number from -99 to 999) that the GM types or rolls. The server SHALL place each token by score among the tokens already in the order and the others being added, highest first, ordering ties exactly as starting an encounter does, using each token's saved score. The order SHALL NOT depend on the order in which the tokens were listed. Each score SHALL be saved on its token as its initiative score. The token whose turn it is SHALL keep the turn and the round SHALL NOT change. A token placed before the active token SHALL get its first turn in the next round. The server SHALL refuse the whole action, adding no token, when any of it is refused:
- a player's request (forbidden);
- a request when no encounter is running (invalid);
- a request with no tokens or more than 60 (invalid);
- a token that does not exist (not found);
- a token already in the order (invalid);
- the same token listed twice (invalid);
- a score outside -99 to 999 (invalid).

The activity log SHALL record each token the GM added to the turn order.

#### Scenario: Join mid-round
- **WHEN** the order is Aria 18, Goblin 15, Wolf 9, it is Goblin's turn, and the GM adds Orc with 16
- **THEN** the order is Aria, Orc, Goblin, Wolf, and it is still Goblin's turn in the same round

#### Scenario: Join after the active token
- **WHEN** it is Goblin's turn and the GM adds Bat with 3
- **THEN** Bat is last in the order and takes its turn this round after Wolf

#### Scenario: Two reinforcements at once
- **WHEN** the order is Aria 18, Goblin 15, Wolf 9, it is Goblin's turn, and the GM adds Bat with 3 and Orc with 16 in one action
- **THEN** the order is Aria, Orc, Goblin, Wolf, Bat, and it is still Goblin's turn in the same round

#### Scenario: Already in the order
- **WHEN** the GM adds Aria while Aria is in the order
- **THEN** the server refuses it and the order doesn't change

#### Scenario: One bad token refuses all
- **WHEN** the GM adds Orc with 16 and Aria, who is already in the order, in one action
- **THEN** the server refuses it, Orc is not added, and the order doesn't change

#### Scenario: Player refused
- **WHEN** a player sends a request to add a token to the order
- **THEN** the server refuses it as forbidden

#### Scenario: Hidden token joins
- **WHEN** the GM adds a hidden Assassin to the order
- **THEN** players' turn order is unchanged and nothing about the Assassin reaches them

### Requirement: GM removes a token from a running encounter
While an encounter is running, the GM SHALL be able to remove any token from the turn order. The token SHALL stay on the board. The token whose turn it is SHALL keep the turn and the round SHALL NOT change. Removing the active token SHALL move the turn to the token after it, exactly as ending its turn would, wrapping to the next round when it was last. Removing the only token left SHALL end the encounter, and the GM's controls SHALL ask the GM to confirm that first, with Cancel as the default choice. The server SHALL refuse:
- a player's request (forbidden);
- a request when no encounter is running (invalid);
- a token that is not in the order (invalid).

The activity log SHALL record that the GM removed the token from the turn order.

#### Scenario: Remove before the active token
- **WHEN** the order is Aria, Goblin, Wolf, it is Goblin's turn, and the GM removes Aria
- **THEN** the order is Goblin, Wolf and it is still Goblin's turn

#### Scenario: Remove the active token
- **WHEN** it is Goblin's turn and the GM removes Goblin
- **THEN** it is Wolf's turn in the same round

#### Scenario: Remove the active last token
- **WHEN** it is Wolf's turn in round 2, Wolf is last, and the GM removes Wolf
- **THEN** it is the first token's turn in round 3

#### Scenario: Remove the last token
- **WHEN** Goblin is the only token in the order and the GM removes it and confirms
- **THEN** the encounter ends for everyone and Goblin is still on the board

#### Scenario: Cancel removing the last token
- **WHEN** Goblin is the only token in the order and the GM clicks Remove and then Cancel
- **THEN** the encounter is still running with Goblin in the order

### Requirement: Deleting a token takes it out of the turn order
When a token in the turn order is deleted, whether the GM deletes it, it goes with a departing player, or it is removed for being defeated, it SHALL leave the order in the same action, following the same rules as the GM removing it: the token whose turn it is keeps the turn, deleting the active token moves the turn on, and deleting the only token left ends the encounter. A deleted token SHALL NOT be shown in the order as a removed entry. Turn orders recorded before this change that already hold deleted tokens SHALL keep showing them as before.

#### Scenario: GM deletes a goblin
- **WHEN** the order is Aria, Goblin, Wolf, it is Wolf's turn, and the GM deletes Goblin
- **THEN** the order is Aria, Wolf and it is still Wolf's turn

#### Scenario: Defeated on its own turn
- **WHEN** it is Goblin's turn, Goblin drops to 0 HP, and the room removes defeated tokens
- **THEN** Goblin is gone from the board and the order, and it is the next token's turn

#### Scenario: Last token defeated
- **WHEN** Goblin is the only token in the order and is removed for being defeated
- **THEN** the encounter ends for everyone

#### Scenario: Hidden token deleted
- **WHEN** the GM deletes a hidden token that is in the order
- **THEN** players' turn order is unchanged and nothing about the hidden token reaches them

### Requirement: Undoing a defeat removal leaves the turn order alone
Undoing the action that removed a defeated token SHALL put the token back on the board with its saved initiative score, and SHALL NOT change the turn order, the round, the token whose turn it is, or whether an encounter is running. An encounter that the removal ended SHALL NOT be restarted. The GM SHALL be able to put the token back in a running encounter with Add to encounter.

#### Scenario: Undo during the same encounter
- **WHEN** Goblin is removed for being defeated in round 2, and the GM undoes the removal in round 3
- **THEN** Goblin is back on the board, the order doesn't include Goblin, and it is still the same token's turn in round 3

#### Scenario: Undo during a later encounter
- **WHEN** Goblin is removed for being defeated, that encounter ends, a new encounter starts without Goblin, and the GM undoes the removal
- **THEN** Goblin is back on the board and the new encounter's order is unchanged

#### Scenario: Undo after the encounter ended
- **WHEN** the last token in the order is removed for being defeated, ending the encounter, and the GM undoes the removal
- **THEN** the token is back on the board and no encounter is running
