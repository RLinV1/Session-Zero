# Spec Delta

## MODIFIED Requirements

### Requirement: Animations in the library
A GM SHALL have an Animations tab in the asset library that lists the GM's own animations with name and shape, filtered by a case-insensitive name search. An animation has a name of 1 to 60 characters and a definition made only of:
- a shape: `slash`, `claw`, `whirlwind`, `slam`, `shadow`, `projectile`, `volley`, `dagger`, `fireball`, `meteor`, `explosion`, `bolt`, `chain`, `beam`, `frost`, `poison`, `smite`, `sonic`, `tornado`, `arrow`, `pierce` or `nuke`;
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

#### Scenario: Arrow and pierce animations
- **WHEN** the GM saves an animation named "Heavy bolt" with the arrow shape, and another named "Lunge" with the pierce shape
- **THEN** the Animations tab lists "Heavy bolt" as an arrow and "Lunge" as a pierce
