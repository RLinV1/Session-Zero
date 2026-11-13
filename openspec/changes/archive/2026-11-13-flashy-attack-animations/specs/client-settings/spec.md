## ADDED Requirements

### Requirement: Browser settings from More
Every viewer SHALL be able to open Settings from the room's More menu. Settings SHALL match the existing slate and rust interface and support narrow screens without horizontal overflow. Closing the dialog SHALL return keyboard focus to More.

#### Scenario: Adjust volume with keyboard or pointer
- **WHEN** the viewer moves Music volume or Sound effects volume
- **THEN** the 0–100 slider, filled track and percentage agree
- **AND** the input has an accessible label, supports arrow keys, Home and End, and retains its value after closing and reopening Settings
- **AND** the interface explains that audio playback will be added later

### Requirement: Local graphics preferences
High, Balanced and Low graphics quality SHALL control canvas pixel density, effect detail, glow, particle limits and animation cadence. Balanced SHALL be the default. The blast SHALL retain its screen-centred placement and broad fire/dust silhouette at every quality level. Changes SHALL apply without reloading or modifying room state.

#### Scenario: Lower rendering work
- **WHEN** a viewer changes from High to Low
- **THEN** canvas resolution is capped at 1x, attack frames at 24 fps, condition particle canvases are disabled, and strike blur is disabled
- **AND** other viewers' settings and room data remain unchanged

### Requirement: Reduced animations compose with existing preferences
The local Reduced animations preference SHALL combine with the device preference and GM table preference. An enabled device or table preference SHALL remain effective when the local switch is off. Still Pixi markers SHALL paint once and use a removal timer rather than an animation loop.

#### Scenario: Audio controls leave graphical effects alone
- **WHEN** either saved volume is adjusted
- **THEN** no canvas resize or effect restart occurs

### Requirement: Preferences survive storage limitations
Validated preferences SHALL persist in browser storage and follow changes from another tab. Invalid values SHALL fall back to safe defaults. Blocked or full storage SHALL not prevent the settings controls from working for the current visit.
