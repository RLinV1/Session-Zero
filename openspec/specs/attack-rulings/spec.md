# attack-rulings Specification

## Purpose
Lets the GM rule on attack rolls after they are made (Hit or Miss, and applying damage) and shows every participant the outcome. The GM always makes the call; the system never decides whether an attack hits.

## Requirements

### Requirement: Roll type on attack rolls
Every attack roll SHALL be either **To hit** or **Damage**, and the type SHALL be stored with the roll:
- a named attack's to-hit roll is To hit;
- a named attack's damage roll is Damage;
- a custom roll takes the type chosen in the Custom roll builder, which defaults to To hit and is remembered in the last-used custom settings for the token.

An attack roll made without a type, including every roll made before the roll type existed, SHALL count as To hit. The custom Roll control SHALL name the type, e.g. "Roll 1d20+5 to hit Goblin" or "Roll 1d8+3 damage to Goblin".

#### Scenario: Damage roll recorded as damage
- **WHEN** Aria's owner chooses Damage, 1d8+3, target Goblin in Custom roll, and rolls
- **THEN** the roll is recorded as a damage roll against Goblin

#### Scenario: Custom type is remembered
- **WHEN** the viewer rolls a custom Damage roll for Aria, reloads, and opens Custom roll for Aria
- **THEN** the roll type is set to Damage

### Requirement: GM rules on to-hit rolls
Only the GM SHALL be able to mark a to-hit attack roll **Hit** or **Miss**, change that verdict, or clear it. A verdict SHALL be accepted only for a to-hit attack roll still in the room's recent roll log. Otherwise:
- a roll that isn't in the log SHALL be answered as not found;
- a damage roll or a plain roll SHALL be refused as invalid;
- setting the verdict a roll already has SHALL be refused as invalid.

A player's attempt SHALL be refused as forbidden. Each ruling SHALL be recorded as a new event that carries the verdict it replaced. The roll itself SHALL never be rewritten. Everyone who can see the roll SHALL see its current verdict. The system SHALL NOT set a verdict by itself.

#### Scenario: GM marks a hit
- **WHEN** Aria's owner rolls 17 to hit Goblin and the GM marks it Hit
- **THEN** every participant who can see the roll sees it marked Hit, e.g. "Aria → Goblin · Longsword · 1d20+5 = 17 · Hit"

#### Scenario: GM corrects a verdict
- **WHEN** the GM changes that roll from Hit to Miss
- **THEN** everyone sees it marked Miss, and the recorded ruling carries Hit as the previous verdict

#### Scenario: Player cannot rule
- **WHEN** a player sends a ruling for any roll
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Damage rolls are not ruled
- **WHEN** the GM tries to mark a damage roll Hit
- **THEN** the server refuses it as invalid

### Requirement: GM applies damage
Only the GM SHALL be able to resolve a damage roll against its target. Resolving SHALL apply an amount the GM chooses and SHALL add any conditions the GM chooses, in one action:
- The amount SHALL be a whole number from −9999 to 9999. A positive amount SHALL lower the target's current HP, and the result SHALL NOT go below the lowest HP a token can hold. A negative amount SHALL heal, and healing SHALL NOT raise HP above the target's Max HP when it has one, nor lower HP. Zero SHALL leave HP unchanged.
- A resolve that does not state an amount SHALL apply the roll's total, with a negative total counting as zero, exactly as before this change.
- Conditions SHALL be added to the target's existing conditions and SHALL never remove one. Adding a condition the target already has SHALL change nothing for that condition. A token SHALL hold at most 12 conditions.

The server SHALL compute the new HP from the target's HP at the moment it resolves the roll. It SHALL refuse the resolve when:
- the roll is not a damage roll (invalid);
- it has already been applied (invalid);
- it is no longer in the recent roll log (not found);
- it was made on another scene (invalid);
- its target no longer exists (not found);
- its target does not track HP (invalid);
- the amount is outside the bounds above (invalid);
- it adds conditions while the room's game preset has conditions off (refused as for any other preset-disabled action);
- it would give the target more than 12 conditions (invalid).

A player's attempt SHALL be refused as forbidden. Resolving SHALL record the HP change, carrying the previous stats, whenever HP actually changes; SHALL record the condition change, carrying the previous conditions, whenever conditions actually change; and SHALL always record that the roll was applied, with the amount applied. The system SHALL NOT apply damage by itself. The GM SHALL be able to undo a resolve from the activity log as one action, restoring HP, conditions, and the roll's unapplied state together.

#### Scenario: Apply once
- **WHEN** Goblin has 15 HP, Aria's owner rolls 7 damage against it, and the GM resolves it leaving the amount at 7
- **THEN** Goblin has 8 HP, and the roll shows as applied to everyone who can see it

#### Scenario: Half damage
- **WHEN** Goblin has 15 HP, the damage roll is 9, and the GM presses Half and confirms
- **THEN** Goblin has 11 HP (9 halved, rounded down, is 4) and the roll shows as applied

#### Scenario: No damage, with a condition
- **WHEN** the damage roll is 6, and the GM presses None, checks Poisoned, and confirms
- **THEN** Goblin's HP is unchanged, Goblin gains Poisoned, and the roll shows as applied

#### Scenario: Older client without an amount
- **WHEN** a client sends a resolve for a 7-damage roll without an amount
- **THEN** 7 is applied, as before this change

#### Scenario: Double apply is refused
- **WHEN** the GM resolves the same damage roll a second time, e.g. from a second tap or a stale screen
- **THEN** the server refuses it as invalid and Goblin's HP and conditions are unchanged

#### Scenario: Target without HP
- **WHEN** the GM resolves a damage roll whose target has no HP set
- **THEN** the server refuses it as invalid

#### Scenario: Conditions off
- **WHEN** the room's preset has conditions off and a resolve adds Prone
- **THEN** the server refuses it and nothing changes

#### Scenario: Undo a resolve
- **WHEN** the GM resolves 4 damage and Prone on Goblin, then undoes that action from the activity log
- **THEN** Goblin's HP and conditions are back to what they were, and the roll is unapplied and back in the Rulings list

### Requirement: GM Rulings list
The GM's Play tab SHALL show a **Rulings** list, and players SHALL NOT be shown it. The list SHALL show, newest first, the attack rolls in the recent roll log that still need the GM and that the GM hasn't ignored, and the open Area Effect, if there is one:
- to-hit rolls without a verdict, each with the target's current AC and **Hit** and **Miss** controls. When the target has an AC, the control the roll points to SHALL be shown in the main button colour: **Hit** when the total is equal to or greater than the AC, **Miss** otherwise. This is only a hint: nothing is ruled until the GM chooses, and with no AC neither control is marked;
- damage rolls not yet applied whose target still tracks HP, each with the target's current HP, the rolled damage, an **Apply −N** control that applies the full damage at once (N being the roll's total, a negative total counting as 0), and a **Resolve** control that opens the damage resolve dialog for that roll;
- the open Area Effect, at every stage until it is resolved or closed, with its label, its number of targets, its stage, and the controls for that stage:
  - **Call**, **Resolve** and **Skip** after its group roll;
  - "Waiting on <caller>", **Reassign** and **Take over** while a player holds the call;
  - **Roll damage** while the GM holds the call;
  - **Resolve** and **Skip** once the damage is rolled.

**Resolve** in the Area Effect row SHALL open the area effect's resolve dialog, and SHALL have the same appearance as **Skip** until damage has been rolled and the same appearance as **Call** afterwards. These controls SHALL be full-size buttons. A roll SHALL leave the list once it is ruled, applied or ignored. An Area Effect SHALL leave the list once it is resolved or closed. The GM SHALL also be able to set, change or clear a verdict from the roll log in the Dice tab.

**Ignore and Clear all.** Each attack roll in the list SHALL have an **Ignore** control. While the list shows at least one attack roll, a **Clear all** control SHALL show at the top of the list. Clear all SHALL ignore every attack roll shown, and only those; a roll that arrives after the GM's list last updated SHALL stay. Neither control SHALL apply to the Area Effect row, which keeps its own controls. Only the GM SHALL be able to ignore rolls; a player's attempt SHALL be refused as forbidden. Ignoring a roll that isn't in the recent roll log SHALL be refused as not found, and ignoring one that is ruled, applied, already ignored, or not an attack roll SHALL be refused as invalid. When Clear all names several rolls, any that were ruled, applied or ignored in the meantime SHALL be skipped, and the request SHALL be refused only if none of its rolls can be ignored. Ignoring SHALL NOT change the roll's verdict, its total, or any token. An ignored roll SHALL stay in the roll log, where the GM can still rule on it. Ignoring SHALL be recorded as a new event, and the GM SHALL be able to undo it, which puts the rolls back in the list. Players SHALL NOT learn that a roll was ignored.

While any rolls or an Area Effect are pending:
- the GM's Play tab SHALL show how many, from any tab, counting an open Area Effect as one and leaving out ignored rolls;
- the initiative controls SHALL show "N rulings pending" below **Previous turn** and **Next turn**, with the same count. It SHALL NOT prevent advancing the turn.

#### Scenario: Pending roll appears with AC
- **WHEN** Aria's owner rolls 17 to hit Goblin, whose AC is 13
- **THEN** the GM's Rulings list shows "Aria → Goblin · 17" with "AC 13" and Hit and Miss controls

#### Scenario: Pending damage shows Resolve
- **WHEN** Aria's owner rolls 7 damage against Goblin, who has 15 HP
- **THEN** the GM's Rulings list shows the roll with Goblin's HP, the damage 7, an Apply −7 control and a Resolve control

#### Scenario: Quick apply
- **WHEN** the GM presses Apply −7 on that roll
- **THEN** Goblin loses 7 HP at once, no dialog opens, and the roll leaves the list

#### Scenario: AC points to a verdict
- **WHEN** Aria's owner rolls 13 to hit Goblin, whose AC is 13
- **THEN** Hit is shown in the main button colour, Miss is not, and the roll stays unruled until the GM chooses one

#### Scenario: Ruled roll leaves the list
- **WHEN** the GM marks that roll Hit
- **THEN** it leaves the Rulings list and shows as Hit in the roll log

#### Scenario: Pending count outside the Play tab
- **WHEN** the GM is on the Tokens tab and two rolls are waiting for a ruling
- **THEN** the Play tab shows 2, and the initiative controls show "2 rulings pending" under Previous turn and Next turn, which still work

#### Scenario: Players have no Rulings list
- **WHEN** a player opens the Play tab
- **THEN** there is no Rulings list, no pending count, and no ruling, resolve, apply, ignore or clear controls anywhere

#### Scenario: Area Effect waiting on a player counts
- **WHEN** one to-hit roll is unruled and an Area Effect "Fireball" is waiting on Mira
- **THEN** the Play tab shows 2, and the Rulings list shows "Fireball · 3 targets · Waiting on Mira" with Reassign and Take over

#### Scenario: Resolved effect leaves the list
- **WHEN** the GM resolves or closes the Area Effect
- **THEN** it leaves the Rulings list and the pending count drops by one

#### Scenario: Ignore one roll
- **WHEN** two to-hit rolls are pending and the GM clicks Ignore on one
- **THEN** it leaves the Rulings list, the pending count drops to 1, and the roll is still in the Dice tab's roll log without a verdict

#### Scenario: Clear all leaves the Area Effect
- **WHEN** three attack rolls and the Area Effect "Fireball" are pending and the GM clicks Clear all
- **THEN** the three rolls leave the list, "Fireball" stays, and the pending count is 1

#### Scenario: Roll arriving during Clear all
- **WHEN** the GM clicks Clear all with two rolls listed, and a third roll is made before that reaches the server
- **THEN** the two rolls are ignored and the third stays in the list

#### Scenario: Rule an ignored roll later
- **WHEN** the GM ignored Aria's to-hit roll and later marks it Hit from the roll log
- **THEN** the roll shows as Hit to everyone who can see it

#### Scenario: Undo an ignore
- **WHEN** the GM clicks Clear all on three rolls and then Undo
- **THEN** the three rolls are back in the Rulings list and the pending count is 3 again

#### Scenario: Player cannot ignore
- **WHEN** a player sends an ignore for any roll
- **THEN** the server refuses it as forbidden and nothing changes

### Requirement: Player sees the outcome
The Attack section SHALL show the viewer's latest attack roll, at the top of the section, with its current outcome:
- "Waiting for the GM" while a to-hit roll has no verdict;
- **Hit** or **Miss** once ruled;
- **Applied** once a damage roll has been applied.

**Roll damage after a Hit.**
- If the roll was made with one of the attacker's named attacks and that named attack has a damage roll, the section SHALL offer **Roll damage** with that named attack's dice. Tapping it SHALL immediately roll that damage against the same target, labeled "<attack> damage", with the same visibility as the to-hit roll it follows. A GM-only attack's damage SHALL stay GM-only whatever the GM's current setting.
- Otherwise **Roll damage** SHALL switch the Custom roll builder to Damage, open it and keep the same target, without rolling.

**The GM's own rolls.** The GM SHALL rule on and resolve their own attack rolls from the Rulings list, as for any other roll; the Attack section SHALL NOT offer separate ruling or resolve controls.

**Player tab indicator.** When the GM rules on, or resolves, a player's latest attack roll while that player is on another tab, the player's Play tab SHALL show an indicator until they open it.

The roll log SHALL show the verdict, or that damage was applied, on every attack roll.

#### Scenario: Waiting, then hit
- **WHEN** Aria's owner rolls to hit Goblin with the Longsword named attack
- **THEN** the top of their Attack section shows "Waiting for the GM", and once the GM marks it Hit, it shows Hit and offers "Roll damage 1d8+3"

#### Scenario: One-tap damage
- **WHEN** the owner taps Roll damage
- **THEN** a damage roll `1d8+3` labeled "Longsword damage" is made against Goblin at once

#### Scenario: Private attack, private damage
- **WHEN** the GM makes a GM-only to-hit roll, rules it Hit, switches tabs and back, and taps Roll damage
- **THEN** the damage roll is GM-only too, and players receive neither it nor a ping

#### Scenario: Ruling arrives on another tab
- **WHEN** Aria's owner rolls to hit, switches to the Dice tab, and the GM marks the roll Hit
- **THEN** the Play tab shows an indicator, which clears when the owner opens Play

#### Scenario: GM rules on their own roll
- **WHEN** the GM rolls Goblin A's to-hit against Aria
- **THEN** the roll appears in the GM's Rulings list with Hit and Miss, and the Attack section shows no ruling controls

### Requirement: Rulings never reveal hidden information
A player SHALL NOT receive a ruling or damage application for a GM-only roll, in any snapshot, live event or response. Ruling and application events SHALL NOT carry token IDs or names. An HP change from applying damage to a hidden target SHALL be withheld from players exactly as any other change to a hidden token. Where a roll names a hidden token, its verdict SHALL be shown to players with that token still shown as Unknown. Players SHALL NOT be told that damage was applied from a roll whose target they see as Unknown, because that would reveal the hidden token still exists and tracks HP, and would tie it to an HP change.

#### Scenario: Ruling a GM-only roll
- **WHEN** the GM makes a GM-only to-hit roll and marks it Hit
- **THEN** players learn only that something happened at that sequence number, never the verdict

#### Scenario: Damage to a hidden target
- **WHEN** the GM applies a public damage roll against a hidden Shadow
- **THEN** players still see the roll with the target Unknown and not marked Applied, and never receive the Shadow's HP, ID or name

#### Scenario: Target revealed before damage is applied
- **WHEN** the GM makes a public damage roll against a hidden Shadow, reveals the Shadow, and then applies the roll
- **THEN** players see the Shadow's HP change, but that roll stays Unknown and not Applied for them, so the two are never linked

### Requirement: Damage resolve dialog
**Resolve** on a damage roll SHALL open a dialog for that one roll. Its title SHALL be the target's name, with the attack's label beside it. It SHALL show, in large type, the rolled damage with its formula and the target's current HP with its Max HP. It SHALL show:
- an amount field that starts at the roll's total (a negative total starts at 0), with **Half**, which sets it to the roll's total halved and rounded down, and **None**, which sets it to 0; a hint SHALL say that a negative amount heals;
- when the room's preset has conditions on, the full conditions checklist used by the token editor, with the target's existing conditions checked and not uncheckable;
- **Confirm**, with the primary appearance.

The dialog SHALL use the same layout, controls and wording as the area effect resolve dialog, so the two read alike. An amount that is not a whole number within bounds SHALL keep Confirm from sending and SHALL show why. Closing the dialog (its Close button, Escape, or a click on the backdrop) SHALL send nothing; reopening Resolve on the same roll SHALL bring back what the GM had set. The dialog SHALL close by itself once the roll is applied, including from another device. A refused resolve SHALL keep the dialog open with the server's message.

#### Scenario: Dialog starts at the rolled damage
- **WHEN** the GM presses Resolve on an 8-damage roll against Goblin (12 / 15 HP)
- **THEN** the dialog is titled Goblin and shows damage 8, HP 12 of 15, and an amount of 8

#### Scenario: Half rounds down
- **WHEN** the damage roll is 9 and the GM presses Half
- **THEN** the amount reads 4

#### Scenario: Closing keeps the draft
- **WHEN** the GM sets the amount to 3, checks Prone, closes the dialog, and presses Resolve on the same roll again
- **THEN** the amount reads 3 and Prone is checked, and nothing was sent

#### Scenario: Applied elsewhere
- **WHEN** the dialog is open on the GM's laptop and the GM resolves the same roll from their phone
- **THEN** the laptop's dialog closes and the roll has left its Rulings list

#### Scenario: Conditions hidden when off
- **WHEN** the room's preset has conditions off
- **THEN** the dialog shows the amount controls and no conditions checklist
