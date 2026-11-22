## Purpose

Lets a participant who arrived late, or anyone at the table, replay how the encounter unfolded from a chosen point, seeing only what they were allowed to see, without touching the live room.

## ADDED Requirements

### Requirement: Replay points
Any active participant SHALL be able to list the room's replay points. The list SHALL contain the start of the room, the start of each encounter (each time initiative started), and each checkpoint the GM saved, oldest first, each with the time it was reached. For the GM, a checkpoint point SHALL show the checkpoint's name. For a player, a checkpoint point SHALL be labelled "Checkpoint N" (numbered in order) and MUST NOT carry the checkpoint's name or id. A participant who is not in the room MUST NOT be able to list replay points.

#### Scenario: Player lists replay points
- **WHEN** the GM saved a checkpoint named "Before the ambush" and then started initiative, and a player lists replay points
- **THEN** the player sees "Start of the room", "Checkpoint 1" and an encounter-start point, and the response contains neither "Before the ambush" nor the checkpoint's id

#### Scenario: GM lists replay points
- **WHEN** the GM lists replay points in the same room
- **THEN** the GM sees the checkpoint labelled "Before the ambush"

#### Scenario: Outsider asks for replay points
- **WHEN** a request without a valid credential for this room asks for its replay points
- **THEN** the server refuses it and returns no room data

### Requirement: Replay is filtered for the viewer
The replay from a point SHALL consist of the table as it was at that point and every later change up to the moment of the request, each filtered for the requesting participant exactly as live sync would filter it. A player's replay MUST NOT contain a token hidden from them or under fog they do not own, a GM-only roll or area, the undo history, checkpoint names or ids, or command ids. A change the player could not see SHALL be left out of the replay entirely.

#### Scenario: Hidden token stays hidden in replay
- **WHEN** the GM added a hidden goblin and moved it after the replay point, and a player fetches the replay
- **THEN** no part of the player's replay contains the goblin or its positions

#### Scenario: Revealed token appears at the reveal
- **WHEN** the GM revealed a hidden token after the replay point
- **THEN** the player's replay shows the token from the reveal step onward and not before

#### Scenario: GM-only roll is left out
- **WHEN** the GM made a GM-only roll after the replay point
- **THEN** the player's replay has no step for that roll

#### Scenario: GM sees everything
- **WHEN** the GM fetches the replay from the same point
- **THEN** the GM's replay includes the hidden goblin and the GM-only roll

### Requirement: Replay controls
While replaying, the viewer SHALL be able to step forward one change, step back one change, play and pause automatic stepping, and jump to any step. Each step SHALL show a short description of the change when one can be given from what the viewer may see, and a neutral description otherwise. The board SHALL show the replayed table at the current step.

#### Scenario: Step through moves
- **WHEN** a player starts a replay from the room start, in which Bob moved his token twice
- **THEN** stepping forward twice shows the token at the first and then the second position, and stepping back returns it to the first

#### Scenario: Play to the end
- **WHEN** the viewer presses play
- **THEN** the replay advances one step at a time until the last step, then stops

### Requirement: Replay is local
Replaying MUST NOT change the live room. While replaying, the board and panels SHALL be read-only and the client MUST NOT send commands or ephemeral messages to the room. The live room SHALL keep updating in the background, and leaving replay SHALL show the live board as it is then.

#### Scenario: Others act during a replay
- **WHEN** a player is replaying and the GM moves a token in the live room
- **THEN** the replaying player's replayed board does not change, and on leaving replay the player sees the token at its new position

#### Scenario: Board is read-only during replay
- **WHEN** a player tries to drag their token while replaying
- **THEN** nothing is sent to the room and the live token does not move

### Requirement: Replay length limit
A replay SHALL contain at most 2,000 steps after its point. When more changes follow the point, the replay SHALL stop at 2,000 steps and say that it was cut short, suggesting a later point.

#### Scenario: Long history
- **WHEN** 2,500 visible changes follow the chosen point
- **THEN** the replay has 2,000 steps and the replay bar says the replay was cut short
