# leave-table Specification

## Purpose

Lets a player end their seat in a room deliberately, knowing what they give up, and lets the GM decide what happens to every token that player owned.

## Requirements

### Requirement: Players can leave the table
The room page SHALL give every player a "Leave table" control in the room sidebar, on the row that says who they are and separate from that text. At rest it SHALL look like a button in the shared neutral style: small, unfilled, with a visible boundary and an icon. It SHALL turn the danger colour only when hovered. It SHALL be reachable by keyboard, SHALL NOT be the panel's primary control, and SHALL be available on both wide and narrow layouts, where a long display name SHALL NOT push it out of view. It SHALL NOT be shown to the GM.

#### Scenario: Player finds Leave table
- **WHEN** a player is in a room
- **THEN** the sidebar shows a "Leave table" button beside "You are …" that looks like a button before it is hovered, and can be reached with Tab and activated with Enter or Space

#### Scenario: Long name on a phone
- **WHEN** a player with a long display name is in a room on a narrow layout
- **THEN** the name truncates and the "Leave table" button stays fully visible

#### Scenario: GM has no Leave table
- **WHEN** the GM is in their room
- **THEN** no "Leave table" control is shown, and the Home link remains their way out

### Requirement: Leaving asks for confirmation and states the loss
Activating "Leave table" SHALL open a confirmation modal before anything is sent to the server. The modal SHALL name the room and SHALL state that the player will lose their seat and display name in this room and lose control of the tokens they own, listing those tokens by name (or saying they own none). It SHALL also state that rejoining through the invite link makes them a new player whose tokens the GM has to reassign. It SHALL offer a safe choice ("Stay") that has focus when the modal opens, and a destructive "Leave table" confirmation. Dismissing the modal by Stay, Escape, the close button or the backdrop SHALL leave the player in the room with nothing changed.

#### Scenario: Modal lists what the player owns
- **WHEN** player Sam, who owns tokens "Aria" and "Wolf", activates Leave table
- **THEN** a modal opens that names the room, lists "Aria" and "Wolf", explains that Sam will lose control of them and their seat, and focuses "Stay"

#### Scenario: Player changes their mind
- **WHEN** the confirmation modal is open and the player presses Escape
- **THEN** the modal closes, focus returns to Leave table, no command is sent and the player is still connected

### Requirement: Leaving permanently ends that participant's seat
When a player confirms, the client SHALL send `participant.leave`. The server SHALL record that the participant left as a committed, sequenced event visible to everyone in the room. From that point the participant SHALL NOT be active:
- every socket bound to that participant, in any tab or device, SHALL receive a session-ended message and be disconnected;
- later connections with that credential SHALL be refused;
- commands and ephemeral messages attributed to that participant SHALL be rejected or dropped.

Other participants' connections SHALL be unaffected. The GM SHALL NOT be able to leave: a `participant.leave` from the GM SHALL be rejected with no event.

#### Scenario: Player leaves
- **WHEN** player Sam confirms Leave table
- **THEN** a single left-the-room event for Sam is committed with the next seq, and every other participant's client applies it without reconnecting

#### Scenario: Other tabs of the same seat end too
- **WHEN** Sam has the room open in two tabs and confirms Leave table in one
- **THEN** both tabs show the session-ended screen and neither remains connected

#### Scenario: Credential is refused afterwards
- **WHEN** a client connects with Sam's credential after Sam left
- **THEN** the connection is refused and no snapshot is sent

#### Scenario: GM cannot leave
- **WHEN** the GM's client sends `participant.leave`
- **THEN** the command is rejected and no event is appended

### Requirement: Session-ended screen after leaving
After leaving, the player's browser SHALL forget its stored credential for that room and show a session-ended screen that names the room and says they left. The screen SHALL NOT offer account creation. Opening the room's invite link again SHALL show the normal join form.

#### Scenario: Player sees the session-ended screen
- **WHEN** Sam's leave is committed
- **THEN** Sam's tab shows a screen saying they left the room, with a link to the home page

#### Scenario: Rejoining creates a new participant
- **WHEN** Sam opens the invite link after leaving and joins as "Sam"
- **THEN** the join succeeds as a new participant who owns no tokens

### Requirement: Leaving does not change tokens
Leaving SHALL NOT change, reassign or delete any token. Tokens the departed player owned SHALL keep listing them as an owner until the GM resolves them, and SHALL stay on the board with the same visibility.

#### Scenario: Tokens stay after leaving
- **WHEN** Sam, the sole owner of "Aria", leaves
- **THEN** "Aria" stays on the board at the same position and still lists Sam as its owner

### Requirement: GM is notified when a player leaves
When a player leaves, every connected client's room page SHALL show a notice "<name> has left the room." announced through a polite live region, once per departure seen happening in that session. A client that loads or reloads after the departure SHALL NOT show a notice for it. The GM's notice SHALL offer "Review tokens" if the departed player owns any tokens; a player's notice SHALL NOT offer it. Every notice SHALL be dismissible without resolving anything. A player removed by the GM SHALL NOT produce a notice for players.

#### Scenario: GM sees the notice
- **WHEN** Sam, who owns a token, leaves while the GM is in the room
- **THEN** the GM sees "Sam has left the room." with a Review tokens action

#### Scenario: Player with no tokens leaves
- **WHEN** a player who owns no tokens leaves
- **THEN** the GM's notice names them and offers no Review tokens action

#### Scenario: Other players are told
- **WHEN** Sam leaves while Kim is connected
- **THEN** Kim sees "Sam has left the room." exactly once, with Dismiss and no Review tokens action

#### Scenario: Reload does not replay
- **WHEN** Sam left earlier and Kim reloads the page
- **THEN** Kim sees no departure notice

#### Scenario: Removal is not announced to players
- **WHEN** the GM removes Sam from the room
- **THEN** Kim sees no departure notice

### Requirement: Unresolved departures stay listed for the GM
The GM panel SHALL list every departed player who still owns at least one token, with the number of tokens, and SHALL let the GM open the review for each. The list SHALL be derived from room state, so it SHALL survive a reload and SHALL empty itself once no token names that player. Players SHALL NOT see this list.

#### Scenario: Deciding later
- **WHEN** Sam left owning two tokens and the GM reloads the page without resolving them
- **THEN** the GM panel lists Sam with 2 tokens and a Review action

#### Scenario: Fully resolved
- **WHEN** the GM resolves every token Sam owned
- **THEN** Sam no longer appears in the Departed players list

### Requirement: GM resolves each departed player's tokens individually
The review modal SHALL list every token that names the departed player as an owner, including hidden tokens, with each token's co-owners. It SHALL offer a choice per token: reassign to an active player, unassign, delete, or decide later (the default). An "Apply to all" control SHALL set every row to one choice, after which individual rows SHALL remain editable. Applying SHALL send one `participant.resolveDeparture` command carrying only the rows not set to decide later.

The server SHALL accept the command only from the GM, only for a participant who has left, only for tokens that currently name that participant as an owner, only with each token listed once, and only with reassignment targets who are active players. Otherwise it SHALL reject the whole command with no events. On acceptance, all resulting changes SHALL be committed together with consecutive seqs:
- reassign SHALL replace the departed player with the target in the token's owners, keeping other co-owners and not duplicating the target;
- unassign SHALL remove the departed player from the owners;
- delete SHALL delete the token.

Each change SHALL be recorded with the value it replaced, so it is undoable like any other ownership change or deletion.

#### Scenario: Mixed resolution
- **WHEN** Sam owned "Aria", "Wolf" and "Lantern", and the GM chooses reassign "Aria" to Kim, delete "Wolf", and decide later for "Lantern"
- **THEN** "Aria" is owned by Kim, "Wolf" is deleted, "Lantern" is unchanged, and all players see both changes

#### Scenario: Co-owner kept
- **WHEN** "Aria" is owned by Sam and Kim, and the GM unassigns Sam
- **THEN** "Aria" is owned by Kim only

#### Scenario: Apply to all then adjust
- **WHEN** the GM sets Apply to all to Delete and then changes "Aria" to reassign to Kim
- **THEN** applying deletes every other listed token and reassigns "Aria" to Kim

#### Scenario: Invalid target rejects everything
- **WHEN** a resolution reassigns one token to a participant who has also left
- **THEN** the command is rejected, no token changes, and the modal shows the error

#### Scenario: Player cannot resolve
- **WHEN** a player sends `participant.resolveDeparture`
- **THEN** it is rejected as forbidden and no event is appended

### Requirement: A departed player's history is kept
Dice rolls and activity-log entries made by a departed player SHALL remain, still attributed to their name. The activity log SHALL record the departure as "<name> left the table". The review modal SHALL tell the GM that history is kept.

#### Scenario: Old rolls keep the name
- **WHEN** Sam rolled 1d20 and then left
- **THEN** the dice log still shows the roll by Sam, and the GM's activity log shows "Sam left the table"
