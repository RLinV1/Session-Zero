## ADDED Requirements

### Requirement: Policies describe the deployed service
The Terms and Privacy pages SHALL describe the app as a hosted service, not a course handout. Privacy MUST list what is stored, the single session cookie and local storage keys, retention, that the hosting provider stores the data on the project's behalf, how to delete an account (the in-app button), and a contact route. Terms MUST cover acceptable use, user content, the AI-generated and CC0 built-in assets, no warranty, and changes. Each statement MUST match the code.

#### Scenario: Deletion text matches the feature
- **WHEN** the privacy page is read
- **THEN** it points to Delete account in the account menu and no longer says deletion is by request to the team

#### Scenario: No handout wording
- **WHEN** either page is rendered
- **THEN** it does not claim to be a CSE 416 student project that "is not a business"

### Requirement: Only takedown-safe assets ship
Every asset served by the app SHALL be one of: original work of the project, an image generated for the project, a CC0 recording, or an open-licensed font bundled in the build. The app MUST NOT load scripts, fonts, images or audio from other origins at runtime, and MUST NOT use third-party trademarked names in user-facing text, asset file names or credit titles.

#### Scenario: No cross-origin loads
- **WHEN** the home page and a room are loaded
- **THEN** every request goes to the app's own origin

#### Scenario: Credits are neutral
- **WHEN** the sound and image CREDITS files are read
- **THEN** each asset lists its source and licence, and no entry uses a trademarked product name as the clip's title
