## ADDED Requirements

### Requirement: Add token stat defaults
The Add token form SHALL NOT create a token without HP and AC. A blank field SHALL get a default:
- HP and Max HP both blank SHALL give 100 HP out of 100;
- a blank HP SHALL start at the Max HP typed;
- a blank Max HP SHALL match a typed HP of 1 or more, and SHALL be 100 otherwise;
- a blank AC SHALL be 0.

A typed value SHALL never be replaced. The fields SHALL show their default as a placeholder, with a hint stating the rule.

#### Scenario: All blank
- **WHEN** the GM adds "Goblin" with HP, Max HP and AC left blank
- **THEN** Goblin is created with 100/100 HP and AC 0

#### Scenario: Only Max HP typed
- **WHEN** the GM types Max HP 22 and AC 13 and leaves HP blank
- **THEN** the token is created with 22/22 HP and AC 13

#### Scenario: Only HP typed
- **WHEN** the GM types HP 30 and leaves Max HP and AC blank
- **THEN** the token is created with 30/30 HP and AC 0

### Requirement: Add token advanced settings
The Add token form SHALL put Size (cells), Rotation (°) and Hidden from players in a section **Advanced settings**, collapsed when the form opens. Their defaults SHALL stay size 1, rotation 0 and not hidden.

#### Scenario: Quick add
- **WHEN** the GM opens Add token
- **THEN** Name, HP, Max HP, AC, Owner and Image are shown, and Size, Rotation and Hidden from players are inside the collapsed Advanced settings

#### Scenario: Hidden token
- **WHEN** the GM opens Advanced settings, ticks Hidden from players and places the token
- **THEN** the token is created hidden
