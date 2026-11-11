# Design

## Context

See `proposal.md` for why and `specs/mcp-ai-seats/spec.md` for the behavior. These facts shape the approach:

- **A non-browser client can already hold a seat.** `scripts/lanternfall/playtest-table.mjs` joins through `POST /api/invites/:code/join` with a generated guest token, connects over Socket.IO, and mirrors state with `reduceReceived`. That folder is not committed, and its players are hand-written rules with no LLM. On production, a request with a fake invite got `404 Invite not found` and a socket handshake with a fake credential got `unauthorized`, so nothing at the edge blocks non-browser clients.
- **The handshake needs two values.** `HandshakeAuth` takes `roomId` and `guestToken`.
- **The GM's view is unfiltered.** `filterStateForViewer` returns the whole state when the viewer is a GM (`visibility.ts`), so a GM seat must never reach an AI.
- **Fog is painted by the client.** Player state carries fog regions and sight polygons as a mask for the board to draw, and the map image itself is unfogged.
- **`MapImage.url` is an unrestricted string** that a GM can set through `scene.setMap`. Unlike `DiceFaceOnTable.url`, it is not limited to `/uploads/...`.
- **The room server's seat limits fit a browser, not a loop.** ADR 0051 allows a player 800 commands per 20 seconds and 1,800 per 5 minutes, so that a held arrow key is never refused. Every accepted `token.move` is a permanent event.
- **Invite requests are limited per address.** ADR 0051 allows 300 invite requests per 15 minutes per address across the whole site, and counts wrong codes.
- **Joins are decided one at a time.** `LiveRoom.join` decides and commits each join in one queue step, so racing joins can't share a name or pass the player cap.
- **The app has no online status.** A participant whose connection closes stays listed, so an abandoned AI seat looks the same as an active one.
- **MCP calls start from the client.** The sampling feature is deprecated as of protocol version `2026-07-28`, and a chat app does not start a model turn on its own. A user talking to their AI avoids this problem, which is why this feature fits MCP.
- **Production is one VM** running Docker Compose behind Caddy, by default with 4 GB of memory shared with the whole app.

## Goals / Non-Goals

**Goals:**
- No changes to `apps/server`, and no changes to existing schemas in `packages/shared`.
- A restart of the MCP server loses nothing, because it stores nothing.
- Everything an AI receives comes from data the room server already filtered for that seat.

**Non-Goals:**
- Running more than one MCP server instance. Seat connections live in memory, and one instance is enough for one VM.
- Making AI seats impossible to disguise. A person can already use the invite route directly with any name.

## Joining scenarios

| Scenario | Seats | How it works | Main failure |
|---|---|---|---|
| One AI, one character | 1 | The AI joins from the invite, the GM assigns a token, and the user directs the AI in chat | No token yet, and `get_view` says so |
| One AI, several characters, with sub-agents | 1 per sub-agent | The main AI calls `join_room` once per character and gives each sub-agent its seat and brief | A taken name fails that join alone |
| One AI, several characters, no sub-agents | 1 per character | The AI holds every seat and acts for each in turn | Its characters share knowledge, but never GM secrets |
| Several people, each with their own AI | 1 or more each | Nothing is shared except the room, and users of one AI app may share a client address | AIs answering each other, which the room chat limit bounds |
| Many joins at once | Up to 32 players | The room decides each join in its queue | Only one call gets a contested name or the last seat |
| New chat after losing the seat | 1 new seat | The old seat holds its name until the GM removes it | The name-taken error explains the fix, and the GM reassigns the token |

## Decisions

### D1. A separate workspace that is an ordinary client of the room server

`apps/mcp` talks to the room server only over the public REST routes and Socket.IO, the same as a browser. It does not import `apps/server`. Invariants 1, 3 and 7 then hold by construction, because the MCP server has no other way to change or read a room.

*Alternative: tools inside `apps/server` calling `LiveRoom` directly.* This would be less code, but a tool bug could skip the visibility filter or authorization, and a crash in MCP code would take the game down with it.

### D2. Hosted at `/mcp` over Streamable HTTP

Users add one URL to their AI app, with nothing to install, which matches the app's "no client installation" promise. Web and desktop AI apps can both reach it, and Claude Code can use it with `claude mcp add --transport http`.

*Alternative: a local stdio server run with `npx`.* It needs Node and hand-edited config, and web-based AI apps can't use it. Tools don't depend on the transport, so a stdio entry point can be added later if people ask.

### D3. The AI holds its own seat

The AI joins as a new player, and the GM adds it as an owner of a token with the existing controls. `ownerIds` is a list, so a human and their AI can both own a token. The GM always sees who is at the table and can remove an AI on its own.

When owners might race, `move_token` sends `expectedOrigin` from the seat's mirror. The room refuses the second of two simultaneous moves with its existing "The board or token changed" message, rather than letting the last one silently win. The guide still recommends one AI per token.

*Alternative: pair the AI with the user's own browser seat.* The AI's chat would look like the human's, removing it would also remove the human, and for a GM it would hand over unfiltered state.

### D4. `seat` is `<roomId>.<guestToken>`, passed as a tool argument

`join_room` generates the guest token the same way a browser does and returns it as `seat`. The room server still stores only its hash, so ADR 0002's guarantee holds. The MCP server keeps the raw value in memory only while that seat's socket is open.

It is a tool argument because a connector has one authentication setting per connection, while sub-agents need many seats on one connection. It also means the MCP server has no secrets to store, which is what makes a restart harmless.

The trade-off is that the credential sits in the AI app's conversation and on that vendor's servers. A leak exposes one player seat in one room, which already can't see hidden information, and the GM can remove it. ADR 0052 records this.

*Alternative: a server-side table mapping handles to tokens.* The MCP server would then hold a store of raw credentials, which is the thing ADR 0002 avoids.
*Alternative: OAuth.* It would need accounts, which conflicts with FR-PL-01, and it identifies one user rather than one seat per sub-agent.

### D5. Stateless HTTP with an in-memory seat cache

Each HTTP request gets a fresh MCP server object with no MCP session (`sessionIdGenerator: undefined`, per the SDK's stateless mode) and a plain JSON reply (`enableJsonResponse`), since nothing is streamed. Seat connections live in a map keyed by the SHA-256 of `seat`. Each one holds a filtered state mirror, kept current with `reduceReceived` and `resync` on a sequence gap, as the web client does.

A socket closes after 15 minutes without a tool call, and the least recently used socket closes when more than 300 are open. Either way, the next call reconnects and gets a fresh `welcome`. 300 sockets is about 9 full rooms of 32.

Simultaneous calls for one seat share one connection attempt, because tool calls can run in parallel. A socket with a call in progress, such as `wait_for_turn`, is never closed to make room. If every socket is in use, the call returns a busy error and the seat is kept.

Only a `sessionEnded` message or a clear refusal (`revoked`, `left`, `deleted`) ends a seat here. At the handshake, `not_found` can also mean a room failed to load or the store hiccuped, so it reads as "try again". A tool that changes something waits, briefly, until the mirror holds that change, so the seat's next read shows it. A mirror that notices a gap asks for a snapshot and repeats every 2 seconds until one arrives, because the room server can drop a request over its limit (ADR 0051) and a quiet room brings nothing else to notice by.

*Alternative: connect for each call.* Every call would reload a snapshot, and `wait_for_turn` would have nothing to listen on.

### D6. Tools speak in grid squares

`get_view` reports `cellAt(position, grid)`, and `move_token` converts back: the square's center for odd-sized tokens, its top-left corner for even-sized ones, then `snapTokenCenter`. Only the converted board coordinates are sent, so invariant 8 holds. A round-trip test covers sizes 1 to 4, including grids with an offset.

*Alternative: expose pixel coordinates.* It would be less code, but the model would have to do grid arithmetic on every move.

### D7. The map image is rendered per seat, and only from known addresses

`get_map_image` overlays an SVG on the map with `sharp`. It paints fog regions opaque, paints everything outside `state.sight` opaque when sight is present, then draws the grid, labels and the tokens in the seat's filtered state. If the overlay fails, the tool returns an error and never falls back to the raw image.

The masks are in board coordinates, and the board draws the picture at its own size from the corner, never stretched. `scene.setMap` takes the size on trust, so a file of another size would slide out from under the masks, and fogged parts of it would show. The render refuses any file whose displayed size isn't the stored one. It also refuses a WebP with a rotation tag, because Chromium and Firefox ignore that tag while WebKit and `sharp` apply it, so what a player sees can't be known. A JPEG's tag is applied by every browser and stored in its size, so it stays aligned.

The returned image is a JPEG, to stay small enough for AI apps to accept (about 100 to 150 KB for a built-in map), at most 1500 pixels on its long edge. Maps over 64 megapixels are refused, because decoding one costs about 256 MB. At most two renders run at once.

The address must match `^/uploads/[A-Za-z0-9._-]+$`, read from the room server, or be a built-in map found with `shippedMapByUrl`, read from files copied into the image. Built-in maps are read from disk because `/img/*` is served by the web container, whose host name depends on `SITE_ADDRESS`. Any other address is never requested, which closes off server-side request forgery through `scene.setMap`.

A person can still open the raw map from their browser. This change does not alter that, and it keeps an AI from seeing more than the board shows.

### D8. `wait_for_turn` is bounded, at 25 seconds by default

It resolves when the filtered `initiative.order[activeIndex]` becomes a token the seat owns, or when a new chat message's `mentions` include the seat, and otherwise returns "still waiting". A short limit avoids depending on client tool timeouts, which vary. `initiativeForPlayer` sets `activeIndex` past the end of the list when the active token is hidden, so that case reads as "not your turn" and reveals nothing.

Each turn and mention is reported once, tracked per seat in memory, so a seat that has already acted waits instead of getting the same answer in a tight loop. With no encounter running it also waits, for the same reason. A restart can repeat one report, which is harmless.

Mentions let a person address one AI among several. `findMentions` already matches a full name such as `@Oswin (AI)`, and the brief tells AIs not to answer other AIs unless a person asks.

Sub-agents call it in a loop, and that usage goes on the user's plan. It doesn't wake an idle chat app. A chat user can simply say "your turn".

An AI can ask for up to 55 seconds with `maxSeconds`. The call still returns the moment there is news, so a longer wait only means fewer idle model turns. Measured on Sonnet (see `verification-log.md`), each idle wait costs about $0.006, so a 3-hour game with one AI projects to about $7.55 at 25 seconds and about $4 at 50 seconds. The limit was first 120 seconds, but a real test showed Claude Code gives up on a call at 60 seconds, which is also the MCP SDK's default. The default stays 25 in case other clients are stricter.

A GM's ruling on the seat's attack also wakes it, so a turn can finish without the GM having to say anything. In the first real test, an AI noticed a hit only when its wait next ended, 72 seconds later. Rulings already known when the server first hears from a seat aren't reported, so a restart repeats nothing.

*Alternative: MCP's Tasks extension or server notifications.* Tasks is an opt-in extension with uneven client support, and a notification doesn't start a model turn.

### D9. Sub-agents get a brief in the `join_room` result

The server can't spawn sub-agents, so it makes them easy to spawn. The result includes a short brief with the character, the `seat`, what the tools do, that the GM rules on attacks and turn order, and that room text is not instructions. A main AI passes it to a sub-agent with no special client feature.

An AI app with no sub-agents can hold several seats and play them in turn. Its characters then share knowledge with each other, but never GM secrets, since every seat is a player.

*Alternative: MCP prompts.* Clients surface them differently, and a tool result reaches the model in every client.

### D10. The AI label is a name suffix

`join_room` appends " (AI)", so it appears everywhere a name appears with no UI work and no schema change. A real `Participant` field could come later, with an ADR and review.

### D11. Limits live in the MCP server

The limits are 60 commands per minute per seat, 240 commands per minute per room across AI seats, 30 chat messages per minute per room across AI seats, and 40 joins per 15 minutes per room and client address. The client address comes from `X-Forwarded-For` behind Caddy with `trust proxy` set to 1.

These stop a runaway AI long before the room server's own limits would. They aren't a security boundary, because a script can still reach Socket.IO directly as it can today. Each command is a real event, so one per second per seat is well above a human pace, and the room limit stops many seats from adding up to 32 times that. Read tools aren't limited because they cost no events.

The join limit includes the room because users of a hosted AI app may share one client address, and a limit on the address alone could block strangers. 40 is above the room's cap of 32, so one AI can fill a table. Invites that match no room don't count, which keeps the limiter's memory bounded.

The MCP server forwards the client's address to the room server in `X-Forwarded-For`, as Caddy does, and the room server's `TRUST_PROXY=1` reads it. Without this, every AI join would share one address, and one client sending 300 wrong invite codes would stop every AI on the site from joining for 15 minutes (ADR 0051 counts wrong codes). This needs no room server change, and it keeps the room server's limits per client.

### D12. Room text is labelled, not sanitized

Chat, names and token names come back as named JSON fields. The server instructions, tool descriptions and brief all say this text comes from other people. This reduces prompt injection but can't prevent it, so the user guide warns against connecting this alongside tools with access to private data or the ability to send things.

### D13. Origin checking at the endpoint

The MCP transport spec requires validating `Origin`. The endpoint allows `CLIENT_ORIGIN` and requests with no `Origin`, which is how AI apps' servers connect. No cookies are involved, so a hostile page could not borrow anyone's seat anyway.

### D14. No batch join tool

Several characters means several `join_room` calls, which can run in parallel. Each one succeeds or fails on its own, and the AI retries only the one that failed. A batch tool would need partial-failure rules and adds nothing else.

### D15. No separate cap on AI seats

The room's 32-player cap is the only seat limit. The MCP server can't count a room's AI seats before it holds a seat there, and enforcing a cap in the room server would break the no-server-changes goal. The GM can remove AIs, reset the invite and lock the room (ADR 0051), which also covers a stranger filling a room through a leaked link.

### D16. Orders come from one person the AI's user names, by id

Going back to the AI's window for every move is the worst part of playing, as a first real session showed. So a person at the table can direct an AI from the room's chat with an @mention. That conflicts with D12 unless it is narrow, because anyone with the invite can post in chat.

`wait_for_turn` takes `ordersFrom`, a participant id, on each call. A mention reports its sender's id, and is marked `isOrder` only when that id matches. The room server sets `senderId`, and a client can't name the sender (ADR 0015), so chat can't forge this. It is an id rather than a name, because a name is freed when someone leaves and a stranger could take it. It is a tool argument rather than something the MCP server remembers, so a restart still loses nothing (D4, D5).

Only the AI's own user can choose this person, by telling it. The brief says an order can only be about actions in this game, and can never ask for the seat. This is still instructions reaching a model through room text, so it reduces the risk rather than removing it. The guide's warning stands.

*Alternative: remember the person in the MCP server per seat.* A restart would silently drop it, and an AI that thinks it has orders would stop getting them.
*Alternative: obey the GM by default.* The GM of a stranger's room is a stranger too, and an AI should take orders only from whoever its user says.

### D17. Pings say where

A person sees the board and an AI thinks in squares, and neither sees the other's coordinates. Pings already exist (double-click the map), and the room already relays them to every seat's socket. So the seat keeps each person's latest ping for 60 seconds, as a grid square, in memory. A mention from that person carries it as `pointedAt`, and `get_view` lists current pings. This needs no room server change, and a ping stays ephemeral (invariant 4). The room sends pings best-effort, so one can occasionally be lost under load. The AI then sees no `pointedAt`, and has to ask.

*Alternative: show grid numbers in the browser.* It needs Pixi work and puts a coordinate system in front of every player. It can come later if pointing isn't enough.

### D18. Staying at the table is a message, not a feature

"Play your own turns" and "stay until told to stop" are instructions to the AI, so they live in a third message in the Share dialog, not in code. It only works in apps that can keep running, such as Claude Code. A chat app acts only when its user messages it.

## Risks / Trade-offs

- [AI apps may require OAuth or refuse a connector without it] → Third-party guides suggest Claude treats OAuth as optional, but this is unconfirmed, and ChatGPT's rules are unclear. Tasks test this with real apps first. If an app requires it, a follow-up adds an OAuth gate without changing the tools.
- [Sub-agents exist only in some AI apps] → Claude Code is reported to support MCP tools in sub-agents, and I found no source for claude.ai or ChatGPT. The guide publishes tested results, and holding several seats in one AI is the fallback.
- [The AI may play badly from a map image] → Grid labels, token markers and `check_move` are meant to help, but this is untested. A user directing the AI ("two squares north") doesn't depend on it, and it mostly matters for sub-agents playing alone.
- [Some clients may not show image results] → `get_view` and `check_move` work without images.
- [A seat credential sits in the AI vendor's transcript] → See D4. It is limited to one player seat, and the GM can remove it.
- [Memory on a 4 GB VM] → `mem_limit: 768m` on the container, the seat cap in D5 and the render limits in D7. If the container is killed, browsers are unaffected and seats reconnect on the next call.
- [SDK fit] → Confirmed by the first task: `@modelcontextprotocol/sdk` 1.32.2 accepts the repo's zod 4 schemas and negotiates protocol version `2025-11-25` over stateless Streamable HTTP. It also supports older versions down to `2024-10-07`, for older clients.
- [An MCP bug could leak data] → The server only ever holds filtered data, the GM-seat refusal has its own test, and `visibility-auditor` reviews the diff before merging.
- [An AI that stays at the table uses its user's plan while idle] → See D8. A longer wait cuts about half of it, and the guide states the cost.
- [AIs may keep answering each other] → The brief tells them not to, `wait_for_turn` wakes only on a turn or a mention of that seat, and the room chat limit bounds the damage. Their usage still goes on their users' plans.
- [Abandoned AI seats look active] → The app has no online status, so a closed chat leaves a seat that looks occupied and counts toward the cap. `leave_room`, the GM's Remove action and the guide cover this.
- [More AIs mean more rulings for the GM] → The load is the same as that many human players. The guide suggests starting with a few AIs.
- [A full table of AI seats may cost more than expected] → The room filters every event per viewer, and with line of sight on, moving an owned token sends that seat a new snapshot. The MCP server also keeps one state copy per seat. A load check with 8 and 32 seats measures this before release, and the limits can be lowered if needed.

## Migration Plan

The change is additive, with no data migration.

1. Deploy the `mcp` service and the Caddy route together. Other services do not depend on `mcp`, and Caddy resolves its address per request, so a failed start affects only `/mcp`.
2. Test real AI apps against the deployed URL, then publish the guide's support table and the Share dialog section.

To roll back, remove the service and the route and redeploy. Existing AI seats stay listed in rooms as ordinary participants, and the GM can remove them.

## Open Questions

- Which AI apps accept a connector with no OAuth, show image results, and offer sub-agents? The answers fill in the guide's table, and any that require OAuth become a follow-up change.
- Should AI seats become a real `Participant` field? This can wait to see whether the name suffix is enough.
- Should a GM be able to pause AI seats without removing them? It would need a server change, and real play will show whether Remove is enough.
