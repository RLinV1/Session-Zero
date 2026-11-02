## ADDED Requirements

### Requirement: Animation sounds
Every attack animation shape and the nuke SHALL play a themed sound for a viewer whenever that viewer's board or library editor preview plays it, built from recorded clips shipped with the app and synthesis in the browser. The sound SHALL NOT be sent, stored or replayed. Each impact sound SHALL begin when its impact is drawn, at any duration, and a shape that strikes several times SHALL sound once per strike. Library thumbnails SHALL stay silent.

#### Scenario: A fireball sounds as it lands
- **WHEN** a fireball attack plays on a viewer's board with Sound effects volume at 80%
- **THEN** the viewer hears the fireball fly, then a blast at the moment the fireball reaches the target

#### Scenario: Thumbnails are silent
- **WHEN** the GM opens the Animations tab of the asset library
- **THEN** every animation's thumbnail plays and no sound plays

### Requirement: Dice sounds
Dice thrown on a viewer's board, and dice thrown in the Dice panel's tray, SHALL clack for that viewer each time a die strikes the surface in its throw animation, softer for each smaller bounce, and SHALL go quiet once the last die has come to rest. A throw removed before its dice rest SHALL fade its sound out. Dice drawn at rest because of reduced animations SHALL play a single soft clack. Dice sounds SHALL NOT take the place of attack sounds.

#### Scenario: Dice clack as they bounce
- **WHEN** a viewer throws 2d6 onto the map
- **THEN** each die clacks as it lands and as it bounces, and slides quietly to rest

#### Scenario: A roll and its attack
- **WHEN** four dice throws are still sounding and an attack animation plays
- **THEN** the attack's sound still plays

### Requirement: Held die rattle
While a viewer holds the Dice panel's die under the pointer, the dice SHALL rattle for that viewer: louder when the die is shaken (each time it changes direction quickly), softly as it is dragged, and faintly now and then while it is held still. The rattle SHALL stop as soon as the hold ends, whether the die is thrown, let go off the map or put back.

#### Scenario: Shaking before a throw
- **WHEN** a viewer picks up the die and shakes it back and forth over the map
- **THEN** the dice rattle on each shake, and stop the moment the die is let go

#### Scenario: Holding still
- **WHEN** a viewer holds the die still over the map
- **THEN** the dice are mostly quiet, with a faint rattle now and then

### Requirement: Credited sound sources
Every recorded clip SHALL come from a source released under CC0, and the clips' credits file SHALL name, for each clip, its source page, author and licence and the part of the recording it was cut from.

#### Scenario: A clip is added
- **WHEN** a recipe plays a clip
- **THEN** the clip's file ships with the app and its row in the credits file names a CC0 source page and author

### Requirement: Animation sound volume and limits
The Sound effects volume setting SHALL scale every animation sound, and 0% SHALL play none. With reduced animations, each animation SHALL play only one short, soft cue as its still marker appears. No more than six animation sounds SHALL play at once, and the same shape starting again within 60 ms SHALL be heard once. An animation removed before it ends SHALL fade its sound out.

#### Scenario: Silenced by the slider
- **WHEN** a viewer sets Sound effects volume to 0% and an attack plays
- **THEN** the animation plays and no sound plays

#### Scenario: One attack at several targets
- **WHEN** a multi-target attack plays the same animation on three targets at once
- **THEN** its sound is heard once, not three times louder

#### Scenario: A nuke replaces an attack
- **WHEN** a nuke arrives while an attack animation is still playing
- **THEN** the attack's sound fades out and the nuke's sound plays
