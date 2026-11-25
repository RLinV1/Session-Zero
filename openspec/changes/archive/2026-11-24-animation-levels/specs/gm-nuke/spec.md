# Spec Delta

## MODIFIED Requirements

### Requirement: Blast respects reduced motion
At the Reduced Animations level (`animation-levels`), the blast SHALL NOT shake the board, expand a shockwave or flash. It SHALL show a brief static centre marker and damage numbers that do not move. At the None level, nothing SHALL be drawn for the blast and no damage numbers SHALL be shown. At both levels, hit points SHALL update at once.

#### Scenario: Reduced motion
- **WHEN** a viewer on Reduced sees a nuke
- **THEN** the board shows a short static marker with still damage numbers and no moving shockwave or shake

#### Scenario: No animations
- **WHEN** a viewer on None sees a nuke
- **THEN** nothing is drawn for the blast, no numbers appear, and the tokens' hit points drop at once

### Requirement: Bounded animation work
Nuke fire SHALL use at most 52 central billow sprites, 24 expanding fire/dust sprites and one fireball, sharing two cached textures and SHALL NOT apply a filter to the map. Heavy effects SHALL update at most 30 times per second. One nuke SHALL play at a time. Attack particles SHALL be bounded and condition particles SHALL use at most 12 visible token canvases, one particle condition per token. Particle emitters SHALL stop while the page is hidden. Completed, replaced or hidden blasts SHALL release their display objects. Screen shake SHALL NOT create horizontal overflow.

#### Scenario: Repeated blasts finish cleanly
- **WHEN** several nukes are triggered in succession and the last one ends
- **THEN** no blast objects, screen filters, persistent tint or horizontal overflow remain and the board still accepts input

#### Scenario: The blast spreads across the visible board
- **WHEN** the bomb reaches the middle of the viewer's screen
- **THEN** a fast-growing fireball and thick shock rings precede a broad mushroom cloud, overlapping banks of ground fire, and rolling fire/dust clouds that spread toward every edge
- **AND** the central cap stays inside the viewport while the outer surge can travel beyond its edges
- **AND** the broad cap rises visibly above its thick stem, retaining the fire and rolling dust surge

#### Scenario: Confirming the blast
- **WHEN** the GM opens the nuke confirmation
- **THEN** Detonate and Cancel are aligned to the right in that order
