# GM and player demo recording

Run `npm run demo:gm-player` with the normal workspace dependencies and Playwright Chromium installed. This command owns local ports 3142, 5242 and 9242; stop other services on those ports first.

The recorder starts a fresh memory-backed API and isolated web server, then drives two independent browser contexts through signup, room creation, invite joining, map selection, token placement, player movement, public dice, chat and a GM HP edit. It asserts convergence using real Socket.IO snapshots. These are deterministic scripted browser actors, not autonomous language-model agents.

Outputs are ignored under `output/gm-player-demo/`: `gm.webm`, `player.webm`, a side-by-side `sunken-crypt-demo.webm`, and `verification.json`. The composite includes chapter headings over unmodified browser footage. It contains no audio. Demo accounts and the room exist only in the local memory store.

Optional environment variables:

- `DEMO_CHROME`: Chromium executable path instead of Playwright's bundled browser.
- `DEMO_PLAYWRIGHT`: installed Playwright test package path, for a shared local installation.
- `DEMO_MCP_CLI`: Playwright MCP CLI path. When supplied, the actual MCP server attaches to the recording browser and captures both perspectives as `gm-mcp.png` and `player-mcp.png`.

The command never connects to the configured production database, Redis or object storage. It blanks those connection settings and writes uploads inside its own output directory. Browser and server processes are closed in `finally`.
