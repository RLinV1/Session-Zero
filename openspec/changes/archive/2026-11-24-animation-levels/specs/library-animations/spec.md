# Spec Delta

## MODIFIED Requirements

### Requirement: Editor with live preview
The Animations tab SHALL let the GM edit an animation's fields and SHALL show a preview stage with a stand-in attacker and target and a Play button. Play SHALL run the animation exactly as a board at the Full level would, using the unsaved values in the editor, at every Animations level (`animation-levels`), including Reduced, None and a device preference for reduced motion. The preview SHALL NOT change any room, token or library data. Unsaved edits SHALL stay out of the library until the GM saves. For a `nuke` shape the preview SHALL play the blast over the stage.

#### Scenario: Preview unsaved changes
- **WHEN** the GM changes the colour of "Fire blade" to blue and presses Play without saving
- **THEN** the preview plays a blue animation and the library still holds the orange one

#### Scenario: Preview touches nothing
- **WHEN** the GM presses Play several times
- **THEN** no event is sent to any room and no library record changes

#### Scenario: Nuke preview
- **WHEN** the GM presses Play on a nuke animation
- **THEN** the stage plays a shockwave, flash and shake, and nothing is damaged

#### Scenario: Full preview at any level
- **WHEN** a GM whose Animations level is None presses Play on "Fire blade"
- **THEN** the whole animation plays on the stage
