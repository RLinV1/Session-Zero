## ADDED Requirements

### Requirement: Public rolls are thrown on the board
When a public roll is made, every connected participant SHALL see its dice thrown over their board. When the dice land, each participant SHALL see a popup with the result:
- for an attack roll, the total as damage or to hit, and the attack's label, dice and parties;
- for any other roll, the total, and who rolled which dice.

The popup SHALL disappear after 4 seconds. The overlay SHALL NOT take pointer input. Rolls already made when the room loads, or when a viewer reconnects, SHALL NOT be thrown.

#### Scenario: GM's attack, seen by a player
- **WHEN** the GM rolls Firebomb (damage `2d6`) for 5 from Goblin against Aria, publicly
- **THEN** the player's board shows two dice thrown, then a popup "5 damage" and "Firebomb damage · 2d6 · Goblin → Aria"

#### Scenario: Player's plain roll, seen by the GM
- **WHEN** Pat rolls `1d20` in the Dice section and gets 19
- **THEN** the GM's board shows the die thrown, then a popup "19" and "Pat · 1d20"

### Requirement: Private rolls stay in the panel
A GM-only roll SHALL be thrown in the GM's panel tray: the Attack section's for their own attack, otherwise the Dice section's. It SHALL NOT be thrown on the board. The GM SHALL see its popup, marked GM only. Players SHALL see nothing of it.

#### Scenario: Private attack
- **WHEN** the GM rolls Scimitar privately
- **THEN** the dice are thrown in the Attack section's card, the GM's board shows a popup marked GM only, and the player's board shows nothing
