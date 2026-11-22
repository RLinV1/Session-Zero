## ADDED Requirements

### Requirement: Move entries show readable coordinates
An activity log entry for a token move SHALL show each coordinate rounded to at most 2 decimal places, without trailing zeros. The stored event SHALL keep its exact coordinates.

#### Scenario: Float noise is rounded away
- **WHEN** Mara moves Goblin from (1987.9, 829.1000000000001) to (2057.3456, 829.1000000000001)
- **THEN** the entry reads "Mara moved Goblin from (1987.9, 829.1) to (2057.35, 829.1)"

#### Scenario: Whole numbers stay whole
- **WHEN** Mara moves Goblin from (35, 35) to (105, 35)
- **THEN** the entry reads "Mara moved Goblin from (35, 35) to (105, 35)"
