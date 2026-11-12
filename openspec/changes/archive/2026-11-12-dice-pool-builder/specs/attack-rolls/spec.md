# Spec Delta

## MODIFIED Requirements

### Requirement: Choosing dice and rolling
The Attack section SHALL show the viewer's latest attack roll above its other controls: the dice landing, the result, and its outcome as described under the rulings requirements.

Rolls other than a named attack's SHALL be made with a **Custom roll** builder. The builder SHALL be collapsed by default, SHALL remember in this browser whether it was left open, and SHALL let the viewer set:
- the roll type;
- the dice, with the dice builder (see `dice-pool`): one or more die types from d4, d6, d8, d10, d12, d20 and d100, each with a number of dice, 20 dice in all, and an optional modifier from −99 to 99;
- an optional label of at most 40 characters;
- for the GM only, whether the roll is GM-only. This choice also applies to named-attack rolls, SHALL be offered above the named attacks together with any hidden-token warning, and SHALL be kept when the viewer leaves and returns to the Play tab.

The custom settings SHALL start from the last ones this browser used with the chosen attacker, or a to-hit `1d20` with no label the first time. Settings saved in this browser before mixed dice existed SHALL still be read. The custom Roll control SHALL name the formula, type and target, e.g. "Roll 1d20+5 to hit Goblin 2", and SHALL be unavailable until a target is chosen. Every roll SHALL be a single roll that carries the attacker, the target and the label. Every roll SHALL also send a ping at the target's position; the ping SHALL be sent only for a public roll whose target is visible to players.

#### Scenario: Custom roll
- **WHEN** Aria's owner targets Goblin 2, opens Custom roll, chooses 1 × d20 with modifier +5 and label "Longsword", and rolls
- **THEN** one roll of `1d20+5` is made, carrying Aria as attacker, Goblin 2 as target and "Longsword" as the label, a ping appears on Goblin 2 for everyone, and the result shows at the top of the section

#### Scenario: Custom roll with mixed dice
- **WHEN** Aria's owner chooses Damage, 1 × d8, adds 2 × d6 with + Die and a modifier of 3, and rolls against Goblin 2
- **THEN** one damage roll of `1d8+2d6+3` is made against Goblin 2, and the Roll control read "Roll 1d8+2d6+3 damage to Goblin 2"

#### Scenario: Builder stays out of the way
- **WHEN** a player who has only ever used named attacks opens the Play tab
- **THEN** Custom roll is collapsed and the named attacks are the first controls after the target

#### Scenario: Settings are remembered per token
- **WHEN** the viewer rolls a custom `1d20+5` with Aria, reloads the page, and opens Custom roll for Aria
- **THEN** the dice are set to `1d20+5`

#### Scenario: Older saved settings
- **WHEN** this browser saved Aria's custom settings as 1 × d20 + 5 before mixed dice existed
- **THEN** Custom roll for Aria opens with 1 × d20 and a modifier of 5

#### Scenario: GM-only attack sends no ping
- **WHEN** the GM makes a GM-only attack roll against Aria
- **THEN** players receive neither the roll nor a ping
