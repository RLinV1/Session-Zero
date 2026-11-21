# Spec Delta

## Purpose

Lets a GM inspect an automatically detected square-grid alignment for a newly uploaded battle map and choose whether to use it without interrupting manual play.

## ADDED Requirements

### Requirement: Every new map receives one asynchronous analysis attempt
The system SHALL start one asynchronous attempt after a new library map upload or direct room map upload. Token uploads and placement of an existing library map SHALL NOT start analysis. An analysis or queue failure SHALL NOT fail an otherwise valid upload.

#### Scenario: Library map upload
- **WHEN** a GM uploads a map to the library
- **THEN** the map is immediately usable with its default saved grid and an analysis attempt is queued

#### Scenario: Direct map upload
- **WHEN** a GM uploads a map directly to a room with map purpose
- **THEN** the image remains playable while its own analysis attempt runs

#### Scenario: Token and placement paths
- **WHEN** any token upload uses the existing upload path, or a saved library map is placed
- **THEN** no new grid analysis starts

### Requirement: Detection produces a bounded square-grid suggestion
Analysis SHALL return either a candidate containing finite cell size, canonical X/Y offsets in original image pixels and confidence from zero to one, or `no_grid`. A candidate SHALL fit the image and drawable-grid limits. The service SHALL reject oversized or invalid images and bound processing time and memory.

#### Scenario: Consistent printed squares
- **WHEN** periodic horizontal and vertical lines have consistent square spacing
- **THEN** the candidate reports their size and phase in original image pixels

#### Scenario: No reliable square grid
- **WHEN** the image has no reliable periodic square grid
- **THEN** analysis reports `no_grid` rather than a high-confidence candidate

### Requirement: Analysis status is private and retryable
An authorized GM SHALL be able to read `queued`, `running`, `suggested`, `no_grid`, or `error` through the private API for an owned library map or a map directly uploaded to its own room, whether or not that map is applied yet. The retry endpoint SHALL accept only an error. One retry SHALL create one new attempt; concurrent retries SHALL NOT duplicate running work. Stale completions SHALL NOT replace newer attempts. Deletion SHALL remove the analysis record. Players SHALL NOT receive status, candidates, job details, or image contents in room payloads or logs.

#### Scenario: GM polls a current map
- **WHEN** its GM opens the relevant grid editor
- **THEN** the editor can poll the private status endpoint for that map

#### Scenario: GM reads a draft map's analysis
- **WHEN** a GM uploads a map directly to a room and opens the map editor's Grid step before applying it
- **THEN** the editor can read that upload's analysis, and only that room's GM can

#### Scenario: Player requests status
- **WHEN** a player credential requests room analysis status, a GM requests another room's upload, or another GM requests a library map's status
- **THEN** the server denies access without exposing the result

#### Scenario: Retry after failure
- **WHEN** an authorized GM requests a retry through the private API after an error
- **THEN** one new attempt is queued, and an old worker's completion cannot replace it

### Requirement: Unavailable detection falls back silently to manual alignment
The library and room grid editors SHALL show analysis progress and available suggestions, but SHALL NOT show failure notices, no-grid notices, detection-request errors, or a failure-specific retry button. A `no_grid` or `error` result, or an analysis request failure, SHALL clear the analysis message and leave the manual editor and its current draft available. Manual validation and save errors SHALL remain visible.

#### Scenario: No usable detection result
- **WHEN** analysis returns `no_grid` or `error`, or the status request fails
- **THEN** the analysis message disappears without a failure notice or retry button
- **AND** the GM can continue aligning and saving the current draft manually

### Requirement: Suggestions require two explicit actions to commit
The editor SHALL show a candidate and its confidence separately from the current grid. Confidence below 0.75 SHALL include a warning. Use suggestion SHALL copy only cell size and offsets into the current draft, retaining units and line style. Save grid or Apply grid remains the sole commit. A result arriving later SHALL NOT overwrite a dirty draft or saved grid. Closing the editor, replacing the room map, or losing GM access SHALL invalidate in-flight responses and previews. Manual alignment and play SHALL remain available throughout.

#### Scenario: Low-confidence candidate
- **WHEN** a candidate has confidence 0.74
- **THEN** the GM can inspect and use it with a visible warning

#### Scenario: Dirty draft receives a result
- **WHEN** analysis finishes while the GM is editing values
- **THEN** the draft remains exactly as edited until the GM explicitly selects Use suggestion

#### Scenario: Use without commit
- **WHEN** the GM selects Use suggestion and then cancels
- **THEN** the saved library or room grid remains unchanged

#### Scenario: Map changed mid-analysis
- **WHEN** the editor's map changes while a poll is active
- **THEN** the old result and preview are discarded and cannot be shown over the new map
