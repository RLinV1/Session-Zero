## ADDED Requirements

### Requirement: Send a chat message
Any active participant of a room (GM or player) SHALL be able to send a text message to the room. The server SHALL trim the text and SHALL accept it only when the trimmed text is 1 to 500 characters long and contains no control characters (including line breaks) or invisible formatting characters (such as right-to-left overrides; the zero-width joiner and non-joiner used by emoji and some scripts are allowed), and shows at least one visible character. An empty, whitespace-only, over-length or control-character message SHALL be refused as invalid and SHALL NOT be recorded. A participant who has left or been removed SHALL NOT be able to send.

#### Scenario: Player sends a message
- **WHEN** player Aria sends "Watch the door"
- **THEN** the room records one message from Aria with the text "Watch the door"

#### Scenario: Surrounding whitespace is trimmed
- **WHEN** a participant sends "  hello  "
- **THEN** the recorded text is "hello"

#### Scenario: Empty message refused
- **WHEN** a participant sends "   "
- **THEN** the server refuses it as invalid and nothing is recorded

#### Scenario: Over-length message refused
- **WHEN** a participant sends 501 characters
- **THEN** the server refuses it as invalid and nothing is recorded

### Requirement: Chat rate limit
One connection SHALL be able to send at most 10 chat messages in any 10-second period. A message over that limit SHALL be refused with a message saying to wait, and SHALL NOT be recorded. The limit SHALL NOT affect other commands.

#### Scenario: Eleventh message refused
- **WHEN** a participant sends 11 messages within 10 seconds from one tab
- **THEN** the first 10 are recorded and the 11th is refused and not recorded

### Requirement: Server sets the sender
Each message SHALL name its sender by the participant id and display name of the connection that sent it, as decided by the server. A client SHALL NOT be able to choose or forge the sender; any sender fields in the request SHALL be rejected. The message SHALL keep the display name it was sent under after a later rename.

#### Scenario: Forged sender rejected
- **WHEN** a client sends a chat command that includes another participant's id as the sender
- **THEN** the server refuses the command as invalid and nothing is recorded

#### Scenario: Name at send time kept
- **WHEN** Aria sends a message and then renames herself to "Ari"
- **THEN** the earlier message still reads as sent by "Aria"

### Requirement: Delivery to the room only
A recorded message SHALL be delivered to every connected participant of the same room, GM and players alike, and SHALL NOT be delivered to participants of any other room.

#### Scenario: Everyone in the room sees it
- **WHEN** the GM and two players are connected and one player sends a message
- **THEN** the GM and both players see it

#### Scenario: Other rooms do not
- **WHEN** a participant in room A sends a message
- **THEN** no participant of room B receives it

### Requirement: Chat history survives reload and late joins
The room SHALL keep its most recent 200 messages, oldest first, each with the time the server committed it. A participant who reloads or joins after messages were sent SHALL see those messages in the order they were sent. Messages beyond the most recent 200 SHALL remain in the room's permanent history and SHALL NOT be deleted or rewritten.

#### Scenario: Reload shows earlier messages
- **WHEN** three messages are sent and a participant reloads the page
- **THEN** they see the three messages in the order sent, with sender and time

#### Scenario: Late joiner sees history
- **WHEN** a player joins after two messages were sent
- **THEN** they see both messages in order

### Requirement: Chat panel
The room page SHALL offer a chat panel listing messages oldest-first with the sender's name and the time sent, scrolled to the newest message when one arrives. It SHALL have a text input that sends on Enter, clears on success, keeps the text and shows the reason on a refusal, and cannot send while empty or while disconnected. Message text SHALL be shown as plain text, never interpreted as markup.

#### Scenario: Send on Enter
- **WHEN** a participant types "Ready" and presses Enter
- **THEN** the message is sent, the input clears, and "Ready" appears in the list for everyone

#### Scenario: Markup shown literally
- **WHEN** a participant sends "<img src=x onerror=alert(1)>"
- **THEN** every viewer sees that text literally and no markup or script runs
