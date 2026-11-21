## ADDED Requirements

### Requirement: Rarely used token fields start collapsed
The token editor SHALL always show the token's name (GM only) and its HP, Max HP and AC. The remaining fields SHALL sit in sections that start closed every time the editor opens:
- **Conditions**: the condition picker.
- **Control & visibility** (GM only): who controls the token, and whether it is hidden from players.
- **Advanced** (GM only): board X, board Y, size, rotation and the token image.

Opening or closing a section SHALL NOT change the draft or send anything.

#### Scenario: Editor opens condensed
- **WHEN** the GM opens a token's editor
- **THEN** the name and HP, Max and AC fields are visible, and the Conditions, Control & visibility and Advanced sections are closed

#### Scenario: Advanced holds position, size, rotation and image
- **WHEN** the GM opens the Advanced section
- **THEN** it shows Board X, Board Y, Size, Rotation and the image controls, and no other section shows them

#### Scenario: Player sees only what they can edit
- **WHEN** a player opens the editor of a token they own
- **THEN** they see HP, Max and AC and a closed Conditions section, and no GM-only sections

### Requirement: A closed section summarises its value
A closed section's header SHALL show a short summary of its current draft value, so the GM can read it without opening the section.

#### Scenario: Conditions count
- **WHEN** a token has two conditions and the Conditions section is closed
- **THEN** the header shows "Conditions" with the count 2

#### Scenario: Advanced summary
- **WHEN** a 2-cell token with rotation 0 and no image is in the editor
- **THEN** the Advanced header shows "2 cells · 0° · no image"

### Requirement: Section fields line up
Inside a section, fields and buttons laid out side by side SHALL share one column gutter, so the image buttons line up with the field columns above them.

#### Scenario: Image buttons align with fields
- **WHEN** the GM opens the Advanced section of a token with an image
- **THEN** the left edge of "From library" lines up with the left edge of the Board Y field
