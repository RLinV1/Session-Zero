## Why

Players and the GM have no way to talk inside a room, so every table leans on a separate voice or text app (KAN-75). A small room chat keeps table talk next to the board and in the room's history.

## What Changes

- **New command `chat.send`** with the message text. Any active participant may send it. The server validates it with zod: text is trimmed, 1–500 characters, and may not contain control characters, line breaks or invisible formatting characters, and must show at least one visible character. Each connection may send at most 10 messages per 10 seconds.
- **New event `ChatMessageSent`** carrying the whole message: a server-generated id, the sender's participant id and display name as they were when sent, and the text. The server sets the sender from the socket's identity, never from the payload.
- **Room state gains `chat`**: the most recent 200 messages, oldest first, each with the committed timestamp. Older messages stay in the event log, like rolls beyond the roll window. Snapshots carry it, so a reload or a late join shows earlier messages in order.
- **Visibility:** chat is public to everyone in the room. Both filters pass it through unchanged; the per-room broadcast keeps it out of other rooms.
- **Activity log:** a sentence for `ChatMessageSent` ("Aria said: …"). Not undoable.
- **Chat panel** in `apps/web`: messages oldest-first with sender and time, auto-scroll to the newest, and an input that sends on Enter and shows server rejections.
- **Contract change**, recorded in ADR 0015 for review by the Real-Time Architecture owner: the new command, event, `RoomState.chat`, and `EventMeta.at` so `reduce` can stamp the committed time without reading a clock.

## Non-goals

- Whispers or GM-only messages (would need visibility filters).
- Dice rolls in chat, editing or deleting messages, reactions, markdown or links.
- Rate limiting across one participant's several connections (a per-connection limit of 10 messages per 10 seconds is included).

## Capabilities

### New Capabilities
- `room-chat`: sending a message, validation and sender identity, delivery to the room only, history on reload and late join, and the chat panel.

### Modified Capabilities
<!-- none: the activity-log requirement "every supported event SHALL have a sentence" already covers the new event -->

## Impact

- **`packages/shared`:** `commands.ts` (`chat.send`), `events.ts` (`ChatMessageSent`), `state.ts` (`ChatMessage`, `RoomState.chat`, `CHAT_LOG_LIMIT`), `decide.ts`, `reducer.ts`, `undo.ts` (`EventMeta.at`), `visibility.ts` (explicit pass), `activityLog.ts`. Unit tests in `packages/shared/test/chat.test.ts`.
- **`apps/server`:** no pipeline change; snapshots already carry state. Multi-client wire test `apps/server/test/chat.test.ts`. Stored snapshots/replays without `chat` must load (default `[]`).
- **`apps/web`:** new `panels/ChatPanel.tsx`, wired into `RoomPanel.tsx`.
- **Docs:** `docs/adr/0015-room-chat.md`.
- **Compatibility:** additive. Older event logs have no chat events and replay to `chat: []`.
