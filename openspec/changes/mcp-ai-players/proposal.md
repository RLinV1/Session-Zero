## Why

A table needs a GM and several players, and finding enough people is often what stops a game from happening. Many users already have an AI app such as Claude or ChatGPT. If that AI can sit at the table, a GM and one friend can run a full party by telling their AI what to do in plain language. Session Zero never calls a model, so there are no token fees or API keys on our side.

## What Changes

- **New MCP server (`apps/mcp`), hosted on the app's own origin at `/mcp`.** A user adds `https://sessionzero.codes/mcp` to their AI app as a connector, with nothing to install and no Session Zero account, matching FR-PL-01.
- **Talk to your AI to play.** Given an invite link, the AI joins the room as a player. "Move Oswin two squares north" becomes a `move_token` call. The tools are `join_room`, `get_view`, `get_map_image`, `move_token`, `check_move`, `roll_dice`, `roll_attack`, `set_door`, `send_chat`, `wait_for_turn` and `leave_room`. Tools speak in grid squares, and the server converts them to board coordinates.
- **Sub-agents, one per character.** Sub-agents are created by the user's AI app, not by this server. The server gives them what they need: the AI joins once per character, every tool takes that character's `seat`, each seat sees only its own view, and `join_room` returns a brief the AI can hand to a sub-agent. `wait_for_turn` lets a sub-agent wait for its turn or an @mention without the user prompting it.
- **Direct it from the table.** A person the AI's user names can give it orders from the room's chat with an @mention, and can double-click the map to show where. `wait_for_turn` can wait up to 55 seconds per call, which cuts about half the cost of idle waiting, and it also wakes on the GM's ruling. A third Share dialog message tells an AI to stay at the table and play its own turns.
- **One AI or many.** The plan covers one AI playing one character, one AI playing several characters with or without sub-agents, several people each bringing their own AI from any AI app, simultaneous joins, and returning in a new chat after losing a seat. AI seats count toward the 32-player cap, and the GM can remove one to make room.
- **An AI seat is an ordinary client.** The MCP server uses the same invite route and Socket.IO connection as a browser, and has no access to `LiveRoom` or the store. Every action still goes `Command` → `decide` → events, and every view is still filtered by the server. The GM gives an AI seat a token with the existing owner controls, and can remove it with the existing Remove action.
- **Player seats only.** The MCP server joins only through invites, and refuses to connect if given a GM's credential, so the GM's unfiltered state can't reach an AI.
- **AI seats are labelled.** Their display name ends in " (AI)", so the table can see who is an AI without a schema change.
- **Fog applies to the map image.** A player's browser paints fog over the raw map image, so sending that image would show an AI what fog hides. `get_map_image` paints the same fog and line-of-sight mask before it returns anything, and never exposes the raw URL.
- **Guards for looping and chatty AIs.** The MCP server limits commands per seat and per room, and AI chat per room, because the room server's own limits (ADR 0051) are set high enough for a held arrow key, every accepted move is a permanent event, and AIs answering each other are a likely failure once several share a table. Text from the room is marked as other people's words, not instructions.
- **Share dialog and guide.** The Share dialog gains a "Play with your AI" section with the connector URL and messages to copy for one character or a party. A new guide lists which AI apps were tested and whether each supports sub-agents.

**Non-goals**

- An AI GM, or an AI that assists the GM by moving monsters, in this change. Rulings, damage and turn order stay with a human GM, so this change does not make solo play possible. An AI GM is planned as a later change, `mcp-ai-gm`, which needs server changes and its own review and reuses this change's seat connection.
- An AI that acts through the user's own browser seat.
- A separate cap on AI seats, or a GM control to pause AIs. The GM can remove an AI, reset the invite or lock the room.
- A built-in AI that plays with nobody prompting it. That would put a model on our bill.
- Area templates and group saves. These stay browser-only in this version.
- Spawning sub-agents from the server. MCP has no way to do this, and its sampling feature is deprecated as of protocol version `2026-07-28`.
- OAuth or Session Zero sign-in for connectors, unless real-client testing shows a major AI app requires it (see design, Open Questions).

## Capabilities

### New Capabilities
- `mcp-ai-seats`: connecting a user's own AI app to a room through MCP. Covers joining and leaving with one AI or many, what a seat can see and do, one isolated seat per sub-agent, the fog-safe map image, per-seat and per-room limits, labelling, and how room text is presented to the AI.

### Modified Capabilities
None. `room-access`, `room-participants` and `leave-table` apply to AI seats as they are written: the invite, unique name, revoke, leave and departure review rules don't change.

## Impact

- **New workspace `apps/mcp` (`@vtt/mcp`):** depends on `@vtt/shared`, `@modelcontextprotocol/sdk`, `socket.io-client`, `express`, `sharp` and `zod`.
- **packages/shared:** no schema changes. The MCP server reuses `reduceReceived`, `ClientMessage`, `HandshakeAuth`, `cellAt` and `snapTokenCenter`.
- **apps/server:** no changes. The new client uses the existing routes and socket protocol.
- **apps/web:** `ShareButton` gains the "Play with your AI" section.
- **Deployment:** a new `mcp` service in `docker-compose.prod.yml`, a new `Dockerfile.mcp`, a `/mcp` route in `deploy/Caddyfile`, an image build in CI, and `apps/mcp/package.json` copied into the existing Dockerfiles because `npm ci` reads every workspace manifest. If the service is down, only `/mcp` fails and browser play is unaffected.
- **Docs:** ADR 0052 records the seat-token decision and needs review by the Real-Time Architecture owner because it touches guest identity (ADR 0002). README gains FR-PL-08 and FR-PL-09. `CLAUDE.md`, `docs/DESIGN.md` and `docs/DEPLOYMENT.md` gain the new service, and `docs/AI-PLAYERS.md` is the new user guide.
- **Cost:** one small always-on container on the existing VM. Users pay for their own AI app.
