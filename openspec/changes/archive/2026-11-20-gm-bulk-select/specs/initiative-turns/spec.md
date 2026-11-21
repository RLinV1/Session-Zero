## MODIFIED Requirements

### Requirement: GM initiative controls
While an encounter is running, the GM's initiative controls SHALL show **Previous turn** and **Next turn** side by side at equal width, with Next turn as the primary, accent-colored action and Previous turn as a secondary action. When rulings are pending, the "N rulings pending" reminder SHALL show below those two buttons. **End encounter** SHALL be a secondary danger button of normal size on a row below, aligned to the end of the row, with a small gap separating it from the row above. **Add to encounter** SHALL be a secondary button at the start of that same row. End encounter SHALL ask the GM to confirm before ending the encounter, and SHALL end it only on confirmation. Cancel SHALL be the default choice. Each entry in the GM's turn order SHALL offer a checkbox, labelled "Select <name>" for assistive technology, that adds the token to the GM's selection or takes it out (ADR 0074). While any selected token is in the order, one **Remove N from encounter** button SHALL show under the list, with a **Clear** control for the selection. An entry whose token no longer exists SHALL offer **Remove from order** instead, since it can't be selected. **Add to encounter** opens a dialog that works like the Start encounter dialog. It lists every token on the board that is not in the order, each with an include checkbox, its color, its name, its rolled result and a score field pre-filled with its saved score. No token SHALL be checked when the dialog opens. Above the list it SHALL show a checkbox for each group and a **Players' tokens** checkbox. Ticking a group SHALL check that group's tokens that are not in the order; ticking Players' tokens SHALL check the tokens owned by an active player that are not in the order. The GM SHALL be able to check or uncheck any single token by hand. The same dice builder and Roll as the Start encounter dialog SHALL roll for the checked tokens. Submitting SHALL add every checked token that has a score in one action, using the same score checks and messages as the Start encounter dialog. When every token on the board is already in the order, the dialog SHALL say so instead of showing the list. Players SHALL NOT be shown these controls.

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
- **THEN** they see no checkboxes, Remove or Add to encounter controls

## ADDED Requirements

### Requirement: Turn order starts at the active turn
The turn order SHALL list from the active turn on, wrapping past the last token into the next round, so the active turn is always the first row. Each row SHALL keep its place in the order beside its name. Where the list wraps, a "Round N" divider SHALL mark it, and the first row of the next round SHALL say so to assistive technology. Players SHALL see the same list.

#### Scenario: Late in the round
- **WHEN** it is the tenth token's turn of eleven in round 2, and the list is unfolded
- **THEN** the rows read 10 (active), 11, a "Round 3" divider, then 1 to 9

### Requirement: Turn order folds past three rows
When more than four tokens are in the order, the turn order SHALL show three rows and fold the rest into one row reading "+N more", N being how many are hidden. That row SHALL be a button exposing its state with `aria-expanded`. Activating it SHALL show every row and read "Show fewer"; activating it again SHALL fold them. While folded rows hold selected tokens, the fold row SHALL say how many.

#### Scenario: Eleven combatants
- **WHEN** eleven tokens are in the order and it is the first token's turn
- **THEN** the list shows the first three rows and "+8 more"

#### Scenario: Unfold and fold
- **WHEN** the viewer activates "+8 more" from the keyboard, and then "Show fewer"
- **THEN** all eleven rows show with the toggle expanded, and then three rows again with it collapsed

#### Scenario: Four tokens
- **WHEN** four tokens are in the order
- **THEN** all four rows show and there is no fold row

### Requirement: GM removes several tokens from a running encounter
The GM SHALL be able to remove every selected token that is in the turn order in one action, with **Remove N from encounter**. The tokens SHALL stay on the board. The turn SHALL end up where removing them one at a time in turn order would leave it. When the selection is the whole order, removing it ends the encounter, and the GM's controls SHALL ask first, with Cancel as the default choice.

#### Scenario: Remove a wave
- **WHEN** it is Hush Clock's turn, and the GM selects Party Oil, Gloam Moth 3, Old Wick, Hush Clock and Ysolde Crane and clicks Remove 5 from encounter
- **THEN** all five leave the order in one action for everyone, and the turn passes to the next token left

#### Scenario: Remove everything
- **WHEN** the GM selects every token in the order and clicks Remove from encounter
- **THEN** a confirmation asks first, and only confirming ends the encounter

### Requirement: Removing several is all or none
The server SHALL refuse the whole removal, removing nothing, for a player (forbidden), with no encounter running (invalid), or when any token is not in the order (invalid). Like removing one token, it SHALL NOT be undoable: the GM adds tokens back with Add to encounter.

#### Scenario: One token outside the order
- **WHEN** the GM's request names Goblin, in the order, and Orc, which is not
- **THEN** it is refused and the order is unchanged
