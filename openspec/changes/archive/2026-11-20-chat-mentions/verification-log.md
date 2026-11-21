# Verification log: chat-mentions

Started 2026-10-05, branch `feat/chat-mentions`.

## Environment

- The user's own dev servers on :3001 and :5173 were left alone.
- Isolated servers: `server-isolated` (Express + Socket.IO on :3101, in-memory store, `DATABASE_URL` and `REDIS_URL` empty) and `web-isolated` (Vite on :5273, proxying to :3101). Both were temporary entries in `.claude/launch.json`, since removed.
- Browser: the built-in browser pane, one viewer. Other viewers are socket.io-client scripts in the session scratchpad (the Playwright browser here is shared, see memory).
- Test accounts: guest seats in an in-memory room only. No accounts and no database were touched.

## Automated checks

| Step | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: shared 426, server 277 (22 skipped), web 462, bench 2 |

## Browser steps

Setup: signed up a throwaway GM account "Mara" on the in-memory :3101 server through the local sign-up page. It disappears when that server stops, and the credentials stayed in the session scratchpad. Created room "Mention test". A scratchpad socket script joined players Aria, Bea and Cid by invite and sent their commands.

| # | Step | Result |
| --- | --- | --- |
| 1 | GM's chat closed. Aria sends "@mara look at the map", Cid sends "ok". | Launcher reads "Chat, 2 unread, 1 mentions you". Badge shows "@2". |
| 2 | Badge look | The rust badge blended into the rust launcher. **Fixed:** added a 2px page-colour ring (`.chat-badge.mention`). Re-checked with Bea's "@Mara, ready when you are": "@1", with the edge now visible. |
| 3 | GM opens chat | Badge and label cleared ("Chat"). "@mara" (as typed) is a filled "you" tag. Row has a rust edge and the words "Mentions you". |
| 4 | Type "@" | List above the input: Aria (highlighted), Bea, Cid. Mara (self) not offered. Input `role=combobox`, `aria-autocomplete=list`, `aria-expanded=true`, `aria-controls` = listbox id, `aria-activedescendant` = Aria's option. Listbox labelled "Mention someone". |
| 5 | Type "B", press Enter | Narrowed to Bea. Enter gave "@Bea " with the caret at 5. List closed. Nothing sent (still 4 messages). |
| 6 | Type "and @", ArrowDown ×2, Tab, "watch the door", Enter | Cid highlighted (`aria-selected`). Tab picked it. Enter sent "@Bea and @Cid watch the door", shown with neutral highlights on the GM's own line. |
| 7 | Type "@c", press Escape | List closed, text still "@c", popup stayed open. A new "@" elsewhere ("hey @") reopened the list. |
| 8 | Click "Cid" | "hey @Cid ", caret after the space, focus kept in the input. |
| 9 | Bea renames to "Bee" (script) | GM's earlier line still highlights "@Bea". "@" now offers Aria, Bee, Cid. |
| 10 | GM previews as Bee | Mara's "@Bea and @Cid…" shows "@Bea" as Bee's own tag, with "Mentions you". Bee's own line is "mine". Input disabled ("Chat is read-only while previewing"), no listbox. |
| 11 | Phone width (375×812): open chat, "@", tap "Bee", "you're up", Enter | List fits above the input with about 37px rows. Tap gave "@Bee ". No horizontal page scroll. Sent line highlights "@Bee" (the new name). |
| 12 | Console and server logs | No errors. |
| 13 | Code read during review: Escape on "@c", finish "@cool, see you", send, then "@" | **Bug found and fixed:** sending clears the input without going through `edit`, so the Escape dismissal (at position 0) survived and the next message's list never opened. Added an effect that resets the dismissal when the input is empty. Re-run: the list opens (Aria, Bee, Cid), and "@cool, see you" shows no highlight. |

Note: the viewer script's own chat capture read the wrong event field (`msg.event` instead of `msg.committed.event`), so it was used only to send commands. Delivery to other players is covered by `apps/server/test/chat.test.ts`, and the player-side rendering by step 10.

## Security pass (manual, on the diff)

- **XSS:** mentions and text are React text children; no `dangerouslySetInnerHTML`. A static-render test checks markup in a mentioning message stays literal.
- **Forgery:** `chat.send` stays strict, so a client-supplied `mentions` is refused as `bad_request` (shared and wire tests).
- **Regex cost:** the patterns are a lookbehind `@`, an anchored one-character class and a `$`-anchored class, all linear. `decide` does at most about 500 `@` positions × 33 active participants × a 40-character compare, on rate-limited messages.
- **Data exposure:** mention ids are participant ids every viewer already receives. Names are their public display names, also in `participants`. Display-name homoglyphs are an existing display-name concern, not new here.
- **Spoofing:** `ChatText` already refuses `\p{Cf}` (RTL overrides) and control characters. A mention resolves only to the room's own active participants.

No findings.

## Review agents

**visibility-auditor:** no leaks. It suggested hardening, all done:
- a unit test that players' filtered state keeps `participants` whole, since mentions rely on it;
- a wire test that a hidden token's name after `@` is no mention and its id never reaches players' raw payloads;
- comment and ADR wording: mentions carry public display names, which can differ in case from the text.

**sync-reviewer:** no invariant violations. Its four findings, all fixed:
1. **Highlight drift.** Sir Lancelot's "@Sir Lancelot …, @Sir go" also highlighted the "@Sir" inside his own name on clients, though the server recorded only the second one. Fix: `mentionSegments` now takes the sender as a candidate and leaves their matches plain, which is exactly the server's winning set.
2. **Unicode trim.** The matcher compared slices with `normalizeName`, which trims, so a name stored decomposed matched "@José  hi" (two spaces) with the space inside the span. Fix: a non-trimming `foldName` in `names.ts`. Text in another Unicode form now never matches.
3. **Mention cap.** A room filled before the 32-player cap could exceed `MAX_CHAT_MENTIONS`. Fix: `decide` stops at the cap.
4. **Browser support.** The matcher's regex lookbehind would throw at load on Safari 16.0–16.3 (Vite's default target), breaking the whole app. Fix: an `indexOf` scan with a `$`-anchored check of the preceding code point, plus a test that no `packages/shared/src` file uses lookbehind.

Also added a strict convergence check (every client's chat equal) to the wire test.

## Re-check after the review fixes

Editing `packages/shared` restarted the `tsx watch` server, which wiped the in-memory room, so this re-check ran on a fresh room "Mention test 2" with scripted players Aria, Sir and Sir Lancelot (viewer script fixed to read `msg.committed.event`).

| # | Step | Result |
| --- | --- | --- |
| R1 | Sir Lancelot sends "@Sir Lancelot reporting, @Sir go". Aria sends "@Mara and @sir lancelot, look". | All three viewers converged. The first message records only Sir; the second records Mara and Sir Lancelot. GM launcher: "Chat, 2 unread, 1 mentions you". |
| R2 | GM opens chat | First line: "@Sir Lancelot reporting, " plain, then "@Sir" highlighted. Second line: "@Mara" filled tag plus "Mentions you", and "@sir lancelot" one neutral span. |
| R3 | GM types "@Sir", then " L", Enter, "hold the bridge", Enter | "@Sir" offered Sir and Sir Lancelot. " L" narrowed to Sir Lancelot. Sent "@Sir Lancelot hold the bridge", recorded as mentioning Sir Lancelot only, and every viewer has the same chat. |
| R4 | `npm run lint && npm run typecheck && npm test`, then `openspec validate --strict` | All pass: shared 431, server 278 (22 skipped), web 463, bench 2. Change valid. |

## Cleanup

- [x] Stopped `server-isolated` (:3101), `web-isolated` (:5273) and both viewer-script runs. The user's :3001 and :5173 servers were never touched.
- [x] Restored `.claude/launch.json` (`git checkout`).
- [x] Deleted the scratchpad file holding the throwaway GM credentials. The account lived only in the in-memory server and is gone.

## Merge of main (2026-10-14)

Merged `main` (`dbae5fc`, PRs up to #100) into `feat/chat-mentions` and renumbered this change's ADR from 0023 to 0034, since main took 0023 for creature starting HP.

**Conflicts resolved:** `decide.ts` and `index.ts` (combined both sides' imports and exports), `styles.css` (the participant-name width limit plus main's AFK name colour), and `ChatPanel.tsx` (the mention autocomplete plus main's draggable chat button, KAN-75). Both sides declared `onKeyDown`, so the input's mention handler is now `onInputKeyDown`, and the launcher's Shift+arrow handler is unchanged.

**Environment:** the same setup as above. Temporary `server-verify` (:3101, in-memory, `DATABASE_URL`/`REDIS_URL` empty) and `web-verify` (:5273) entries in `.claude/launch.json`, since restored. The built-in browser was the GM; a scratchpad socket script played Aria and Bea. The throwaway GM account "Mara" existed only in the in-memory server. The user's :3001 and :5173 servers were not touched.

| # | Step | Result |
| --- | --- | --- |
| M1 | `npm install`, `npm run lint`, `npm run typecheck`, `npm test` | All pass: shared 573, server 394 (35 skipped), web 575, bench 2. The lockfile was unchanged. |
| M2 | Aria sends "@Mara the door is locked", Bea sends "ok" | The launcher reads "Chat, 2 unread, 1 mentions you". |
| M3 | Drag the chat button to the upper left | It moved and the position was saved (`vtt.ui.chatSpot`). The widget got `chat-widget-left chat-widget-top`. The drag did not open the chat. |
| M4 | Focus the button, Shift+ArrowRight ×2, Shift+ArrowDown | It moved 48px right and 24px down. |
| M5 | Enter on the button opens the chat; type "hey @", ArrowDown | The popup opens downward from the moved button, with the list (Aria, Bea) inside it. ArrowDown highlighted Bea and did not move the button. |
| M6 | Enter, type "watch the door", Shift+ArrowLeft, End, Enter | The first Enter picked "@Bea " (caret 9) without sending. Shift+arrow in the input did not move the button. Sent "hey @Bea watch the door" with "@Bea" as a mention. |
| M7 | Bea leaves (`participant.leave`) | "Bea has left the room." `@` now offers only Aria, and the earlier "@Bea" stays highlighted. Escape closed the list but left the popup open. |
| M8 | Participants list | Bea's row is `participant-away`, with the name muted (rgb 142,150,162) and "AFK". Names keep the 14rem limit, and every row is one 40px line. |
| M9 | Console and server logs | No server errors. The only console 403 came from a manual `/invite` fetch made during setup without the GM header. |

**Cleanup:** stopped both servers, restored `.claude/launch.json`, and deleted the scratchpad credentials and player tokens.

## Second merge of main (2026-10-14)

Merged `main` again (`a000982`, PRs #101 and #103) with no conflicts. Main's new `0034-shared-token-attacks.md` took 0034, so this change's ADR moved to **0035**. Only the lines this change added were renumbered (found with `git blame`); Antonio's "ADR 0034" references to shared token attacks were left as they are. Added the ADR to the index in `docs/DESIGN.md`.

| Step | Result |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm test` | All pass: shared 591, server 398 (35 skipped), web 624, bench 2. |
