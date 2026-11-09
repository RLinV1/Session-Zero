## Why

Getting a game ready takes hours: uploading maps, setting grids, typing in every monster's HP and attacks, and placing tokens. Many GMs already have the rules, sheets and art in a folder, and an AI app that can read them. If that AI can do the typing, a GM can go from a folder of materials to a game that is ready to play, and spend their time checking it instead of building it. Session Zero still never calls a model, so this adds no model cost on our side.

**This change depends on `mcp-ai-players`, which is not committed yet.** It adds to `apps/mcp`, the `/mcp` route in Caddy and `Dockerfile.mcp`, all of which exist only in that uncommitted work. That change must land first.

## What Changes

- **A build is a private draft.** A signed-in user starts an "AI build" in the app. Everything the AI makes goes into that draft, and nothing reaches the user's library or any room until the user publishes it.
- **A build pass lets the AI in.** Starting a build gives one key that works for that one build only, ends after 24 hours, and can be cancelled. The AI never sees the user's password or session cookie. The pass can add to the draft and nothing else: it can't read the library, delete anything outside the draft, publish, or enter a room.
- **A second MCP address, `/mcp/build`.** The tools for building are kept apart from the player tools at `/mcp`, so an AI sitting at a table with strangers doesn't also hold building tools.
- **Files don't travel through the model.** Apps that can run commands upload with one `curl` line. For every other app, the user drops the art onto the build's page in their browser. The AI only reads the rules and sheets, in its own app. Session Zero refuses PDFs and never stores a rulebook.
- **The AI maps sheets to the fields the app really has.** HP, Max HP, AC, up to 8 attacks with simple dice, the 12 conditions, size, colour and art. Anything missing or unclear is stored as blank with a flag. Anything with no field is listed as "not carried over". Nothing is made up.
- **Maps use what already exists.** A UVTT file brings its own grid, walls and doors. A plain image gets the existing grid detection as a suggestion, which the user confirms. The AI doesn't draw walls. The user can run wall detection in the existing map editor after publishing.
- **The user reviews, fixes and publishes in the browser.** The build page shows every item and every flag. The user edits what's wrong, then publishes what they choose, as ordinary library items. They can then start a room from an encounter with the existing room-creation path. No GM seat ever goes to an AI.
- **Everything a build made can be removed.** The user can discard a draft or remove what a build published, with the usual warning when something is in use. Nothing the user already had is ever overwritten.
- **Limits** on files, storage, drafts and request rate, and the same file checks as the browser, plus checking what each file really is.

**Non-goals**

- An AI GM, or any tool that gives an AI a GM seat. Rooms are still run by a person.
- OAuth sign-in for connectors, in this change. See design D2. It is the planned next step if we list the connector publicly.
- User-defined game presets. A game sheet can't add a new game to the app, because presets are code (ADR 0027).
- New token fields such as saves, skills, speed, spells or inventory. These would change existing schemas and need their own ADR.
- The AI drawing walls, fog or terrain from a picture.
- A way to send a file to a chat app and have it reach us. MCP has no standard for this, so the browser drop is the path.
- Session Zero reading PDFs or calling a model.

## Capabilities

### New Capabilities

- `game-build-access`: starting a build, the build pass, exactly what it may and may not do, and how it ends.
- `game-build-files`: getting maps and art into a build, the checks on them, and the limits.
- `game-build-drafts`: what the AI can put in a draft through MCP, how values are flagged, and how text from the materials is treated.
- `game-build-review`: the build page, fixing, publishing, starting a room, handing out characters, removing what a build made, and clean-up.

### Modified Capabilities

- `encounter-templates`: adds a second way a template can be made, built by the server from a draft the user approved. Saving from a room is unchanged.

## Impact

- **`apps/server` must change.** Today there is no credential for an account except the cookie, a template can only be made from a live room, and nothing marks a draft. New: a `build` module with routes, a store on both memory and Postgres, one additive migration and an expiry sweep. Small edits to `app.ts`, the password-change and account-deletion paths, and `DetectionTarget` (server-only).
- **`packages/shared`:** new schemas only (`build.ts`). No existing schema changes: `Command`, `DomainEvent`, `RoomState`, `visibility.ts` and `EncounterTemplateData` stay as they are, so CLAUDE.md invariants 1 to 8 hold.
- **`apps/mcp`:** a new `/mcp/build` endpoint and its tools. It stays an ordinary client of the room server and stores nothing.
- **`apps/web`:** a build page, an entry in the library, and a way to copy the message for the AI.
- **ADR 0053 is required, with review by the Real-Time Architecture owner**, even though no existing schema changes. It adds a new kind of credential to ADR 0017's identity layers and an exception to ADR 0024 and ADR 0033's rule that the server builds templates only from live rooms. 0053 is the next free number on `origin/main` once `mcp-ai-players` takes 0052. Recheck before pushing.
- **Docs:** README gains FR-GM-26 and FR-GM-27. New guide `docs/AI-GAME-BUILDER.md`. The terms page gains one line on AI builds.
- **Deployment:** no new service or Caddy route beyond the `mcp-ai-players` ones, since `/mcp/*` already goes to the MCP service. Extra storage for drafts, bounded by the limits.
- **Cost:** a typical build is projected at about $0.75 of the user's own AI usage on Sonnet, part measured and part estimated. See design, "Cost".
