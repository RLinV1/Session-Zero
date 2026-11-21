## Purpose

Bounds the Redis memory that wall detection uses, by keeping map images out of the job body, expiring them, sharing identical ones, and limiting how many analyses are pending.

## ADDED Requirements

### Requirement: A job names its image, it does not carry it
A wall-detection job SHALL NOT contain the image bytes. The server SHALL store the bytes once under a key derived from their content, with an expiry, and the job SHALL carry only that key. The worker SHALL read the bytes by that key, and SHALL refuse a key that does not have exactly the server's key shape.

#### Scenario: Job body is small
- **WHEN** the server queues an analysis of a 20 MB map
- **THEN** the job data holds no image bytes, only a key and the small numeric fields

#### Scenario: Worker refuses a foreign key
- **WHEN** a job names a key that is not a wall-image key
- **THEN** the worker fails the job without reading that key

#### Scenario: Missing bytes
- **WHEN** the image key has expired or was removed before the worker reads it
- **THEN** the worker fails the job and the GM is told the analysis failed

### Requirement: Stored images expire and are removed when unused
Every stored image SHALL have an expiry longer than the longest time a job may run. The server SHALL remove an image as soon as no live job of this server uses it.

#### Scenario: Job finishes
- **WHEN** the only job using an image finishes, fails, times out or is dropped
- **THEN** the image key is deleted

#### Scenario: Server lost before cleanup
- **WHEN** the server stops before removing an image
- **THEN** the key expires by itself

### Requirement: Identical maps share one stored image
Jobs for maps with identical bytes SHALL use the same key. The key SHALL stay until the last job using it is done.

#### Scenario: Two rooms, one map
- **WHEN** two rooms analyse the same built-in map at the same time
- **THEN** one image key exists, and it is deleted only after both jobs are done

### Requirement: Pending analyses are limited server-wide
The server SHALL NOT have more than a fixed number of analyses queued or running at once. A request beyond the limit SHALL be refused with a message telling the GM to try again shortly, and SHALL NOT store an image.

#### Scenario: Server busy
- **WHEN** the limit of analyses are pending and a GM asks for another
- **THEN** the request is refused with a 503 and nothing is stored

#### Scenario: Room already analysing
- **WHEN** a GM asks to analyse a map that is already queued or running for that room
- **THEN** the existing "already being detected" refusal still applies
