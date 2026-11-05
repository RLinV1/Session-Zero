# Spec Delta

## Purpose

Bounds what one seat and one address can make the server do, because an invite link is all it takes to hold a seat.

## ADDED Requirements

### Requirement: Commands are limited per seat
The server SHALL accept at most 800 commands per 20 seconds and 1,800 per 5 minutes from a player, and 3,000 per 30 seconds from the GM, across all of that participant's connections. Malformed commands SHALL count. A command over the limit SHALL be rejected with a reason and SHALL append nothing.

#### Scenario: A burst from a player
- **WHEN** a player sends 2,000 commands at once
- **THEN** 800 are accepted, the other 1,200 are rejected, and the room's log grows by 800

#### Scenario: Holding an arrow key
- **WHEN** a player holds an arrow key to move their token, at 33 moves a second for 20 seconds
- **THEN** every move is accepted

#### Scenario: A second tab
- **WHEN** a player has used the budget in one tab and sends a command from another
- **THEN** that command is rejected

#### Scenario: Another seat
- **WHEN** one player has used their budget
- **THEN** another player's commands are still accepted

### Requirement: Snapshots are limited per seat
The server SHALL answer at most 30 resync requests per minute from one participant and SHALL drop the rest.

#### Scenario: Repeated resyncs
- **WHEN** a player sends 40 resync messages
- **THEN** they receive 30 snapshots

### Requirement: Live traffic is limited per seat
The server SHALL relay at most 40 live messages a second from one participant, across all of their connections.

#### Scenario: Two tabs
- **WHEN** a player's two tabs each send 30 pings within a second
- **THEN** other viewers receive at most 40 of them

### Requirement: Connections are limited per seat
A seat SHALL hold at most 8 open connections and SHALL open at most 120 new connections a minute. A new connection past the cap SHALL close the seat's oldest. A closed or refused connection SHALL be told why, and SHALL NOT end the seat.

#### Scenario: A ninth tab
- **WHEN** a seat has 8 connections and opens a ninth
- **THEN** the ninth is admitted, the oldest closes and shows "Open in too many places", and the other seven stay open

#### Scenario: Reloading after being closed
- **WHEN** a person reloads a tab that was closed this way, after closing another
- **THEN** they are back in the same seat

#### Scenario: A reconnect loop
- **WHEN** a seat opens over 120 connections in a minute
- **THEN** further connections are refused until the minute has passed

### Requirement: Invite requests are limited per address
The server SHALL accept at most 300 invite requests per 15 minutes from one address, for any code, counted before the code is looked up.

#### Scenario: Wrong codes
- **WHEN** an address has spent its budget on wrong codes
- **THEN** every further invite request from it is answered 429, even with a valid code

#### Scenario: A class on one address
- **WHEN** 32 players on one address each open the link and join
- **THEN** all of them get seats
