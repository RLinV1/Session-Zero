## ADDED Requirements

### Requirement: Each editor step has a Guide
The map editor SHALL show a compact Guide icon button (accessible name "Guide", 44px target) overlaid on the top-right corner of the map area, not in the header or over the side panel and flush in the corner with the zoom controls to its left, on every step of the room editor and the library map editor. Pressing it SHALL start a guided tour of the current step's controls, one highlighted control at a time with a card of one or two short sentences, Next, Back and Done, and Escape to close. Controls that are not on screen SHALL be skipped. Closing the tour with Escape SHALL NOT close the editor. The tour SHALL change no map data.

#### Scenario: Tour the Fog step
- **WHEN** the GM is on the Fog step and presses Guide
- **THEN** the tools, player view and fog controls are highlighted in turn, and Done closes the tour

#### Scenario: Skipped control
- **WHEN** the map has no fogged regions
- **THEN** the tour does not stop at the fogged regions list

#### Scenario: Escape
- **WHEN** a tour is open and the GM presses Escape
- **THEN** the tour closes and the editor stays open
