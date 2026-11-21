# Asset library delta

## ADDED Requirements

### Requirement: Setup before unconfigured map placement
Selecting an unconfigured library map for a room SHALL open private setup before placement and SHALL read the original library asset's valid cached estimate. Placement SHALL require explicit confirmation of the prepared grid; cancellation SHALL leave the room unchanged. Configured maps SHALL retain existing placement behavior. UVTT-supplied grids and shipped calibrations SHALL remain authoritative.

Unconfigured library uploads, reopened library editors and room selections SHALL wait for pending grid analysis before revealing setup. Skipping the waiting step SHALL reveal manual setup while retaining the upload and analysis cache; it SHALL NOT place the map or close the editor. Cancelling editable setup SHALL preserve the room. A cached candidate SHALL prepare the draft before its first editable frame.

#### Scenario: Select unconfigured library map
- **WHEN** the GM selects a library map with no saved grid
- **THEN** private setup opens with that asset's valid cached result, and no room map changes before explicit saving and placement

#### Scenario: Cancel setup
- **WHEN** the GM cancels setup for an unconfigured selection
- **THEN** the current room map is preserved

#### Scenario: Skip pending analysis for a selection
- **WHEN** a selected unconfigured map is still fitting and the GM uses X, Escape, backdrop or Set up manually
- **THEN** private manual setup opens for that same upload, later estimates require Use suggestion, and the room stays unchanged until explicit Apply map
