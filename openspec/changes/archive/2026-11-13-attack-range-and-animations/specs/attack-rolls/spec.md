# Spec Delta

## MODIFIED Requirements

### Requirement: Choosing a target
The viewer SHALL be able to choose a target in either of two ways.

**Pick on board** SHALL put the viewer's board into targeting mode:
- The cursor SHALL be a crosshair.
- A line SHALL run from the attacking token to the token under the pointer, labeled with the distance in the room's grid units. Over empty board, it SHALL run to the square under the pointer instead, outlining that square, drawn partly transparent, with the label still solid. The line SHALL be drawn red when that token or square is out of range for the chosen named attack, as described in `attack-range`.
- Clicking another token the viewer can see SHALL choose it as the target.
- Clicking the attacking token SHALL NOT choose a target, and targeting mode SHALL continue.
- Clicking an empty square SHALL leave targeting mode without choosing, as `Esc` does. Dragging from empty board SHALL still pan the board and SHALL NOT leave targeting mode.
- `Esc` or a right-click SHALL leave targeting mode without choosing.

**The target list** SHALL show every token the viewer can see other than the attacker, nearest first, each with its distance in grid units. For a named attack with a range, it SHALL group the targets by range as described in `attack-range`. Choosing one SHALL make it the target.

Every distance shown while choosing a target, on the board line and in the list, SHALL be measured as described in `attack-range`: from the attacker's nearest occupied square to the target's nearest occupied square, using the room's Diagonals rule.

Targeting SHALL be local to the viewer. Nothing SHALL be sent to other participants until a roll is made. The chosen target SHALL stay selected after a roll until the viewer clears it, the target is no longer visible to the viewer, or the viewer makes it the attacker.

#### Scenario: Hovering shows the distance
- **WHEN** Aria's owner is picking on the board and the pointer is over Goblin 2, three squares away on a 5 ft grid
- **THEN** a line from Aria to Goblin 2 is labeled "15 ft"

#### Scenario: Choosing from the list
- **WHEN** Goblin 2 is 15 ft from Aria and an Orc is 30 ft away
- **THEN** the list shows "Goblin 2 · 15 ft" before "Orc · 30 ft", and choosing Goblin 2 makes it the target

#### Scenario: Distances follow the Diagonals rule
- **WHEN** the room uses Alternating (1, 2) and Goblin 2 is two squares diagonally from Aria on a 5 ft grid
- **THEN** both the board line and the list show "15 ft"

#### Scenario: Aiming at empty board shows the reach
- **WHEN** Aria's owner, with the Melee Longsword chosen, is picking on the board and moves the pointer over an empty square three squares away on a 5 ft grid
- **THEN** a fainter line runs from Aria to that square, outlined, red, labeled "15 ft · Out of range"

#### Scenario: Clicking empty board cancels
- **WHEN** the viewer clicks an empty square while picking on the board
- **THEN** the board returns to its previous tool, the target is unchanged, and nothing is sent; a drag from empty board pans instead and keeps targeting mode

#### Scenario: Cancelling
- **WHEN** the viewer presses `Esc` while picking on the board
- **THEN** the board returns to its previous tool, the target is unchanged, and no roll or ping is sent

#### Scenario: A token cannot target itself
- **WHEN** the viewer clicks the attacking token while picking on the board
- **THEN** no target is chosen and targeting mode continues

#### Scenario: Target stays for the damage roll
- **WHEN** Aria's owner rolls an attack at Goblin 2
- **THEN** Goblin 2 is still the target, and the next roll is made against it without choosing again

## ADDED Requirements

### Requirement: Previewing an attack's animation
The attack editor SHALL show a preview stage below its Animation picker. Choosing an animation SHALL play it once on the stage, from a stand-in attacker to a stand-in target, and a **Play** control SHALL play it again. When Automatic is chosen, the stage SHALL play what Automatic would play for the attack's Range choice: the built-in melee slash for Melee, the built-in arrow for Ranged or Unlimited. Changing the Range choice while Automatic is chosen SHALL update what the stage plays. The preview SHALL send nothing to the room and SHALL change no data. When the viewer prefers reduced motion, or the room has reduced animations on, the stage SHALL show the static version instead. When the stage cannot start on this device, the editor SHALL say that the preview is unavailable and SHALL still allow choosing and saving.

#### Scenario: Preview on choosing
- **WHEN** the GM opens Aria's "Longbow" in the attack editor and chooses "Arrow" in the Animation picker
- **THEN** the stage plays the arrow once, and Play plays it again

#### Scenario: Automatic follows the range
- **WHEN** the Animation picker is on Automatic and the GM switches Range from Ranged to Melee
- **THEN** the stage now plays the melee slash instead of the arrow

#### Scenario: Preview sends nothing
- **WHEN** the GM previews several animations and then cancels the editor
- **THEN** nothing is sent to the room, the attack is unchanged, and no other participant's board plays anything

### Requirement: Labels in the Animation picker
The attack editor's Animation picker SHALL show "Automatic" and every built-in animation by name with no tag. It SHALL tag the GM's library animations, and an attack's saved animation that is no longer in the library, with "(custom)". It SHALL NOT show the tags "(preset)", "(yours)" or "(animation)". Every name and tag SHALL be shown in the viewer's language.

#### Scenario: Custom tag only
- **WHEN** the GM opens the Animation picker while their library holds "Fire blade"
- **THEN** it lists "Automatic", the built-ins such as "Melee slash" and "Arrow" with no tag, and "Fire blade (custom)"

#### Scenario: Saved copy is custom
- **WHEN** an attack has an animation copied from a library entry that has since been deleted
- **THEN** the picker shows it as "Saved animation (custom)"

#### Scenario: Translated
- **WHEN** a viewer using zh-TW opens the picker
- **THEN** "Automatic", the built-in names and the custom tag are shown in zh-TW

### Requirement: Named attacks show their range and rolls
The Attack section SHALL be ordered: the attacker, then the named attack, then the target, then the roll, because the target list depends on the chosen attack's range. Each named attack, on its card and in the list of attacks, SHALL show its range ("Melee: 5 ft", "Ranged: 80 ft" or "Unlimited", in the room's units), its attack roll and its damage roll, under a divider from its name. A roll SHALL be shown in full with its die, such as "1d20+4", never as a bare modifier. Each value SHALL carry its name ("Range", "Attack roll", "Damage roll") for assistive technology and on hover. The rolls SHALL stay together: every attack's line SHALL be on one row when the widest attack's line fits, and otherwise every attack SHALL show its range above its two rolls.

#### Scenario: The card spells the attack out
- **WHEN** Aria's chosen attack is a Longbow with range Ranged 80, attack roll 1d20+5 and damage 1d8+3
- **THEN** its card shows "Ranged: 80 ft", "1d20+5" and "1d8+3", and so does its entry in the list of attacks

#### Scenario: One layout for all
- **WHEN** one of a token's attacks has a line too wide for the card
- **THEN** every one of its attacks shows the range above its rolls, on the card and in the list
