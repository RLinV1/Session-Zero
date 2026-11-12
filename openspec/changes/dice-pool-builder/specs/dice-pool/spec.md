# Spec Delta

## Purpose

Defines the dice formula the table rolls (one or more die terms plus a constant), the one dice builder every roll input uses, and how a roll's individual dice are shown.

## ADDED Requirements

### Requirement: Dice formula
A dice formula SHALL be one or more die terms `NdX` followed by at most one constant modifier, e.g. `1d20+5`, `2d6+1d4+3`, `1d8-1`. Each die term SHALL have 1 or more dice; the formula SHALL have at most 20 dice in all. The modifier SHALL be a whole number. A formula written by the app SHALL be canonical: die terms in the order the user added them, no repeated die type, then the modifier, with no spaces (`2d6+1d4+3`). The server SHALL parse and roll every formula it receives and SHALL refuse one it cannot parse, one with no die term, more than 20 dice, a die with fewer than 2 or more than 1000 sides, or a modifier outside the bounds it accepts today. It SHALL roll each die independently, in the formula's order, and the total SHALL be the sum of every die plus the modifier. Formulas of the old single-term form (`NdX+M`, `dX`) SHALL keep their meaning.

#### Scenario: Mixed dice
- **WHEN** a participant rolls `2d6+1d4+3`
- **THEN** the server rolls two six-sided dice and one four-sided die, and the total is their sum plus 3

#### Scenario: Old form still works
- **WHEN** an MCP seat sends `d20+5`
- **THEN** it is rolled as one twenty-sided die plus 5, as before

#### Scenario: Too many dice
- **WHEN** a formula `15d6+6d8` reaches the server
- **THEN** it is refused as invalid because it has 21 dice

#### Scenario: Not a formula
- **WHEN** a formula `1d20+banana` reaches the server
- **THEN** it is refused as invalid

### Requirement: One dice builder for every roll input
Everywhere the app asks for a roll, it SHALL use the same dice builder, and SHALL NOT offer a text field for formulas. That includes the Dice panel's roll, Group roll, starting an Area Effect, rolling an Area Effect's damage (including a called player's prompt), the attack Custom roll, the named-attack editor wherever it appears (token editor, New Token, Attack section, creature form), the AI builder's draft creature editor, and the home page dice demo.

The builder SHALL show one row per die type, each with a number of dice and a die type chosen from d4, d6, d8, d10, d12, d20 and d100, and at most one modifier row with a whole number from −99 to 99:
- **+ Die** SHALL add a row for a die type not yet in the builder, with 1 die; it SHALL be unavailable once all seven die types are used or the builder holds 20 dice.
- **+ Modifier** SHALL add the modifier row at 0; it SHALL be unavailable while the modifier row is shown.
- Each row SHALL have a remove control, except that the last die row SHALL NOT be removable.
- A row's die type menu SHALL NOT offer a die type another row already uses.
- The number of dice SHALL keep the builder at 20 dice or fewer.

The builder SHALL show a small "+" between each of its rows, hidden from screen readers. It SHALL show the formula it makes, e.g. "2d6 + 1d4 + 3", and every control SHALL have an accessible name naming its row. Each place SHALL start the builder from its own default (for example 1 × d20 in the Dice panel, the attack's saved dice in the attack editor). The Dice panel SHALL NOT offer example rolls to pick from; the builder is the only way to choose dice there.

#### Scenario: Build a sneak attack
- **WHEN** a player sets 1 × d6 in Custom roll, presses + Die and picks d4 with 1 die, then presses + Modifier and types 3
- **THEN** the builder reads "1d6 + 1d4 + 3", and rolling sends `1d6+1d4+3`

#### Scenario: A die type only once
- **WHEN** the builder holds a d6 row and the user presses + Die
- **THEN** the new row's die menu does not offer d6

#### Scenario: Remove a row
- **WHEN** the builder holds 2d6, 1d4 and +3, and the user removes the 1d4 row
- **THEN** it reads "2d6 + 3"

#### Scenario: Twenty dice
- **WHEN** the builder holds 18d6 and the user presses + Die
- **THEN** a new row with 1 die is added, and its count cannot go above 2

#### Scenario: No text field
- **WHEN** a GM opens Group roll, Area Effect, or the Dice panel
- **THEN** each shows the dice builder and none shows a text box for a formula

#### Scenario: Rows read as a sum
- **WHEN** the builder holds 2d6, 1d4 and +3
- **THEN** a small "+" sits between the d6 and d4 rows and between the d4 and modifier rows

#### Scenario: No example rolls
- **WHEN** a player opens the Dice tab
- **THEN** it shows the dice builder starting at 1 × d20, and no example rolls such as `1d8+3` to pick from

### Requirement: Named attacks hold mixed dice
A named attack's to-hit and damage rolls SHALL each be a list of die terms (each 1 to 20 dice of d4, d6, d8, d10, d12, d20 or d100, no repeated die type, 20 dice in all) and a modifier from −99 to 99. Named attacks saved before this change, with one die type, SHALL load with the same dice. Wherever a named attack's dice are shown, they SHALL read as its formula, e.g. "2d6+1d4+3".

#### Scenario: Flame tongue
- **WHEN** the GM gives Aria an attack "Flame tongue" with damage 2 × d6, 1 × d8 and a modifier of 3, and saves
- **THEN** Aria's attack lists damage `2d6+1d8+3`, and Roll damage rolls exactly that

#### Scenario: Older attack
- **WHEN** a creature saved last month with damage 1d8+3 is placed
- **THEN** the token's attack rolls `1d8+3`

### Requirement: Per-die breakdown
The Dice panel's roll log, the group roll entries, and the board's roll pop-up SHALL show each die's result, grouped by die type in the formula's order, and the modifier, e.g. "2d6 (4, 2) + 1d4 (3) + 3", next to the total. A single-term roll SHALL read the same way, e.g. "1d20 (12) + 5". Rolls made before this change SHALL show their breakdown from their formula. In the roll pop-up the breakdown SHALL wrap instead of widening the pop-up, and SHALL NOT be part of what the pop-up announces to screen readers. The activity log SHALL keep showing only the formula and total.

#### Scenario: Pop-up shows each die
- **WHEN** Aria's owner rolls `2d6+1d4+3` and gets 4, 2 and 3
- **THEN** the board's roll pop-up shows 12 and "2d6 (4, 2) + 1d4 (3) + 3", and the roll log shows the same

#### Scenario: Activity log stays short
- **WHEN** the GM opens the activity log after that roll
- **THEN** it reads "… rolled 2d6+1d4+3: 12"

#### Scenario: Old roll
- **WHEN** a roll of `1d20+5` made before this change is in the log with a 12
- **THEN** it shows "1d20 (12) + 5"

### Requirement: Mixed dice on the board
When a roll mixes die types, the 3D dice in the Dice panel and every die thrown on the board SHALL each take the shape of its own die type. Board throws SHALL keep their existing die count limits; above them the existing fallback (one die per token showing its total) SHALL apply.

#### Scenario: Two shapes
- **WHEN** a player throws `1d20+1d4` onto the board
- **THEN** one twenty-sided die and one four-sided die are thrown, each showing its own result
