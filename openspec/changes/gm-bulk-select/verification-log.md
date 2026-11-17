# Verification log: gm-bulk-select

Run 2026-11-16 by Claude in worktree `.claude/worktrees/gm-bulk-select` (branch `feat/gm-bulk-select`, from origin/main 8c4f82a1).

## Environment

- Own servers, never the user's: API `PORT=3141` (memory store, `SEED_DEV_ACCOUNT=1`), web on `5341` with `VTT_SERVER=http://127.0.0.1:3141`. Both confirmed with `lsof -d cwd` to run from the worktree.
- Started through `preview_start` with two temporary `--prefix` entries in the main checkout's `.claude/launch.json`; the entries were removed as soon as the servers were up, and `cmp` against a byte copy confirmed the file was back as it was.
- Browser: the built-in browser pane, on `http://127.0.0.1:5341` (not `localhost`, whose cookie other servers share).
- Memory store: every room and token below is gone when the server stops. No accounts were created.

## Steps

1. **Automated gate.** `npm run lint && npm run typecheck && npm test` from the worktree: exit 0. Shared 1913 tests, MCP 271, server 1067 (57 skipped, the Postgres-only ones), web 1982, latency bench 2.
2. **Room.** "Try without signing in" → Start the room as guest GM "T1" on The Broken Span. A scratchpad script (`seed-room.mjs`, socket.io as that GM) created 11 tokens named as in the screenshot, with Gloam Moth 3 hidden, and started the encounter. The credential file it read was deleted afterwards.
3. **Compact turn order.** Play tab: Oswin Tarr ▶, 2 Maren Holloway, 3 Gloam Moth 4, then "+8 more" (`aria-expanded="false"`, `aria-controls="init-order"`). Focused the toggle and pressed Enter: all 11 rows, label "Show fewer", `aria-expanded="true"`, focus kept on the toggle. Pressed it again: back to 3 rows.
4. **Wrap.** Next turn ×9 to Hush Clock (10th): ▶ Hush Clock, 11 Ysolde Crane, a "Round 2" divider, 1 Oswin Tarr (its label ends ", Round 2" for screen readers), then the fold.
5. **Shift-drag.** The browser tool's drag doesn't hold Shift (a plain drag panned the map, as it should), so the gesture was sent as real `pointerdown`/`pointermove`/`pointerup` events with `shiftKey` on the canvas. Mid-drag the blue box was drawn over the bottom row and the map didn't move. On release, the selection held exactly the 5 boxed tokens (Party Oil, Gloam Moth 3 (hidden), Old Wick, Hush Clock, Ysolde Crane). The turn order ticked Hush Clock and Ysolde; the fold read "+8 more · 3 selected"; one button read "Remove 5 from encounter".
6. **Bulk remove.** Clicked it: one command, no dialog (6 tokens remained). Heading "Initiative · round 2", Oswin Tarr ▶ (the turn passed the removed Hush Clock and Ysolde and wrapped), "+3 more". The five stayed selected.
   - Fix made here: "Clear selection" wrapped under the button in the narrow panel; the visible label is now "Clear", with "Clear selection" as its accessible name (both the turn order and the Tokens tab).
7. **Bulk delete.** Tokens tab: bar "5 tokens selected · Delete 5 tokens · Clear", the five rows ticked and raised. Delete opened "Delete 5 tokens?" naming all five, saying it can be undone from the activity log, with Keep focused. Confirmed: 6 tokens left, bar gone.
8. **Undo.** More → Activity log offered "Undo delete of 5 tokens". Clicked: the log reads "T1 undid deleting Party Oil and 4 more"; the roster is back to 11, Gloam Moth 3 still hidden. The turn order kept its 6 (undo never touches it, ADR 0065).
9. **zh-TW.** Settings → Language → zh-TW: "還有 3 枚", "將 2 枚移出遭遇", "清除", and the hint "按住 Shift 拖曳可框選多枚" fit the panel. Switched back to English.
10. **Errors.** No server errors in the API log, no console errors in the page.

Not covered in the browser: a player's view. The integration tests in `apps/server/test/bulkTokenActions.test.ts` cover it over real sockets (players never receive the hidden token's id, and converge on the server's filtered view).

## Cleanup

- Both servers stopped (`preview_stop`); ports 3141 and 5341 free. The memory store went with them.
- `seed-room.mjs` stays in the session scratchpad; the credential file is deleted.
- Viewport emulation reset to desktop.
