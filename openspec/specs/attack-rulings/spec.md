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
Only the GM SHALL be able to apply a damage roll to its target. Applying SHALL lower the target's current HP by the roll's total. A negative total SHALL count as zero, and the result SHALL not go below the lowest HP a token can hold. The server SHALL compute the new HP from the target's HP at the moment it applies the roll. It SHALL refuse the application when:
- the roll is not a damage roll (invalid);
- it has already been applied (invalid);
- it is no longer in the recent roll log (not found);
- its target no longer exists (not found);
- its target does not track HP (invalid).

A player's attempt SHALL be refused as forbidden. Applying SHALL record the HP change, carrying the previous stats, whenever HP actually changes, and SHALL always record that the roll was applied. The system SHALL NOT apply damage by itself.

#### Scenario: Apply once
- **WHEN** Goblin has 15 HP, Aria's owner rolls 7 damage against it, and the GM applies it
- **THEN** Goblin has 8 HP, and the roll shows as applied to everyone who can see it

#### Scenario: Double apply is refused
- **WHEN** the GM applies the same damage roll a second time, e.g. from a second tap or a stale screen
- **THEN** the server refuses it as invalid and Goblin's HP is unchanged

#### Scenario: Target without HP
- **WHEN** the GM applies a damage roll whose target has no HP set
- **THEN** the server refuses it as invalid

### Requirement: GM Rulings list
The GM's Play tab SHALL show a **Rulings** list, and players SHALL NOT be shown it. The list SHALL show, newest first, the attack rolls in the recent roll log that still need the GM, and the open Area Effect, if there is one:
- to-hit rolls without a verdict, each with the target's current AC and **Hit** and **Miss** controls;
- damage rolls not yet applied whose target still tracks HP, each with the target's current HP and an **Apply −N** control, where N is the damage that would be applied;
- the open Area Effect, at every stage until it is resolved or closed, with its label, its number of targets, its stage, and the controls for that stage:
  - **Call**, **Resolve** and **Skip** after its group roll;
  - "Waiting on <caller>", **Reassign** and **Take over** while a player holds the call;
  - **Roll damage** while the GM holds the call;
  - **Resolve** and **Skip** once the damage is rolled.

**Resolve** in this row SHALL open the resolve dialog, and SHALL have the same appearance as **Skip** until damage has been rolled and the same appearance as **Call** afterwards. These controls SHALL be full-size buttons. A roll SHALL leave the list once it is ruled or applied. An Area Effect SHALL leave the list once it is resolved or closed. The GM SHALL also be able to set, change or clear a verdict from the roll log in the Dice tab.

While any rolls or an Area Effect are pending:
- the GM's Play tab SHALL show how many, from any tab, counting an open Area Effect as one;
- the initiative controls SHALL show "N rulings pending" beside **Next turn**, with the same count. It SHALL NOT prevent advancing the turn.

#### Scenario: Pending roll appears with AC
- **WHEN** Aria's owner rolls 17 to hit Goblin, whose AC is 13
- **THEN** the GM's Rulings list shows "Aria → Goblin · 17" with "AC 13" and Hit and Miss controls

#### Scenario: Ruled roll leaves the list
- **WHEN** the GM marks that roll Hit
- **THEN** it leaves the Rulings list and shows as Hit in the roll log

#### Scenario: Pending count outside the Play tab
- **WHEN** the GM is on the Tokens tab and two rolls are waiting for a ruling
- **THEN** the Play tab shows 2, and the initiative controls show "2 rulings pending" next to Next turn, which still works

#### Scenario: Players have no Rulings list
- **WHEN** a player opens the Play tab
- **THEN** there is no Rulings list, no pending count, and no ruling or apply controls anywhere

#### Scenario: Area Effect waiting on a player counts
- **WHEN** one to-hit roll is unruled and an Area Effect "Fireball" is waiting on Mira
- **THEN** the Play tab shows 2, and the Rulings list shows "Fireball · 3 targets · Waiting on Mira" with Reassign and Take over

#### Scenario: Resolved effect leaves the list
- **WHEN** the GM resolves or closes the Area Effect
- **THEN** it leaves the Rulings list and the pending count drops by one

### Requirement: Player sees the outcome
The Attack section SHALL show the viewer's latest attack roll, at the top of the section, with its current outcome:
- "Waiting for the GM" while a to-hit roll has no verdict;
- **Hit** or **Miss** once ruled;
- **Applied** once a damage roll has been applied.

**Roll damage after a Hit.**
- If the roll was made with one of the attacker's named attacks and that named attack has a damage roll, the section SHALL offer **Roll damage** with that named attack's dice. Tapping it SHALL immediately roll that damage against the same target, labeled "<attack> damage", with the same visibility as the to-hit roll it follows. A GM-only attack's damage SHALL stay GM-only whatever the GM's current setting.
- Otherwise **Roll damage** SHALL switch the Custom roll builder to Damage, open it and keep the same target, without rolling.

**The GM's own rolls.** On their own latest attack roll, the GM SHALL also be offered **Hit** and **Miss** for a to-hit roll without a verdict, and **Apply −N** for an unapplied damage roll whose target tracks HP. These act exactly as in the Rulings list.

**Player tab indicator.** When the GM rules on, or applies, a player's latest attack roll while that player is on another tab, the player's Play tab SHALL show an indicator until they open it.

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
- **THEN** the top of the GM's Attack section offers Hit and Miss for that roll, and choosing Miss rules it without visiting the Rulings list

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
