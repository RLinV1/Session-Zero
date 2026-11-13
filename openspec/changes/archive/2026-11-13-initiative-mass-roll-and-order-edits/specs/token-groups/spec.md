# Spec Delta

## MODIFIED Requirements

### Requirement: Start an encounter from groups
The Start encounter dialog SHALL show a checkbox for each group and a separate **Players' tokens** checkbox. Ticking a group SHALL include that group's tokens only. Ticking Players' tokens SHALL include every token owned by an active player. With any of these checkboxes ticked, the dialog SHALL include exactly the tokens of the ticked groups, plus the players' tokens when Players' tokens is ticked, and leave all other tokens out. With none ticked, every token SHALL be included. The dialog SHALL open with no group and Players' tokens unticked. Ticking a group SHALL NOT tick Players' tokens, and ticking Players' tokens SHALL NOT tick any group. The checkboxes SHALL be shown when the room has at least one group or at least one token owned by an active player. The GM SHALL be able to include or leave out any single token before starting, and that choice SHALL win over the checkboxes. Only included tokens with a score SHALL enter the turn order.

#### Scenario: Start from one group
- **WHEN** the GM ticks "Gate guards" (two goblins) in a room with two player tokens and a third, ungrouped goblin
- **THEN** Players' tokens stays unticked, and the dialog includes only the two goblins

#### Scenario: Group with the players
- **WHEN** the GM ticks "Gate guards" and Players' tokens
- **THEN** the dialog includes the two goblins and the two player tokens, and leaves out the third goblin

#### Scenario: Combine groups
- **WHEN** the GM ticks "Gate guards" and "Patrol"
- **THEN** the dialog includes the tokens of both groups and not the player tokens

#### Scenario: Players only
- **WHEN** the GM opens the Start encounter dialog without choosing groups and ticks only Players' tokens
- **THEN** the dialog includes the two player tokens and leaves out every goblin

#### Scenario: A hand-picked token wins
- **WHEN** the dialog has "Gate guards" ticked and the GM also checks the third, ungrouped goblin by hand
- **THEN** the third goblin is included along with the ticked group's tokens
