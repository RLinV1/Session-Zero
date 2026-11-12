# Spec Delta

## ADDED Requirements

### Requirement: Attack animations setting
The Settings dialog's Graphics tab SHALL offer "Attack animations" with three choices: All, Current turn and None, defaulting to All. The choice SHALL be saved in this browser and SHALL only change what this viewer's board plays; other viewers and the room SHALL be unaffected. It applies on top of every other rule in this capability: it can only stop an effect from playing, never make one play.

- **All:** every effect plays as specified elsewhere in this capability.
- **Current turn:** while an encounter is running, a strike and its hit or miss ending SHALL play only when the attacking token is the token whose turn it is. A map nuke has no attacking token; it SHALL play only when the token whose turn it is has no owner, or is not in the viewer's turn order. Damage numbers SHALL always play. While no encounter is running, Current turn SHALL behave as All.
- **None:** no strike, nuke blast, hit or miss ending, or damage number SHALL play, including an area effect's damage numbers.

In every choice, the fall of a token removed at 0 HP SHALL still play, and dice SHALL still be thrown and dropped as before. The board SHALL only pan and zoom to a strike that plays.

#### Scenario: All by default
- **WHEN** a viewer who has never changed the setting sees Aria attack Goblin
- **THEN** the strike plays as before

#### Scenario: Current turn skips another token's attack
- **WHEN** a viewer has chosen Current turn, it is Aria's turn in the encounter, and Bram's owner rolls to hit Goblin and the GM rules it a Hit and applies 5 damage
- **THEN** the viewer's board plays no strike and no hit effect, and "−5" rises from Goblin

#### Scenario: Current turn plays the active token's attack
- **WHEN** a viewer has chosen Current turn, it is Aria's turn, and Aria's owner rolls to hit Goblin and the GM rules it a Miss
- **THEN** the viewer's board plays the strike from Aria to Goblin and the miss effect

#### Scenario: Current turn outside an encounter
- **WHEN** a viewer has chosen Current turn, no encounter is running, and Bram attacks Goblin
- **THEN** the strike plays

#### Scenario: Nuke on a player's turn
- **WHEN** a viewer has chosen Current turn, it is Aria's turn and Aria has an owner, and the GM nukes the map
- **THEN** the viewer's board plays no blast, and each damaged token's number still rises

#### Scenario: None
- **WHEN** a viewer has chosen None and the GM resolves an area effect that damages three tokens
- **THEN** no damage numbers play on the viewer's board, and the save dice still drop onto the tokens

#### Scenario: Defeat still falls
- **WHEN** a viewer has chosen None and Goblin is removed at 0 HP
- **THEN** the viewer's board still shows Goblin falling before it is gone

#### Scenario: Only this viewer
- **WHEN** one player has chosen None and another has chosen All, and Aria attacks Goblin
- **THEN** only the second player's board plays the strike
