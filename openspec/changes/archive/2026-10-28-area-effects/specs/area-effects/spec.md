# Spec Delta

## Purpose

Lets the GM run an area effect such as a fireball or a trap from the Play tab: roll a formula for every caught token, call a player (or themselves) to roll the damage, and resolve each token's outcome as one undoable action.

## ADDED Requirements

### Requirement: Starting an Area Effect
The GM's Play tab SHALL contain an **Area Effect** section. It SHALL be shown only to the GM and only while the room's game preset has attacks turned on. To start an effect, the GM SHALL give a selection of tokens (made as in group rolls), a formula, and an optional effect name of at most 40 characters. The name field SHALL be labelled **Effect name**, with the placeholder "New Effect". Starting SHALL make a group roll of that formula for the selected tokens, and these tokens SHALL become the effect's targets.

A room SHALL have at most one open Area Effect. The server SHALL refuse:
- a player's start (forbidden);
- a start while another Area Effect is open (invalid);
- a start while attacks are off in the preset (invalid);
- a start with a selection or formula a group roll would refuse, for the same reason.

Each target's result SHALL be advisory. The system SHALL NOT decide any outcome from it.

#### Scenario: Start a fireball
- **WHEN** the GM selects Goblin 1, Goblin 2 and the Ogre, enters `1d20+2` labelled "Fireball", and starts
- **THEN** an open Area Effect "Fireball" has three targets, each with its own `1d20+2` result visible to the GM

#### Scenario: Only one at a time
- **WHEN** an Area Effect is open and the GM tries to start another
- **THEN** the server refuses it as invalid

#### Scenario: Attacks off
- **WHEN** the room's preset has attacks turned off
- **THEN** the Play tab has no Area Effect section, and a start sent anyway is refused as invalid

### Requirement: Calling for damage
After the group roll, the GM SHALL be able to call a participant to roll the damage. The caller field SHALL be pre-filled with:
- the owner of the token whose turn it is, when an encounter is running and that token has exactly one owner;
- the first owner of that token, in the token's owner order, when it has several;
- otherwise the GM.

The GM SHALL be able to change the caller to any participant in the room, including the GM, before calling. The GM SHALL NOT be able to give a damage formula when calling someone else. The call SHALL be stored with the effect, so it survives reloads and reconnects on every side.

The called player SHALL be shown a prompt, from any tab, with the effect's label, how many of its targets they can see, a formula field, a choice of **One roll for all** or **One roll per target**, and **Roll**. Other players SHALL NOT be shown the prompt. Wherever the damage formula is entered, by a called player or by the GM holding the call, its field SHALL show the placeholder "Damage Formula (e.g. 8d6)".

#### Scenario: Pre-filled with the turn's owner
- **WHEN** it is Mira's wizard's turn and the GM opens the call step
- **THEN** the caller field shows Mira

#### Scenario: No encounter
- **WHEN** no encounter is running
- **THEN** the caller field shows the GM

#### Scenario: Prompt survives a reload
- **WHEN** the GM calls Mira and Mira reloads the page
- **THEN** Mira still sees the prompt

### Requirement: Reassigning and taking over a call
While a call is pending, the GM SHALL be able to reassign it to any other participant, or to themselves (take over). Each change SHALL be recorded as a new event that carries the caller it replaced. The previous caller's prompt SHALL disappear, and the new caller SHALL see it. The server SHALL refuse a reassignment:
- from a player (forbidden);
- when no call is pending, including after the damage has been rolled (invalid);
- to the participant who already holds the call (invalid);
- to someone who is not a participant in the room (not found).

If the called participant leaves or is removed from the room, the call SHALL stay pending with them until the GM reassigns or takes it over, and the GM SHALL be shown that the caller has left.

#### Scenario: Wrong player called
- **WHEN** the GM calls Kael by mistake and then reassigns the call to Mira
- **THEN** Kael's prompt disappears and Mira's appears, and the record shows the call moved from Kael to Mira

#### Scenario: GM finishes it themselves
- **WHEN** Mira has not answered and the GM takes over the call
- **THEN** Mira's prompt disappears, and the GM can write the formula and roll

#### Scenario: Race with the roll
- **WHEN** Mira's damage roll and the GM's takeover reach the server at the same time
- **THEN** whichever the server handles first takes effect, and the other is refused as invalid

### Requirement: Rolling the damage
Only the participant holding the call SHALL be able to roll the damage, and they alone SHALL write its formula, in the form the dice roller accepts. They SHALL choose:
- **One roll for all**: the formula is rolled once, and every target's damage is that total;
- **One roll per target**: the same formula is rolled separately for each target that still exists.

The server SHALL refuse a damage roll from anyone else (forbidden), when no call is pending or it has already been answered (invalid), or with a refused expression (invalid). The damage roll SHALL end the call.

#### Scenario: One roll for all
- **WHEN** Mira rolls `8d6` as one roll for all and gets 28
- **THEN** every target's rolled damage is 28

#### Scenario: One roll per target
- **WHEN** Mira rolls `8d6` as one roll per target
- **THEN** each target gets its own `8d6` result

#### Scenario: Someone else tries to roll
- **WHEN** the call is with Mira and Kael sends a damage roll
- **THEN** the server refuses it as forbidden

### Requirement: Resolving the effect
The GM SHALL resolve the effect in a resolve dialog that shows one target at a time, with **Previous** and **Next** to move between targets. **Next** SHALL have the primary appearance, like **Call**, and **Previous** the same as **Skip**. **Confirm resolution** SHALL have the same appearance as **Skip** until the last target is shown, and the primary appearance there. The shown target's name SHALL be the dialog's title; the effect's name and the target's position, e.g. "Fireball · 1 of 3", SHALL sit beside it in smaller type. The dialog SHALL show, in large type, the target's roll result, its rolled damage and its current HP, and an amount field. The area effect's menus SHALL call the per-target roll a "roll" or "result", never a "save". Each target's amount SHALL start at its rolled damage, or 0 if no damage was rolled. For each target:
- **Half** SHALL set the amount to the target's rolled damage divided by two, rounded down, whatever the field currently holds;
- **None** SHALL set the amount to 0;
- the GM SHALL be able to type any whole number from −9999 to 9999, where a negative number heals.

Neither Half nor None SHALL apply anything by itself, and there SHALL be no Full button. A target that does not track HP SHALL show no amount field.

For the shown target, the dialog SHALL show the full conditions checklist, the same one the token editor uses. The target's existing conditions SHALL show checked and SHALL NOT be uncheckable there; the GM SHALL be able to check further conditions to add. **Apply these conditions to every target** SHALL add the shown target's newly checked conditions to every other target's choice. Conditions SHALL be added to the target's existing conditions, never replace them. The condition controls SHALL be shown only while the preset has conditions turned on.

**Confirm resolution** SHALL be available at every target and SHALL apply every target's amount and conditions at once, including targets the GM has not moved to, which keep their starting amounts. For each target that still exists, the server SHALL:
- compute new HP from the target's HP at that moment: lowered by the amount, never below the lowest HP a token can hold, and, when healing, never above its max HP if it has one (healing never lowers HP);
- add the chosen conditions.

The server SHALL record each HP change and each condition change with the value it replaced, and SHALL record that the effect was resolved, closing it. Targets deleted since the effect started SHALL be skipped. The server SHALL refuse a resolve:
- from a player (forbidden);
- when the effect is not open, for example a second Confirm (invalid);
- while a damage call is pending (invalid);
- that names a token that is not a target (invalid);
- that would give a token more than 12 conditions (invalid);
- that adds conditions while conditions are off in the preset (invalid).

#### Scenario: Half and none
- **WHEN** the damage roll was 28, the GM presses Half on the Ogre and None on Goblin 2, then confirms
- **THEN** Goblin 1 loses 28 HP, the Ogre loses 14 HP and Goblin 2's HP is unchanged

#### Scenario: Half after editing
- **WHEN** a target's rolled damage is 27, the GM types 20 in its field, then presses Half
- **THEN** the field shows 13

#### Scenario: Healing is capped
- **WHEN** a target with 30 / 35 HP gets −10 and the GM confirms
- **THEN** its HP becomes 35

#### Scenario: Conditions added
- **WHEN** Goblin 1 is Poisoned, the GM adds Prone to all targets and confirms
- **THEN** Goblin 1 is Poisoned and Prone

#### Scenario: One target at a time
- **WHEN** three targets are caught by "Fireball" and the GM opens the resolve dialog
- **THEN** its title is "Goblin 1" with "Fireball · 1 of 3" beside it, and Next shows Goblin 2 with its own roll, amount and conditions

#### Scenario: Existing conditions are locked
- **WHEN** Goblin 1 is Poisoned and the GM reaches it in the resolve dialog
- **THEN** Poisoned shows checked and can't be unchecked, and the GM can check Prone to add it

#### Scenario: Double confirm
- **WHEN** the GM confirms the same effect twice, for example from a stale screen
- **THEN** the second is refused as invalid and HP changes only once

### Requirement: The resolve dialog
The resolve dialog SHALL open only when the GM presses **Resolve**, in the Area Effect section or in its Rulings row. It SHALL NOT open by itself, including when a damage roll arrives. It SHALL be a modal dialog placed low on the screen and no taller than about a third of it, with a light backdrop, so most of the map stays visible behind it.

**Resolve** SHALL be offered once the group roll is in and no call is pending. Until damage has been rolled, it SHALL have the same appearance as **Skip**, because resolving then skips the damage roll. Once damage has been rolled, it SHALL have the same appearance as **Call**.

Closing the dialog without confirming (its Close button, Escape, or a click on the backdrop) SHALL send nothing and SHALL keep the draft: every target's amount and chosen conditions, and which target was shown. Reopening the dialog SHALL bring the draft back. The draft SHALL be dropped once the effect is resolved or closed, and the dialog SHALL close by itself if that happens while it is open.

#### Scenario: Not opened by a damage roll
- **WHEN** the called player rolls the damage while the GM is on the Tokens tab
- **THEN** no dialog opens, and the Rulings row's Resolve takes the appearance of Call

#### Scenario: Resolve's appearance before damage
- **WHEN** the group roll is in and the GM has not called anyone
- **THEN** Resolve looks like Skip

#### Scenario: Draft kept
- **WHEN** the GM sets Goblin 2's amount to 14 and checks Prone, presses Escape, and opens Resolve again
- **THEN** the dialog shows Goblin 2 with 14 and Prone checked

#### Scenario: Closed elsewhere
- **WHEN** the dialog is open on one screen and the effect is skipped from another
- **THEN** the dialog closes and the draft is gone

### Requirement: Dice for area-effect rolls
On a viewer's board, each roll SHALL animate for the numbers that viewer was sent, with the same throw, die size and linger as a Roll-button roll:
- each target's group-roll result SHALL be thrown onto that target's token, on the GM's board only;
- with **One roll per target**, each target's damage SHALL be thrown onto that target's token, for every viewer who can see that target;
- with **One roll for all**, the damage SHALL be thrown once, onto the middle of the targets the viewer can see.

Every token's throw of one roll SHALL leave together, so the roll lands as soon as a single throw does, however many targets it has. The dice SHALL stay about three seconds after landing, as a Roll-button roll's do. A roll's throws SHALL never push one another, or another roll, off the board. When one roll would show more than about 40 dice, each token SHALL instead get a single die showing its total, dropped straight onto it. A total shown in the panel or the resolve dialog SHALL appear once its dice have landed. With reduced motion, nothing SHALL animate and results SHALL show at once.

#### Scenario: Rolls land on their tokens
- **WHEN** the GM starts an effect on three goblins
- **THEN** each goblin's roll is thrown onto that goblin on the GM's board, all landing together, and players see no dice

#### Scenario: Per-target damage for a player
- **WHEN** Mira rolls 2d6 per target on Goblin 1 and a hidden Assassin
- **THEN** her board shows dice only on Goblin 1

#### Scenario: A large roll stays quick
- **WHEN** 8d6 is rolled per target on 30 targets
- **THEN** each token gets one die showing its total, dropped straight onto it, and all of them land together

### Requirement: Damage numbers on resolve
When an Area Effect is resolved, each viewer's board SHALL play the same damage number it plays for an applied damage roll, on every target that viewer can see whose amount is above 0, all at once. Healing and 0 SHALL show no number. With reduced motion, the numbers SHALL show without moving.

#### Scenario: Fireball resolved
- **WHEN** the GM confirms 28 on Goblin 1, 14 on Goblin 2 and 0 on the Ogre
- **THEN** every board shows −28 on Goblin 1 and −14 on Goblin 2 at the same time, and nothing on the Ogre

#### Scenario: Hidden target
- **WHEN** a hidden Assassin takes 11 in the same resolve
- **THEN** players see no number for it, and their copy of the event carries no amount for it

### Requirement: Undoing a resolved effect
A resolved Area Effect SHALL be one undoable action in the GM's activity log. Undoing it SHALL put back every HP value and every condition set it changed, as one action. It SHALL be refused, like any undo, if any of those values has changed since. Undo SHALL NOT reopen the effect.

#### Scenario: Undo a fireball
- **WHEN** the GM resolves a fireball that damaged three goblins and knocked them prone, then undoes it
- **THEN** all three goblins' HP and conditions are back to what they were before

#### Scenario: Undo after a later change
- **WHEN** after the fireball the GM edits Goblin 1's HP by hand, then tries to undo the fireball
- **THEN** the undo is refused and nothing changes

### Requirement: Skipping steps
The GM SHALL be able to skip the call and go straight to resolving, rolling no damage. The GM SHALL also be able to close the effect at any stage without applying anything (**Skip**). Closing SHALL change no HP or conditions, and it SHALL remove any pending prompt from the caller. The server SHALL refuse closing from a player (forbidden), or when no effect is open (invalid).

#### Scenario: Rolls only
- **WHEN** the GM starts an effect, reads the rolls, and presses Skip
- **THEN** the effect closes and no token changes

#### Scenario: GM types the damage
- **WHEN** the GM skips the call and presses Resolve
- **THEN** the resolve dialog opens with every amount at 0, and the GM can type amounts and confirm

#### Scenario: Close while a player is called
- **WHEN** Mira has a pending prompt and the GM presses Skip
- **THEN** the effect closes and Mira's prompt disappears

### Requirement: What players see of an Area Effect
Players SHALL see an open Area Effect's label, its stage, who holds the call, the targets they can currently see, and the damage roll. With one roll per target, they SHALL see only the results of the targets they can see. Players SHALL NOT see:
- any target's group-roll result;
- any target that is hidden or under fog, or a count that includes one;
- the amounts or conditions the GM chooses before Confirm.

After Confirm, players SHALL see HP and condition changes only on tokens they can see, as they do today, and the amount applied to each target they can see, for its damage number; never a concealed target's amount. This SHALL hold for live events, snapshots on join or reconnect, and every other payload that carries room data.

#### Scenario: Rolls stay secret
- **WHEN** the GM starts an effect on Goblin 1 and the Ogre
- **THEN** players see "Fireball · 2 targets" naming both, and no `1d20+2` results

#### Scenario: Hidden target
- **WHEN** a hidden Assassin is one of three targets
- **THEN** players, including the called player, see two targets, and the Assassin's damage, HP change and conditions never reach them

#### Scenario: Reconnect
- **WHEN** a player reconnects while an effect is open
- **THEN** their snapshot shows the same filtered view as before
