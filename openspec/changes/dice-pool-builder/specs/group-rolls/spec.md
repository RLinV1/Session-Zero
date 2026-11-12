# Spec Delta

## MODIFIED Requirements

### Requirement: The server rolls one formula for each selected token
A group roll SHALL take a list of 1 to 30 distinct tokens and one dice formula of the form accepted by the dice roller (see `dice-pool`: one or more die terms and a modifier, 1 to 20 dice). The server SHALL roll the formula once for each token, independently, and SHALL record every token's dice and total together as a single group roll. Only the GM SHALL be able to make a group roll. The server SHALL refuse:
- a player's group roll (forbidden);
- an empty token list, a repeated token, or more than 30 tokens (invalid);
- a token that does not exist (not found);
- a formula the dice roller would refuse (invalid).

A group roll SHALL take one entry in the room's recent roll log, however many tokens it holds.

#### Scenario: One roll per token
- **WHEN** the GM makes a group roll of `1d20+2` for Goblin 1, Goblin 2 and the Ogre
- **THEN** the log has one new entry holding three separate `1d20+2` results, one per token

#### Scenario: Mixed dice per token
- **WHEN** the GM makes a group roll of `1d20+1d4` for Goblin 1 and Goblin 2
- **THEN** each goblin gets its own d20 and d4, and the entry shows each goblin's total with its dice grouped by type

#### Scenario: Player refused
- **WHEN** a player sends a group roll
- **THEN** the server refuses it as forbidden and nothing is recorded

#### Scenario: Bad expression
- **WHEN** a group roll of `1d20+banana` reaches the server
- **THEN** the server refuses it as invalid
