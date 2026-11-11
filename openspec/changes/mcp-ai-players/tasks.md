# Tasks

## 1. Prove the path first

- [x] 1.1 Create the `apps/mcp` workspace (`@vtt/mcp`) with `package.json`, `tsconfig.json` and Vitest, adding `@vtt/shared`, `@modelcontextprotocol/sdk`, `socket.io-client`, `express`, `sharp` and `zod`. Verify `npm install`, `npm run typecheck` and `npm run lint` pass, and that the SDK accepts the repo's zod 4 schemas. Record the SDK version and negotiated protocol version in the design.
- [x] 1.2 Add a stateless Streamable HTTP endpoint at `/mcp` with `join_room` and a minimal `get_view`. Verify a real AI app can use it: connect Claude Code with `claude mcp add --transport http`, join a local room by asking in plain language, and record the steps in `verification-log.md`.
- [x] 1.3 Record the decisions in `docs/adr/0052-mcp-player-seats.md`, covering the ordinary-client boundary, player seats only and the seat token as a tool argument. Recheck the number against `origin/main` before pushing, and verify the file links ADR 0002 and names the Real-Time Architecture owner as reviewer.
- [x] 1.4 Add FR-PL-08 (connect your own AI) and FR-PL-09 (several AI seats at one table) to `README.md`, and add `apps/mcp` to the layout in `CLAUDE.md`. Verify both IDs are unused on `origin/main`.

## 2. Seat connection

- [x] 2.1 Implement the seat connection: parse `<roomId>.<guestToken>`, connect with `HandshakeAuth`, and mirror filtered state with `reduceReceived`, sending `resync` on a sequence gap. Verify with integration tests against `startServer` that a seat's mirror matches `filterStateForViewer` after a series of commands (FR-PL-08).
- [x] 2.2 Refuse GM seats: if `welcome.you.role` is not `player`, disconnect and return an error. Verify with a test that passes a GM's credential as `seat` and asserts the result contains no room data.
- [x] 2.3 Map ended seats to clear errors for `revoked`, `left`, `deleted` and `sessionEnded`. Verify each with a test, including that a revoked seat gets no data.
- [x] 2.4 Add the seat cache, keyed by the SHA-256 of `seat`, with a 15-minute idle close and a 300-socket cap. Share one connection attempt across simultaneous calls for a seat, never close a socket with a call in progress, and return a busy error when every socket is in use. Verify with tests that an idle seat and a restarted MCP server both reconnect as the same participant with no new participant added, that two simultaneous calls open one socket, and that a seat refused as busy works later as the same participant.

## 3. Reading the room

- [x] 3.1 Finish `join_room`: accept a link or code, append " (AI)" without doubling it, refuse names over 35 characters, and pass through not-found, name-taken, room-full and room-locked errors, with the name-taken error saying the GM can remove an old seat. Verify each spec scenario with a test (FR-PL-08).
- [x] 3.2 Finish `get_view`: grid, tokens by square, doors, turn order, the people at the table, recent chat and rolls, and the no-token hint, with no map URL. Verify with tests that a hidden token, a fogged token and an out-of-sight token never appear anywhere in the JSON, including the turn order, and that a token assigned after joining shows as the seat's own.
- [x] 3.3 Mark room text as other people's words in labelled fields, tool descriptions, server instructions and the brief. Verify with a test that a chat message containing instructions appears only as a chat entry and causes no command.

## 4. Acting at the table

- [x] 4.1 Add grid-square conversion, the inverse of `cellAt` followed by `snapTokenCenter`. Verify with a round-trip unit test for token sizes 1 to 4 on grids with offsets.
- [x] 4.2 Add `move_token` and `check_move`, returning the server's refusal text as tool errors, with `move_token` sending `expectedOrigin` from the seat's mirror. Verify with tests for own token, unowned token, wall in the way and off the map, that `check_move` appends no event, and that two owners moving one token at once leave one move refused.
- [x] 4.3 Add `roll_dice` and `roll_attack` with no hidden-roll or result input. Verify with tests that the server rolls, a to-hit roll is reported as pending the GM's ruling, a damage roll is reported as for the GM to apply, and attacking with an unowned token is refused.
- [x] 4.4 Add `set_door`, `send_chat` and `leave_room`. Verify with tests for a locked door, the room's chat limit, and that a left seat gets the ended-seat error while the GM's departure review lists its tokens.
- [x] 4.5 Add `wait_for_turn` with a 25-second limit, waking on the seat's turn or a new @mention and reporting each once. Verify with tests for a turn arriving mid-wait, a mention, a repeat call during the same turn, a timeout, no encounter (it waits rather than returning at once), and a hidden active token that is never named.

## 5. Joining scenarios

- [x] 5.1 Test one AI with one character from start to finish: join, see the no-token hint, get a token from the GM, move it, and leave. Verify the room's event log and the browser client's view match at each step (FR-PL-08).
- [x] 5.2 Return the brief from `join_room` and require `seat` on every other tool. Verify with a test that one connection holding two seats gets different views, and that one seat can't move a token owned only by the other (FR-PL-09).
- [x] 5.3 Test parallel joins from one AI: join two characters at once where one name is taken. Verify one call returns a seat, the other returns a name-taken error, and retrying with a new name succeeds (FR-PL-09).
- [x] 5.4 Test several people's AIs: use two separate MCP client connections in one room. Verify they get separate views, and that a seat used with the wrong room is refused (FR-PL-09).
- [x] 5.5 Test simultaneous joins from several connections. Verify that with one contested name exactly one call wins, that with one open seat exactly one call wins and the room stays at 32 players, and that a person can join after the GM removes an AI seat from a full room (FR-PL-09).
- [x] 5.6 Test returning in a new chat: rejoining with a held name is refused with the fix in the error, and after the GM removes the old seat the AI can rejoin and be given the token from the departure review. Verify with an integration test (FR-PL-08).
- [x] 5.7 Try sub-agents for real in Claude Code: have the main AI join two characters and start one sub-agent per seat, and confirm each acts from its own view. Record the result in `verification-log.md`, and if sub-agents can't reach the tools, record that and test the one-AI-several-seats fallback.
- [x] 5.8 Try two separate AI sessions in one local room: each joins, gets a token and moves it, and one @mentions the other's seat during `wait_for_turn`. Record each step in `verification-log.md`.

## 6. Map image

- [x] 6.1 Implement the address check: only `/uploads/<key>` from the room server, or a built-in map from disk. Verify with a test that a room whose map address is `http://169.254.169.254/...` gets "unavailable" and a local listener at that kind of address receives no request.
- [x] 6.2 Render `get_map_image`: paint fog opaque, paint outside sight opaque, draw grid labels and visible tokens, scale to 1500 pixels, allow two renders at once, and refuse maps over 64 megapixels. Verify by sampling pixels in tests that fogged and out-of-sight areas match the mask color rather than the map, that two seats with different sight get different images, and that a forced overlay failure returns an error rather than the raw image.
- [x] 6.3 Check the output by eye: render a fogged map with line of sight on and look at the image, confirming labels are readable and match squares from `get_view`. Record it in `verification-log.md`.

## 7. Guards

- [x] 7.1 Add the limits: 60 commands per minute per seat, 240 commands per minute per room, 30 AI chat messages per minute per room, and 40 joins per 15 minutes per room and client address. Verify with tests using an injected clock that a 61st seat command sends nothing and another seat is unaffected, that a 241st room command and a 31st room chat are refused while another room and a browser player are unaffected, that a 41st join adds no participant while the same address can join another room, and that 32 joins from one address to one room are all allowed. Forward the client's address to the room server, and verify that one address using up the room server's invite limit doesn't stop a join from another.
- [x] 7.2 Add `Origin` checking and a 64 KB body limit at `/mcp`. Verify with tests for a disallowed origin (403), no origin (handled) and an oversized body (refused).
- [x] 7.3 Keep `seat` values and guest tokens out of logs, including errors. Verify with a test that captures log output across a join, several calls and a failed call and finds no `seat` value or guest token.

## 8. Share dialog and guide

- [x] 8.1 Add the "Play with your AI" section to `ShareButton` with the connector URL and two copyable messages containing the invite link, one for a single character and one for a party. Verify with a component test that both messages update after an invite reset, and check the dialog in the browser at desktop and phone width.
- [x] 8.2 Write `docs/AI-PLAYERS.md`: connecting, giving the AI a token, talking to it, playing with one AI or several, using sub-agents, addressing one AI with an @mention, returning in a new chat, what the AI can't do, and the warning about connecting it alongside tools that can reach private data. Verify by following it from a clean AI app session against the local stack.

## 9. Deployment

- [x] 9.1 Add `Dockerfile.mcp` with DejaVu fonts for the labels and the built-in maps copied in, and copy `apps/mcp/package.json` into `Dockerfile.server` and `Dockerfile.web`. Verify all three images build, and add the new image to the CI build job.
- [x] 9.2 Add the `mcp` service with `mem_limit: 768m` to `docker-compose.prod.yml`, and a `/mcp` route with streaming flush to `deploy/Caddyfile`. Verify with the production compose stack locally that `/mcp` responds and that stopping the service leaves browser play working.
- [x] 9.3 Update `docs/DESIGN.md` and `docs/DEPLOYMENT.md` with the new service. Verify the deployment steps match what 9.2 ran.

## 10. Integration checks

- [x] 10.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass.
- [x] 10.2 Run the `visibility-auditor` and `sync-reviewer` agents on the diff, then fix or record every finding in `verification-log.md`.
- [x] 10.3 Run a load check with 8 and 32 AI seats in one room with line of sight on and a large wall set. Measure command latency at p95 against a baseline with one browser client, plus the MCP server's memory, and record the numbers in `verification-log.md`. Lower the limits or the socket cap if the 768 MB memory limit is at risk.
- [x] 10.4 Play one real scene against the local stack with a human GM in a browser and an AI in Claude Code: assign a token, move it by talking, open a door, make an attack the GM rules on, and hide a token mid-scene to confirm the AI loses sight of it. Record each step in `verification-log.md`.
- [ ] 10.5 After deployment, test the Claude app and ChatGPT against the public URL for whether they connect with no OAuth, show image results and offer sub-agents. Record the answers in the `docs/AI-PLAYERS.md` support table, and propose a follow-up change for any app that requires OAuth.

## 11. Directing an AI from the table

- [x] 11.1 Add `maxSeconds` to `wait_for_turn`, up to 55, keeping 25 as the default, and wake on a GM's ruling on the seat's attack. Verify with tests that it waits that long, returns at once on news, refuses over 55, and reports a ruling once and only to that seat.
- [x] 11.2 Add `ordersFrom` to `wait_for_turn`, and `fromId` and `isOrder` to the mentions it reports, and add ids to the people in `get_view`. Verify with tests that only the named id's mentions are orders, that a stranger's text claiming to be from them is not, that a name or an unknown or departed id is refused, and that nothing is an order with nobody named.
- [x] 11.3 Keep each person's latest ping for 60 seconds on the seat's connection, as `pointedAt` on their mentions and in `get_view`. Verify with tests for the square, another person's ping, an expired ping, and that a ping adds no event.
- [x] 11.4 Update the brief, server instructions and tool descriptions, so an order can only be about actions in this game and never asks for the seat. Verify with a test on the brief, and a real AI refusing such an order.
- [x] 11.5 Add the stay-at-the-table message to the Share dialog, with the GM's name, and a guide section with the measured cost. Verify with component tests and in a browser at desktop and phone width.
- [x] 11.6 Test with a real AI and a GM in a browser, using real clicks: the AI waits with a 50-second limit, the GM points and sends an @mention, and the AI moves there with nobody going back to its window. Record the steps and the token use in `verification-log.md`.

## Workflow follow-up

- Deploying to production needs the team's go-ahead, and task 10.5 can't finish until then.
- Archive the change after review by the Real-Time Architecture owner.
- Plan the AI GM as a separate change, `mcp-ai-gm`, after this one lands.
