# Spec Delta

## Purpose

Lets each viewer choose how much moves on their screen (Full, Reduced or None), and defines what every board effect does at each level, so the table stays readable for people who want little or no motion.

## ADDED Requirements

### Requirement: Animations choice
The Settings dialog's Graphics tab SHALL offer **Animations** with three choices: **Full**, **Reduced** and **None**, defaulting to Full. It SHALL replace the "Reduced animations" switch. The choice SHALL be saved in this browser, SHALL be shared by every room and the account pages, SHALL take effect at once without a reload, and SHALL change only what this viewer sees. Other viewers and the room SHALL be unaffected. Wherever another requirement says "reduced motion" or "reduced animations", it SHALL mean the Reduced or the None level.

#### Scenario: Choosing a level
- **WHEN** a player opens Settings → Graphics and chooses Reduced
- **THEN** their board uses the Reduced level from the next effect on, and no other viewer's board changes

#### Scenario: Default
- **WHEN** a viewer who has never changed the setting, on a device with no reduced-motion preference, opens Settings → Graphics
- **THEN** Animations shows Full

### Requirement: The device preference forces None
When the device asks for reduced motion (`prefers-reduced-motion: reduce`), the effective level SHALL be None, whatever the viewer chose. While the device preference applies, the Animations choice SHALL show None, SHALL NOT be changeable, and SHALL say that the device's setting is in effect. When the device preference is turned off, the viewer's own saved choice SHALL apply again.

#### Scenario: Device preference wins
- **WHEN** a viewer chose Full and their system asks for reduced motion
- **THEN** their board behaves as None, and Settings shows Animations locked at None with a note that the device's setting is in effect

#### Scenario: Device preference turned off
- **WHEN** the same viewer turns their system's reduced-motion preference off
- **THEN** their board returns to Full without a reload

### Requirement: The old switch carries forward
A browser that saved "Reduced animations" on SHALL start with Animations set to Reduced. A browser that saved it off SHALL start with Full. A saved Animations choice SHALL take precedence over the old switch.

#### Scenario: Old switch on
- **WHEN** a viewer had turned "Reduced animations" on before this change and opens Settings after it
- **THEN** Animations shows Reduced

### Requirement: The room's table-wide flag has no effect
A room's stored table-wide reduced-animations flag SHALL NOT change any viewer's animation level, in either direction.

#### Scenario: Legacy room
- **WHEN** a room whose table-wide flag was turned on earlier is opened by a viewer with Animations on Full and no device preference
- **THEN** that viewer's board plays every effect at the Full level

### Requirement: Attacks at each level
- **Full:** strikes, hits, misses and damage numbers SHALL play as `board-attack-effects` specifies.
- **Reduced:** no strike animation SHALL play and nothing SHALL be drawn for it. A hit SHALL show a still red ring on the target, and a miss SHALL show a still grey ring, each for a moment, with no text, no flash, no particles and no shake of the token. A damage number SHALL appear without moving and fade out.
- **None:** nothing SHALL be drawn on the board for a strike, hit, miss or damage number.

At every level, the "Attack animations" setting SHALL still only stop effects from playing, never make one play. At Reduced and None the board SHALL NOT pan or zoom to an attack, even when "Focus attacks" is on.

#### Scenario: Reduced hit
- **WHEN** a viewer on Reduced sees the GM rule an attack against Goblin a Hit and apply 7 damage
- **THEN** no strike crosses the board, a still red ring briefly appears on Goblin with no text and Goblin does not shake, and "−7" appears over Goblin without moving and fades

#### Scenario: No camera focus below Full
- **WHEN** a viewer on Reduced or None with "Focus attacks" on sees an attack roll between tokens off screen
- **THEN** the board's pan and zoom stay as they were

#### Scenario: Reduced miss
- **WHEN** a viewer on Reduced sees an attack ruled a Miss
- **THEN** a still grey ring briefly appears on the target and no "Miss" text is shown

#### Scenario: None leaves no trace on the board
- **WHEN** a viewer on None sees an attack rolled, ruled a Hit and damage applied
- **THEN** nothing is drawn on the board for any of them, and the roll's result card, the activity log and the target's hit points still show the outcome

### Requirement: Dice at each level
At Full, rolls SHALL be thrown as `shared-roll-throws` and `dice-roll-animation` specify. At Reduced and None, no dice SHALL be thrown on the board. A roll's result card SHALL appear at once, without sliding in. At Reduced the card SHALL draw each die as a flat, still outline of its shape (triangle for a d4, square for a d6, and so on) at a readable size, with its value inside and its type under it, in roll order. At None the card SHALL show only the numbers. A panel or home page tray SHALL draw its dice at rest and show the result at once.

#### Scenario: Another player's roll on Reduced
- **WHEN** a viewer on Reduced receives another player's public 2d6 roll
- **THEN** no dice are thrown on their board, and the result card appears at once without sliding, showing each die as a flat outline of its shape with its value

#### Scenario: Another player's roll on None
- **WHEN** a viewer on None receives the same roll
- **THEN** no dice are thrown and the result card appears at once with the total and the numbers only

### Requirement: Token movement at each level
At Full and Reduced, a moved token SHALL slide as `token-slide` specifies. At None, every move SHALL jump straight to its square.

#### Scenario: Reduced still slides
- **WHEN** a viewer on Reduced sees another player's token move three squares
- **THEN** the token slides along its path

#### Scenario: None jumps
- **WHEN** a viewer on None sees the same move
- **THEN** the token appears on its new square without sliding

### Requirement: Defeated tokens at each level
When a token is removed by a defeat, a viewer who can see it SHALL see the full death animation at Full, a brief fade of about 200 ms at Reduced, and the token disappear at once at None.

#### Scenario: None removes at once
- **WHEN** a viewer on None sees Goblin removed at 0 HP
- **THEN** Goblin disappears from their board with no fade

#### Scenario: Reduced fades
- **WHEN** a viewer on Reduced sees Goblin removed at 0 HP
- **THEN** Goblin fades out briefly and nothing else plays

### Requirement: Other motion at Reduced and None
At both Reduced and None, pings SHALL be a still ring that fades without growing. At None, the ping an attack roll sends at its target SHALL NOT be shown, on the roller's board or on any other board at None; a ping made by hand SHALL still show. Condition effects SHALL be drawn without motion, particles or tremble. Fog SHALL not drift. The sight mask SHALL change without a cross-fade. Interface transitions and CSS animations SHALL not run, and a hit-point change from a nuke SHALL show at once.

#### Scenario: Attack ping on None
- **WHEN** a viewer on None sees another player roll an attack against Goblin
- **THEN** no ping appears on Goblin, while viewers at Full or Reduced still see it

#### Scenario: Ping on None
- **WHEN** a viewer on None receives a ping
- **THEN** they see a ring of constant size at the ping point that fades out

### Requirement: Attack previews follow the level
At Reduced and None, the attack editor's animation preview stage SHALL NOT be shown. The home page's attack demo SHALL NOT play: it SHALL show its still picture instead and SHALL NOT load the renderer. The Animation Editor's preview SHALL play every animation in full at every level, including None.

#### Scenario: Attack editor on Reduced
- **WHEN** a GM on Reduced opens an attack in the attack editor
- **THEN** no animation preview stage is shown below the Animation picker, and choosing and saving an animation still works

#### Scenario: Animation Editor on None
- **WHEN** a GM on None presses Play in the Animation Editor
- **THEN** the whole animation plays on the stage
