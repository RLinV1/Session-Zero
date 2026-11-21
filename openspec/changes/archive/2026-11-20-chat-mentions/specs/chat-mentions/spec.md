## Purpose

Lets a participant tag other people in room chat by name so the tagged person can see the message was meant for them. Mentions are recorded by participant identity, so they still point at the right person after a rename and never at someone who later takes the same name.

## ADDED Requirements

### Requirement: Recognise mentions in a message
When the server records a chat message, it SHALL treat `@` followed immediately by an active participant's current display name as a mention of that participant. All of these SHALL hold:
- The name SHALL match the way display names are compared for uniqueness (ignoring letter case).
- The `@` SHALL be at the start of the text or follow a character that is not a letter or digit.
- The name SHALL be followed by the end of the text or by a character that is not a letter or digit.
- When more than one active participant's name matches at the same `@`, the longest name SHALL be the mention.

These SHALL NOT be mentions: the sender's own name, and the names of participants who have left or been removed. Text that holds no mention SHALL be recorded as an ordinary message and SHALL NOT be refused. The recorded text SHALL be exactly what the sender sent after the existing trimming, with no change for mentions.

#### Scenario: A name after @ is a mention
- **WHEN** active players Aria and Bea are in the room and Aria sends "@Bea watch the door"
- **THEN** the recorded message mentions Bea, and its text is "@Bea watch the door"

#### Scenario: Letter case is ignored
- **WHEN** Aria sends "@bea, you're up"
- **THEN** the recorded message mentions Bea

#### Scenario: Names with spaces
- **WHEN** an active participant is named "Sir Lancelot" and Aria sends "@Sir Lancelot hold the bridge"
- **THEN** the recorded message mentions Sir Lancelot

#### Scenario: Longest name wins
- **WHEN** active participants "Sir" and "Sir Lancelot" are in the room and Aria sends "@Sir Lancelot go"
- **THEN** the recorded message mentions Sir Lancelot only

#### Scenario: A name inside a longer word is not a mention
- **WHEN** an active participant is named "Al" and Aria sends "@Alice is not here"
- **THEN** the recorded message mentions nobody

#### Scenario: @ inside a word is not a mention
- **WHEN** Aria sends "write to me at aria@Bea.example"
- **THEN** the recorded message mentions nobody

#### Scenario: Departed participants and the sender are not mentioned
- **WHEN** Cal has left the room and Aria sends "@Cal @Aria hello"
- **THEN** the message is recorded with that text and mentions nobody

#### Scenario: Unknown names are plain text
- **WHEN** Aria sends "@Nobody hi" and no participant is named Nobody
- **THEN** the message is recorded as an ordinary message with no mentions

### Requirement: Mentions are recorded by participant
Each recorded mention SHALL identify the mentioned participant by their participant id and SHALL keep the display name they had when the message was sent. A participant mentioned more than once in one message SHALL be recorded once, in the order their first mention appears. A later rename SHALL NOT change which participant a message mentions or the name the mention shows. A participant who later takes a display name that someone else had when they were mentioned SHALL NOT be treated as mentioned by that earlier message. A message that mentions nobody SHALL be recorded exactly as it is today, with no mention data.

#### Scenario: Repeated mention recorded once
- **WHEN** Aria sends "@Bea @Cid then @Bea again"
- **THEN** the message mentions Bea then Cid, each once

#### Scenario: Mention survives a rename
- **WHEN** Aria mentions Bea and Bea then renames herself to "Bee"
- **THEN** the message still mentions Bea's participant and still shows the name "Bea"

#### Scenario: Same name, different person
- **WHEN** Aria mentions Bea, Bea leaves the room, and a new guest joins as "Bea"
- **THEN** the earlier message does not mention the new guest

### Requirement: Clients cannot choose mentions
Only the server SHALL decide who a message mentions, from the text and the room's participants. A chat request that includes mention data or any other field beyond the text SHALL be refused as invalid, and nothing SHALL be recorded.

#### Scenario: Forged mention list refused
- **WHEN** a client sends a chat request with the text "hello" and a list naming Bea as mentioned
- **THEN** the server refuses it as invalid and records nothing

### Requirement: Mentions reach everyone with the message
A message's mentions SHALL be delivered with it to every connected participant of the room, GM and players alike, and SHALL be kept in the room's chat history, so a participant who reloads or joins later sees the same mentions. Mentions SHALL NOT reveal anything a player could not already see: they name only participants in the room, by the public display names every viewer already has.

#### Scenario: Everyone sees the mention
- **WHEN** the GM and players Aria and Bea are connected and Aria sends "@Bea look"
- **THEN** the GM, Aria and Bea all receive the message with Bea as its mention

#### Scenario: Late joiner sees the mention
- **WHEN** Aria sends "@Bea look" and then player Cid joins
- **THEN** Cid's chat history holds that message with Bea as its mention

#### Scenario: Older messages still load
- **WHEN** a room's history holds messages recorded before mentions existed
- **THEN** they load and display as before, with no mentions

### Requirement: Mention autocomplete
The chat input SHALL offer a list of participants to mention while the participant is typing a mention:
- **Opening:** typing `@` at the start of the input, or after a character that is not a letter or digit, SHALL open the list. It SHALL list the room's active participants other than the person typing, narrowed to names that start with what has been typed after the `@` (ignoring letter case).
- **Picking:** a participant SHALL be pickable with the arrow keys and Enter or Tab, or by click or tap. Picking SHALL replace the typed `@` fragment with `@` followed by the participant's display name and a space, and SHALL leave the caret after that space.
- **Enter with the list open:** Enter SHALL pick the highlighted participant and SHALL NOT send the message.
- **Closing:** Escape SHALL close the list without changing the text. The list SHALL close when nothing matches.
- **Accessibility:** the list SHALL be announced to assistive technology as suggestions for the input, with the highlighted participant identified.
- **Disabled:** the list SHALL NOT open while the chat input cannot send, such as during the GM's player preview.

#### Scenario: Pick with the keyboard
- **WHEN** Aria types "hi @be", presses the down arrow until Bea is highlighted, and presses Enter
- **THEN** the input reads "hi @Bea " and no message is sent

#### Scenario: Pick with a tap
- **WHEN** Aria types "@" on a phone and taps "Sir Lancelot"
- **THEN** the input reads "@Sir Lancelot "

#### Scenario: Escape closes without change
- **WHEN** Aria types "@b" and presses Escape
- **THEN** the list closes and the input still reads "@b"

#### Scenario: Yourself and departed participants are not offered
- **WHEN** Aria types "@" in a room where Cal has left
- **THEN** the list offers neither Aria nor Cal

### Requirement: Mention highlighting
The chat panel SHALL show each recorded mention in a message as a highlighted name, found by the name the mention recorded and shown as written in the text, and SHALL show the rest of the text as plain text, never as markup. A mention of the viewer SHALL be highlighted distinctly from mentions of others, and a message that mentions the viewer SHALL be visibly marked. Mentions SHALL be judged from the viewer's point of view, including when the GM previews the room as a player. A message with no recorded mentions SHALL display exactly as before, even if its text contains `@` followed by a name.

#### Scenario: Your mention stands out
- **WHEN** Bea views a message from Aria reading "@Bea and @Cid, flank left"
- **THEN** "@Bea" is highlighted as a mention of her, "@Cid" is highlighted as a mention of someone else, and the message is marked as mentioning her

#### Scenario: Others see neutral highlights
- **WHEN** the GM views the same message
- **THEN** "@Bea" and "@Cid" are highlighted as mentions and the message is not marked as mentioning the GM

#### Scenario: Highlight keeps the written name after a rename
- **WHEN** Bea renames herself to "Bee" after being mentioned
- **THEN** the earlier message still highlights "@Bea" as a mention of her

### Requirement: Mention indicator on the chat button
While the chat popup is closed, the chat button SHALL show that unread messages include at least one that mentions the viewer, distinctly from the ordinary unread count. Its accessible name SHALL state how many unread messages mention the viewer. The viewer's own messages SHALL NOT count as mentions. Opening the chat SHALL clear the mention indicator along with the unread count.

#### Scenario: Mentioned while chat is closed
- **WHEN** Bea's chat is closed and Aria sends "@Bea look" and Cid sends "ok"
- **THEN** Bea's chat button shows 2 unread with a mention indicator, and its accessible name says 1 message mentions her

#### Scenario: Opening clears it
- **WHEN** Bea opens the chat
- **THEN** the unread count and the mention indicator are cleared

#### Scenario: No indicator without a mention
- **WHEN** Bea's chat is closed and Cid sends "ok"
- **THEN** Bea's chat button shows 1 unread and no mention indicator
