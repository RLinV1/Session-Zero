## ADDED Requirements

### Requirement: Attack without a saved preset
A GM with an eligible attacker, or a player owning that attacker, SHALL see a Roll to hit action even when the token has no saved attacks. The action SHALL roll 1d20 with the selected attacker, target and visibility through the existing dice command, leaving style selection automatic. The interface SHALL explain that a named attack can supply custom dice and damage. It SHALL not claim attacks are saved only in this browser.

#### Scenario: New token can attack
- **WHEN** an eligible viewer chooses a target for a token with no attacks
- **THEN** Roll to hit sends a normal to-hit command
- **AND** existing authorization, private visibility, GM rulings and damage follow-up remain in effect

#### Scenario: Existing dice are still rolling
- **WHEN** the viewer's previous dice are still showing
- **THEN** the fallback action is disabled just like a named attack roll
