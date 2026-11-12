# Spec Delta

## MODIFIED Requirements

### Requirement: Portal state controls movement
A closed or locked portal SHALL block tokens exactly as a wall does, under the clearance rule of the `token-wall-clearance` capability: no token may stand where it touches the clearance circle at any of the token's sample points, and a player may not move a token so that a sample point's circle sweeps across it. An open portal SHALL NOT block tokens.

#### Scenario: Walk through an open door
- **WHEN** a player moves their token straight through an open door
- **THEN** the move is accepted

#### Scenario: A closed door is in the way
- **WHEN** a player moves their token straight through a closed door
- **THEN** the server refuses it with "That move is unavailable."

#### Scenario: Locked blocks like closed
- **WHEN** a player moves their token straight through a locked window
- **THEN** the server refuses it with "That move is unavailable."
