# Spec Delta

## Purpose

Presents a dice roll as physical dice thrown onto the table and coming to rest on the rolled values, in the room's Dice panel for every participant and in the home page's dice demo, without changing any roll or what each participant is allowed to see.

## ADDED Requirements

### Requirement: Rolls are thrown for everyone who receives them
The room's Dice panel SHALL present each newly received roll as three-dimensional dice thrown into a tray above the latest-roll row, for every participant whose client receives the roll, whether or not they made it. The throw SHALL show the dice falling in, bouncing, tumbling and coming to rest within about one and a half seconds. At rest, each die SHALL show the roll's value for that die, in the roll's order. Presenting a roll SHALL NOT change, re-roll or reorder any value, and SHALL NOT send anything to the server.

#### Scenario: Another participant's roll is thrown for everyone
- **WHEN** a player makes a public roll while the GM and another player have the room open
- **THEN** all three see the dice thrown into their tray and come to rest

#### Scenario: The dice land on the rolled values
- **WHEN** the server rolls `3d20` as 5, 14 and 1
- **THEN** the three dice come to rest showing 5, 14 and 1, left to right, and the row reads a total of 20

### Requirement: The result waits for the dice
While a roll's dice are in the air, the latest-roll row SHALL say who is rolling and what expression, and SHALL NOT show the total or any die's value. When the dice come to rest the row SHALL show the total and every die's value, and assistive technology SHALL be told the result once, at that moment. The thrown dice SHALL be hidden from assistive technology, since the row carries the result as text.

#### Scenario: Mid-throw
- **WHEN** a participant's `2d6` roll is still in the air
- **THEN** the row reads that they are rolling 2d6, with no total and no die values

#### Scenario: Landing is announced once
- **WHEN** the dice come to rest
- **THEN** the row shows the total and each die's value, and a screen reader announces that result once and does not announce the placeholder before it

### Requirement: Rolls already on the table are not replayed
A roll that is already the latest when the Dice panel appears SHALL be shown at rest without being thrown. This SHALL hold on joining a room, reloading, reconnecting, and switching to the Dice tab on a narrow screen. A newer roll arriving while an earlier one is still in the air SHALL replace it.

#### Scenario: Joining mid-session
- **WHEN** a player joins a room whose latest roll was made before they arrived
- **THEN** that roll's dice are shown at rest with its result, and nothing is thrown

#### Scenario: Switching phone tabs
- **WHEN** a participant on a narrow screen switches away from the Dice tab and back
- **THEN** the latest roll is shown at rest and is not thrown again

### Requirement: GM-only rolls are thrown for the GM alone
A GM-only roll SHALL be thrown only on the GM's screen, with dice visibly distinct from public rolls, and its row SHALL keep the "GM only" label so the distinction does not rely on colour alone. A player's client SHALL receive nothing about a GM-only roll, so no dice SHALL be thrown for it on a player's screen and the player's tray SHALL keep showing the latest roll they are allowed to see.

#### Scenario: Private roll
- **WHEN** the GM rolls `2d6` privately while a player has the room open
- **THEN** the GM sees private-coloured dice land with the "GM only" label on the row, and the player's tray and row are unchanged

### Requirement: Dice are drawn as real dice and read like them
Dice with 4, 6, 8, 10, 12 or 20 sides SHALL be drawn as the matching polyhedron, numbered 1 to N, with opposite faces summing to N + 1 wherever the solid has opposite faces. A d4 SHALL come to rest read at its top corner, with the result printed at that corner on each face that meets there. Every other die SHALL come to rest with its result face toward the viewer, upright. On dice with nine or more sides, 6 and 9 SHALL be underlined. Dice of other sizes SHALL borrow a body: a d2 or d3 is a d6 numbered over again; other sizes up to twenty use the smallest standard body with at least as many faces; anything larger is a d20 whose resting face carries the rolled value. In every case, the numbers nearest the viewer at rest SHALL be the rolled value.

#### Scenario: A d20 lands face up
- **WHEN** a d20 rolls 9
- **THEN** it rests as an icosahedron with the face marked 9, underlined, turned toward the viewer

#### Scenario: A d4 is read at its tip
- **WHEN** a d4 rolls 1
- **THEN** it rests as a pyramid with its top corner up, and the number at that corner on every visible face is 1

#### Scenario: A die with more sides than faces
- **WHEN** a d100 rolls 43
- **THEN** it rests as a d20 whose face toward the viewer reads 43

### Requirement: Reduced motion shows the dice at rest
When the viewer prefers reduced motion, no throw SHALL run, in the room or on the home page: the dice SHALL be drawn at rest and the result SHALL be shown at once.

#### Scenario: A roll under reduced motion
- **WHEN** a participant who prefers reduced motion receives a new roll
- **THEN** its dice appear at rest and the row shows the total immediately, with no "rolling" state

### Requirement: The home page demo throws the same dice
The home page's dice demo SHALL present each roll with the same thrown dice as the table, coming to rest on the values produced by the shared roller. The total and each die's value SHALL appear once the dice have landed. The dice SHALL read clearly on both the light and the dark home page grounds.

#### Scenario: Demo roll
- **WHEN** a visitor rolls `2d6+3` on the home page
- **THEN** two d6s are thrown and land, and only then are the total and the sum of the shown dice plus 3 displayed

#### Scenario: Light ground
- **WHEN** the home page is on its light ground and a visitor rolls
- **THEN** the dice, their shadows and the tray remain clearly visible against the page
