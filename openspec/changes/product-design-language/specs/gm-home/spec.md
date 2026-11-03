# Spec Delta

## MODIFIED Requirements

### Requirement: The home page demonstrates the product
The home page SHALL show what the product does using the product's own behaviour, not depictions of it. It SHALL NOT contain an interface built to look like a screenshot. Its demos SHALL run the same rules the table runs: grid alignment, line of sight over a map's own walls, area templates, dice, and undo. Tokens shown on its maps SHALL be drawn the way the board draws a token, including the token's art when it has some, and SHALL sit in the middle of a grid square. A demo that needs the board's renderer SHALL load it only when the demo comes near the viewport.

#### Scenario: Grid alignment is operable
- **WHEN** a visitor drags the cell-size control in the grid demo
- **THEN** the app's grid resizes over a real map that shows its own faint squares, the current cell size is shown, and at the map's cell size the two grids coincide

#### Scenario: Line of sight is operable
- **WHEN** a visitor moves the lead token in the line-of-sight demo, by dragging or with the arrow keys
- **THEN** the lit area is recomputed from the token's new square against that map's own walls, by the same rules the table uses
- **AND** in the player view the rest of the map is dimmed in the board's own darkness colour for that map, and nothing outside the lit area is shown on it

#### Scenario: Visibility is shown from both sides
- **WHEN** a visitor switches between the GM view and the player view in the line-of-sight demo
- **THEN** a token marked hidden is present in the GM view and absent from the player view, and the caption states that its place in the turn order is withheld too

#### Scenario: Area templates use the table's shapes
- **WHEN** a visitor places the area template in the play section, by clicking or dragging on the map or with the arrow keys
- **THEN** the template takes the table's shape for that kind and size, and the tokens it marks as caught are exactly the ones the table would count as inside it
- **AND** the template stays where it was placed while the pointer only passes over the map

#### Scenario: Dice run the real engine
- **WHEN** a visitor submits a dice expression
- **THEN** it is parsed and rolled by the same shared functions the table uses, every die is shown alongside the total, and an invalid expression shows the parser's own message

#### Scenario: Dice open on a result
- **WHEN** the dice demo first comes into view
- **THEN** it already shows a settled example roll, so it never opens on an empty box

#### Scenario: Undo runs the table's undo
- **WHEN** a visitor makes a change in the recovery demo and then presses Undo on its activity log
- **THEN** the change is reversed by the same rules the table uses, the log keeps the original entry and adds the undo as a new entry, and the board returns to how it was

#### Scenario: Tokens are drawn as the board draws them
- **WHEN** a map on the home page shows a token that has character art
- **THEN** the art fills the token's disc, clipped to its circle, with its ring, hit-point bar and name kept; if the art fails to load, the token shows its coloured disc and initial instead

#### Scenario: Tokens sit in a square
- **WHEN** a map on the home page shows tokens
- **THEN** each token's centre is the centre of a grid square on that map's faint grid, on open floor rather than on a wall

#### Scenario: The board's renderer is not loaded up front
- **WHEN** a visitor opens the home page and does not scroll
- **THEN** the board's renderer has not been downloaded

### Requirement: The home page does not overstate what is saved
Wherever the home page says where something is kept, it SHALL say it accurately. The asset library SHALL be described as kept on the GM's account, available wherever they sign in. Rooms the page lists as joined SHALL be described as remembered in this browser only.

#### Scenario: The library is presented honestly
- **WHEN** the asset library is described on the home page
- **THEN** the page states that it is kept on the GM's account and is there on any device they sign in on

#### Scenario: Joined rooms are presented honestly
- **WHEN** the home page lists rooms this browser has joined
- **THEN** it states that the list is saved in this browser only

### Requirement: Both paths in the first screen
The home page SHALL present a path for running a game and a path for joining one, both visible without scrolling. The run path SHALL be the page's primary action and SHALL enter the GM dashboard under its entry rule. The join path SHALL be a second action that reveals the invite form in place and moves focus to its field. The page SHALL contain one join form only.

#### Scenario: Laptop viewport
- **WHEN** a visitor opens `/` in a 1366×768 viewport
- **THEN** the headline, the action for running a game and the action for joining one are fully visible without scrolling

#### Scenario: Phone viewport
- **WHEN** a visitor opens `/` in a 390×844 viewport
- **THEN** both actions are fully visible without scrolling and appear before the hero scene

#### Scenario: Joining opens the form in place
- **WHEN** a visitor chooses the action for joining a game
- **THEN** the invite field appears in the hero without leaving the page, and keyboard focus moves to it

#### Scenario: Owned rooms do not push join down
- **WHEN** a browser that owns rooms opens `/`
- **THEN** both actions stay exactly where they are for a first-time visitor, since the home page lists no owned rooms

#### Scenario: A returning player starts with the form open
- **WHEN** a browser that has joined rooms opens `/`
- **THEN** the join form is already open, with the list of rooms this browser has joined above the invite field

#### Scenario: Each path names its reader
- **WHEN** a visitor reads the hero
- **THEN** one action is worded for someone running a game and the other for someone joining a game their GM invited them to

#### Scenario: The run path enters the GM flow
- **WHEN** a visitor follows the action for running a game
- **THEN** they reach the GM dashboard, or the sign-in page first if the browser is not recognised

#### Scenario: Join still accepts a link or a code
- **WHEN** a visitor submits a full invite link or a bare invite code in the join field
- **THEN** they are taken to that invite's join page, and input that is neither shows an error beside the field

#### Scenario: The players section reuses the hero form
- **WHEN** a visitor follows the join action in the section for players
- **THEN** the page returns to the hero with the join form open and focused, and no second form exists on the page

### Requirement: "You" is unambiguous
Every second-person reference on the home page SHALL make clear whether it addresses the GM or a player. Below the hero, sections SHALL sit under headings that name their reader: running a game, or joining one. Under "running a game", "you" SHALL mean the GM and players SHALL be named in the third person. Under "joining a game", "you" SHALL mean the player. A line that applies to everyone at the table SHALL say so.

#### Scenario: Feature sections address the GM
- **WHEN** a visitor reads the sections for preparing, playing and recovering
- **THEN** they sit under a heading identifying them as about running a game, and no sentence in them uses "you" to mean a player

#### Scenario: The players section addresses the player
- **WHEN** a visitor reads the section for players
- **THEN** it sits under a heading identifying it as about joining a game, and its "you" means the player

#### Scenario: Shared features say who they are for
- **WHEN** a section describes something every participant sees, such as dice results
- **THEN** its text names everyone at the table rather than addressing a single "you"

### Requirement: Home page maps show their squares
Every map on the home page SHALL show a faint grid that matches that map's own squares. Each map crop SHALL be a 16:9 crop, 20 squares wide and starting on one of its grid lines, of a map drawn for the home page. The home page SHALL NOT use the asset library's maps or token art; the one exception is the stage of the attack animation preview. The library strip SHALL show the home page's maps whole, with a lighter grid, each labelled with the map's pixel size and its squares, and SHALL say that these are the page's maps. Maps SHALL be drawn from overhead with no creatures but the tokens the page places.

#### Scenario: Faint grid on every example
- **WHEN** a visitor views any map on the home page
- **THEN** it shows a faint grid whose lines roughly follow the drawn floor tiles and walls

#### Scenario: Crops start on a grid line
- **WHEN** a map crop is shown in the hero or any section
- **THEN** its top-left corner is a grid intersection and it is 20 squares wide, so each square is roughly one token wide on screen

#### Scenario: The shelf shows whole maps
- **WHEN** a visitor views the library strip
- **THEN** each of the page's maps is shown whole
- **AND** its label shows the map's real pixel size and its number of squares
- **AND** a caption says these are the maps on this page

#### Scenario: No library art on the home page
- **WHEN** a reviewer lists the images the home page loads
- **THEN** none is one of the asset library's built-in maps or token portraits, apart from the attack preview's stage

#### Scenario: No extra creatures
- **WHEN** any home page map is shown
- **THEN** the only creatures on it are the tokens the page places

## ADDED Requirements

### Requirement: The home page covers the four promises
Below the hero, the home page SHALL have a section each for preparing a map, playing at the table, recovering from mistakes and joining as a player. Each section SHALL include at least one operable demo or a running piece of the real app.

#### Scenario: Every promise has a section
- **WHEN** a visitor scrolls the home page
- **THEN** they find sections for preparing, playing, recovering and joining, each with something they can operate or a running piece of the real app

### Requirement: The hero shows a table in play
The hero SHALL show a map crop with tokens drawn as the board draws them, and a lit area around the party with a thin fog beyond it. It SHALL show no area template; the play section demonstrates templates. Under reduced motion it SHALL show the same scene settled.

#### Scenario: The scene's parts
- **WHEN** the hero scene has rendered
- **THEN** it shows tokens and a lit area with a thin fog outside it, on the same map, and no area template

### Requirement: The home page advertises only what the table does
Every capability the home page names SHALL work in the current build. The page SHALL NOT mention features that are partial or missing: a shared movement budget, drawings shared with the table, or detection of doors and windows. Every figure it states SHALL come from the product's own limits or its measured targets.

#### Scenario: Partial features are absent
- **WHEN** the home page's visible text is checked
- **THEN** it names no movement budget, no drawing shared with other players, and no door or window detection

#### Scenario: Figures are sourced
- **WHEN** the facts row states a number, such as players per room or how fast a ping arrives
- **THEN** that number matches the product's enforced limit or a target its test suite measures

## REMOVED Requirements

### Requirement: Both grounds, on the home page only
**Reason**: The light and dark themes now cover the entry and hub pages too, so theme scope is a product-wide rule rather than a home page rule.
**Migration**: See `design-language`, "Light and dark outside the table". The table still renders dark, and the stored choice and storage-failure behaviour carry over unchanged.
