## Context

See proposal.md, Why. Room chat already goes through the standard pipeline:
- **Command:** `chat.send { text }` is a strict zod object. `ChatText` trims the text and refuses control and invisible characters.
- **Decide:** `decide` builds `ChatMessageSent { message: { id, senderId, senderName, text } }` from the actor, with the sender never taken from the payload.
- **Reduce:** `reduce` appends `{ ...event.message, at }` to `RoomState.chat`, capped at 200 (ADR 0015).
- **Visibility:** chat is public. `filterStateForViewer` keeps `chat` and `participants` as they are, and `filterEventForViewer` passes `ChatMessageSent` through.

Display names are unique among active participants, compared with `normalizeName` (NFC, trimmed, `en-US` lower case; `room-participants` spec). Two people can share a name only when one of them has left or been removed. Names are 1 to 40 characters. Participant ids are server UUIDs that players already receive in `state.participants`.

The web client does not re-parse events with zod. `RoomConnection` applies the JSON it receives. `ChatPanel` renders text as React children, and its unread badge counts messages after the newest one seen, by id (`unreadCount`).

## Goals / Non-Goals

**Goals:**
- Mentions decided only on the server, from the text, with no second source of truth.
- Mentions identify people by participant id, so they survive renames and reused names.
- The text stays human-readable everywhere it already appears: the activity log, older clients, exports.
- A strictly additive, optional contract change: old logs, old snapshots and older clients keep working.

**Non-Goals:**
- Rewriting how a past message reads after a rename. The name shown stays the one written, like `senderName`.
- A rich-text composer. The input stays a plain `<input>`.

## Decisions

### 1. The server derives mentions from the text. `chat.send` does not change.

`decide` scans the trimmed text for `@Name` against the room's active participants and records what it finds, apart from the actor's own name. A client influences mentions only by what it writes, and the command stays `{ text }` and strict, so a request carrying a `mentions` field fails validation as `bad_request`. That is the existing forgery behaviour, now with a spec scenario of its own.

Alternatives considered:
- **Client sends `mentions: Id[]` and `decide` checks each id belongs to the room.** Rejected. It creates two sources of truth that can disagree. The text could read "@Bob" while the list pings Carol, or a list could ping people the text never names (silent pings). Stopping that needs `decide` to check the text against the list anyway, which is the same scan. It would also change the command schema for no gain.
- **Inline tokens such as `<@participant-uuid>` in the text (Discord style).** Rejected. The text would no longer be readable in the activity log, on an older client or in an export. The composer would have to translate tokens to names and back. And a `<@…>` that does not resolve needs its own rule.
- **Structured message parts (`[{ text } | { mention }]`).** Rejected. It replaces the `text` field's shape, which breaks every reader of chat.

### 2. Shape: `ChatMention { participantId, displayName }` and an optional `ChatMessage.mentions`

```ts
// state.ts
export const MAX_CHAT_MENTIONS = MAX_PLAYERS_PER_ROOM + 1; // every active participant
export const ChatMention = z.object({ participantId: Id, displayName: z.string().min(1).max(40) });
export const ChatMessage = z.object({ /* existing fields */, mentions: z.array(ChatMention).min(1).max(MAX_CHAT_MENTIONS).optional() });
```

`ChatMessageSent.message` is `ChatMessage.omit({ at })`, so the event gains the field with no edit to `events.ts`. `mentions` is present only when the message mentions someone. A plain message, and every stored event, keeps the shape it has today. The `.min(1)` keeps "absent" as the one way to say nobody was mentioned.

`displayName` is the mentioned person's name at send time, for the same reason `senderName` exists: the client has to find the written `@Name` in the text to highlight it, and after a rename the current name no longer appears there.

Alternatives considered:
- **`Id[]` only.** Rejected. After a rename, the client cannot find which part of the text to highlight.
- **Character offsets (`{ participantId, start, end }`).** Rejected. It adds an offset contract in UTF-16 units that `reduce` would have to trust or check. The shared matcher in Decision 3 finds the same spans from `displayName`.

### 3. One shared, pure matcher: `packages/shared/src/chatMentions.ts`

```ts
findMentions(text, candidates: { participantId, displayName }[]): { participantId, displayName, start, end }[]
mentionSegments(text, mentions: ChatMention[], sender?: ChatMention): ({ kind: "text"; text } | { kind: "mention"; text; participantId })[]
```

`findMentions` steps through each `@` with `indexOf`. The `@` counts only at the start of the text or when the code point before it is not `\p{L}`, `\p{N}` or `\p{M}`. It uses no regex lookbehind: the module loads on every page, and Safari before 16.4 can't parse one.
- **Longest name first.** At each `@`, it tries candidates longest first, by code-unit length, with ties broken by `participantId` so the result is deterministic.
- **Comparing a name.** It compares `foldName(text.slice(i + 1, i + 1 + name.length))` with `foldName(name)`, and the next code point must not be a letter, digit or combining mark. `foldName` is `normalizeName` (NFC, `en-US` lower case) without the trim: stored names are already trimmed, and trimming the slice would let "José " match a name stored decomposed.
- **First match wins.** The first candidate that matches is the mention, and the scan resumes after it, so a matched name's own characters are never rescanned.

`decide` uses `findMentions`, then dedupes by `participantId` in order of first appearance. `mentionSegments` runs the same matcher with the message's recorded mentions plus its sender as the candidates, and leaves the sender's matches plain. That is exactly the set that can win at any `@` the server recorded: every longer active name that matched was either recorded or was the sender's. So the panel highlights only the spans the server recorded. Server and client cannot drift, because there is only one matcher.

Equal-length slicing means text in a different Unicode normalisation form than the stored name (NFD against NFC) does not match. The failure is safe: the message is sent as plain text. Within one script, case mapping keeps code-unit length, so case-insensitive matching works for the names people actually use.

### 4. `decide` and `reduce`

`chat.send`:
1. Authorize as today.
2. `candidates` = active participants, the actor included, so the longest-name rule sees the actor's name: when the actor "Sir Lancelot" writes "@Sir Lancelot", it must not tag an active "Sir".
3. `mentions` = `findMentions(command.text, candidates)` without the actor's own matches, deduped, capped at `MAX_CHAT_MENTIONS` (a room filled before the player cap can hold more active participants), and mapped to `ChatMention`.
4. Emit `ChatMessageSent` with `...(mentions.length ? { mentions } : {})`.

The result is pure and deterministic, and it uses no new `ctx`.

`reduce` needs no code change. It already spreads `event.message` into state. A unit test pins that `mentions` survives the reduce, the 200-message cap and replay.

### 5. Visibility, activity log and undo stay as they are

- **Visibility.** Mentions carry only the ids and public display names of participants that players already receive, unfiltered, in `state.participants`. Both filters keep passing chat through. The existing comments get a sentence saying mentions are public by design and must be filtered alongside `participants` if that list is ever filtered; a unit test pins it as unfiltered. Whispers would be the change that needs filtering.
- **Activity log.** The sentence `"<actor> said: <text>"` already reads "Aria said: @Bea watch the door".
- **Undo.** `ChatMessageSent` stays non-reversible.

### 6. Composer: an editable combobox with list autocomplete (WAI-ARIA pattern)

- **The input.** It gets `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` and `aria-activedescendant`. The suggestion list is a `role="listbox"` with `role="option"` items, positioned above the input inside the chat popup.
- **Finding the fragment.** On change and on caret move (`onSelect`), the panel looks back from the caret for the nearest `@` at a boundary. The fragment between `@` and the caret must be at most 40 characters and may contain spaces, because names can.
- **Suggestions.** The list holds active participants other than the viewer whose `normalizeName(displayName)` starts with `normalizeName(fragment)`, sorted by name, showing at most 8. When nothing matches, the list closes.
- **Keys** (handled in the input's `onKeyDown` only while the list is open):
  - ArrowDown and ArrowUp move the highlight, wrapping at the ends.
  - Enter and Tab pick the highlighted name and `preventDefault`, so the form does not submit.
  - Escape closes the list and `preventDefault`s, and stops propagation within the popup.
  - Keys are ignored during IME composition (`e.nativeEvent.isComposing`).
- **Picking.** A pick replaces `@fragment` with `@${displayName} ` and puts the caret after the space. Options use `onMouseDown` with `preventDefault` so focus stays in the input. Taps work the same way.
- **When the list never opens.** While `readOnly` (GM preview) or offline, the list never opens.
- **Why not reuse `Picker`.** `Picker` is a select-only combobox and keeps focus on a button. Here the text field keeps focus, so this is a small local component inside `ChatPanel.tsx` rather than a change to `Picker`.

The board's Escape handlers already ignore events from text fields (`isTyping`), so Escape in the chat input cannot change the board tool.

### 7. Rendering and the badge

- **Rows.** `ChatRow` receives `viewerId` and renders `mentionSegments(message.text, message.mentions ?? [])`. Plain segments stay React text. Mention segments are `<span class="chat-mention">`, with a `you` modifier when `participantId === viewerId`. A row that mentions the viewer gets the class `mentions-you` and a visible "Mentions you" label in its meta, so the line is marked in words as well as colour and screen readers hear it. `viewerId` is the panel's existing `you` (`viewer ?? self`), so the GM's player preview judges mentions as that player.
- **Badge counts.** A new exported `unreadMentionCount(chat, seenId, viewerId)` sits beside `unreadCount` and uses the same "after the newest seen id" logic. It counts messages whose `mentions` include the viewer and whose `senderId` is not the viewer.
- **Badge display.** When that count is above zero, the badge gets a `mention` modifier (an `@` glyph and an accent colour from the theme tokens). The launcher's `aria-label` becomes "Chat, 3 unread, 1 mentions you". Opening the popup already sets `seenId` to the newest message, which clears both counts.

### 8. ADR 0035 amends ADR 0015

`docs/adr/0035-chat-mentions.md` (Proposed) records:
- the optional `ChatMessage.mentions` and `ChatMention`;
- the server-derived rule and its matching rules;
- the unchanged strict `chat.send`;
- the public-visibility reasoning;
- the alternatives above.

It needs sign-off from the Real-Time Architecture owner before the schema change merges, as CLAUDE.md requires for changes to existing shared schemas.

## Risks / Trade-offs

- **[Accidental mentions when a name is a common word]** → A mention needs `@` at a boundary plus the full name and a trailing boundary, so ordinary words never match. `@` inside an email address does not count.
- **[A name that is a prefix of another]** ("Al", "Alice"; "Sir", "Sir Lancelot") → Longest match wins, and the trailing boundary stops "@Al" matching inside "@Alice". Unit tests cover both cases.
- **[Rename between typing and sending]** → The written name no longer resolves, so the message goes out as plain text. Nothing is refused or sent to the wrong person. The autocomplete reads live state, so a fresh pick uses the new name.
- **[Unicode normalisation mismatch]** → The message is sent as plain text, which fails safe. No spoofing is possible, because the resolved ids come only from the room's own participants.
- **[Mention spam aimed at one player]** → The existing limit of 10 messages per 10 seconds per connection bounds it. Muting is a follow-up.
- **[Cost]** → At most 500 characters times 33 candidates per message, and render-time segmentation over at most 200 messages. Both are negligible. Segments can be memoised per message id if profiling ever shows a cost.
- **[Specs depend on an unarchived change]** → `room-chat`'s requirements are not in `openspec/specs/` yet, so mentions are a separate capability. Archive `room-chat` first, so both main specs exist side by side.

## Migration Plan

1. Land ADR 0035 (Proposed) and get Real-Time Architecture review.
2. Ship the shared contract, server and web changes together, as usual. The order is not critical:
   - An older web client keeps `mentions` in state without reading it and shows plain text.
   - An older server never emits `mentions`.
3. No data migration. Stored events and snapshots have no `mentions` and replay unchanged.
4. **Rollback:** reverting is safe. Older code spreads or strips the extra field (zod objects strip unknown keys on parse), so events recorded with mentions still parse and display as plain text.

## Open Questions

- Should a highlighted mention show the person's current name in a tooltip after a rename ("now Bee")? This is display only and can come later without changing the contract.
- Should a mention also raise a toast, as the turn notice does? This is a UI follow-up. The badge indicator covers the spec.
