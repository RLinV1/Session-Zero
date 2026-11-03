# GM and player demo recording

Run `npm run demo:gm-player` with the normal workspace dependencies and Playwright Chromium installed. This command owns local ports 3142, 5242 and 9242; stop other services on those ports first.

The recorder starts a fresh memory-backed API and isolated web server, then drives two independent browser contexts through signup, room creation, invite joining, map selection, token placement, player movement, public dice, chat and a GM HP edit. It asserts convergence using real Socket.IO snapshots. These are deterministic scripted browser actors, not autonomous language-model agents.

Outputs are ignored under `output/gm-player-demo/`: `gm.webm`, `player.webm`, a side-by-side `sunken-crypt-demo.webm`, and `verification.json`. The composite includes chapter headings over unmodified browser footage. It contains no audio. Demo accounts and the room exist only in the local memory store.

Optional environment variables:

- `DEMO_CHROME`: Chromium executable path instead of Playwright's bundled browser.
- `DEMO_PLAYWRIGHT`: installed Playwright test package path, for a shared local installation.
- `DEMO_MCP_CLI`: Playwright MCP CLI path. When supplied, the actual MCP server attaches to the recording browser and captures both perspectives as `gm-mcp.png` and `player-mcp.png`.

The command never connects to the configured production database, Redis or object storage. It blanks those connection settings and writes uploads inside its own output directory. Browser and server processes are closed in `finally`.

## A full game

`npm run demo:gm-player:long` records about 30 minutes of live gameplay, then composes the two perspectives at normal speed. Allow roughly another recording-length period for browser-based composition. Use `npm run demo:gm-player -- --minutes=10` for a shorter session.

The long game follows Mara's expedition to restore the Lantern Seal. GM narration and player choices are sent through room chat. Player movement uses owned-token controls; attack, damage, healing and investigation use actual public dice results; the GM resolves HP and advances initiative through the UI. Guardians can yield, Mara can be wounded or rescued, and exploration continues between encounters. Each turn asserts that both seats received the shared state. The actors are scripted role players, with outcomes branching on real dice and current HP.

Long outputs are preserved separately under `output/gm-player-long/`. `session-progress.json` updates during play; `long-session.json` includes duration, rounds, dice IDs, transcript and final token state. The raw viewpoint recordings are retained alongside the combined WebM. `DEMO_COMPOSE=0` saves the raw clips without waiting for composition. `DEMO_SESSION_MINUTES` is an alternative to the CLI option. `DEMO_PACE_MS` is only for accelerated local scenario preflight; the full capture uses normal reading/turn pacing.
