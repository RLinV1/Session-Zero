# Spec Delta

## MODIFIED Requirements

### Requirement: Damage numbers on resolve
When an Area Effect is resolved, each viewer's board SHALL play the same damage number it plays for an applied damage roll, on every target that viewer can see whose amount is above 0, all at once. Healing and 0 SHALL show no number. At the Reduced Animations level (`animation-levels`), the numbers SHALL show without moving. At the None level, no number SHALL be shown.

#### Scenario: Fireball resolved
- **WHEN** the GM confirms 28 on Goblin 1, 14 on Goblin 2 and 0 on the Ogre
- **THEN** every board shows −28 on Goblin 1 and −14 on Goblin 2 at the same time, and nothing on the Ogre

#### Scenario: Hidden target
- **WHEN** a hidden Assassin takes 11 in the same resolve
- **THEN** players see no number for it, and their copy of the event carries no amount for it

#### Scenario: No numbers on None
- **WHEN** a viewer on None sees the Fireball resolved
- **THEN** no number is drawn on their board and the goblins' hit points still update
