# Spec Delta

## Purpose

Defines the one visual language every surface of the app shares, "the lit table", so the home page, entry pages, hub pages and the table read as one product: type, numbers, shapes, the accent, themes, backgrounds, shared components, motion and imagery.

## ADDED Requirements

### Requirement: One typeface
Every surface SHALL set its text in Geist, including the table's panels, dialogs, the map and encounter editors, and the labels the board draws on tokens. The app SHALL load no other text typeface and SHALL make no request to a third-party font service.

#### Scenario: The table uses the shared typeface
- **WHEN** a GM opens a room and inspects a panel heading, a button label, a dialog title and a token's name label on the board
- **THEN** each is drawn in Geist

#### Scenario: No third-party font request
- **WHEN** any page of the app loads
- **THEN** no request is made to a font service outside the app's own origin

### Requirement: Numbers in a monospace face
Every numeric readout SHALL be set in Geist Mono with tabular figures on every surface: hit points, initiative, dice and roll totals, grid sizes, distances, counts and activity log times. The faces of the 3D dice are dice art and keep the dice look's own figures.

#### Scenario: Hit points do not jitter
- **WHEN** a token's hit points change from 9 to 10 in the roster
- **THEN** the number is drawn in Geist Mono and the digits keep the same width

#### Scenario: Dice results
- **WHEN** a roll's dice and total are shown at the table or on the home page
- **THEN** every die value in the roll's breakdown and the total are drawn in Geist Mono

### Requirement: One corner scale
Interactive controls SHALL have 6px corners, and surfaces that group or float content (cards, panels with corners, menus, popovers, dialogs, map frames) SHALL have 12px corners. Tokens, avatars and colour swatches SHALL be circular. App chrome SHALL use no other corner radius.

#### Scenario: Controls and overlays
- **WHEN** a button, a text field, a menu and a dialog are measured on the dashboard and at the table
- **THEN** the button and field have 6px corners and the menu and dialog have 12px corners

### Requirement: Rust marks one action
A rust fill SHALL mark only the main action of a page section, a dialog or a collapsible section of the table's side panel, and the active turn. Each of those regions SHALL show at most one rust-filled control at a time. Other buttons SHALL use the neutral control style.

#### Scenario: A dialog with two actions
- **WHEN** a dialog offers Save and Cancel
- **THEN** only Save is filled with rust

#### Scenario: One rust action per side-panel section
- **WHEN** the GM opens the Tokens tab, whose section offers New Token and Saved Creatures
- **THEN** only New Token is filled with rust

#### Scenario: Active turn
- **WHEN** a token's turn is active in the initiative tracker
- **THEN** its row is marked in rust together with a glyph and its position, so colour is not the only signal

### Requirement: Selected states are neutral
A selected tab, tool or segment SHALL be shown by a raised neutral surface, a 2px rust indicator and its selected or pressed state exposed to assistive technology, not by a rust fill.

#### Scenario: Selected table tab
- **WHEN** the Play tab of the table's top bar is selected
- **THEN** it has a raised neutral background and a rust indicator, its label meets 4.5:1 against that background, and it reports itself as selected

#### Scenario: Selected tool
- **WHEN** the Fog tool is chosen on the tool rail
- **THEN** it shows the same selected treatment as a selected tab and reports itself as pressed

### Requirement: Board colours follow the tokens
The board SHALL draw hit-point bars with the same status colours and thresholds as the panels, and SHALL draw the selection ring in the focus colour. Colours a player or GM chooses, such as a token's colour or an area template's colour, and attack effect art, are exempt.

#### Scenario: Wounded token
- **WHEN** a token drops to 20% of its hit points
- **THEN** its hit-point bar on the board, in the roster and on the home page uses the same danger colour

### Requirement: Light and dark outside the table
The home page, sign-in, sign-up, join, not-found, GM dashboard and library pages SHALL follow one stored theme choice (light, dark or system), defaulting to the system preference. The table and the encounter editor SHALL always render dark.

#### Scenario: One choice carries across pages
- **WHEN** a visitor chooses the light theme on the home page and then opens the GM dashboard
- **THEN** the dashboard renders light without asking again

#### Scenario: The table stays dark
- **WHEN** a visitor who chose the light theme opens a room
- **THEN** the room renders dark, and returning to the dashboard renders it light again

#### Scenario: Storage unavailable
- **WHEN** local storage cannot be read or written
- **THEN** every themed page follows the system preference and the choice silently does not persist

### Requirement: Contrast on every surface
On every surface, in each theme that surface supports, text SHALL meet 4.5:1 against its own background (3:1 for text 24px and larger), and every interactive control's visual boundary and focus ring SHALL meet 3:1.

#### Scenario: Light hub pages
- **WHEN** contrast is measured on the dashboard and library in the light theme
- **THEN** body text, muted text, control labels, control boundaries and the focus ring all meet their thresholds

#### Scenario: Text on rust
- **WHEN** a label sits on a rust fill in either theme
- **THEN** it meets 4.5:1

### Requirement: Background by layer
Each layer SHALL have its own amount of ambient background. The home page has the most: lamp light, grain, a battle-grid pattern in the hero and fog between sections. Entry pages have a dimmed table photograph, half the lamp light and grain. Hub pages have a faint glow along the top and grain. The table has none.

#### Scenario: The table has no ambient layers
- **WHEN** a room is open
- **THEN** no lamp light, grain or photograph is drawn behind or over the board, and the board's surround is the flat ground with a vignette at its edges

#### Scenario: Entry pages
- **WHEN** a visitor opens the sign-in or join page
- **THEN** the form sits on the dimmed table photograph with the lamp light behind it

### Requirement: Ambient layers stay out of the way
Ambient background layers SHALL be fixed to the viewport, SHALL NOT receive pointer input, SHALL NOT cause horizontal scrolling and SHALL NOT shift layout when they load.

#### Scenario: Clicking through the background
- **WHEN** a visitor clicks a link that sits over a fog or light layer
- **THEN** the link receives the click

#### Scenario: No horizontal scroll
- **WHEN** any themed page is viewed at 390px wide
- **THEN** the page does not scroll horizontally

### Requirement: One header for the home and hub pages
The home page, GM dashboard and library SHALL share one header containing the logo and product name, the page's navigation, the account control and the theme toggle. Entry pages SHALL show only the logo and product name. The product name SHALL read identically wherever it appears.

#### Scenario: Same header in two places
- **WHEN** a signed-in GM moves from the home page to the dashboard
- **THEN** the logo, product name, account control and theme toggle keep the same position, size and style

### Requirement: One token drawing
Wherever the app shows a token outside the board (home page demos, library creature cards, roster rows), it SHALL draw it as the board does: a disc in the token's colour with its art clipped to the circle, a ring, a hit-point bar where hit points are known, and its initial when it has no art or the art fails to load.

#### Scenario: Art fails to load in the library
- **WHEN** a creature's art cannot be loaded on its library card
- **THEN** the card shows the coloured disc with the creature's initial, as the board would

### Requirement: Map thumbnails
A map shown as a thumbnail (library cards, the home page library strip, encounter templates) SHALL show the map with its grid at a lighter weight. A built-in map's thumbnail SHALL load a prepared thumbnail image, not the full map. Until an image loads, a placeholder of the card's shape SHALL hold its place.

#### Scenario: Built-in maps in the library
- **WHEN** the library's Maps tab opens
- **THEN** each built-in map's card downloads its prepared thumbnail and not the full-size map

#### Scenario: Uploaded map still loading
- **WHEN** an uploaded map's thumbnail has not loaded yet
- **THEN** a placeholder the size and shape of the card is shown, hidden from assistive technology, and no layout shift occurs when the image arrives

### Requirement: Empty states show the next step
The dashboard with no rooms, a library tab with nothing in it and a room with no map SHALL each show an empty state with a picture drawn from the shared lighting brief and a short line of text. Where the viewer can fill it, the empty state SHALL also offer the one action that does, unless that same action already sits beside it.

#### Scenario: Dashboard with no rooms
- **WHEN** a GM with no rooms opens the dashboard
- **THEN** an empty state shows its picture, says there are no rooms yet, and offers creating one as its single action

#### Scenario: A library tab with nothing in it
- **WHEN** a GM opens a library tab that holds none of their own items
- **THEN** the empty state shows its picture and its line of text, and the tab's toolbar action (Upload map, New creature, New encounter or New animation) stays the one way to add one, with no second copy of it

#### Scenario: A player in a room with no map
- **WHEN** a player opens a room whose GM has not set a map
- **THEN** the empty state shows its picture and says the GM has not set a map yet, with no action, while the GM sees the same state with the action to choose a map

### Requirement: Shared motion timing
Hover feedback, state changes and entrances SHALL use the shared easing curve and the three shared durations (120ms, 240ms and 480ms). Only transform and opacity SHALL be animated.

#### Scenario: Opening a menu
- **WHEN** a menu opens on the dashboard or at the table
- **THEN** it fades and moves into place over 240ms on the shared curve, without animating its size or position properties

### Requirement: Reduced motion everywhere
When the system prefers reduced motion, or the in-app Reduced animations setting is on, no decorative animation or transition SHALL run on any surface. Each element SHALL render in its settled state. State changes SHALL still be shown, without movement.

#### Scenario: In-app setting at the table
- **WHEN** a player with Reduced animations on rolls dice
- **THEN** no die tumble, roll card entrance or total entrance animation runs, and the result is shown at once

#### Scenario: System setting on the home page
- **WHEN** a visitor whose system prefers reduced motion opens the home page
- **THEN** fog does not drift, nothing reveals on scroll, and the hero scene is shown in its settled state

### Requirement: One icon family
Every icon SHALL come from the Phosphor family at its regular weight, with the fill weight used only to mark a selected tool. The app SHALL show no emoji and no hand-drawn icon.

#### Scenario: Home page section icons
- **WHEN** the home page and the table are compared
- **THEN** their icons share the same family and weight

### Requirement: Imagery is real or atmospheric
Every picture of the product SHALL show the real app: a running component, the table's own code running on the page, or a capture of the real app. A generated image SHALL be one of two things: atmosphere that follows the shared lighting brief, or a home page scene's map or token art. No generated image SHALL contain text, screens, interface or logos.

#### Scenario: Review of the imagery
- **WHEN** a reviewer checks each image on the home, entry, hub and empty-state surfaces
- **THEN** every image that shows the product is the real app
- **AND** every generated image is either atmosphere that follows the lighting brief or a home page scene's map or token art
- **AND** no generated image shows any interface

### Requirement: Each home page scene is drawn for it
The maps and tokens that the home page's demos run on SHALL be drawn for the home page, not taken from the asset library. Each scene SHALL have its own theme and drawing style. A scene's tokens SHALL be drawn in its map's style. Each map SHALL be drawn top-down to a square grid, with room for tokens to move, so that it plays.

#### Scenario: A scene's map and tokens belong together
- **WHEN** a home page demo shows tokens on a map
- **THEN** the tokens' art is drawn in the same style and palette as that map, and no two scenes share a theme or a drawing style
