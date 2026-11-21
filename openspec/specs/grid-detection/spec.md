# grid-detection Specification

## Purpose
Provide private, editable grid estimates for newly uploaded raster maps while keeping saved grids authoritative and analysis resource use bounded.

## Requirements

### Requirement: Reviewed native-resolution estimate
The system SHALL analyze PNG, JPEG and WebP map uploads using full-resolution EXIF-oriented 8-bit grayscale and the reviewed classical LSD/fitter behavior. It SHALL preserve fractional cell size and canonical offsets. The highest-ranked usable best candidate SHALL be returned regardless of diagnostic acceptance gates. With no usable best candidate it SHALL return no_grid. Candidates SHALL contain no confidence probability. The original artwork SHALL be preserved.

#### Scenario: Borderline best candidate
- **WHEN** the reviewed fitter has a usable best candidate whose diagnostic gates fail
- **THEN** that candidate is available as an editable estimate with neutral check-before-saving wording

### Requirement: Per-upload versioned private cache
Candidates and completed no_grid outcomes SHALL persist separately from saved grids and SHALL be reused for polling, reopening, selection and placement of that upload. Jobs, claims, completions and reads SHALL validate source identity, configuration fingerprint and attempt. Equal bytes in separate uploads SHALL start separate analyses. Legacy or obsolete results SHALL be unavailable and SHALL NOT be backfilled or recovered. Only authorized owners/GMs SHALL read results; players SHALL receive no analysis metadata.

#### Scenario: Reopen after restart
- **WHEN** an owner reopens a map with a valid persisted candidate or no_grid result after restart
- **THEN** the same outcome is returned with no detector invocation

#### Scenario: Obsolete or stale work
- **WHEN** a result has an old fingerprint, mismatched source, deleted upload or superseded attempt
- **THEN** it cannot be read or complete current analysis and does not trigger editor-open analysis

### Requirement: Bounded asynchronous analysis
Both raster map upload paths SHALL return while analysis runs asynchronously and SHALL exclude tokens. The default analysis ceiling SHALL be 16 MP, independent of existing upload limits. Oversized and invalid images SHALL produce terminal errors, never no_grid. Excess admitted work SHALL be deferred; only transient failures SHALL consume up to three attempts. One fresh process SHALL perform each map analysis and SHALL be terminated and reaped after its default 30-second deadline. HTTP timeout SHALL default to 40 seconds and stale claims to 90 seconds. The grid container SHALL default to a configurable 2 GiB ceiling.

#### Scenario: Busy or oversized input
- **WHEN** the supervisor is busy or a map exceeds the analysis ceiling
- **THEN** busy work waits without consuming a failure attempt, and oversized work ends in error while manual setup remains available

### Requirement: Guarded automatic draft prefilling
An unconfigured raster map's editor SHALL wait for analysis before revealing its canvas, fields, tabs and save/apply actions. Preparation SHALL be shared across steps, keyed to the original analysis target and editor session. The initial status lookup SHALL show Checking grid…, queued analysis SHALL show Waiting to fit grid… and running analysis SHALL show Fitting grid…, with a centered spinner, polite announcements and no percentage or estimated completion time. The spinner SHALL respect reduced motion. Valid queued/running responses SHALL allow an indefinite wait with cancellation always available.

A usable candidate SHALL update geometry and the editable phase in one state change so the first visible editor frame is already fitted. Automatic adoption SHALL preserve units and line style and SHALL never run after a session becomes editable. Configured maps, UVTT grids and shipped calibrations SHALL bypass waiting. Cached results SHALL reveal prepared setup without an artificial delay. Completed no_grid and failed fitting SHALL reveal manual setup with a short neutral explanation; missing or denied analysis SHALL fall back quietly. Each status request SHALL time out after 10 seconds; request failure or timeout SHALL reveal manual setup and prevent later automatic adoption without imposing a deadline on queue/processing time.

The waiting X SHALL have the accessible label Set up manually. X, Escape, backdrop and a visible Set up manually button SHALL synchronously latch manual intent and reveal setup without discarding the upload or cancelling server analysis. Results SHALL remain cached, and session-level polling SHALL continue after skip so a later estimate is available through Use suggestion. A simultaneous skip SHALL prevent automatic adoption. The grid canvas SHALL receive focus when setup becomes editable; normal closing behavior SHALL then resume.

Manual interaction SHALL be tracked separately from equality, including the first anchor, keyboard alignment, field edits and discard. Saved grids, save attempts, dismissal, map replacement and access loss SHALL prevent automatic replacement. Use suggestion SHALL remain available for explicit adoption after interaction. Saving SHALL remain explicit. Polling SHALL stop when analysis is absent or access is denied, and responses from superseded or unmounted sessions SHALL be ignored.

#### Scenario: Delayed result after skipping
- **WHEN** the GM skips waiting and a candidate arrives later, including after the first anchor or typing begins
- **THEN** the draft stays unchanged and Use suggestion permits explicit adoption

#### Scenario: Unconfigured map finishes fitting
- **WHEN** a valid estimate arrives while an unconfigured editor is waiting
- **THEN** its first visible editable frame contains the fitted geometry without saving or changing units and style

#### Scenario: Slow queue with responsive status requests
- **WHEN** analysis remains queued or running for more than 15 seconds and each status request succeeds
- **THEN** setup continues waiting until completion or manual skip

#### Scenario: Status timeout followed by recovered analysis
- **WHEN** a status request exceeds 10 seconds and a later request returns a candidate
- **THEN** manual setup is revealed at timeout and the later candidate requires explicit Use suggestion

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
