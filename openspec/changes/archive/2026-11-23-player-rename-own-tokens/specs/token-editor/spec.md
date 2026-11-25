## MODIFIED Requirements

### Requirement: Rarely used token fields start collapsed
The token editor SHALL always show the token's name, to the GM and to the token's owners, and its HP, Max HP and AC. The remaining fields SHALL sit in sections that start closed every time the editor opens:
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
- **THEN** they see the name, HP, Max and AC and a closed Conditions section, and no GM-only sections

#### Scenario: Player renames from the editor
- **WHEN** a player changes their token's name in the editor and presses Save
- **THEN** only the new name is sent, the editor closes, and the token's name changes for everyone
