# Spec Delta

## MODIFIED Requirements

### Requirement: Previewing an attack's animation
The attack editor SHALL show a preview stage below its Animation picker. Choosing an animation SHALL play it once on the stage, from a stand-in attacker to a stand-in target, and a **Play** control SHALL play it again. When Automatic is chosen, the stage SHALL play what Automatic would play for the attack's Range choice: the built-in melee slash for Melee, the built-in arrow for Ranged or Unlimited. Changing the Range choice while Automatic is chosen SHALL update what the stage plays. The preview SHALL send nothing to the room and SHALL change no data. When the viewer's Animations level is Reduced or None (`animation-levels`), the stage SHALL NOT be shown, and choosing and saving an animation SHALL still work. When the stage cannot start on this device, the editor SHALL say that the preview is unavailable and SHALL still allow choosing and saving.

#### Scenario: Preview on choosing
- **WHEN** the GM opens Aria's "Longbow" in the attack editor and chooses "Arrow" in the Animation picker
- **THEN** the stage plays the arrow once, and Play plays it again

#### Scenario: Automatic follows the range
- **WHEN** the Animation picker is on Automatic and the GM switches Range from Ranged to Melee
- **THEN** the stage now plays the melee slash instead of the arrow

#### Scenario: Preview sends nothing
- **WHEN** the GM previews several animations and then cancels the editor
- **THEN** nothing is sent to the room, the attack is unchanged, and no other participant's board plays anything

#### Scenario: No preview at reduced levels
- **WHEN** a GM whose Animations level is Reduced or None opens the attack editor and chooses "Arrow"
- **THEN** no preview stage is shown, and saving keeps "Arrow" on the attack
