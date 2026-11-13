# shared-roll-throws Specification

## Purpose
Says where each public roll's dice are thrown on each viewer's board, so that every participant watches attack, damage and Roll-button rolls land, not just the roller.

## Requirements

### Requirement: Every public roll is thrown on every viewer's board
Every public roll that arrives while a viewer is connected SHALL be thrown as 3D dice on that viewer's board, the roller's and everyone else's alike, in the roller's dice look as `shared-dice-looks` decides. This replaces the `board-dice-throw` rule that a roll made without letting a die go is thrown only on the roller's board while every other viewer sees only its result card. GM-only rolls SHALL stay off the board, in the GM's panel tray, as before. Group and area-effect rolls SHALL keep dropping onto their tokens. Reduced motion and an animation the browser cannot run SHALL still land the roll at once with its result card.

#### Scenario: Another player's Roll button
- **WHEN** player A presses Roll with `2d6`
- **THEN** player B's board throws two d6 showing A's rolled values, and B's result card slides in when they land

#### Scenario: GM-only roll
- **WHEN** the GM rolls privately
- **THEN** no player's board throws any dice for it

#### Scenario: Reduced motion
- **WHEN** a viewer who prefers reduced motion receives another player's public roll
- **THEN** no dice are thrown on their board and the result card shows at once

### Requirement: Attack and damage rolls are thrown from the attacker toward the target
A public roll made from the Attack section (to hit or damage) SHALL be thrown, on every board where both the attacker's and the target's tokens are visible to that viewer, along the line from the attacker's token toward the target's, landing short of the target and travelling no further than a hand throw does (`board-dice-throw`), so for a distant target the dice start partway along that line rather than at the attacker. The landing point SHALL be kept on the map. The path and resting attitude SHALL depend only on the roll and the two token positions, so it lands the same way on each such board. On a viewer's board where either token is hidden from them, or no longer exists, the roll SHALL be thrown into the middle of that viewer's visible board instead. An attack with several targets throws each target's roll toward its own target.

#### Scenario: To-hit roll seen by the table
- **WHEN** a player rolls to hit a goblin with their fighter
- **THEN** every viewer who can see both tokens sees the d20 tumble from the fighter toward the goblin and come to rest short of it

#### Scenario: Distant target
- **WHEN** an archer rolls to hit a target twenty cells away
- **THEN** the dice tumble along the line between them and come to rest short of the target, without crossing the whole map

#### Scenario: Target hidden from a viewer
- **WHEN** a player's attack roll targets a token that is under fog for another player
- **THEN** that other player's board throws the dice into the middle of their visible board, and nothing about the target's position is shown

#### Scenario: Roller's own board
- **WHEN** a player rolls damage from the Attack section
- **THEN** their own board throws the dice from their attacker toward the target too, not into the middle of the board

### Requirement: A roll without a drop or an attack is thrown into the middle of each viewer's board
A public roll that has no dice drop to land at and is not an attack roll (the Dice panel's Roll button or a quick chip) SHALL be thrown into the middle of each viewer's own visible board, kept on the map when there is one. Each viewer's landing spot depends on their own view; the dice and their values SHALL be the same everywhere. A thrown die whose dice drop a viewer missed SHALL also be thrown into the middle of that viewer's board, instead of showing only its result card.

#### Scenario: Different views
- **WHEN** player A presses Roll with `1d20` while player B is scrolled to another part of the map
- **THEN** the d20 lands in the middle of A's view on A's board and in the middle of B's view on B's board, showing the same value

#### Scenario: Drop missed
- **WHEN** a viewer never receives the dice drop for a die another player threw onto the map
- **THEN** that viewer's board throws the roll into the middle of their visible board

### Requirement: Other participants' dice never hold your roll controls
Dice thrown on a viewer's board for someone else's roll SHALL NOT disable that viewer's roll controls, and SHALL NOT delay any of that viewer's own rolls.

#### Scenario: Rolling while another roll is showing
- **WHEN** another player's attack dice are still on this viewer's board
- **THEN** this viewer can press Roll and roll attacks as usual
