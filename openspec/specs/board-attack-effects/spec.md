# board-attack-effects Specification

## Purpose
Shows attacks, rulings, damage and conditions on the board itself, using only what each viewer may see, so the table can follow play without reading the sidebar.

## Requirements

### Requirement: Attack animation
When a to-hit or damage attack roll is committed while a viewer is connected, and that viewer can see both the attacker and the target, the viewer's board SHALL play an animation of a strike from the attacker token to the target token followed by an impact on the target. A roll that carries an animation SHALL play it. Otherwise, a roll with an attack style SHALL play that style's built-in: `melee` a glowing slash arc across the target, `ranged` a projectile with a trail flying from attacker to target, `magic` a charged bolt that bursts on impact. A roll with neither SHALL play the **Automatic** animation:
- when the roll was made with a named attack whose range is Melee, the built-in melee slash;
- when it was made with a named attack whose range is Ranged, the built-in arrow;
- otherwise (a named attack with range None, a custom roll, or a label matching no named attack), the melee slash when the two tokens' squares touch at a side or corner, and the arrow when they do not.

The Automatic animation SHALL be the same for every viewer of a roll. It SHALL NOT depend on the roll's id or vary between rolls in the same situation. A damage roll SHALL NOT play the strike when it follows a to-hit roll: that is, when the latest earlier attack roll in the viewer's copy of the room from the same attacker at the same target is a to-hit roll. Nothing SHALL be played in its place. A damage roll that does not follow a to-hit roll SHALL strike as any other attack roll. Attack rolls the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT animate.

#### Scenario: Live attack animates
- **WHEN** Aria's owner rolls a ranged attack on Goblin while the GM and another player, who can see both tokens, are connected
- **THEN** each of their boards plays a projectile with a trail from Aria to Goblin ending in an impact on Goblin

#### Scenario: Styles look different
- **WHEN** three attacks are rolled with the melee, ranged and magic styles
- **THEN** a slash arc, a trailing projectile and a charged bolt play respectively, and no two look alike

#### Scenario: Automatic follows the attack's range
- **WHEN** Aria rolls her Melee "Longsword" with no animation at a goblin six squares away, then her Ranged "Longbow" with no animation at an adjacent goblin
- **THEN** the first plays the melee slash and the second plays the arrow

#### Scenario: Every viewer sees the same Automatic animation
- **WHEN** Aria's owner rolls her Ranged "Longbow" with no animation at an adjacent goblin, while another player who doesn't receive Aria's attacks watches
- **THEN** both boards play the arrow

#### Scenario: Unstyled attack is inferred
- **WHEN** an attack with no animation and no range is rolled against an adjacent target, then another against a target six squares away
- **THEN** the first plays the melee slash and the second plays the arrow

#### Scenario: Repeated distant attacks look the same
- **WHEN** several custom rolls with no animation are made against the same distant target
- **THEN** each plays the arrow, the same for every viewer

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
When the viewer prefers reduced motion, or the GM has turned on reduced animations for the room, no travelling or looping animation SHALL play. An attack SHALL instead show a brief static marker on the target; hit, miss and damage SHALL show static, short-lived indicators; condition effects SHALL be drawn without motion. The GM SHALL be able to turn reduced animations on and off for the whole room at any time; the setting SHALL be stored with the room, SHALL reach every participant, and SHALL take effect on every board as soon as it changes. Only the GM SHALL be able to change it. Turning it off SHALL NOT override a viewer's own reduced-motion preference.

#### Scenario: Reduced motion attack
- **WHEN** a viewer with reduced motion enabled sees an attack roll
- **THEN** no strike travels across the board and a static marker briefly appears on the target

#### Scenario: Reduced motion condition
- **WHEN** a viewer with reduced motion enabled sees a stunned token
- **THEN** the stun effect is drawn but does not move

#### Scenario: GM turns animations down for the table
- **WHEN** the GM turns on reduced animations and a player then rolls an attack
- **THEN** every board shows only the static marker, including boards of viewers who have no reduced-motion preference

#### Scenario: Only the GM changes it
- **WHEN** a player sends the command to change reduced animations
- **THEN** the server rejects it and the setting is unchanged

#### Scenario: Own preference still wins
- **WHEN** the GM turns reduced animations off and a viewer's system asks for reduced motion
- **THEN** that viewer's board still plays the reduced forms

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

### Requirement: Arrow and pierce animations
The built-in animations SHALL include two more:
- **Arrow**: a single, large, grey arrow that flies from the attacker to the target on a low arc and strikes it, with a single-arrow sound;
- **Pierce**: a melee thrust: a painted blade that winds up with a glint, lunges into the target with afterimages and a glowing point, and bursts out its far side in a cone of sparks with a short recoil, with a stab sound. A hit count above 1 SHALL be a flurry of that many thrusts in quick succession, each with its own sparks and sound.

Each SHALL be offered everywhere built-in animations are: the attack editor's Animation picker, the library's "Start from built-in" and the animation editor's shapes. Each SHALL have a default preset, a static card preview and a reduced-motion version, as every built-in does. A GM SHALL be able to attach either to a named attack, as with any built-in. Rooms and library animations saved before these existed SHALL be unaffected.

#### Scenario: Arrow plays
- **WHEN** Aria's "Longbow" has the Arrow animation and her owner rolls it at a goblin
- **THEN** every viewer who can see both tokens sees one large grey arrow fly from Aria to the goblin and strike it

#### Scenario: Pierce plays
- **WHEN** Aria's "Rapier" has the Pierce animation and her owner rolls it at an adjacent goblin
- **THEN** every viewer who can see both tokens sees a thrust from Aria punch through the goblin

#### Scenario: New shapes in the library
- **WHEN** the GM opens "Start from built-in" in the library
- **THEN** Arrow and Pierce are offered among the built-ins, each with its own preview card

### Requirement: The arrow volley lands round its target
The arrow volley's arrows SHALL come down scattered in a rough circle around the target, as wide as the animation's spread makes it, not in a line across their path. A single arrow SHALL land on the target.

#### Scenario: A volley of seven
- **WHEN** a volley of seven arrows strikes a goblin
- **THEN** the arrows land around the goblin on every side
