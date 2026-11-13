## Purpose

Lets the GM, and any player for their own tokens, change a token's HP straight from its board card during play, without opening the token editor or leaving the board.

## ADDED Requirements

### Requirement: Quick HP on the token card
When a token is selected, its board token card SHALL show quick HP controls to a viewer allowed to edit that token, when the token tracks HP and its HP is not hidden from them: the buttons −5, −1, +1 and +5, and no other HP control. Each press SHALL send one HP change for that token. Healing SHALL NOT raise HP above the token's maximum HP when it has one. Damage SHALL be allowed to take HP to 0 or below, down to the lowest HP the token editor accepts, and the room's "Remove tokens at 0 HP" rule SHALL apply as to any other HP change. A press that would not change HP (healing at maximum) SHALL send nothing. A change the server refuses SHALL leave the card open and show the reason. A viewer who may not edit the token SHALL see the card without these controls. Selecting a token SHALL NOT change the side panel's tab.

#### Scenario: GM damages a goblin
- **WHEN** the GM selects a goblin at 12/12 HP and presses −5
- **THEN** the goblin's HP is 7/12 for everyone allowed to see it

#### Scenario: Only the four buttons
- **WHEN** the GM selects a goblin
- **THEN** its card shows −5, −1, +1 and +5 and no field to type an amount

#### Scenario: Healing capped
- **WHEN** a player's token is at 10/12 HP and they press +5 on its card
- **THEN** its HP is 12/12

#### Scenario: Player on someone else's token
- **WHEN** a player selects a token they don't own
- **THEN** its card shows no quick HP controls

#### Scenario: Side panel stays put
- **WHEN** the GM, on the Play tab, selects a token on the board
- **THEN** the side panel stays on the Play tab
