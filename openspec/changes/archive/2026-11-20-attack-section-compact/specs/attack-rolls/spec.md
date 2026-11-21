## ADDED Requirements

### Requirement: Compact Attack section
The Attack section SHALL show, top to bottom:
- the attacker, as a dropdown when the viewer controls more than one token, else as the token's name;
- the target, as a dropdown of other tokens nearest first with their distances, with a Pick on board control beside it;
- the chosen token's named attacks as a dropdown, with a menu holding Edit, Add attack and Custom roll; with no named attacks, an Add an attack control in the dropdown's place;
- a Roll control for the chosen attack, whose accessible name gives the attack and the target; for the GM, a toggle beside it for rolling privately;
- the viewer's latest attack roll: its total as damage or to hit, the outcome, the attack's label, dice and parties, and the GM's ruling controls.

The target SHALL appear once. Custom roll SHALL open from the menu and SHALL close on its own control.

#### Scenario: Ready to roll
- **WHEN** the GM has Goblin as attacker, Aria as target and Firebomb (damage `2d6`) chosen
- **THEN** the section shows "Goblin", then "Aria · 5 ft" beside Pick on board, then "Firebomb 2d6" with the ⋯ menu, then "Roll damage" with the private toggle, and no separate target list

#### Scenario: No attacks yet
- **WHEN** the chosen token has no named attacks
- **THEN** the section shows Add an attack where the attack dropdown would be, and no Roll control

#### Scenario: Result card
- **WHEN** the GM rolls Firebomb for 7 against Aria
- **THEN** below the Roll control the card reads "7 damage" and "Firebomb damage · 2d6 · Goblin → Aria", with Apply −7
