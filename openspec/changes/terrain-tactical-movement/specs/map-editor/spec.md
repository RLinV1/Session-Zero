## ADDED Requirements

### Requirement: Optional private terrain preparation
The room and library map editors SHALL offer an optional Terrain step with a cell brush, rectangle fill and Normal/Erase, Difficult and Blocked choices for base ground. Room preparation SHALL remain private until Save; library preparation SHALL save grid and board atomically. Keyboard arrows SHALL move the cell cursor, Enter SHALL begin/finish a gesture, and Escape SHALL cancel a gesture before closing the editor. Geometry changes with terrain SHALL require Cancel or explicit reset-and-apply.

#### Scenario: Prepare without publishing
- **WHEN** the GM paints base cells in the Terrain step before pressing Save
- **THEN** only that draft changes and no room command or library write occurs

#### Scenario: Cancel a keyboard gesture
- **WHEN** the GM begins a terrain gesture with Enter and presses Escape
- **THEN** the preview is discarded and the editor stays open

#### Scenario: Cosmetic grid save with private terrain
- **WHEN** the GM keeps a private terrain draft while entering Grid and saves only units or line style
- **THEN** the private cells and their revision context remain available when returning to Terrain; spacing/origin changes require saving or explicitly discarding the draft first
