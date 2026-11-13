## Purpose

Defines how the board's tool rail orders and groups its tools, so play tools and GM-only tools are told apart at a glance.

## ADDED Requirements

### Requirement: Play tools and GM tools are separated
The board's tool rail SHALL list, in order: the play tools (Select, Measure, Draw, AoE, Eraser); then, for the GM only, a divider followed by the GM tools (Fog, Terrain, Doors, Sight); then a divider and Clear. The divider before the GM tools SHALL look like the divider before Clear, and SHALL be shown only when at least one GM tool is shown. A player's rail SHALL show no GM tool and no divider before Clear other than the existing one. On a phone, the tool flyout SHALL group the tools the same way, with the same divider. A rail limited to Select (a template being edited) SHALL show neither divider.

#### Scenario: GM rail
- **WHEN** the GM's desktop rail is open
- **THEN** it shows Select, Measure, Draw, AoE and Eraser, a divider, Fog, Terrain, Doors and Sight, a divider, and Clear

#### Scenario: Player rail
- **WHEN** a player's desktop rail is open
- **THEN** it shows Select, Measure, Draw, AoE and Eraser, a divider, and Clear, and no GM tool

#### Scenario: Phone flyout
- **WHEN** the GM opens the tool flyout on a phone
- **THEN** a divider separates the play tools from the GM tools
