## MODIFIED Requirements

### Requirement: Named attacks hold mixed dice
A named attack's to-hit and damage rolls SHALL each be a list of die terms (each 1 to 20 dice of d4, d6, d8, d10, d12, d20 or d100, no repeated die type, 20 dice in all) and a modifier from −99 to 99. Named attacks saved before this change, with one die type, SHALL load with the same dice. Wherever a named attack's dice are shown, they SHALL read as its formula, e.g. "2d6+1d4+3".

Named attacks of the one-die form SHALL load with the same dice wherever they are stored: in a room's event history, in an encounter template, in a saved creature, and in an AI build draft. Every room snapshot and event the server sends SHALL carry named attacks in the current form only. Events the server writes from stored data, for example when an encounter template is applied, SHALL carry the current form. Stored events SHALL NOT be rewritten to achieve this.

If a token's named attack holds dice that can be read in neither form, the Attack section and every other place that shows the attack SHALL keep working. That attack SHALL show no formula and SHALL NOT be rollable, and the token's other attacks SHALL stay usable.

#### Scenario: Flame tongue
- **WHEN** the GM gives Aria an attack "Flame tongue" with damage 2 × d6, 1 × d8 and a modifier of 3, and saves
- **THEN** Aria's attack lists damage `2d6+1d8+3`, and Roll damage rolls exactly that

#### Scenario: Older attack
- **WHEN** a creature saved last month with damage 1d8+3 is placed
- **THEN** the token's attack rolls `1d8+3`

#### Scenario: Older attack in room history
- **WHEN** a room's stored history gave a token the attack "Bite" with to-hit `{ count: 1, sides: 20, modifier: 4 }` before mixed dice existed, and the GM opens the room
- **THEN** the room loads, the Attack section lists Bite with to-hit `+4`, and rolling it rolls `1d20+4`

#### Scenario: Older attack in an encounter template
- **WHEN** the GM applies an encounter template saved before mixed dice, whose goblin has damage `{ count: 1, sides: 6, modifier: 2 }`
- **THEN** the placed goblin's attack rolls `1d6+2`, and the event that placed it carries the dice in the current form

#### Scenario: History is not rewritten
- **WHEN** a room with one-die attacks in its history is loaded
- **THEN** its stored events are unchanged, and the activity log and replay show the same history as before

#### Scenario: Unreadable attack
- **WHEN** a token's stored attack "Claw" has damage dice that match neither form, and the GM opens the Play tab with that token as the attacker
- **THEN** the Attack section shows Claw without a formula and does not offer to roll it, and the token's other attacks can still be rolled
