## MODIFIED Requirements

### Requirement: GM Rulings list
The GM's Play tab SHALL show a **Rulings** list, and players SHALL NOT be shown it. The list SHALL show, newest first, the attack rolls in the recent roll log that still need the GM and that the GM hasn't ignored, and the open Area Effect, if there is one:
- to-hit rolls without a verdict, each with the target's current AC and **Hit** and **Miss** controls;
- damage rolls not yet applied whose target still tracks HP, each with the target's current HP and an **Apply −N** control, where N is the damage that would be applied;
- the open Area Effect, at every stage until it is resolved or closed, with its label, its number of targets, its stage, and the controls for that stage:
  - **Call**, **Resolve** and **Skip** after its group roll;
  - "Waiting on <caller>", **Reassign** and **Take over** while a player holds the call;
  - **Roll damage** while the GM holds the call;
  - **Resolve** and **Skip** once the damage is rolled.

**Resolve** in this row SHALL open the resolve dialog, and SHALL have the same appearance as **Skip** until damage has been rolled and the same appearance as **Call** afterwards. These controls SHALL be full-size buttons. A roll SHALL leave the list once it is ruled, applied or ignored. An Area Effect SHALL leave the list once it is resolved or closed. The GM SHALL also be able to set, change or clear a verdict from the roll log in the Dice tab.

**Ignore and Clear all.** Each attack roll in the list SHALL have an **Ignore** control. While the list shows at least one attack roll, a **Clear all** control SHALL show at the top of the list. Clear all SHALL ignore every attack roll shown, and only those; a roll that arrives after the GM's list last updated SHALL stay. Neither control SHALL apply to the Area Effect row, which keeps its own controls. Only the GM SHALL be able to ignore rolls; a player's attempt SHALL be refused as forbidden. Ignoring a roll that isn't in the recent roll log SHALL be refused as not found, and ignoring one that is ruled, applied, already ignored, or not an attack roll SHALL be refused as invalid. When Clear all names several rolls, any that were ruled, applied or ignored in the meantime SHALL be skipped, and the request SHALL be refused only if none of its rolls can be ignored. Ignoring SHALL NOT change the roll's verdict, its total, or any token. An ignored roll SHALL stay in the roll log, where the GM can still rule on it. Ignoring SHALL be recorded as a new event, and the GM SHALL be able to undo it, which puts the rolls back in the list. Players SHALL NOT learn that a roll was ignored.

While any rolls or an Area Effect are pending:
- the GM's Play tab SHALL show how many, from any tab, counting an open Area Effect as one and leaving out ignored rolls;
- the initiative controls SHALL show "N rulings pending" below **Previous turn** and **Next turn**, with the same count. It SHALL NOT prevent advancing the turn.

#### Scenario: Pending roll appears with AC
- **WHEN** Aria's owner rolls 17 to hit Goblin, whose AC is 13
- **THEN** the GM's Rulings list shows "Aria → Goblin · 17" with "AC 13" and Hit and Miss controls

#### Scenario: Ruled roll leaves the list
- **WHEN** the GM marks that roll Hit
- **THEN** it leaves the Rulings list and shows as Hit in the roll log

#### Scenario: Pending count outside the Play tab
- **WHEN** the GM is on the Tokens tab and two rolls are waiting for a ruling
- **THEN** the Play tab shows 2, and the initiative controls show "2 rulings pending" under Previous turn and Next turn, which still work

#### Scenario: Players have no Rulings list
- **WHEN** a player opens the Play tab
- **THEN** there is no Rulings list, no pending count, and no ruling, apply, ignore or clear controls anywhere

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
