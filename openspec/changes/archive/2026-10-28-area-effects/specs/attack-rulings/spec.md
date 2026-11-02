# Spec Delta

## MODIFIED Requirements

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
