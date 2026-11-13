# initiative-mass-roll Specification

## Purpose
Lets the GM roll initiative at once for every checked token in the Start encounter and Add to encounter dialogs, privately, and still see each token's roll after adjusting its score.

## Requirements

### Requirement: Roll initiative for the checked tokens
The GM's Start encounter and Add to encounter dialogs SHALL each show, below the group checkboxes and above the token list, the app's dice builder (the same one every other roll in the app uses) set to one d20, and a **Roll** button. Neither dialog SHALL offer a text field for typing a formula. Roll SHALL roll the built formula once for each token whose include checkbox is checked, independently, and SHALL NOT roll for unchecked tokens. Each checked token's rolled total SHALL replace the contents of its score field. Roll SHALL be disabled while no token is checked or a roll is still in progress. A roll the server refuses SHALL show the server's message in the dialog and change no field. The GM SHALL be able to roll again, which replaces the checked tokens' scores with the new results.

Rolling SHALL NOT start the encounter or add anyone to it: the GM SHALL still be able to edit any score and check or uncheck tokens, and then start the encounter or add the tokens as before.

When more than 30 tokens are checked, the roll SHALL still cover every checked token. It may be recorded as more than one group roll.

#### Scenario: Only checked tokens are rolled
- **WHEN** Aria and Goblin are checked, Wolf is unchecked, and the GM rolls 1d20
- **THEN** Aria's and Goblin's score fields hold their rolled totals, and Wolf's field is unchanged

#### Scenario: Formula with a modifier
- **WHEN** the GM sets the dice builder to 1d20 + 2 and rolls for Goblin 1 and Goblin 2
- **THEN** each goblin's field holds its own d20 result plus 2

#### Scenario: Dice builder, not a text field
- **WHEN** the GM opens the Start encounter or Add to encounter dialog
- **THEN** the formula is shown in the same dice builder as the Dice panel, set to one d20, and there is no text field for a formula

#### Scenario: Edit after rolling
- **WHEN** the GM rolls, Goblin gets 7, and the GM types 9 in Goblin's field and starts the encounter
- **THEN** Goblin enters the turn order with 9

#### Scenario: Refused roll
- **WHEN** the GM clicks Roll and the server refuses the roll
- **THEN** the dialog shows the server's message and no score field changes

#### Scenario: Large encounter
- **WHEN** 40 tokens are checked and the GM clicks Roll
- **THEN** all 40 score fields are filled with rolled totals

#### Scenario: Roll in Add to encounter
- **WHEN** an encounter is running, the GM opens Add to encounter, checks Orc 1 and Orc 2, and clicks Roll
- **THEN** both orcs' score fields hold their rolled totals, and no token in the turn order is rolled for

### Requirement: Initiative rolls are the GM's alone
An initiative roll from either dialog SHALL be GM-only. It SHALL appear in the GM's roll log as a group roll labelled as initiative, and its dice SHALL be thrown on the GM's board. Players SHALL NOT receive the roll, its results, its dice throw, or which tokens it covered, in any snapshot, event or REST response. The dialog covering the thrown dice is acceptable.

#### Scenario: Player sees nothing
- **WHEN** the GM rolls initiative for three goblins while a player is connected
- **THEN** the player's roll log and board show no roll, and the player receives nothing naming the goblins or their results

#### Scenario: GM sees the throw
- **WHEN** the GM rolls initiative for Aria and Goblin
- **THEN** the dice are thrown on the GM's board at those tokens and the GM's roll log has one initiative entry for them

### Requirement: Each token's roll stays visible beside its score
In either dialog, after a roll, each rolled token's row SHALL show that token's rolled total to the left of its score field, with the dice that made it available to assistive technology and on hover. The shown result SHALL stay unchanged when the GM edits the score field, so the GM can refer back to it. Rolling again SHALL replace the shown result for the tokens rolled. A token unchecked after it was rolled SHALL keep its shown result, dimmed with the rest of its row. Shown results SHALL be cleared when the dialog closes, the encounter starts, or the tokens are added. The row SHALL fit at phone width without horizontal scrolling.

#### Scenario: Reference after editing
- **WHEN** Goblin rolls 7 and the GM changes Goblin's score to 9
- **THEN** Goblin's row still shows 7 to the left of the field holding 9

#### Scenario: Re-roll replaces the result
- **WHEN** Goblin rolled 7, and the GM rolls again with only Goblin checked and gets 15
- **THEN** Goblin's row shows 15

#### Scenario: Cleared on close
- **WHEN** the GM rolls, closes the dialog without starting, and opens it again
- **THEN** no rolled results are shown
