# Spec Delta

## RENAMED Requirements
- FROM: `### Requirement: Controls tab`
- TO: `### Requirement: Preferences tab`

## MODIFIED Requirements

### Requirement: Preferences tab
The Settings dialog SHALL have a Preferences tab, after Audio and Graphics and before Table, shown to everyone, including on the account pages. It SHALL hold the switch "Arrow keys move selected token", on by default, and, for the GM in a room, the switch **Turn banner on every turn** (see `turn-notice`). While "Arrow keys move selected token" is on, the arrow keys SHALL move the selected token one square, as before, whenever the viewer may move that token. While it is off, the arrow keys SHALL NOT move tokens. The token card SHALL NOT show its own arrow-key switch. Each choice SHALL be saved in this browser and shared by every room.

#### Scenario: Turning arrow-key movement off
- **WHEN** a player turns off "Arrow keys move selected token" in Settings and then selects their token and presses Right
- **THEN** the token does not move

#### Scenario: On by default
- **WHEN** a player who has never changed the setting selects their token and presses Right
- **THEN** the token moves one square right

#### Scenario: Token card has no switch
- **WHEN** a player selects a token they may move
- **THEN** the token card shows no arrow-key switch

#### Scenario: Named Preferences
- **WHEN** anyone opens Settings
- **THEN** the tab after Graphics reads "Preferences", and no tab reads "Controls"
