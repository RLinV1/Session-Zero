# Verification log: leave-table-visible-control

Date: 2026-11-09. Worktree `.claude/worktrees/leave-table-control`, branch `feat/leave-table-control`, from `origin/main` at 9185cf7.

## Environment touched

- API on port 3101: the in-memory store (log line "DATABASE_URL unset"), started from the main checkout by `preview_start`. Web-only change, so this API was kept.
- Web on port 5273, serving the worktree (confirmed with `lsof -d cwd`). The first start ran from the main checkout and served the old code, so it was stopped and restarted through a temporary `--prefix` entry in the main checkout's `.claude/launch.json`.
- `.claude/launch.json` was restored from a byte copy straight after (same SHA, `git status` clean for that file).
- The user's own dev servers (3001, 5173) and databases were not touched. `.env` was not read.
- Accounts and rooms: the seeded dev account, signed in on 127.0.0.1. Test rooms "Leave Check" and "Phone Check", in memory only. Guest players "P1" and a 40-character name.

## Steps and results

| # | Step | Result |
|---|------|--------|
| 1 | Join as a player at desktop width, read the header | Pass: bordered button with icon, right-aligned beside "You are P1 (player)" |
| 2 | Measure the first version (`secondary small danger`) | Found: `button.secondary` comes later in the stylesheet and cancels `button.danger`, so the text was neutral. Fixed by dropping the dead class and making neutral the stated design |
| 3 | Hover | Pass: text and border both `rgb(224, 104, 92)` (`--danger`) |
| 4 | Open the confirmation at desktop width | Pass: names the room, focus on Stay, text at 16px and the normal text colour |
| 5 | Press Escape | Pass: closes, focus returns to Leave table, still connected |
| 6 | 375x812, 40-character name | Pass: name truncates, button fully visible (left 251.6, right 363 of 375), 36px tall, no horizontal page overflow |
| 7 | Open the confirmation at 375x812 | Pass: text wraps (`white-space: normal`), dialog within the viewport (19 to 356) |
| 8 | Confirm Leave table | Pass: "You left Phone Check" screen, dialog closed |
| 9 | Open a room as its GM | Pass: "You are GM One (GM)", no Leave table button |
| 10 | `npm run lint && npm run typecheck && npm test` | Pass: exit 0. Shared 1015, server 628 (53 skipped), web 1316, benchmark 2 |

Note on step 9: opening "Leave Check" from the dashboard first showed "You are P1 (player)", because this browser still held that room's guest seat from step 1. A test artefact of one browser holding both seats. "Phone Check" had no stored seat left, so it opened as the GM.

## Cleanup

- Both test servers stopped; the in-memory rooms and account went with them.
- Temporary cookie jar removed from the scratchpad.

## After rebasing onto `origin/main` at 448c631

PR 169 landed while this was open and also edits `styles.css`. The rebase had no conflicts. `npm run lint`, `npm run typecheck` and `npm test` were rerun on the rebased branch and pass (shared 1015, server 628 with 53 skipped, web 1323, benchmark 2). The browser steps above were not repeated on the new base.
