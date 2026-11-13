## ADDED Requirements

### Requirement: Attacks that can hit several targets
A named attack MAY allow between 2 and 10 targets at once. The attack editor SHALL offer a "Can attack multiple targets" switch and a most-targets number the user can type. Turning the switch off SHALL remove the limit. Older attacks SHALL remain valid and single-target. The limit SHALL survive token edits, creature library saves, placement and encounter copies.

#### Scenario: Set the most targets
- **WHEN** a GM or token owner turns on multiple targets and types 3
- **THEN** the attack stores a limit of 3 and its summary says "up to 3 targets"

### Requirement: Choosing targets and rolling per target
When the chosen attack allows several targets, the target control SHALL open a list where the roller ticks up to the limit, whether the roller is a player or the GM. Rolling SHALL make one ordinary single-target roll per chosen target, each with its own dice, and each SHALL be ruled and applied on its own. After Hits, the damage button SHALL roll that attack's damage at every chosen target that was hit.

#### Scenario: Two targets
- **WHEN** a player with a 3-target attack ticks two enemies and rolls
- **THEN** two to-hit rolls appear, one per enemy, and their dice land side by side on the board

#### Scenario: Limit reached
- **WHEN** the limit of targets is chosen
- **THEN** the remaining targets in the list cannot be ticked until one is cleared
