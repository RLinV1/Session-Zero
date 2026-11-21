## Purpose

Bounds how many rooms one account can create and keep, so a single account cannot grow the database and event log without limit.

## ADDED Requirements

### Requirement: Room creation rate per account
The server SHALL refuse a room creation when the account has already created 20 rooms in the current hour. Ordinary rooms and temporary encounter-editing rooms SHALL share this budget. The refusal SHALL be HTTP 429 with a `Retry-After` header and a message from the server text catalog in the request's language. A refused request SHALL create no room, seat or event.

#### Scenario: Twenty-first room in an hour
- **WHEN** an account that created 20 rooms in the last hour requests another
- **THEN** the server responds 429 with `Retry-After`, and no room is created

#### Scenario: Rate is per account
- **WHEN** one account has reached its hourly limit and a different account creates a room
- **THEN** the second account's room is created

### Requirement: Maximum rooms owned at once
The server SHALL refuse a room creation when the account already owns 100 rooms that have not been deleted, including temporary encounter-editing rooms. Concurrent requests across both entrypoints SHALL respect the same cap. The refusal SHALL be HTTP 429 with a catalog message telling the GM to delete a room first. Deleting a room SHALL free its place.

#### Scenario: At the cap
- **WHEN** an account that owns 100 rooms requests another
- **THEN** the server responds 429 with the catalog message, and no room is created

#### Scenario: Deleting frees a place
- **WHEN** an account at the cap deletes one room and then requests a new one
- **THEN** the new room is created

### Requirement: The GM sees why a room was not created
When room creation is refused for either limit, the GM dashboard SHALL show the server's message beside the create control, in the GM's language. It SHALL NOT show a generic error.

#### Scenario: Refusal shown
- **WHEN** the server refuses a room creation with 429
- **THEN** the create-room dialog shows the server's message and stays open
