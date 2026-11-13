## MODIFIED Requirements

### Requirement: Attack animation
When a to-hit or damage attack roll is committed while a viewer is connected, and that viewer can see both the attacker and the target, the viewer's board SHALL play an animation of a strike from the attacker token to the target token followed by an impact on the target. The strike SHALL depend on the roll's attack style: `melee` plays a glowing slash arc across the target, `ranged` plays a projectile with a trail flying from attacker to target, and `magic` plays a charged bolt from attacker to target that bursts on impact. A roll with no style or saved animation SHALL use melee within 1.5 grid cells and a varied ranged default otherwise. The default SHALL vary between roll ids and remain the same for all viewers of a given roll. A damage roll SHALL NOT play the strike when it follows a to-hit roll: that is, when the latest earlier attack roll in the viewer's copy of the room from the same attacker at the same target is a to-hit roll. Nothing SHALL be played in its place. A damage roll that does not follow a to-hit roll SHALL strike as any other attack roll. Attack rolls the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT animate.

#### Scenario: Live attack animates
- **WHEN** Aria's owner rolls a ranged attack on Goblin while the GM and another player, who can see both tokens, are connected
- **THEN** each of their boards plays a projectile with a trail from Aria to Goblin ending in an impact on Goblin

#### Scenario: Styles look different
- **WHEN** three attacks are rolled with the melee, ranged and magic styles
- **THEN** a slash arc, a trailing projectile and a charged bolt play respectively, and no two look alike

#### Scenario: Unstyled attack is inferred
- **WHEN** an attack with no style is rolled against an adjacent target, and another against a target six cells away
- **THEN** the first plays the melee slash and the second plays one of the ranged defaults

### Requirement: Varied automatic ranged attacks
For an attack without a saved animation or explicit historical style, targets within 1.5 grid cells SHALL use the melee slash, including diagonal neighbouring cells. Farther targets SHALL use a varied travelling effect chosen from projectile, volley, dagger, fireball, bolt and beam. The selection SHALL be stable for the roll id so all viewers see the same effect, without a manual style selector. Saved attack animations SHALL retain precedence.

#### Scenario: Repeated distant attacks
- **WHEN** several distinct unstyled rolls attack a distant target
- **THEN** their effects vary across the ranged pool
- **AND** each individual roll looks the same for every viewer who can see both tokens

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

