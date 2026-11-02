## ADDED Requirements

### Requirement: Animations in the library
A GM SHALL have an Animations tab in the asset library that lists the GM's own animations with name and shape, filtered by a case-insensitive name search. An animation has a name of 1 to 60 characters and a definition made only of:
- a shape: `slash`, `claw`, `whirlwind`, `slam`, `shadow`, `projectile`, `volley`, `dagger`, `fireball`, `meteor`, `explosion`, `bolt`, `chain`, `beam`, `frost`, `poison`, `smite`, `sonic`, `tornado` or `nuke`;
- a duration from 0.2 to 8 seconds (4 until ADR 0047);
- a primary and a secondary six-digit hex colour, and an optional third (accent) colour;
- a size from 0.5 to 3;
- a particle count from 0 to 120 and a particle look (`spark`, `star`, `square`, `shard` or `ring`);
- glow, shake and flash intensities from 0 to 1;
- a hit count from 1 to 12, for shapes that repeat, such as volley arrows, claw cuts or chain jumps;
- spread, arc, trail and spin from 0 to 1;
- particle gravity from −1 (rises) to 1 (falls);
- an impact ring count from 0 to 5.

Every field added after the first four shapes MAY be left out. A stored definition without them SHALL read with that shape's defaults. A GM SHALL be able to create, edit, rename, duplicate and delete their animations. The library SHALL also offer a built-in starting point for every shape that can be duplicated into the GM's animations. Every library animation endpoint SHALL be GM-only, SHALL authorize on the server, and SHALL answer 404 for another GM's animation, the same as for one that does not exist. The server SHALL reject any definition outside these bounds with 400 and store nothing. A GM SHALL NOT hold more than 100 animations.

#### Scenario: Create and list
- **WHEN** the GM saves a slash animation named "Fire blade" with orange colours and 40 particles
- **THEN** the Animations tab lists "Fire blade" as a slash

#### Scenario: Out-of-range definition
- **WHEN** a request creates an animation with 500 particles, a duration of 60 seconds, a colour of "red", or an unknown shape
- **THEN** the server responds 400 and no animation is added

#### Scenario: Another GM's animation
- **WHEN** GM B requests rename or delete for an animation owned by GM A
- **THEN** the server responds 404 and the animation is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a library animation endpoint carries only a room guest credential
- **THEN** the server responds 401

#### Scenario: Duplicate a built-in
- **WHEN** the GM duplicates the built-in magic style
- **THEN** a new library animation named after it with the same definition appears and can be edited

### Requirement: A default preset for every shape
Every shape SHALL have one built-in default preset: a full definition tuned to look good as it is. Choosing a shape in the editor SHALL load that shape's default preset into every field, and a "Reset to shape default" action SHALL restore it after edits. The library's "Start from built-in" SHALL list every shape's default preset. On the board, an attack style with no animation of its own SHALL play its default preset: melee the `slash` preset, ranged the `projectile` preset and magic the `bolt` preset. A nuke with no animation SHALL play the `nuke` preset.

#### Scenario: Switching shape loads its defaults
- **WHEN** the GM changes an animation's shape from slash to tornado in the editor
- **THEN** every field shows the tornado default preset, and Play shows a tornado

#### Scenario: Reset after edits
- **WHEN** the GM edits a meteor's colours and hit count, then chooses "Reset to shape default"
- **THEN** every field returns to the meteor default preset

#### Scenario: Every shape has a starting point
- **WHEN** the GM opens "Start from built-in"
- **THEN** one entry per shape is offered, and each one parses as a valid definition

### Requirement: Editor with live preview
The Animations tab SHALL let the GM edit an animation's fields and SHALL show a preview stage with a stand-in attacker and target and a Play button. Play SHALL run the animation exactly as a board would, using the unsaved values in the editor. The preview SHALL NOT change any room, token or library data. Unsaved edits SHALL stay out of the library until the GM saves. For a `nuke` shape the preview SHALL play the blast over the stage. When the GM prefers reduced motion, the preview SHALL show the same static markers a board shows.

#### Scenario: Preview unsaved changes
- **WHEN** the GM changes the colour of "Fire blade" to blue and presses Play without saving
- **THEN** the preview plays a blue animation and the library still holds the orange one

#### Scenario: Preview touches nothing
- **WHEN** the GM presses Play several times
- **THEN** no event is sent to any room and no library record changes

#### Scenario: Nuke preview
- **WHEN** the GM presses Play on a nuke animation
- **THEN** the stage plays a shockwave, flash and shake, and nothing is damaged

### Requirement: Attaching an animation to an attack
A GM SHALL be able to attach one of their library animations, other than a `nuke`, to a named attack on a creature or a token. The animation definition SHALL be copied into the attack, so players see it without library access and later changes to the library animation SHALL NOT change an attack or a room. When a named attack with an animation is rolled, the server SHALL copy the actor token's matching attack animation into the roll's attack context; a client SHALL NOT be able to supply one. Every viewer who can see the attack SHALL play that animation in place of the built-in style animation, under the same visibility and reduced-motion rules as any attack animation. Removing the animation from the attack SHALL restore the built-in style.

#### Scenario: Custom animation plays for everyone
- **WHEN** Aria has a named attack "Flame Tongue" with the "Fire blade" animation, and her owner rolls it against Goblin
- **THEN** every viewer who can see both tokens sees the "Fire blade" animation, not the built-in slash

#### Scenario: Library edit does not change the attack
- **WHEN** the GM later changes "Fire blade" in the library
- **THEN** Aria's "Flame Tongue" still plays the copy it was given

#### Scenario: Forged animation
- **WHEN** a client sends an attack roll that includes an animation of its own
- **THEN** the server ignores it and uses only the actor's matching attack animation, if any

#### Scenario: Nuke animation on an attack
- **WHEN** the GM tries to attach a `nuke` animation to an attack
- **THEN** it is refused

### Requirement: Using an animation for the nuke
The nuke control SHALL let the GM choose a `nuke` animation from the library or the built-in. The chosen definition SHALL be validated by the server and carried in the `MapNuked` event, so every viewer plays it. A definition whose shape is not `nuke` SHALL be refused.

#### Scenario: Custom blast
- **WHEN** the GM detonates a nuke with their "Green death" nuke animation
- **THEN** every viewer's board plays "Green death" instead of the built-in blast

#### Scenario: Wrong shape
- **WHEN** a request detonates a nuke with a slash animation
- **THEN** the server rejects it and no event is appended


### Requirement: Dedicated animation workspace
Creating or editing an animation SHALL open its own full-screen editor using the map editor's shell. The header SHALL keep Save and Cancel visible. Settings SHALL be split into keyboard-accessible Appearance, Timing & power and Motion sections, with independent scrolling. The large preview SHALL stay mounted and visible while sections change and SHALL show two distinct, labelled tokens: Attacker and Target. Play SHALL use the current unsaved definition; Stop SHALL release the active preview. Preview rendering SHALL be idle when stopped and bounded to 30fps when playing. Hidden tabs and closed editors SHALL stop and clean up the preview. On narrow screens, the preview SHALL sit above the settings without horizontal scrolling.

#### Scenario: Tune an attack between two tokens
- **WHEN** the GM opens an animation and presses Play
- **THEN** the animation plays between the visible Attacker and Target tokens
- **AND** switching settings sections keeps the same preview and unsaved definition

#### Scenario: Protect a draft
- **WHEN** the GM closes an editor containing unsaved changes
- **THEN** Keep editing preserves the draft and Discard changes closes without saving
- **AND** a failed Save reports an error while retaining the draft


### Requirement: Static animation card previews
Every animation card SHALL show a still frame rendered from its own definition using the same effect renderer as the board and editor. The frame SHALL be chosen to show the shape clearly and SHALL refresh when settings change. Images SHALL be cached by definition in a bounded cache and generated serially through one shared offscreen renderer, requested only near the viewport. Cached cards SHALL NOT run animation loops or own WebGL canvases. Leaving the library tab SHALL cancel unneeded rendering and release its renderer after extraction finishes. A render failure SHALL leave card actions usable and show a preview-unavailable state.

#### Scenario: Recognizable previews without looping effects
- **WHEN** the GM views the Animations tab
- **THEN** each visible card shows a static image of its animation, including custom colours and the nuke
- **AND** revisiting unchanged cards reuses the cached images without creating another renderer
