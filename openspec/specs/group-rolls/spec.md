# group-rolls Specification

## Purpose
Lets the GM select several tokens on the board and have the server roll one dice formula once for each of them, so a save or check for a whole group is a single action and a single log entry.

## Requirements

### Requirement: GM selects several tokens
The GM SHALL be able to build a token selection on the board in two ways:
- **Shift-click** SHALL add a token the GM can see to the selection, or remove it if it is already selected. A plain click SHALL keep its current single-selection behavior.
- **From a template**: the selection controls SHALL offer **From template**, which puts the GM's board into template-picking mode (crosshair cursor; `Esc` or right-click cancels). Clicking a placed area template SHALL replace the selection with every token whose footprint touches the template's area, including tokens that are hidden or under fog, and SHALL leave picking mode. A token touches the area when any part of its footprint (its size in grid cells, centred on its position) overlaps the area. Merely sharing an edge or corner SHALL NOT count.

After either, the GM SHALL be able to add or remove tokens with shift-click and from a list of the selected tokens. Selected tokens SHALL be marked on the GM's board. The selection SHALL be local to the GM: nothing SHALL be sent to other participants until a roll is made. Players SHALL NOT be offered shift-click selection or From template.

#### Scenario: Shift-click builds a selection
- **WHEN** the GM shift-clicks Goblin 1, Goblin 2 and then Goblin 1 again
- **THEN** only Goblin 2 is selected

#### Scenario: Select tokens from a template
- **WHEN** a 20 ft circle covers Goblin 1 and the edge of a Large Ogre's footprint, and Goblin 2 stands just outside it
- **THEN** picking that template with From template selects Goblin 1 and the Ogre, and not Goblin 2

#### Scenario: Edit the template's selection
- **WHEN** the GM picks a template with From template and then shift-clicks one of the selected tokens and one outside the area
- **THEN** the first is removed and the second is added

#### Scenario: Selection is private
- **WHEN** the GM selects three tokens
- **THEN** players' boards show no selection and nothing is sent to them

### Requirement: The server rolls one formula for each selected token
A group roll SHALL take a list of 1 to 30 distinct tokens and one dice expression of the form accepted by the existing dice roller (`NdX + M`, 1 to 20 dice). The server SHALL roll the expression once for each token, independently, and SHALL record every token's dice and total together as a single group roll. Only the GM SHALL be able to make a group roll. The server SHALL refuse:
- a player's group roll (forbidden);
- an empty token list, a repeated token, or more than 30 tokens (invalid);
- a token that does not exist (not found);
- an expression the dice roller would refuse (invalid).

A group roll SHALL take one entry in the room's recent roll log, however many tokens it holds.

#### Scenario: One roll per token
- **WHEN** the GM makes a group roll of `1d20+2` for Goblin 1, Goblin 2 and the Ogre
- **THEN** the log has one new entry holding three separate `1d20+2` results, one per token

#### Scenario: Player refused
- **WHEN** a player sends a group roll
- **THEN** the server refuses it as forbidden and nothing is recorded

#### Scenario: Bad expression
- **WHEN** the GM makes a group roll of `1d20+banana`
- **THEN** the server refuses it as invalid

### Requirement: Group roll in the Dice tab
The GM's Dice tab SHALL offer **Group roll**. It SHALL show the current selection (and how many tokens it holds), a formula field, an optional label of at most 40 characters, and the Dice tab's existing public / GM-only choice. **Roll** SHALL be disabled while nothing is selected. Players SHALL NOT be offered Group roll.

The roll log SHALL show a group roll as one entry with its formula, label, and each token's name and total.

On a viewer's board, a group roll SHALL animate the results that viewer was sent: each token's dice SHALL be thrown onto that token with the same throw, die size and linger as a Roll-button roll, every token's throw leaving together, so the roll lands as soon as a single throw does, however many tokens there are. A GM-only group roll SHALL animate on the GM's board only. When one group roll would show more than about 40 dice, each token SHALL instead get a single die showing its total, dropped straight onto it. The roll log entry SHALL show the totals once the dice have landed. With reduced motion, nothing SHALL animate.

#### Scenario: Dice on each token
- **WHEN** the GM makes a public group roll of 1d20 for three goblins
- **THEN** a die is thrown onto each goblin on every board, and all three land together

#### Scenario: Group roll from the Dice tab
- **WHEN** the GM selects Goblin 1 and Goblin 2, enters `1d20+2` labelled "Dex save", and rolls publicly
- **THEN** the roll log shows one entry "Dex save · 1d20+2" listing "Goblin 1 · 14" and "Goblin 2 · 9"

#### Scenario: Nothing selected
- **WHEN** the GM opens Group roll with no tokens selected
- **THEN** Roll is disabled

### Requirement: Group roll visibility
A group roll SHALL follow the existing roll visibility (FR-GM-22):
- a GM-only group roll SHALL never reach a player;
- a public group roll SHALL reach every participant, but each player SHALL see only the results for tokens they can currently see. Results for hidden tokens and tokens under fog SHALL be left out entirely, not shown as unknown, so the number of results reveals nothing.

#### Scenario: Hidden token left out
- **WHEN** the GM makes a public group roll for Goblin 1 and a hidden Assassin
- **THEN** players see the entry with only Goblin 1's result, and the GM sees both

#### Scenario: GM-only group roll
- **WHEN** the GM makes a GM-only group roll
- **THEN** players receive nothing about it
