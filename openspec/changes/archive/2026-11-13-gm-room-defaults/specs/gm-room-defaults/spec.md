# Spec Delta

## Purpose

Lets a GM save how their new rooms start: the table rules and the grid's distance per square and unit label. Each new room and each new library map grid then starts that way, without the GM setting it by hand.

## ADDED Requirements

### Requirement: Room settings hold the GM's defaults for new rooms
The GM dashboard's Room settings, a gear in the header's row of settings on the dashboard and the asset library alike, SHALL hold the signed-in GM's defaults for new rooms. It SHALL offer every control the in-room Table tab offers, with the same labels and choices:
- "Remove tokens at 0 HP" (All, Only NPC tokens, Off);
- the switches "Hide map from players without a token", "Hide HP from Players" and "Hide AC from Players";
- "Diagonals" (Equal cost, Alternating (1, 2), Euclidean);
- "Difficult terrain applies" (On entry, On exit, Both).

It SHALL also offer two grid settings as separate fields:
- **Distance per square**: a number greater than 0, labelled "Distance per square" and followed by the current unit label, e.g. "Distance per square: 5 ft";
- **Unit label**: text of 1 to 12 characters, e.g. `ft` or `m`.

A GM who has never saved defaults SHALL see, and get, the built-in defaults: All, the three switches off, Equal cost, On entry, 5 per square and `ft`. Room settings SHALL say that the settings apply to rooms created from now on. A change SHALL be saved only when the GM saves it, and cancelling SHALL leave the saved defaults unchanged. A value the server refuses SHALL leave the saved defaults unchanged and SHALL be reported to the GM with the form kept as it was.

#### Scenario: Room settings show the Table tab's controls
- **WHEN** a signed-in GM opens Room settings for the first time
- **THEN** it shows "Remove tokens at 0 HP" set to All, the three switches off, "Diagonals" set to Equal cost, "Difficult terrain applies" set to On entry, "Distance per square: 5 ft" and "Unit label: ft"

#### Scenario: Save new defaults
- **WHEN** the GM turns on "Hide HP from Players", chooses Euclidean, sets the distance per square to 1.5 and the unit label to `m`, and saves
- **THEN** reopening Room settings, on this or another signed-in device, shows exactly those values

#### Scenario: Invalid distance refused
- **WHEN** the GM enters 0 or a negative distance per square, or an empty unit label, and saves
- **THEN** nothing is saved, the problem is shown, and the previous defaults stay in effect

### Requirement: Defaults belong to the GM's account
The defaults SHALL be stored on the server for the signed-in GM, not in the browser. Only that GM SHALL be able to read or change them. A request without a signed-in account SHALL be refused, and nothing SHALL let one GM read or change another GM's defaults. The server MUST validate a change and MUST refuse a value outside the limits above, or an unknown rule choice, without changing the stored defaults.

#### Scenario: Another GM cannot see them
- **WHEN** GM A saves defaults and GM B, signed in elsewhere, asks for room defaults
- **THEN** GM B receives only their own defaults, or the built-in ones if they never saved any

#### Scenario: Not signed in
- **WHEN** a request to read or change room defaults arrives without a signed-in account
- **THEN** it is refused and nothing is read or changed

#### Scenario: Forged value refused
- **WHEN** a request sets "Diagonals" to `"hex"` or the distance per square to `-5`
- **THEN** the server refuses it and the stored defaults are unchanged

### Requirement: New rooms start with the creating GM's defaults
A room SHALL start with the defaults of the GM who creates it, as they are when it is created: every table rule, and its grid's units per square and unit label. This SHALL hold for a room started from an encounter template too. The GM's saved units per square and unit label SHALL take the place of the game preset's in the new room. The room SHALL start with these values from its first event: its activity log SHALL NOT show a list of rule or grid changes made at creation. Changing the defaults later SHALL NOT change any existing room. A room created before this requirement SHALL read as it did before.

#### Scenario: Room starts with the defaults
- **WHEN** a GM whose defaults are "Hide HP from Players" on, Euclidean and 1.5 m creates a room
- **THEN** in the new room "Hide HP from Players" is on, "Diagonals" is Euclidean, the ruler measures in metres at 1.5 per square, and the activity log has no rule-change entries

#### Scenario: Encounter template room
- **WHEN** the same GM creates a room from one of their encounter templates
- **THEN** the room starts with the same rules and grid units

#### Scenario: Existing rooms are untouched
- **WHEN** the GM changes their defaults from Equal cost to Alternating (1, 2)
- **THEN** every room they already have keeps the Diagonals rule it had, and only rooms created afterwards start with Alternating (1, 2)

#### Scenario: No saved defaults
- **WHEN** a GM who never saved defaults creates a room
- **THEN** it starts exactly as a room did before this change
