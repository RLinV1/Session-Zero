## ADDED Requirements

### Requirement: The Sight step sets the map style
The Sight step SHALL offer a Map style choice, Flat or 2.5D isometric, as a labelled radio group. It SHALL default to Flat, be part of the editor's draft (sent with Save changes, dropped by Discard), and be saved with the room's scene. Only the GM can change it.

#### Scenario: Choose 2.5D and save
- **WHEN** the GM picks 2.5D isometric in the Sight step and presses Save changes
- **THEN** the room's scene is isometric and `scene.setIsometric` was sent once

#### Scenario: Existing rooms
- **WHEN** a room created before this change is opened
- **THEN** its map style is Flat
