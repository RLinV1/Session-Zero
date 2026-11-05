# Spec Delta

## Purpose

Gives the GM the tools to end the abuse of a leaked link: stop new joins, and clear out several players at once.

## ADDED Requirements

### Requirement: GM can lock a room to new joins
The GM SHALL be able to lock and unlock the room from the Share dialog. While it is locked, a join SHALL be refused whichever code it uses, with code `room_locked`, adding no participant and keeping no credential. Locking SHALL NOT affect anyone already seated. Only the GM SHALL be able to change it. A room from before this setting SHALL read as unlocked.

#### Scenario: A join while locked
- **WHEN** the GM has locked the room and someone opens the invite link and submits a name
- **THEN** the join page says the room is locked, the name is not marked as the cause, and no participant is added

#### Scenario: Seated players while locked
- **WHEN** the room is locked and a seated player reloads
- **THEN** they come back to the same seat

#### Scenario: Resetting the link while locked
- **WHEN** the room is locked and the GM resets the link
- **THEN** the room stays locked, and the new link is refused until the GM unlocks

#### Scenario: A removed guest while locked
- **WHEN** the room is locked and a guest the GM removed tries to join as someone new
- **THEN** the join is refused

#### Scenario: A player tries to lock
- **WHEN** a player sends the lock command
- **THEN** it is refused as forbidden

### Requirement: GM can remove several players at once
The GM SHALL be able to tick any of the room's active players, or all of them, and remove them in one step. The removal SHALL be all or none. Each removed player SHALL be treated exactly as a single removal is: disconnected on every device, unable to return with that seat, with their tokens left for the departure review.

#### Scenario: Removing a leaked link's visitors
- **WHEN** the GM ticks three players and confirms
- **THEN** all three are disconnected, their seats are free, and everyone else stays connected

#### Scenario: One on the list can't be removed
- **WHEN** the list includes someone who has already left
- **THEN** the GM sees the reason and no one is removed

#### Scenario: Removed players own tokens
- **WHEN** a removed player still owns tokens
- **THEN** the GM is taken to the token review, and any other pending reviews stay listed in the departure notice
