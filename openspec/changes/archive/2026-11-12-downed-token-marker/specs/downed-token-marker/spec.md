# Spec Delta

## Purpose

Shows at a glance which tokens on the board are down at 0 HP or below, without telling any viewer more about a token's HP than they are already allowed to know.

## ADDED Requirements

### Requirement: Downed tokens look downed
A token SHALL be drawn as downed on a viewer's board when that viewer holds the token's HP and it is 0 or below. A downed token's art, its image or its color disc when it has none, SHALL be drawn mostly greyscale (75%), with a small red X drawn over the art inside the token's circle. The X SHALL be a shape, so the state isn't shown by colour alone. A token with no HP value SHALL NOT be drawn as downed. When the token's HP rises above 0, the downed look SHALL go away. The token's name label, condition badges and other decorations SHALL keep their usual look.

#### Scenario: A goblin drops to 0
- **WHEN** the GM, with auto-remove defeated tokens off, applies damage that takes "Goblin" from 3 HP to 0
- **THEN** on the GM's board Goblin's art turns mostly grey with an X over it, and the token stays on the board

#### Scenario: Below zero
- **WHEN** a token's HP is set to −4
- **THEN** it is drawn downed

#### Scenario: Healed
- **WHEN** a downed token is healed to 5 HP
- **THEN** the grey and the X go away

#### Scenario: No HP tracked
- **WHEN** a token has no HP value
- **THEN** it is never drawn downed

#### Scenario: A token with no image
- **WHEN** a token with no image, drawn as a coloured disc, reaches 0 HP
- **THEN** the disc is drawn grey with the X over it

### Requirement: The downed look combines with conditions
A downed token that also has the Unconscious condition SHALL be drawn with the downed look's stronger greyscale, not the Unconscious partial grey. Other condition effects on the art (fading, tilting, trembling) SHALL still apply to a downed token.

#### Scenario: Downed and Unconscious
- **WHEN** a token at 0 HP also has Unconscious
- **THEN** its art is mostly grey with the X, and its Unconscious badge still shows

#### Scenario: Downed and Prone
- **WHEN** a token at 0 HP is Prone
- **THEN** its art is tilted as for Prone, mostly grey, with the X

### Requirement: The marker reveals no hidden HP
The board SHALL decide whether a token is downed only from the HP the viewer's own state holds. When the room hides HP from players, a player SHALL NOT see the downed look on a token they don't own, whatever its HP. The GM and the token's owners SHALL see it. No information beyond what the viewer already receives SHALL be sent for this marker.

#### Scenario: Hidden HP
- **WHEN** "Hide HP from Players" is on and an enemy goblin reaches 0 HP
- **THEN** the GM sees it downed, and the players' boards show the goblin as usual

#### Scenario: HP visible
- **WHEN** "Hide HP from Players" is off and an enemy goblin reaches 0 HP
- **THEN** every participant who can see the goblin sees it downed

#### Scenario: A player's own token
- **WHEN** "Hide HP from Players" is on and a player's own character reaches 0 HP
- **THEN** that player sees their token downed
