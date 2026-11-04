## Purpose

Defines how every screen of the web app behaves at phone widths, so a player or GM can join and run a game from a phone without clipped, overlapping or unreachable controls.

## ADDED Requirements

### Requirement: No horizontal page overflow on phones
Every screen SHALL render without horizontal page scrolling at viewport widths from 360px to 430px. Content that is wider than the viewport, such as tab strips and wide tables, SHALL scroll or wrap inside its own container.

#### Scenario: Library tabs on a narrow phone
- **WHEN** the library is opened at 390px width
- **THEN** every tab (Maps, Token Art, Creatures, Encounters, Animations) is reachable without scrolling the page, and no tab label is cut off without a visible way to reach it

#### Scenario: Any route at 360px
- **WHEN** any route is opened at 360px width
- **THEN** the document is no wider than the viewport

### Requirement: Controls do not overlap content
Floating controls SHALL NOT cover interactive or readable content that the user cannot scroll away from the control.

#### Scenario: Chat button over panels
- **WHEN** the room's side panels are scrolled to the bottom on a phone
- **THEN** the chat button does not cover any panel heading, text or control

#### Scenario: Tool rail over the board
- **WHEN** the room is open on a phone with an empty board
- **THEN** the tool rail does not cover the board's centre or its empty-state action, and it does not scroll inside the board

### Requirement: Usable board area on phones
The room SHALL give the board at least half of the viewport height on a phone in portrait, with the side panels reachable below or in a sheet.

#### Scenario: Portrait room
- **WHEN** a room is opened at 390x844
- **THEN** the board is at least 420px tall and the Play, Tokens, Dice and Manage tabs are reachable

### Requirement: Dialogs fit the viewport
Modals, popovers and menus SHALL fit within the viewport at phone widths, with their primary and cancel actions visible or reachable by scrolling inside the dialog.

#### Scenario: Create-room dialog
- **WHEN** the create-room dialog is opened at 360px width
- **THEN** the dialog is fully inside the viewport and its Create and Cancel buttons are usable

#### Scenario: Long dialog
- **WHEN** a dialog taller than the viewport is opened, such as scene setup
- **THEN** its content scrolls inside the dialog and its close control stays visible

### Requirement: Touch targets on coarse pointers
On coarse pointers, buttons, tabs, inputs and selects SHALL be at least 44px tall, and adjacent targets SHALL be separated enough to avoid mis-taps.

#### Scenario: Room tab bar on touch
- **WHEN** the room's tab bar is shown on a coarse pointer
- **THEN** each tab is at least 44px tall
