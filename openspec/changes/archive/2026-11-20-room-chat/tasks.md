## 1. ADR

- [x] 1.1 Write `docs/adr/0015-room-chat.md` (Proposed): the `chat.send` command and its validation, the `ChatMessageSent` event, `RoomState.chat` and `CHAT_LOG_LIMIT`, `EventMeta.at`, the public-visibility decision, and the deploy-together note. Verify the file exists and links this change.

## 2. Contract (packages/shared)

- [x] 2.1 Schemas: `ChatText` (trim, 1–500, rejects `\p{Cc}` and `\p{Cf}`), `chat.send { text }` with `.strict()` in `commands.ts`; `ChatMessage { id, senderId, senderName, text, at: string | null }`, `RoomState.chat`, `CHAT_LOG_LIMIT = 200` and `emptyRoomState` in `state.ts`; `ChatMessageSent { message }` in `events.ts`. Export from `index.ts`. Verify `npm run typecheck` passes.
- [x] 2.2 `decide`: `chat.send` emits one `ChatMessageSent` with `newId()`, actor id and display name; refuses a left/revoked actor as forbidden. `reduce`: appends with `at` from meta (null without), trims to the newest 200. `EventMeta.at` filled by `eventMeta`; a way for the client to pass `at` without a `commandId` so players get times but no undo history. Verify with `packages/shared/test/chat.test.ts` (KAN-75): trimmed text; empty, whitespace-only, 501-char, newline, and RTL-override text rejected by the schema; extra `senderId` rejected; sender from actor; name kept after rename; left participant forbidden; cap at 200 keeps newest; `at` stamped from meta; reduce is deterministic.
- [x] 2.3 `visibility.ts`: explicit `ChatMessageSent` pass case; state filter keeps `chat`. `activityLog.ts`: `"<actor> said: <text>"` truncated at 80 chars. Verify in `chat.test.ts`: a player receives the event unchanged and sees `chat` in their filtered state; the activity sentence reads as expected. Existing `visibility.test.ts` and `undo.test.ts` still pass.

## 3. Server

- [x] 3.1 Confirm the pipeline needs no change and replay of an old log yields `chat: []` (store loaders / fixtures updated if they build `RoomState` by hand). Add `apps/server/test/chat.test.ts` (KAN-75): two players and a GM in room A plus a player in room B; a message from one player reaches all of room A and none of room B; a late joiner's `welcome` holds earlier messages in order with `at`; empty and 501-char messages are rejected with no event; a payload with a forged `senderId` is rejected. Verify with `npm test --workspace=@vtt/server -- -t "chat"`.

## 4. Web

- [x] 4.1 `RoomConnection`: pass the committed `at` into `reduce` for player events too, without enabling undo for players. Verify a player's state gets `at` on a live chat message (unit or integration test) and `undo` stays empty.
- [x] 4.2 New `apps/web/src/panels/ChatPanel.tsx` wired into `RoomPanel.tsx`: oldest-first list with sender and local time, auto-scroll to newest, input sending on Enter via `connection.command({ type: "chat.send", text })`, clears on success, shows rejection message, disabled while empty or offline, `maxLength=500`, text rendered as plain React text. Verify `npm run typecheck && npm run lint`, then in the running app (Playwright, desktop and mobile widths): two browsers exchange messages, reload keeps history, `<img src=x onerror=alert(1)>` renders literally.

## 5. Integration

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`; run the visibility-auditor and sync-reviewer agents and a security review on the diff and fix findings.
