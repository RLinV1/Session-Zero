## ADDED Requirements

### Requirement: Free is stated
The home page SHALL state "Free forever" in the first screen without scrolling at 1366×768 and 390×844. The facts row SHALL carry a fact such as "Free forever: every feature, no paid tier" and SHALL NOT state a ping latency. The page SHALL NOT mention a price, trial, plan, upgrade, premium or subscription.

#### Scenario: Laptop and phone first screens
- **WHEN** a visitor opens `/` at 1366×768 or 390×844
- **THEN** the words "Free forever" are visible without scrolling

#### Scenario: The facts row says what is free
- **WHEN** a visitor reads the facts row
- **THEN** it includes "Free forever" with "every feature, no paid tier", and no fact about ping latency

#### Scenario: No billing words
- **WHEN** the page's text, labels and alt text are read in either language
- **THEN** none mentions a price, trial, plan, upgrade, premium or subscription

### Requirement: The hero leads with what sets the product apart
The hero heading and body SHALL together mention that the product is free forever, that it suggests the grid and walls, that the GM's own AI app can take a player seat, and that players still join from a link without an account.

#### Scenario: The hero names the four differences
- **WHEN** a visitor reads the hero heading and body
- **THEN** they mention free forever, grid and wall suggestions, the GM's own AI app taking a player seat, and players joining from a link with no account

### Requirement: A differentiators section opens the running-a-game part
The first section under "Running a game", before the prepare section, SHALL present four items in this order: grid and wall detection, AI player seats, the AI game builder and open source. Grid and wall detection SHALL include an operable demo on a built-in map in which suggested walls appear and the visitor applies or discards them, drawn as the board draws walls. AI player seats SHALL include an operable demo, labelled as a preview and not a live AI, in which preset plain-language instructions move a token on a built-in map. The game builder and open source items SHALL be text tiles; open source SHALL state the MIT license and link to the repository.

#### Scenario: Order of the items
- **WHEN** a visitor reads the section
- **THEN** the item headings appear as grid and wall detection, AI player seats, AI game builder, open source, and the section comes before the prepare section

#### Scenario: Suggested walls are applied
- **WHEN** a visitor presses Apply on the detection demo
- **THEN** the suggested walls are drawn solid as the board draws walls and the demo says they were applied

#### Scenario: Suggested walls are discarded
- **WHEN** a visitor presses Discard on the detection demo
- **THEN** the suggested walls are removed and the demo says the map is as it was

#### Scenario: A preset instruction moves the AI's token
- **WHEN** a visitor chooses "Move Oswin two squares north" in the seat demo
- **THEN** the AI's token moves two squares north on the map and the demo says so, and the demo is labelled a preview with no AI running

#### Scenario: Each item points to where it lives
- **WHEN** a visitor reads the items
- **THEN** detection points to the map editor, seats to Share › Play with your AI, and the builder to AI builds in the library

### Requirement: Differentiator claims stay accurate
Detection SHALL be described as a suggestion the GM checks before applying. Each AI item SHALL state that Session Zero does not run an AI itself, that use counts against the GM's own AI app's usage limits, and that a person is still the GM. The seat item SHALL say the AI sees only what a player can see and SHALL mention "MCP" at most once, in parentheses. Visible text SHALL NOT use the word "server" or name any other product.

#### Scenario: AI items carry the disclaimer
- **WHEN** a visitor reads the AI player seats and AI game builder items
- **THEN** each says Session Zero runs no AI itself, that use counts against the GM's own AI app, and that a person is still the GM

#### Scenario: Detection is a suggestion
- **WHEN** a visitor reads the detection item
- **THEN** it says the GM checks a preview before applying or discarding it

#### Scenario: Forbidden words
- **WHEN** the section's text is read
- **THEN** it contains none of: server, price, trial, plan, upgrade, premium, subscription
