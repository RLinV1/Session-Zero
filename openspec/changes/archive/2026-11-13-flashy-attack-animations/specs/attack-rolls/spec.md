## ADDED Requirements

### Requirement: Attack style
An attack roll MAY carry one of three styles: `melee`, `ranged` or `magic`. The attack panel SHALL NOT offer a manual style picker or send a style override. Its rolls SHALL use the named attack's saved animation when present, otherwise the existing automatic distance-based effect. Styles supplied by other clients SHALL remain validated by the server, stored on the roll and sent to viewers who can see it. Rolls without a style SHALL remain valid. Style SHALL change only how the attack is drawn; it SHALL NOT change the roll, dice, verdict or damage.

#### Scenario: Automatic style
- **WHEN** a player rolls an attack against Goblin from the attack panel
- **THEN** no Melee, Ranged or Magic picker is shown and no style override is sent
- **AND** the saved attack animation or automatic distance-based effect still plays

#### Scenario: Forged style
- **WHEN** a client sends an attack roll with style `"nuclear"`
- **THEN** the server rejects the roll

#### Scenario: Old rolls still load
- **WHEN** a room holds attack rolls with no style
- **THEN** it loads, replays and renders them without error

### Requirement: Named attack animation
A named attack on a token MAY carry one animation definition (see `library-animations`). When a roll is made with a label that matches one of the actor token's named attacks and that attack has an animation, the server SHALL store a copy of that animation on the roll's attack context and send it to every viewer who can see the roll. A client-supplied animation on a roll SHALL be ignored. An animation SHALL NOT change the roll, the dice, the verdict or the damage. Attacks and rolls made before this requirement SHALL stay valid with no animation.

#### Scenario: Matching attack carries its animation
- **WHEN** a token has the attack "Flame Tongue" with an animation and its owner rolls "Flame Tongue" at a target
- **THEN** the roll's attack context holds a copy of that animation

#### Scenario: Unmatched label
- **WHEN** a roll's label matches none of the actor's named attacks
- **THEN** the roll has no animation
