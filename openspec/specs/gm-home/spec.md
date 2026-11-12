# gm-home Specification

## Purpose
Gives a GM a home in the app: a landing page for newcomers, a dashboard that finds their rooms again, and the account screens that FR-GM-01 will later bring to life.

## Requirements

### Requirement: GM device identity
Until accounts exist (FR-GM-01), a GM SHALL be identified by a GM token that the browser generates and keeps in local storage. The server MUST store only a one-way hash of the token. The token SHALL be created the first time the browser performs a GM **write**, which is creating a room or uploading a library asset. Opening a GM surface (the dashboard or the asset library) or continuing as a guest MUST NOT create an identity. It SHALL own every room created and every library asset uploaded from that browser.

#### Scenario: First GM action creates the identity
- **WHEN** a browser with no GM token creates a room
- **THEN** a GM token is generated and stored in the browser, and the new room is owned by that GM identity

#### Scenario: Reading does not create an identity
- **WHEN** a browser with no GM token opens the asset library or the GM dashboard
- **THEN** no GM token is stored and no GM identity is created on the server

#### Scenario: Server never holds the raw token
- **WHEN** the server records a GM identity
- **THEN** only a hash of the token is persisted, and the raw token appears in no stored record

#### Scenario: Missing or unknown token
- **WHEN** a request to a GM-only endpoint carries no GM token, or a token the server does not recognise
- **THEN** the server responds 401 and returns no GM data

### Requirement: Account UI placeholder
The app SHALL provide sign-in (`/signin`) and create-account (`/signup`) screens, and an account menu in the GM dashboard header and the asset library header. These SHALL be laid out as FR-GM-01 will need them: email, password, and display name on sign-up. Until accounts are implemented, the sign-in screen SHALL offer "Continue as guest" above its form, and submitting either form SHALL NOT send credentials anywhere. The screen SHALL instead state that accounts are not available yet and that the GM's rooms and library are saved on this device.

#### Scenario: Submitting sign-in before accounts exist
- **WHEN** a user fills in the sign-in form and submits
- **THEN** no network request carrying the email or password is made, and a notice explains that accounts are coming and that work is saved on this device

#### Scenario: Guest option comes first
- **WHEN** a user opens the sign-in screen
- **THEN** "Continue as guest" and its note that work is saved in this browser appear above the email and password fields

#### Scenario: Account menu without an account
- **WHEN** a GM with a device identity opens the account menu
- **THEN** it shows that they are using this device's identity and offers sign-in and create-account links

### Requirement: One home page
`/` SHALL render one page for every visitor. It SHALL NOT render a structurally different page depending on whether a GM identity exists, and it SHALL NOT list the rooms a GM owns; those are on the GM dashboard. Navigating away from `/` and returning, by link or by browser history, SHALL return the visitor to the same page they left.

#### Scenario: Back returns to the page you left
- **WHEN** a visitor opens `/`, follows the link into the GM flow, and presses the browser Back button
- **THEN** they are returned to the same home page

#### Scenario: A returning GM sees the same page
- **WHEN** a browser that owns rooms opens `/`
- **THEN** the same page is shown as for a first-time visitor, with no list of rooms

#### Scenario: Rooms section stays away when empty
- **WHEN** a browser owns no rooms, or the room list cannot be loaded
- **THEN** no rooms section is rendered and no error is shown on the home page, as for every other visitor

### Requirement: The home page demonstrates the product
The home page SHALL show what the product does using the product's own behaviour, not depictions of it. It SHALL NOT contain an interface built to look like a screenshot. It SHALL include at least one real battle map image. Tokens shown on its maps SHALL be drawn the way the board draws a token, including the token's art when it has some, and SHALL sit in the middle of a grid square.

#### Scenario: Grid alignment is operable
- **WHEN** a visitor drags the cell-size control in the grid demo
- **THEN** the app's grid resizes over a real map that shows its own faint squares, the current cell size is shown, and at the map's cell size the two grids coincide

#### Scenario: Visibility is shown from both sides
- **WHEN** a visitor switches between the GM view and the player view
- **THEN** a token marked hidden is present in one and absent from the other, and the caption states that its place in the turn order is withheld too

#### Scenario: Dice run the real engine
- **WHEN** a visitor builds a roll with the dice builder, e.g. 2 × d6 and a modifier of 3, and rolls
- **THEN** it is rolled by the same shared functions the table uses, every die is shown alongside the total grouped by die type, and the demo offers no text field for a formula

#### Scenario: Tokens are drawn as the board draws them
- **WHEN** a map on the home page shows a token that has character art
- **THEN** the art fills the token's disc, clipped to its circle, with its ring, hit-point bar and name kept; if the art fails to load, the token shows its coloured disc and initial instead

#### Scenario: Tokens sit in a square
- **WHEN** a map on the home page shows tokens
- **THEN** each token's centre is the centre of a grid square on that map's faint grid, on open floor rather than on a wall

### Requirement: Both grounds, on the home page only
The home page SHALL support a light and a dark ground, following the system preference by default and offering a manual override that persists. The setting SHALL apply to the home page only, leaving the table's ground unchanged.

#### Scenario: System preference is followed
- **WHEN** a visitor whose system prefers light opens `/` without having chosen a ground
- **THEN** the light ground is used

#### Scenario: The table is unaffected
- **WHEN** a visitor who has chosen the light ground opens a room
- **THEN** the room renders on its own dark ground

#### Scenario: Storage unavailable
- **WHEN** local storage cannot be read or written
- **THEN** the home page renders on the system-preferred ground and the override silently does not persist

### Requirement: Contrast and motion on the home page
Every text label on the home page SHALL meet WCAG AA contrast against its own background, and every interactive control's visual boundary SHALL meet 3:1, in both grounds. All animation SHALL be disabled under `prefers-reduced-motion: reduce`, and no scroll position listener SHALL be used to drive it.

#### Scenario: Both grounds pass
- **WHEN** contrast is measured for body text, control labels and control borders in each ground
- **THEN** text pairs are at least 4.5:1 and control boundaries at least 3:1

#### Scenario: Reduced motion
- **WHEN** a visitor prefers reduced motion
- **THEN** entry, reveal, dice-throw and hover transitions do not run, and the page renders in its settled state

### Requirement: The home page does not overstate what is saved
Where the home page offers to save a room or an asset without an account, it SHALL state that what is saved is tied to that browser.

#### Scenario: The library is presented honestly
- **WHEN** the asset library is promoted on the home page
- **THEN** the page states that no sign-in is needed and that the library does not follow the user to another device

### Requirement: Both paths in the first screen
The home page SHALL present a path for joining an existing game and a path for running one, both visible without scrolling, with the join path placed before the run path. Each path SHALL be labelled with the reader it is for. The join path SHALL be a form. The run path SHALL be a link that enters the GM dashboard under its entry rule, not a room creation form. The page SHALL NOT offer a second join form elsewhere.

#### Scenario: Laptop viewport
- **WHEN** a visitor opens `/` in a 1366×768 viewport
- **THEN** the invite link field and its Join button are fully visible without scrolling, above the link for running a game

#### Scenario: Phone viewport
- **WHEN** a visitor opens `/` in a 390×844 viewport
- **THEN** the invite link field, its Join button and the link for running a game are fully visible without scrolling, and appear before the hero map

#### Scenario: Owned rooms do not push join down
- **WHEN** a browser that owns rooms opens `/`
- **THEN** the join path stays exactly where it is for a first-time visitor, since the home page lists no rooms

#### Scenario: Each path names its reader
- **WHEN** a visitor reads the hero
- **THEN** the join path is labelled for someone joining a game their GM invited them to, and the run path is labelled for someone running a game

#### Scenario: The run path enters the GM flow
- **WHEN** a visitor follows the link for running a game
- **THEN** they reach the GM dashboard, or the sign-in page first if the browser is not recognised

#### Scenario: Join still accepts a link or a code
- **WHEN** a visitor submits a full invite link or a bare invite code in the hero's join field
- **THEN** they are taken to that invite's join page, and input that is neither shows an error beside the field

### Requirement: "You" is unambiguous
Every second-person reference on the home page SHALL make clear whether it addresses the GM or a player. Below the hero, the feature sections SHALL sit under a heading that marks them as being about running a game. Within them, "you" SHALL refer to the GM, players SHALL be referred to in the third person, and a line that applies to everyone at the table SHALL say so.

#### Scenario: Feature sections address the GM
- **WHEN** a visitor reads the grid, library, visibility and dice sections
- **THEN** they sit under a heading identifying them as about running a game, and no sentence in them uses "you" to mean a player

#### Scenario: Shared features say who they are for
- **WHEN** a section describes something every participant sees, such as dice results
- **THEN** its text names everyone at the table rather than addressing a single "you"

### Requirement: Capabilities in user terms
The home page SHALL describe what the app does in terms a tabletop player uses, not in terms of how it is built. Tabletop vocabulary (GM, token, turn order, dice notation, grid squares and feet) MAY appear. Visible text SHALL NOT use implementation vocabulary: server, client, filter, snapshot, update stream, parser, overlay, or code identifiers such as `cellSize`. This applies to readouts, labels and captions as well as body text, but not to alt text or accessible names that describe a map image.

#### Scenario: No implementation vocabulary in visible text
- **WHEN** the rendered home page text is checked in both GM and player views of the visibility section, and after a valid and an invalid dice roll
- **THEN** none of the listed implementation terms or code identifiers appears

#### Scenario: Hidden information is promised, not explained
- **WHEN** a visitor reads the visibility section
- **THEN** it states that players cannot see a hidden token, cannot find it in the turn order, and cannot recover it from their own browser, without describing the mechanism

#### Scenario: Grid readout uses tabletop units
- **WHEN** a visitor drags the grid control
- **THEN** the readout shows the square size and the distance one square represents, labelled in plain words

### Requirement: Home page maps show their squares
Every map example on the home page SHALL show a faint grid that matches that map's own squares. The hero, grid demo and visibility examples SHALL show a 16:9 crop of a built-in map that is 20 squares wide and starts on one of its grid lines. The library shelf SHALL show each built-in map whole, with a lighter grid, and label it with the size and grid from the built-in catalogue. The maps shown SHALL be drawn from directly overhead and SHALL contain no creatures other than the tokens placed on them.

#### Scenario: Faint grid on every example
- **WHEN** a visitor views the hero, the grid demo, either visibility view, or the library shelf
- **THEN** each map shows a faint grid whose lines roughly follow the drawn floor tiles and walls

#### Scenario: Crops start on a grid line
- **WHEN** the hero, grid demo or visibility map is shown
- **THEN** its top-left corner is a grid intersection and it is 20 squares wide, so each square is roughly one token wide on screen

#### Scenario: The shelf shows whole maps
- **WHEN** a visitor views the library shelf
- **THEN** each built-in map is shown whole, and its label shows the map's real pixel size and grid cell size

#### Scenario: No extra creatures
- **WHEN** any home page map is shown
- **THEN** the only creatures on it are the tokens the page places
