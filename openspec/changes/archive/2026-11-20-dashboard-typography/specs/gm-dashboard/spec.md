## ADDED Requirements

### Requirement: The dashboard shares the home page's typography
The GM dashboard SHALL set its text in the same typeface as the home page, including its header, headings, form labels, fields, buttons, and room list. Its headings SHALL use the home page's heading style: the same typeface, sentence case, and no small caps. The room page's own typography SHALL NOT change.

#### Scenario: Create a room card matches the home page
- **WHEN** a GM opens `/gm-dashboard`
- **THEN** the "Create a room" heading, its field labels, its fields and the "Create room" button are set in the home page's typeface, and the heading is not in small caps

#### Scenario: The room page keeps its own type
- **WHEN** a participant opens a room
- **THEN** the room's panels keep their existing typeface and small-caps section headings
