# board-attack-effects Specification

## Purpose
Shows attacks, rulings, damage and conditions on the board itself, using only what each viewer may see, so the table can follow play without reading the sidebar.

## Requirements

### Requirement: Attack animation
When a to-hit or damage attack roll is committed while a viewer is connected, and that viewer can see both the attacker and the target, the viewer's board SHALL play an animation of a strike travelling from the attacker token to the target token followed by an impact on the target. A damage roll SHALL NOT play the strike when it follows a to-hit roll: that is, when the latest earlier attack roll in the viewer's copy of the room from the same attacker at the same target is a to-hit roll. Nothing SHALL be played in its place. A damage roll that does not follow a to-hit roll SHALL strike as any other attack roll. The animation SHALL be the same built-in default for every token and participant. Attack rolls the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT animate.

#### Scenario: Live attack animates
- **WHEN** Aria's owner rolls to hit Goblin while the GM and another player, who can see both tokens, are connected
- **THEN** each of their boards plays a strike from Aria to Goblin ending in an impact on Goblin

#### Scenario: Damage after a to-hit does not strike again
- **WHEN** Aria's owner rolls to hit Goblin, the GM rules it a Hit, and Aria's owner rolls damage against Goblin
- **THEN** each viewer's board plays the strike for the to-hit roll only, and nothing plays when the damage roll's dice land

#### Scenario: Damage-only attack still strikes
- **WHEN** Aria's owner rolls a named attack with no to-hit roll, such as Magic Missile, against Goblin
- **THEN** each viewer's board plays a strike from Aria to Goblin

#### Scenario: A to-hit the viewer never saw
- **WHEN** the GM rolls a GM-only to-hit for Ogre against Aria, then rolls public damage against Aria
- **THEN** players' boards play a strike for the damage roll, and the GM's board does not

#### Scenario: A different target
- **WHEN** Aria's owner rolls to hit Goblin and then rolls damage against Orc
- **THEN** the damage roll plays a strike from Aria to Orc

#### Scenario: Reload does not replay
- **WHEN** a viewer reloads after several attack rolls
- **THEN** no attack animation plays for those earlier rolls

### Requirement: Ruling and damage endings
When the GM rules an attack roll a Hit, viewers who can see its target SHALL see a hit effect on the target (a flash and shake). When the GM rules it a Miss, they SHALL see a visibly different miss effect (a deflect or whiff). When the GM applies damage, they SHALL see the amount rise from the target as a floating number such as "−7". Clearing a ruling SHALL play nothing.

#### Scenario: Hit and miss differ
- **WHEN** the GM rules one roll Hit and another roll Miss
- **THEN** the target of the first shows the hit effect and the target of the second shows the miss effect, and the two are distinguishable

#### Scenario: Damage number
- **WHEN** the GM applies a 7-damage roll to Goblin
- **THEN** "−7" rises from Goblin and fades out

### Requirement: No animation reveals hidden tokens
An attack, ruling or damage animation SHALL NOT play for a viewer when the attacker or the target is hidden from that viewer, and nothing drawn SHALL reveal a hidden token's position. An animation SHALL only use tokens present in the viewer's own copy of the room.

#### Scenario: Hidden attacker
- **WHEN** a hidden monster attacks Aria with a public roll
- **THEN** players see no attack animation, and the GM sees it

#### Scenario: Hidden target ruled
- **WHEN** the GM rules a public roll against a hidden target a Hit
- **THEN** players see no hit effect anywhere on the board

### Requirement: Fixed condition effects
Each status condition SHALL have one fixed visual effect, defined in the product and not changeable by users, drawn on a token for as long as that condition is set and removed when it is cleared. Every viewer who can see the token SHALL see the same effect. The effects SHALL be distinct per condition and SHALL include at least: poisoned — green bubbles; frightened — trembling; stunned — circling stars; prone — token tilted; invisible — faded shimmer; concentrating — pulsing ring; unconscious — greyed out. The existing condition shape and abbreviation badges SHALL remain unchanged and SHALL stay the way conditions are identified; colour and motion SHALL be decoration only.

#### Scenario: Effect follows the condition
- **WHEN** the GM sets Poisoned on Goblin and later clears it
- **THEN** every viewer of Goblin sees green bubbles while it is set and none after, and the "PO" badge shows as before

#### Scenario: Badges unchanged
- **WHEN** a token has Stunned and Prone
- **THEN** it shows both effects and still shows the ST and PR badges with their shapes

### Requirement: Reduced motion
When the viewer prefers reduced motion, no travelling or looping animation SHALL play. An attack SHALL instead show a brief static marker on the target; hit, miss and damage SHALL show static, short-lived indicators; condition effects SHALL be drawn without motion.

#### Scenario: Reduced motion attack
- **WHEN** a viewer with reduced motion enabled sees an attack roll
- **THEN** no strike travels across the board and a static marker briefly appears on the target

#### Scenario: Reduced motion condition
- **WHEN** a viewer with reduced motion enabled sees a stunned token
- **THEN** the stun effect is drawn but does not move

### Requirement: Effects never interfere with play
Effects SHALL NOT block or delay input: clicks, drags, pans and zooms SHALL behave as without them. Effects SHALL NOT change any token's position in the room; any shake or tilt SHALL be visual only and the token SHALL be drawn back at its board-coordinate position when the effect ends. Effects SHALL follow a token that moves while they play.

#### Scenario: Drag during an animation
- **WHEN** a player drags their token while a hit effect is playing on it
- **THEN** the drag works as usual and the token lands where it was dropped

#### Scenario: Shake leaves position unchanged
- **WHEN** a hit effect shakes Goblin
- **THEN** Goblin's recorded position is unchanged and it is drawn exactly there afterwards

### Requirement: Attack animations setting
The Settings dialog's Graphics tab SHALL offer "Attack animations" with three choices: All, Current turn and None, defaulting to All. The choice SHALL be saved in this browser and SHALL only change what this viewer's board plays; other viewers and the room SHALL be unaffected. It applies on top of every other rule in this capability: it can only stop an effect from playing, never make one play.

- **All:** every effect plays as specified elsewhere in this capability.
- **Current turn:** while an encounter is running, a strike and its hit or miss ending SHALL play only when the attacking token is the token whose turn it is. A map nuke has no attacking token; it SHALL play only when the token whose turn it is has no owner, or is not in the viewer's turn order. Damage numbers SHALL always play. While no encounter is running, Current turn SHALL behave as All.
- **None:** no strike, nuke blast, hit or miss ending, or damage number SHALL play, including an area effect's damage numbers.

In every choice, the fall of a token removed at 0 HP SHALL still play, and dice SHALL still be thrown and dropped as before. The board SHALL only pan and zoom to a strike that plays.

#### Scenario: All by default
- **WHEN** a viewer who has never changed the setting sees Aria attack Goblin
- **THEN** the strike plays as before

#### Scenario: Current turn skips another token's attack
- **WHEN** a viewer has chosen Current turn, it is Aria's turn in the encounter, and Bram's owner rolls to hit Goblin and the GM rules it a Hit and applies 5 damage
- **THEN** the viewer's board plays no strike and no hit effect, and "−5" rises from Goblin

#### Scenario: Current turn plays the active token's attack
- **WHEN** a viewer has chosen Current turn, it is Aria's turn, and Aria's owner rolls to hit Goblin and the GM rules it a Miss
- **THEN** the viewer's board plays the strike from Aria to Goblin and the miss effect

#### Scenario: Current turn outside an encounter
- **WHEN** a viewer has chosen Current turn, no encounter is running, and Bram attacks Goblin
- **THEN** the strike plays

#### Scenario: Nuke on a player's turn
- **WHEN** a viewer has chosen Current turn, it is Aria's turn and Aria has an owner, and the GM nukes the map
- **THEN** the viewer's board plays no blast, and each damaged token's number still rises

#### Scenario: None
- **WHEN** a viewer has chosen None and the GM resolves an area effect that damages three tokens
- **THEN** no damage numbers play on the viewer's board, and the save dice still drop onto the tokens

#### Scenario: Defeat still falls
- **WHEN** a viewer has chosen None and Goblin is removed at 0 HP
- **THEN** the viewer's board still shows Goblin falling before it is gone

#### Scenario: Only this viewer
- **WHEN** one player has chosen None and another has chosen All, and Aria attacks Goblin
- **THEN** only the second player's board plays the strike
