# Spec Delta

This delta is written against `board-attack-effects` as synced from `flashy-attack-animations` (archived 2026-11-13).

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Varied automatic ranged attacks
**Reason**: An unconfigured ranged attack now always plays the arrow, so a bow never fires a fireball, and Automatic follows the attack's range (see "Attack animation").
**Migration**: None. Rolls carry no stored choice of automatic animation; it is worked out when a roll plays, so old rolls simply play the new Automatic animation. A GM who wants variety attaches an animation to the named attack.

## ADDED Requirements

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
