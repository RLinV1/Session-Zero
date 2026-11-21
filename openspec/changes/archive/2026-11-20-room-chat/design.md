## Context

See proposal.md — Why. Room data only changes through `Command → decide → events → append → reduce → broadcast` (CLAUDE.md invariant 1), and `reduce` may not read a clock (invariant 2). Rolls already show the pattern for "recent items in state, full history in the log": `RoomState.rolls` is capped at `ROLL_LOG_LIMIT`. Clients get state through the filtered `welcome` snapshot and filtered live events (invariant 3).

## Goals / Non-Goals

**Goals:** chat through the standard pipeline; server-owned sender; bounded state; plain-text rendering.

**Non-Goals:** whispers, rate limiting across a participant's connections, message edit/delete (invariant 5 would make delete a compensating event anyway).

## Decisions

1. **Command `chat.send { text }`, strict.** zod: `z.string().trim().min(1).max(500)` refined to reject `\p{Cc}`, `\p{Cs}` and `\p{Cf}` characters (except ZWJ/ZWNJ) and text with no visible character, with `.strict()` on the object so extra fields such as `senderId` fail validation (the forgery acceptance criterion). `decide` re-checks the actor is active (not `left`/`revoked`) — the socket layer already refuses ended seats, but `decide` is the authority.
   *Alternative:* strip unknown keys silently. Rejected: explicit rejection makes forgery attempts visible and testable.

2. **Event `ChatMessageSent { message: { id, senderId, senderName, text } }`.** `id` from `DecideContext.newId`; `senderName` is the actor's display name at send time, so the log reads correctly after a rename (the same reason `AttackSide` records names). Nothing is replaced, so invariant 6 has nothing to carry.

3. **State `chat: ChatMessage[]`, capped at `CHAT_LOG_LIMIT = 200`, oldest first.** `ChatMessage` = the event's message plus `at: string | null`. Snapshots carry it, which gives reload and late-join history for free. The event log keeps everything (invariant 5).
   *Alternative:* a REST history endpoint. Rejected: a second read path that also needs filtering, for no gain at this size.

4. **Timestamp via `EventMeta.at`.** `reduce` cannot call `Date`. `eventMeta(committed)` gains `at: committed.at`; `reduce` stamps `message.at = meta?.at ?? null`. The web client today calls `reduce` without meta for players (no `commandId`); it will call `reduce(state, event, { …, at })` — see Decision 6 — so players also get times. Deterministic: the same committed event always yields the same state.

5. **Visibility: public.** Both filters get an explicit `ChatMessageSent` case returning the event / leaving `chat` intact, with a comment, so the exhaustive switch documents the decision. The Socket.IO room broadcast is already per room.

6. **Client reduce with time for players.** `RoomConnection` currently does `reduce(state, event)` when `commandId` is absent. Add an `at`-only path so chat messages get their time without giving players an undo history: `reduce` records undo only when `meta.commandId` is present. Implementation detail: make `EventMeta.commandId` optional-aware or pass a separate `at` argument — the implementer picks the smaller diff, keeping `recordUndo` unchanged for players.

7. **Activity log:** `"<actor> said: <text>"`, text truncated to 80 chars. Not reversible, so `undo.ts` ignores it (it already treats unknown events as non-undoable).

8. **Chat panel.** New `panels/ChatPanel.tsx`, a tab/section in `RoomPanel.tsx`. Renders text as React children (auto-escaped); no `dangerouslySetInnerHTML`. `maxLength=500` on the input as a hint; the server is authoritative.

## Risks / Trade-offs

- [Spam fills the 200-message window and the event log] → length cap and state cap bound memory; a per-connection limit of 10 messages per 10 seconds in `ws/socket.ts` bounds log growth. A limit across one participant's tabs is a follow-up.
- [Schema change to `RoomState` breaks older snapshots or tests that build state by hand] → `emptyRoomState` adds `chat: []`; any persisted snapshot path is rebuilt by replay, so no migration. Fixtures updated.
- [Bidirectional / zero-width Unicode used to spoof text] → `\p{Cc}` blocks control characters only; format characters (`\p{Cf}`) are also rejected to prevent RTL-override spoofing, except ZWJ/ZWNJ so emoji and Persian/Indic text work; lone surrogates are rejected; blank-only fillers are rejected.

## Migration Plan

Additive; deploy server and web together (the web client must understand the new event, or it resyncs). Rollback: revert; logs containing `ChatMessageSent` would then fail to parse, so rollback after chat use requires keeping the event schema.
