# Spec Delta

## MODIFIED Requirements

### Requirement: Every upload is kept on local disk
Every ordinary public upload SHALL be written to the server's local upload folder. When SeaweedFS is in use, it SHALL also be stored in SeaweedFS, which serves it. Deleting a library asset SHALL remove it from both, so a deleted asset stops loading everywhere.

#### Scenario: Upload with SeaweedFS running
- **WHEN** a GM uploads a map while SeaweedFS is in use
- **THEN** the image is in the SeaweedFS bucket and in the local upload folder

#### Scenario: Delete removes both copies
- **WHEN** the GM deletes that map from the library
- **THEN** it is gone from SeaweedFS and from the local folder, and `/uploads/<key>` answers 404

## ADDED Requirements

### Requirement: A published Studio original is delivered from committed library state

Studio originals and derivatives SHALL stay in private storage. Committing an owner-approved publication SHALL make the original retrievable through a reserved opaque library filename. The server SHALL resolve that alias only from committed library state. The reserved filename MUST terminate at its own handler before public storage or static fallback.

#### Scenario: Rollback after staging an alias

- **WHEN** a transaction stages library art then fails during publication
- **THEN** anonymous GET and HEAD cannot read the prospective alias during the transaction or afterward, and the owner's draft retains access

#### Scenario: Discard after publication

- **WHEN** the owner discards the draft after publishing a map
- **THEN** its draft-only media is reclaimed and the committed map alias still resolves to the original

#### Scenario: End the last reference

- **WHEN** the last draft or library reference ends
- **THEN** a durable deletion job removes the private original
