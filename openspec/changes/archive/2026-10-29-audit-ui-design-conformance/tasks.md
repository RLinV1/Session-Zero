# Tasks

The rubric is principles 1–30 in design.md Decision 1. Severity follows Decision 3, and the three buckets (violation, not built, doc conflict) follow Decision 4. Every step is appended to `verification-log.md` in this change as it happens, as an action and its observation.

## 1. Baseline and scaffolding

- [x] 1.1 Record the baseline: commit SHA, branch, `git status --porcelain`, and `git diff | shasum`. Write them at the top of `openspec/changes/audit-ui-design-conformance/verification-log.md`. Verify the log file exists and lists the six pre-existing dirty paths plus `scripts/`.
- [x] 1.2 Create `docs/audits/ui-design-audit-2026-10-29.md` with the seven empty sections from design.md Decision 9 and a summary table with rows 1–30, each marked "pending". Verify the file has 30 table rows and the seven headings.
- [x] 1.3 Re-read FRONTEND-CONTRACT §13.3, §13.5, §13.6, §13.8, INTERFACE §11.3, §11.9–§11.11, CLAUDE.md invariants 3, 7, 8, and `styles.css :root`. Note in the log any rule wording that differs from the principle text in design.md. Verify by logging each section as read, with any differences found.

## 2. Static pass (all groups dispatched in parallel, then verified one by one)

- [x] 2.1 Dispatch five read-only Explore subagents, one each for groups A (1–7), B+C (8–15), D (16–18), E (19–25) and F (26–30). Give each the principle text, the doc sections, the art/chrome rule (Decision 2) and the "candidates only, with `file:line` and quoted code" instruction. Verify that five candidate lists came back, and log the candidate count for each group.
- [x] 2.2 Group A: re-read every candidate's cited lines. Accept, drop or reclassify each one. Write the accepted findings into the report. Verify that the log records the accepted and dropped counts, and that each accepted finding has principle, location, doc section, observed code and fix.
- [x] 2.3 Group B+C: same verification as 2.2. Unbuilt surfaces (prepare/log sheets, `/rooms` hub) go to Not built or Doc conflicts, not findings. Verify as in 2.2, plus that no finding cites a route missing from `router.ts`.
- [x] 2.4 Group D: same as 2.2. Verify as in 2.2.
- [x] 2.5 Group E: same as 2.2. Verify as in 2.2.
- [x] 2.6 Group F: same as 2.2. For principle 28, confirm each suspected local type duplicates an export of `packages/shared`, by naming the shared export. Verify as in 2.2.
- [x] 2.7 Static check of reduced motion: list every CSS `@media (prefers-reduced-motion)` rule and every JS call site of `matchMedia(reduced-motion)` or `reducedAnimations`. Mark which ones read the query at load time and which read it per event, so that 4.7 knows what runtime checks can cover. Verify that this list is in the log and that the at-load paths are carried to Limitations.

## 3. Runtime environment

- [x] 3.1 Start `server-isolated` and `web-isolated` with `preview_start`. Verify the logs show `:3101` using the in-memory store with the dev account seeded, and `:5273` serving, without touching `:3001`/`:5173`.
- [x] 3.2 GM tab at `http://localhost:5273`: sign in with the seeded dev account (loopback only, value never written down). Create a room, place two or three tokens, add initiative entries, and copy the invite. Verify the room ID and invite code are logged and the board renders.
- [x] 3.3 Player tab at `http://127.0.0.1:5273/join/<code>`: join as guest "Auditor-P" and have the GM assign one token. Verify the player sees the room, and that the two origins hold separate storage (the GM tab is still signed in as GM after the join).
- [x] 3.4 Write the scratchpad `socket.io-client` script: join via `POST /api/invites/:code/join`, connect with `auth: { roomId, guestToken }`, timestamp every ephemeral message, and send a ping, a preview and a forbidden command on request. Verify it connects and logs one received event.

## 4. Runtime checks (add findings and the log as each check finishes; offline last)

- [x] 4.1 Layout (8–11, 9): for each of 375×812, 667×375, 800×600 and 1280×800, record page overflow, board and panel rects, tab `offsetTop` values, the collapsed-panel opener, and the connection indicator. Open a complex GM editor below 720×480 to check for a larger-screen message. Pan the camera, resize, and check whether the board refits. Verify the log has four viewport rows for both GM and player, and screenshots for any Fail.
- [x] 4.2 Visual measures (3, 4, 21, 25): computed control heights, hit targets under the mobile preset, font family and `font-variant-numeric` on HP, initiative, dice and seq, and the outline after a real `Tab` keypress (including accent buttons). Measure contrast for every text style in use and for control boundaries, in dark and light themes. Verify that each measured pair is logged with its ratio, and each failing pair is a Blocker finding.
- [x] 4.3 Keyboard and semantics (19, 20, 23, 24): use only the keyboard to tab through the room, arrow through tabs, and open and close every modal and sheet (checking focus trap and focus return). Select a token via the roster and move and edit it without a pointer. Read the `aria-live` regions while the connection, turns and actions change. Verify that every modal and tab component is listed in the log with a pass or fail for each check.
- [x] 4.4 Interaction (12, 13, 15): check for non-drag move and initiative reorder controls. Press Escape mid-gesture with a sheet open. Check that shortcut keys typed into a text field don't fire. Measure the scripted player's received preview rate while the GM drags (≤20 Hz). Measure how long a ping or preview stays after the sender stops (≤1.5 s / ≤1 s), and whether previews clear on commit, cancel or disconnect. Verify the measured Hz and durations are in the log.
- [x] 4.5 Authority (14, 27): diff the player and GM tool rails, menus and `read_page` trees. For each extra control the player sees, send its command from the scripted player and record the server's response. Verify that the diff and the server's response for each are logged. Any accepted GM-only command is a Blocker.
- [x] 4.6 States (16–18): empty room or roster, `/join/not-a-code`, the error a sender gets after a forbidden command, a screenshot right after a reload for loading, a pending button keeping its label and width, a disabled button giving a reason, and destructive dialogs (remove participant, delete token, leave table) naming their target. Verify that each surface is logged with what it showed for each state.
- [x] 4.7 Reduced motion (7): with the in-app `reducedAnimations` setting on, and separately with `matchMedia` overridden in the page, trigger a ping, an attack animation (including nuke screen shake) and a dice throw. Record what still animates. Verify the log has one row per trigger per method, with the at-load paths from 2.7 marked not runtime-verified.
- [x] 4.8 Offline (16) — last runtime step: `preview_stop` the isolated server mid-session. Record what the GM and player tabs show (stale indicator, no modal, board still usable), then record the reconnect behaviour after restart. Verify that screenshots of both tabs are logged.

## 5. Report integration and closeout

- [x] 5.1 Assign `UI-NNN` IDs in severity → principle → file order. Fill the summary table so that every row is Pass, Partial, Fail or Not built and its count matches the findings. Verify that no row says "pending" and that the counts sum to the number of findings.
- [x] 5.2 Complete Not built, Doc conflicts (including the routes and `/library` conflicts from design.md Context) and Limitations (at-load reduced-motion paths, CSS reduced-motion, loading under throttling). Verify that every Not built status in the table has an entry here.
- [x] 5.3 Copy `verification-log.md` into the report's Verification log section. Stop the isolated servers and close the audit tabs. Verify with `preview_list` that no isolated server is still running.
- [x] 5.4 Check that nothing was modified: compare `git status --porcelain` and `git diff | shasum` with the 1.1 baseline. Verify that the only new paths are the report and this change's files, and that the hash is unchanged.
- [x] 5.5 Reply in chat with the top 10 findings (ID, severity, principle, location, one-line issue) and a link to the report. Verify that the list matches the first ten entries of the report's findings section.

## Workflow follow-up

- Decide with the team how to turn findings into follow-up changes, one per finding or grouped by owner (design.md Open Questions).
- Archive this change once the report has been reviewed.
