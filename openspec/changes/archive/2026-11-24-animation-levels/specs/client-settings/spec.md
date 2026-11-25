# Spec Delta

## MODIFIED Requirements

### Requirement: Reduced animations compose with existing preferences
The viewer's Animations level (`animation-levels`) SHALL combine with the device preference only: a device preference for reduced motion SHALL make the level None whatever the viewer chose. A room's table-wide reduced-animations flag SHALL NOT affect the level. Still Pixi markers SHALL paint once and use a removal timer rather than an animation loop.

#### Scenario: Audio controls leave graphical effects alone
- **WHEN** either saved volume is adjusted
- **THEN** no canvas resize or effect restart occurs

#### Scenario: Room flag ignored
- **WHEN** a viewer with Animations on Full joins a room whose table-wide reduced flag is on
- **THEN** their board plays at Full
