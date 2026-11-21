# Spec Delta

## Purpose

Helps the GM find and fix the wrong walls in an automatic detection quickly, by flagging walls the model was unsure about (FR-GM-11).

## ADDED Requirements

### Requirement: Detected walls carry a confidence
When the learned model detects walls, each wall SHALL carry a confidence between 0 and 1, the mean model probability along the wall. Other detection methods MAY omit it. A result without confidences SHALL still be valid, and its walls SHALL be treated as confident. Applying walls SHALL NOT store confidence in the room.

#### Scenario: Model wall has confidence
- **WHEN** the model detects a wall
- **THEN** the result's wall has a confidence from 0 to 1

#### Scenario: Older result
- **WHEN** a result has walls with no confidence
- **THEN** it is accepted and no wall is shown as doubtful

#### Scenario: Out of range
- **WHEN** a result has a confidence above 1 or below 0
- **THEN** the server rejects the result

### Requirement: Doubtful walls are drawn differently
In the detection preview, a wall whose confidence is below 0.6 SHALL be drawn amber and dashed, and other detected walls SHALL keep their normal style. A legend SHALL explain the styles, and the panel SHALL show how many doubtful walls remain. An erased doubtful wall SHALL NOT count.

#### Scenario: Mixed result
- **WHEN** a result has 10 walls and 3 have confidence below 0.6
- **THEN** 3 walls are drawn amber and dashed and the panel says 3 doubtful

### Requirement: The GM reviews doubtful walls in turn
A Review doubtful walls control SHALL step through the doubtful walls. The current wall SHALL be highlighted and brought into view. The GM SHALL be able to keep it (go to the next), erase it, or move back, and the review SHALL end after the last one.

#### Scenario: Erase during review
- **WHEN** the GM erases the current doubtful wall in review
- **THEN** that wall is marked erased, the count drops by one, and the next doubtful wall becomes current

### Requirement: Apply confident walls only
When doubtful walls exist, an Apply confident walls only button SHALL apply every detected wall that is not doubtful and not erased, using the existing apply command. It SHALL be disabled when no such wall exists.

#### Scenario: Confident only
- **WHEN** the GM clicks Apply confident walls only on a result with 10 walls, 3 doubtful
- **THEN** 7 walls are applied
