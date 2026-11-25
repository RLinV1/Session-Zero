# Spec Delta

## MODIFIED Requirements

### Requirement: Reduced motion
At the Reduced and None Animations levels (`animation-levels`), no travelling or looping animation SHALL play and no strike SHALL be drawn. At Reduced, a hit or miss SHALL show a brief still ring on the target with no text and no shake, and a damage number SHALL show without moving. At None, nothing SHALL be drawn for a strike, hit, miss or damage number. Condition effects SHALL be drawn without motion at both levels. No room setting SHALL change a viewer's level.

#### Scenario: Reduced motion attack
- **WHEN** a viewer on Reduced sees an attack roll that the GM rules a Hit
- **THEN** no strike travels across the board and nothing is drawn for it, and a still ring briefly appears on the target without text or shake

#### Scenario: No animations attack
- **WHEN** a viewer on None sees an attack roll that the GM rules a Miss
- **THEN** nothing is drawn on the board for the strike or the miss

#### Scenario: Reduced motion condition
- **WHEN** a viewer on Reduced or None sees a stunned token
- **THEN** the stun effect is drawn but does not move

#### Scenario: GM turns animations down for the table
- **WHEN** a room's stored table-wide reduced flag is on and a player whose Animations level is Full sees an attack
- **THEN** that player's board plays the attack at the Full level

#### Scenario: Only the GM changes it
- **WHEN** a player sends the command to change the room's table-wide reduced flag
- **THEN** the server rejects it and the flag is unchanged

#### Scenario: Own preference still wins
- **WHEN** a viewer's system asks for reduced motion
- **THEN** that viewer's board plays at the None level whatever the room or their saved choice says

### Requirement: Animation sound volume and limits
The Sound effects volume setting SHALL scale every animation sound, and 0% SHALL play none. At the Reduced and None Animations levels, each strike and nuke SHALL play only one short, soft cue when it arrives, whether or not anything is drawn for it. No more than six animation sounds SHALL play at once, and the same shape starting again within 60 ms SHALL be heard once. An animation removed before it ends SHALL fade its sound out.

#### Scenario: Silenced by the slider
- **WHEN** a viewer sets Sound effects volume to 0% and an attack plays
- **THEN** the animation plays and no sound plays

#### Scenario: One attack at several targets
- **WHEN** a multi-target attack plays the same animation on three targets at once
- **THEN** its sound is heard once, not three times louder

#### Scenario: A nuke replaces an attack
- **WHEN** a nuke arrives while an attack animation is still playing
- **THEN** the attack's sound fades out and the nuke's sound plays

#### Scenario: Soft cue without a picture
- **WHEN** a viewer on None sees an attack roll with Sound effects volume above 0%
- **THEN** one short soft cue plays and nothing is drawn
