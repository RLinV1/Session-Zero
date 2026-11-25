# Spec Delta

## MODIFIED Requirements

### Requirement: When a move jumps instead
A move SHALL jump straight to its square, with no slide, when the viewer's Animations level is None (`animation-levels`), and when the token moves less than one square. At the Reduced level moves SHALL slide as at Full. Alt and Reposition drags SHALL slide in a straight line.

#### Scenario: Reduced motion
- **WHEN** a viewer on None drops their token
- **THEN** the token appears on its new square without sliding

#### Scenario: Reduced level still slides
- **WHEN** a viewer on Reduced sees a token moved three squares
- **THEN** the token slides to its new square

#### Scenario: A nudge
- **WHEN** a token is moved half a square with Alt held
- **THEN** it appears there without sliding
