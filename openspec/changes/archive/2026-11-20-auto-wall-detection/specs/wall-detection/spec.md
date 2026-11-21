# Spec Delta

## Purpose

Lets the GM have a room's battle map analyzed for walls by the isolated vision service (FR-GM-11), and review the detected walls on a rendered preview before anything reaches the table.

## ADDED Requirements

### Requirement: A map is queued for wall analysis
Uploading a map image to a room SHALL queue one wall-analysis job for that image. The GM SHALL also be able to start analysis of the room's current map with Detect walls. Token uploads SHALL NOT start analysis. A failure to queue SHALL NOT fail the upload or change the room.

#### Scenario: Map upload starts analysis
- **WHEN** the GM uploads a map image into a room
- **THEN** the upload succeeds and a wall-analysis job for that image is queued

#### Scenario: Detect walls on the current map
- **WHEN** the GM presses Detect walls while the room shows a map
- **THEN** a wall-analysis job for that map is queued and the GM sees "Detecting walls…"

#### Scenario: Token art is not analyzed
- **WHEN** the GM uploads token art
- **THEN** no wall-analysis job is queued

#### Scenario: Queue unavailable
- **WHEN** Redis or the vision worker is not configured and the GM presses Detect walls
- **THEN** the GM is told wall detection is unavailable, and the room and the upload are unaffected

### Requirement: The vision worker returns walls and a rendered preview
The vision worker SHALL take the job from the queue, and SHALL return wall segments in the image's own pixel coordinates together with a preview image of the map with those walls drawn on it. Thin grid lines and small marks SHALL NOT be reported as walls. The worker SHALL bound image size and processing work. An image it cannot read SHALL fail the job.

#### Scenario: Walls drawn as thick dark strokes
- **WHEN** a map shows rooms outlined by thick dark walls over a floor with thin grid lines
- **THEN** the result contains segments along the walls' centrelines and none along the grid lines

#### Scenario: Map without walls
- **WHEN** a map has no wall-like strokes
- **THEN** the job completes with zero walls and a preview of the map

#### Scenario: Unreadable image
- **WHEN** the queued bytes are not a decodable image, or exceed the size limit
- **THEN** the job fails and the GM sees that detection failed

### Requirement: The app server is notified when a job finishes
The app server SHALL learn of each job's completion or failure from the queue, without the GM polling for it. It SHALL validate the result, rejecting segments outside the map or more segments than a room may hold. It SHALL then send a GM-only notice to the room's GM connections. Players SHALL NOT receive the notice.

#### Scenario: Completion reaches the GM
- **WHEN** the worker completes a job for the room's map
- **THEN** the GM's panel switches from "Detecting walls…" to the result without a reload

#### Scenario: Malformed result
- **WHEN** the worker returns a segment outside the image bounds
- **THEN** the result is treated as failed and the GM is offered Try again

### Requirement: Detection results are private to the room's GM
The GM SHALL be able to read the latest detection status for a map of their room (`queued`, `running`, `done` with a wall count, or `failed`), and fetch its preview image. Requests from players, from another room's GM, or for a map not analyzed in that room SHALL be refused without revealing whether a result exists.

#### Scenario: GM reads the result
- **WHEN** the room's GM opens the Walls panel after a job completed
- **THEN** the panel shows the preview image and the number of walls found

#### Scenario: Player asks for the result
- **WHEN** a player's credential requests the room's wall-detection status or preview
- **THEN** the server answers 403 and returns no result data

### Requirement: Detected walls change nothing until the GM applies them
A detection result SHALL NOT alter room state. Only the GM's Apply walls action SHALL commit walls, and only for the map currently in the room. Running detection again SHALL replace the earlier result for that map.

#### Scenario: Result arrives, nothing changes
- **WHEN** a job completes
- **THEN** the room's walls are unchanged and no event is committed

#### Scenario: Map changed before applying
- **WHEN** the GM applies a result whose map is no longer the room's map
- **THEN** the server refuses it as invalid and the walls are unchanged
