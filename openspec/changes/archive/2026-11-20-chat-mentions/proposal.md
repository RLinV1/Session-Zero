## Why

Room chat (KAN-75, ADR 0015) is one public stream. When a player wants one person to notice something, such as "@Bea your turn to scout", they can type the name, but nothing tells Bea it was meant for her. Her unread badge looks the same as for any other line, and in a busy session the message scrolls past. Tagging a participant by name, and storing who was tagged by participant id, gets the message to the right person even after a rename or when someone who left shared that name.

## What Changes

- **Mentions in chat text.** `@` followed by an active participant's current display name is a mention of that participant: for example `@Bea`, or `@Sir Lancelot` for a name with a space. Names match the way display names are already compared, ignoring case. The sender's own name, names of participants who left or were removed, and `@` inside a word (such as an email address) are not mentions. The text is stored exactly as typed, as it is today.
- **The server works out the mentions.** `decide` reads the text against the room's active participants and records each one mentioned once, as `{ participantId, displayName }`, with the name as it was at send time (the same reason the message keeps `senderName`). The `chat.send` command does not change. It stays `{ text }` and strict, so a client cannot claim mentions the text does not contain.
- **`ChatMessageSent.message` and `RoomState.chat[]` gain an optional `mentions` field.** It is absent when nobody is mentioned, so every message sent today and every stored event keeps its current shape and replays unchanged.
- **Chat panel:**
  - **Autocomplete:** typing `@` opens a list of the room's other active participants, narrowed as you type. Arrow keys, Enter or Tab, a click, or a tap picks one and inserts `@Name `. Escape closes the list.
  - **Highlighting:** mentions show as highlighted names in each message. A mention of you is highlighted more strongly, and a message that mentions you is marked.
  - **Mention badge:** the closed chat button shows that a mention of you is waiting, separately from the ordinary unread count, and says so in its accessible name.
- **Visibility unchanged.** Mentions are public, like the rest of chat. The ids and display names belong to participants every viewer already receives. They are not whispers.
- **Contract change.** This adds a field to an existing shared schema, so it is recorded in a new ADR (`docs/adr/0035-chat-mentions.md`) for review by the Real-Time Architecture owner.

## Non-goals

- Whispers, private or GM-only messages (these need visibility filters, a separate change).
- Group aliases such as `@everyone`, `@gm` or `@players`.
- Notifications outside the chat button: sounds, toasts, browser or push notifications, or email.
- Tagging tokens or creatures, or linking to anything on the board.
- Changing how an earlier message reads after a rename. The highlighted name stays as it was written, like `senderName`.
- Clients choosing mentions directly (an explicit id list in `chat.send`). See design.md, Decision 1.

## Capabilities

### New Capabilities
- `chat-mentions`: recognising mentions in chat text, recording them by participant id with the name at send time, refusing client-chosen mentions, delivery and history of mentions, the mention autocomplete, highlighting, and the separate mention indicator on the chat button.

### Modified Capabilities
<!-- none. Room chat's requirements live in the unarchived `room-chat` change, so mentions are a new capability rather than a delta on a main spec that does not exist yet. The activity log sentence ("<actor> said: <text>") already reads correctly because the text keeps the typed `@Name`. -->

## Impact

- **`packages/shared`:**
  - `state.ts`: `ChatMention`, an optional `mentions` on `ChatMessage`, and `MAX_CHAT_MENTIONS`.
  - `events.ts`: picks the field up through `ChatMessage.omit({ at })`.
  - A new pure module `chatMentions.ts` with `findMentions` (used by `decide`) and `mentionSegments` (used by the panel), so the server and the client match names the same way.
  - `decide.ts` (`chat.send`) and `reducer.ts` (carry `mentions` through).
  - `visibility.ts`: a comment only. Mentions are public.
  - Tests in `packages/shared/test/chatMentions.test.ts`.
- **`apps/server`:** no pipeline, socket or rate-limit change. Wire test added to `apps/server/test/chat.test.ts`.
- **`apps/web`:** `panels/ChatPanel.tsx` (autocomplete combobox, mention rendering, mention badge), `styles.css` (mention styles), and tests next to `apps/web/test/chatUnread.test.ts`.
- **Docs:** `docs/adr/0035-chat-mentions.md`, which amends ADR 0015.
- **Compatibility:** additive and optional. Old logs replay with no mentions. An older web client keeps the extra field without reading it (`RoomConnection` does not re-parse events) and shows plain text, so the server can deploy before or after the web client.
- **Dependency:** builds on the `room-chat` change, whose tasks are all done but which is not yet archived. Archive `room-chat` before or together with this change.
