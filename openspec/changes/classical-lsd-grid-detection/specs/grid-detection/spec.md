# Grid detection

## Purpose

Provide private, editable grid estimates for newly uploaded raster maps while keeping saved grids authoritative and analysis resource use bounded.

## ADDED Requirements

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
