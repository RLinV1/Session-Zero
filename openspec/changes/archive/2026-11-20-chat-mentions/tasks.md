## 1. ADR

- [x] 1.1 Write `docs/adr/0035-chat-mentions.md` (Status: Proposed, needs Real-Time Architecture review; Amends ADR 0015). Record:
  - the optional `ChatMessage.mentions` / `ChatMention { participantId, displayName }` and `MAX_CHAT_MENTIONS`;
  - that the server derives mentions from the text with the matching rules, while `chat.send` stays `{ text }` and strict;
  - public visibility;
  - deploy order and rollback;
  - the rejected alternatives (client-sent ids, inline `<@id>` tokens, structured parts, offsets).

  Add a one-line pointer in ADR 0015's "Not covered" list. Verify both files exist and the new ADR links `openspec/changes/chat-mentions`.

## 2. Contract (packages/shared)

- [x] 2.1 `state.ts`: add `MAX_CHAT_MENTIONS = MAX_PLAYERS_PER_ROOM + 1`, `ChatMention`, and `mentions: z.array(ChatMention).min(1).max(MAX_CHAT_MENTIONS).optional()` on `ChatMessage`. Confirm `ChatMessageSent` picks the field up through `ChatMessage.omit({ at })` with no edit to `events.ts`. Verify `npm run typecheck` passes and the existing `packages/shared/test/chat.test.ts` still passes unchanged.
- [x] 2.2 New pure module `packages/shared/src/chatMentions.ts`, exported from `index.ts`:
  - `findMentions(text, candidates)` follows design Decision 3: a boundary `@` (not after `\p{L}\p{N}\p{M}`), `normalizeName` comparison on an equal-length slice, a trailing boundary, longest name first with ties broken by `participantId`, and the scan resuming after each match.
  - `mentionSegments(text, mentions)` returns text and mention segments.

  Verify with `packages/shared/test/chatMentions.test.ts` (`describe("chat mentions matcher (chat-mentions)")`), covering:
  - a basic mention, case-insensitive matching, and a name with a space;
  - longest match ("Sir" against "Sir Lancelot") and a prefix that is not a mention ("@Al" in "@Alice");
  - `@` inside an email, a name followed by punctuation ("@Bea," and "@Bea's"), and a name followed by a combining mark;
  - repeated names, and an NFD/NFC mismatch, which is not a mention;
  - segments rebuilding the original text exactly;
  - determinism.
- [x] 2.3 `decide` `chat.send`: candidates are the active participants, the actor included so the longest-name rule sees their name, with the actor's own matches then dropped. Dedupe by `participantId` in order of first appearance, and emit `mentions` only when non-empty. Extend the `chat.test.ts` decision and reduce suites (`describe("... (chat-mentions)")`) to check that:
  - "@Bea watch the door" records Bea with her send-time name, and the text is unchanged;
  - the sender's own name, a left participant and a revoked participant are not mentioned;
  - "@Bea @Cid @Bea" records Bea then Cid;
  - a plain message has no `mentions` key;
  - after Bea renames, the earlier message still holds her id and "Bea";
  - a new guest joining under a departed participant's old name is not in the earlier message's mentions;
  - a `chat.send` payload with a `mentions` field fails the strict schema;
  - `reduce` keeps `mentions` through the 200-message cap and replay;
  - reduce and decide stay deterministic.
- [x] 2.4 `visibility.ts`: extend the `chat` comment in `filterStateForViewer` and the `ChatMessageSent` case in `filterEventForViewer` to say mentions are public by design (no logic change). Verify in `chat.test.ts` that a player's filtered event and filtered state carry `mentions` unchanged, and that the activity sentence for a mention message reads "Aria said: @Bea watch the door".

## 3. Server

- [x] 3.1 Confirm the pipeline, socket and rate limit need no change. Extend `apps/server/test/chat.test.ts` (`describe("chat mentions over the wire (chat-mentions)")`) to check that:
  - with the GM and players Aria and Bea connected, Aria's "@Bea look" reaches all three with Bea in `mentions`;
  - a player who joins later gets the message with its mentions in the `welcome` snapshot;
  - a message naming a participant who left has no mentions;
  - a raw payload `{ type: "chat.send", text: "hi", mentions: [...] }` is refused as `bad_request` and records no event.

  Verify with `npm test --workspace=@vtt/server -- -t "chat"`.

## 4. Web

- [x] 4.1 Pure composer helpers in `apps/web/src/panels/ChatPanel.tsx` (or a sibling `chatMentionInput.ts`):
  - `mentionQuery(text, caret)` returns the boundary `@` before the caret and the fragment (at most 40 characters, spaces allowed), or null;
  - `mentionSuggestions(participants, viewerId, fragment)` returns active participants other than the viewer whose names start with the fragment (`normalizeName`), sorted, at most 8;
  - `applyMention(text, query, displayName)` returns the new text and caret after `@Name `.

  Verify with `apps/web/test/chatMentions.test.ts` (`describe("chat mention autocomplete (chat-mentions)")`): opening after a boundary only, none inside an email, a fragment with a space, narrowing, the viewer and departed participants excluded, and replacement with the caret placed after the space.
- [x] 4.2 The autocomplete in `ChatPanel`, following design Decision 6:
  - an editable combobox (`role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) with a `role="listbox"` above the input;
  - ArrowUp and ArrowDown wrap; Enter or Tab picks without submitting; Escape closes without changing the text;
  - keys are ignored during IME composition; `onMouseDown` uses `preventDefault` so taps pick without losing focus;
  - the list never opens while `readOnly` or offline.

  Add `.chat-mention-list` styles to `styles.css` using the existing theme tokens, for light and dark. Verify `npm run typecheck && npm run lint`. The popup starts closed and the web tests render statically with no DOM, so check the combobox attributes, the open list and the `readOnly` case in the running app (accessibility snapshot, task 5.1).
- [x] 4.3 Mention rendering and the badge:
  - `ChatRow` takes `viewerId` and renders `mentionSegments(message.text, message.mentions ?? [])` as React text plus `<span class="chat-mention">`, with a `you` modifier for the viewer;
  - a row that mentions the viewer gets `mentions-you` and a visible "Mentions you" label;
  - an exported `unreadMentionCount(chat, seenId, viewerId)` skips the viewer's own messages;
  - the badge gets a `mention` modifier, and the launcher reads `aria-label="Chat, N unread, M mentions you"`.

  Add `.chat-mention`, `.chat-mention.you`, `.chat-message.mentions-you` and `.chat-badge.mention` styles. Verify:
  - extend `apps/web/test/chatUnread.test.ts` for `unreadMentionCount` and the launcher label: it counts only after the newest seen message, ignores your own messages, ignores messages without mentions, and handles the capped log;
  - a static-render test of `ChatRow` (`apps/web/test/chatMentionRows.test.tsx`) shows a message with mentions displays "@Bea" in a mention span with the `you` modifier for Bea's view, neutral for the GM's view, and markup text stays literal;
  - a message without `mentions` whose text holds "@Bea" renders no mention span.

## 5. Integration

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`. Then, in the running app (`npm run dev`, Playwright, desktop and mobile widths), with a second viewer through a socket script per the shared-browser note, check that:
  - typing "@" opens the list; keyboard and tap picks insert "@Name "; Enter with the list open does not send;
  - the mentioned player's closed chat button shows the mention indicator and its accessible name;
  - opening the chat clears it;
  - the mention is highlighted for that player and neutral for others;
  - a rename after a mention keeps the highlight on the written name;
  - the GM's player preview shows the list disabled.

  Keep a verification log of each step.
- [x] 5.2 Run the `visibility-auditor` and `sync-reviewer` agents and a security review on the diff, fix the findings, and request review of ADR 0035 from the Real-Time Architecture owner. Verify no open findings remain, and the PR title references the change (`feat(chat): mentions (chat-mentions)`).
