## Purpose

Lets anyone using Session Zero tell the team about a bug or an idea, with screenshots, and turns each report into files Claude Code can read.

## ADDED Requirements

### Requirement: One Feedback dialog everywhere
The web app SHALL offer one Feedback dialog, opened from the site header, the site footer, the Settings dialog, "Report a problem" in the room's More menu, and the What's new page. Opened from Settings, it SHALL appear on top of Settings, so closing it returns there. The dialog SHALL ask for a kind (Bug, Idea or Other), a summary of 1 to 120 characters and optional details of up to 4,000 characters.

#### Scenario: Opening from a room
- **WHEN** a participant chooses "Report a problem" in the room's More menu
- **THEN** the Feedback dialog opens with Bug selected and the room's technical details ready to include

#### Scenario: Summary missing
- **WHEN** the person sends with an empty summary
- **THEN** the dialog does not send and says a summary is needed

### Requirement: Screenshots
The dialog SHALL accept up to three images (PNG, JPEG or WebP, up to 5 MB each) by choosing files, dropping, or pasting. In a room it SHALL also offer to capture the viewer's own view of the board. When a GM attaches a capture, the dialog SHALL say that it shows fog-hidden areas.

#### Scenario: A fourth image
- **WHEN** three images are attached and the person adds another
- **THEN** it is not added and the dialog says three is the limit

#### Scenario: A player's capture
- **WHEN** a player captures the board
- **THEN** the attached image shows only what that player's board shows

### Requirement: Technical details are opt-out and allow-listed
"Include technical details" SHALL be on by default and SHALL list what it sends. When on, the report SHALL include only: page path without query or hash, browser user agent, screen and viewport size, device pixel ratio, language, and in a room the room ID, the last event number and the person's role. It SHALL NOT include any room contents.

#### Scenario: Turned off
- **WHEN** the person unticks "Include technical details" and sends
- **THEN** the stored report has no technical details

#### Scenario: Invite token in the address
- **WHEN** the page address carries a query or fragment
- **THEN** the stored page path contains neither

### Requirement: Accepting a report
`POST /api/feedback` SHALL accept a report from the site's own origin, signed in or not. It SHALL validate the fields with zod and limit each address to 10 attempts per hour. It SHALL refuse a file that is not really PNG, JPEG or WebP, a file over 5 MB, and more than three files. It SHALL answer with the report's reference and the number of images stored.

#### Scenario: Valid report with two images
- **WHEN** a valid report with two PNG screenshots is posted
- **THEN** the answer is 201 with a reference like `FB-7Q2K` and `screenshots: 2`

#### Scenario: Disguised file
- **WHEN** a file named `.png` is really something else
- **THEN** the answer is 415 and nothing is stored

#### Scenario: Too many attempts
- **WHEN** one address sends an 11th report within an hour
- **THEN** the answer is 429 with `Retry-After`

### Requirement: Private, cleaned storage
Each image SHALL be re-encoded to WebP without metadata before it is stored. Reports and images SHALL be stored only in the database and SHALL NOT be reachable by any URL. A signed-in report SHALL record its account; deleting that account SHALL delete its reports and their images.

#### Scenario: EXIF location
- **WHEN** a JPEG with GPS data is attached
- **THEN** the stored image is WebP and carries no EXIF data

#### Scenario: Account deleted
- **WHEN** a signed-in reporter deletes their account
- **THEN** their reports and images are gone from the store

### Requirement: Export for Claude Code
`npm run feedback:export` SHALL write each report from Postgres as `feedback/<reference>/report.md` with its images beside it. The `feedback/` folder SHALL be ignored by git.

#### Scenario: Export one report
- **WHEN** the export runs after one report with two images was stored
- **THEN** `feedback/<reference>/` holds `report.md` naming `screenshot-1.webp` and `screenshot-2.webp`, and both files
