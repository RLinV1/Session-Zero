# Spec Delta

## Purpose

Gives every viewer one place to change their own browser preferences (audio, graphics and controls), reachable directly from the room's top bar and from the account pages, and keeps their choices across visits as new options are added.

## ADDED Requirements

### Requirement: Settings has its own button in the room
On a desktop-width room page, the top bar SHALL show a Settings button, an icon-only gear with the accessible name "Settings", placed directly before the "More" button. It SHALL open the Settings dialog. The "More" menu SHALL NOT list Settings on desktop. On a phone-width (compact) room page, the top bar SHALL NOT show the gear; Settings SHALL instead be an item in the "More" menu, as Share is. When the Settings dialog closes, focus SHALL return to the control that opened it. "More" SHALL keep its other items (Share on phones, Activity log for the GM, Replay, Guide) unchanged. The Settings button SHALL be available wherever "More" is, including while previewing as a player and while replaying. The Table tab SHALL still appear only for the GM outside a preview.

#### Scenario: Desktop gear opens Settings
- **WHEN** a player on a desktop-width screen presses the gear button in the room's top bar
- **THEN** the Settings dialog opens, and the "More" menu does not list Settings

#### Scenario: Phone keeps Settings in More
- **WHEN** a player on a phone-width screen opens "More"
- **THEN** it lists Settings, which opens the Settings dialog, and no gear button is shown in the top bar

#### Scenario: Focus returns
- **WHEN** a viewer closes the Settings dialog after opening it with the gear button
- **THEN** keyboard focus is back on the gear button

### Requirement: Controls tab
The Settings dialog SHALL have a Controls tab, after Audio and Graphics and before Table, shown to everyone, including on the account pages. It SHALL hold one switch, "Arrow keys move selected token", on by default. While it is on, the arrow keys SHALL move the selected token one square, as before, whenever the viewer may move that token. While it is off, the arrow keys SHALL NOT move tokens. The token card SHALL NOT show its own arrow-key switch. The choice SHALL be saved in this browser and shared by every room.

#### Scenario: Turning arrow-key movement off
- **WHEN** a player turns off "Arrow keys move selected token" in Settings and then selects their token and presses Right
- **THEN** the token does not move

#### Scenario: On by default
- **WHEN** a player who has never changed the setting selects their token and presses Right
- **THEN** the token moves one square right

#### Scenario: Token card has no switch
- **WHEN** a player selects a token they may move
- **THEN** the token card shows no arrow-key switch

### Requirement: Earlier choices carry forward
A browser's saved settings SHALL survive the addition of new settings. A setting missing from what is saved SHALL take its default, while every saved setting that is still valid SHALL keep its saved value. A saved value that is invalid SHALL fall back to its default without resetting the other settings. A browser that saved the arrow-key switch on the token card before this change SHALL keep that choice in "Arrow keys move selected token".

#### Scenario: Volume kept when a new setting appears
- **WHEN** a viewer saved Music volume 30 before this change and opens Settings after it
- **THEN** Music volume shows 30 and Attack animations shows All

#### Scenario: Old arrow-key choice kept
- **WHEN** a viewer had turned off "Move with arrow keys" on the token card before this change
- **THEN** after the change "Arrow keys move selected token" is off in Settings

#### Scenario: One bad value does not reset the rest
- **WHEN** a browser's saved settings hold Sound effects volume 250 and Graphics quality Low
- **THEN** Sound effects volume shows its default and Graphics quality stays Low
