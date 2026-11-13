# attack-range Specification

## Purpose
Lets a named attack say how far it reaches, so the attack panel can show which targets are in range. Range is a hint for the table and never stops a roll.

## Requirements

### Requirement: A named attack has a range
Each named attack SHALL have a range, which is one of:
- **Unlimited**: no limit. Attacks saved before this requirement SHALL read as Unlimited.
- **Melee**, with an optional **reach**: a number greater than 0 and at most 9999. A melee attack with no reach SHALL mean one square on whatever map it is used.
- **Ranged**, with a **distance**: a number greater than 0 and at most 9999.

The attack editor, wherever named attacks are edited (the Attack section, the token editor, New Token and the library's creature editor), SHALL offer **Range** with the choices Unlimited, Melee and Ranged:
- Choosing Melee SHALL show a Reach field, pre-filled with one square's worth of distance: the room's distance per square in a room, or the GM's default distance per square outside one (5 when there is none). Saving with Reach left at that pre-filled value SHALL save a melee attack with no reach. Any other value SHALL be saved as typed.
- Choosing Ranged SHALL show a Distance field.
- Each field SHALL be followed by the unit label: the room's in a room, or the GM's default label outside one (`ft` when there is none).

A range number SHALL be stored exactly as entered and SHALL NOT be converted. Changing a room's distance per square or unit label SHALL NOT change any attack's number. The server MUST refuse an attack whose range is not one of these shapes or breaks these limits. A range SHALL reach only those who receive the attack itself: the GM and the token's owners. A roll made with a named attack SHALL carry only whether the attack is Melee or Ranged, never its reach or distance, to every viewer of the roll, so every board plays the same animation (see `board-attack-effects`). The server SHALL take this from the actor's own named attack, and SHALL ignore one supplied by a client.

#### Scenario: A ranged attack
- **WHEN** the GM edits Aria's "Longbow" in a room measured in `ft`, chooses Ranged and enters 80
- **THEN** the field reads "80 ft", and Aria's Longbow is saved as ranged 80 for the GM and Aria's owners

#### Scenario: Melee keeps one square
- **WHEN** an owner chooses Melee for "Longsword" in a 5 ft room and saves without changing Reach from 5
- **THEN** Longsword is saved as melee with no reach, and on a map of 1.5 m per square it still reaches one square

#### Scenario: Melee with a longer reach
- **WHEN** the GM chooses Melee for "Glaive" and sets Reach to 10
- **THEN** Glaive is saved as melee with reach 10

#### Scenario: Unit label change does not convert
- **WHEN** a room's unit label changes from `ft` to `m`
- **THEN** Longbow still has range 80, now shown as "80 m"

#### Scenario: Old attacks have no range
- **WHEN** a room or creature holds attacks saved before ranges existed
- **THEN** they load with range Unlimited, and every target counts as in range for them

#### Scenario: Other players learn only melee or ranged
- **WHEN** Aria's owner rolls her Ranged 80 "Longbow" while another player, who doesn't own Aria, is connected
- **THEN** that player's copy of the roll says the attack is ranged, and nothing in it gives the 80

#### Scenario: Forged range kind ignored
- **WHEN** a client sends a roll labelled "Longsword" that claims the attack is ranged, while Aria's Longsword is Melee
- **THEN** the stored roll says melee

#### Scenario: Forged range refused
- **WHEN** a client saves an attack with a ranged distance of 0 or −10, or a range of kind `"thrown"`
- **THEN** the server refuses the change and the attack is unchanged

### Requirement: How range is measured
The distance from an attacker to a target SHALL be the shortest distance from any square the attacker occupies to any square the target occupies, counted in squares with the room's Diagonals rule and multiplied by the room's distance per square. A token smaller than one square SHALL occupy the square its centre is in. A target is **in range**:
- for **Unlimited**, always;
- for **Melee**, when the two tokens' squares touch at a side or a corner, or overlap, whatever the reach and the Diagonals rule. With a reach, it is also in range when the distance is at most the reach;
- for **Ranged**, when the distance is at most the range. A Ranged attack SHALL NOT treat touching tokens as in range for that reason alone.

No game-specific exception SHALL apply. For example, under Alternating (1, 2) a target two squares away diagonally is 15 ft away on a 5 ft grid and is out of a 10 ft reach.

#### Scenario: Large target
- **WHEN** Aria (one square) stands with one empty square between her and a Large ogre (2×2 squares) on a 5 ft grid
- **THEN** the distance is 10 ft, measured to the ogre's nearest square, not its centre

#### Scenario: Diagonal neighbour under Euclidean
- **WHEN** the room uses Euclidean and a goblin stands diagonally next to Aria, who attacks with a Melee Longsword
- **THEN** the goblin is in range

#### Scenario: Reach under different rules
- **WHEN** a goblin stands two squares diagonally from Aria on a 5 ft grid and she attacks with a Melee Glaive of reach 10
- **THEN** the goblin is in range under Equal cost (10 ft), and out of range under Alternating (1, 2) (15 ft) and Euclidean (about 14.1 ft)

#### Scenario: Ranged has no adjacency exception
- **WHEN** an attack is Ranged 3 and its target is adjacent on a 5 ft grid
- **THEN** the target is out of range

### Requirement: The target list and picker show range
For an attack with a range, the attack panel's target list SHALL list the in-range targets first, nearest first, each with its distance. Below them, it SHALL list the out-of-range targets, nearest first, in a group headed "Out of range" with its count. That group SHALL start collapsed every time the list is opened, and SHALL NOT be hidden or disabled: its targets SHALL be choosable like any other. When no target is in range, the list SHALL say so above the group. For an attack with range Unlimited, or for a custom roll, the list SHALL be as today. The multi-target list SHALL group its targets the same way.

The attack that range is checked against SHALL be the named attack chosen in the Attack section. While the custom roll builder is in use, no range applies.

When the chosen target is out of range for that attack, the target picker SHALL say "Out of range" in red; it SHALL NOT be outlined in red. The out-of-range group and its targets SHALL be shown less prominently than the targets in range. On the multi-target list, each out-of-range target that is chosen SHALL be marked red. Red SHALL NOT rely on colour alone: the words "Out of range" SHALL be present for assistive technology. A target chosen on the board SHALL be shown the same way.

While picking on the board, when the token under the pointer is out of range for that attack, the line from the attacker and its distance label SHALL be drawn red, and the label SHALL add "Out of range", e.g. "30 ft · Out of range". Over an in-range token, or when no range applies, the line SHALL be drawn as before. Clicking an out-of-range token SHALL still choose it.

#### Scenario: Grouped list
- **WHEN** Aria's Longsword (Melee) is selected, Goblin 1 is adjacent and an Orc is 30 ft away
- **THEN** the list shows Goblin 1, then a collapsed "Out of range (1)" group that opens to show the Orc

#### Scenario: Choosing an out-of-range target
- **WHEN** the viewer opens the group and chooses the Orc
- **THEN** the Orc is the target, the picker says "Out of range" in red, and the Longsword can still be rolled

#### Scenario: Red line on the board
- **WHEN** Aria's Longsword (Melee) is chosen, her owner presses Pick on board, and moves the pointer from an adjacent goblin to an Orc 30 ft away
- **THEN** the line is drawn as usual over the goblin, and turns red labelled "30 ft · Out of range" over the Orc, and clicking the Orc makes it the target with the picker red

#### Scenario: Custom roll has no red line
- **WHEN** the custom roll builder is in use and the viewer picks on the board over a distant token
- **THEN** the line is drawn as usual

#### Scenario: Nothing in range
- **WHEN** every target is farther than Aria's Shortbow reaches
- **THEN** the list says that no target is in range, and the collapsed group still offers every target

#### Scenario: No range
- **WHEN** a named attack with range Unlimited or a custom roll is selected
- **THEN** the list shows every target nearest first with no group and nothing red

### Requirement: Range never blocks a roll
Range SHALL only change what the attack panel shows. A roll at an out-of-range target SHALL be made, stored, shown and animated exactly as one in range. The server SHALL NOT check range.

#### Scenario: Out-of-range roll accepted
- **WHEN** a player rolls a Melee attack at a target ten squares away
- **THEN** the server accepts the roll and every viewer sees it as usual
