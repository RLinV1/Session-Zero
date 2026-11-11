# ADR 0052 — AI player seats over MCP

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Extends:** [ADR 0002](0002-transport-and-identity.md), [ADR 0006](0006-participant-lifecycle.md)
**Change:** `openspec/changes/mcp-ai-players` · **Requirements:** FR-PL-08, FR-PL-09

## Context

Finding enough people is often what stops a game from happening. Many users already pay for an AI app, so a GM and one friend could run a whole party by telling their AI what to do, with no model and no token fees on our side. MCP is how AI apps reach outside tools.

Three things needed a decision: where this code sits relative to the room server, what an AI is allowed to be at the table, and how a stateless tool call says which seat it is for. The last one touches ADR 0002, which promises that the server stores only the hash of a guest token.

## Decision

**An AI seat is an ordinary client.** A new service, `apps/mcp`, talks to the room server only through the public invite route and a Socket.IO connection per seat, the same as a browser. It does not import `apps/server`, and it has no access to `LiveRoom` or the store. Every action still goes `Command` → `decide` → events, and everything it holds came through `filterStateForViewer` and `filterEventForViewer` for that seat. Invariants 1, 3 and 7 hold by construction, because it has no other way to change or read a room. There are no room server changes and no schema changes. If the service stops, browser play is unaffected.

**Player seats only.** The service joins only through invites. If a seat value turns out to be a GM's, it closes the connection on `welcome`, before keeping the snapshot, and returns an error. A GM's state is unfiltered, so it must never reach an AI. An AI GM would need its own change and review.

**The seat is a tool argument.** `join_room` generates a guest token the way a browser does, and returns `seat`, which is `<roomId>.<guestToken>`. Every other tool requires it. The room server still stores only the hash, so ADR 0002's guarantee holds. The service keeps the raw value in memory only while that seat's socket is open, and keys its cache by the SHA-256 of the value. It never writes the value to disk or to its logs.

It is an argument because a connector has one authentication setting per connection, while sub-agents need many seats on one connection. It also means the service stores no secrets, so a restart loses nothing: the next call reconnects and gets a fresh snapshot.

**Fog applies to the map image.** Fog is painted by each browser over the raw picture, so `get_map_image` paints the fog and sight masks itself, in one pipeline with the picture, and never exposes the address. It reads a map only from `/uploads/<key>` on the room server or the built-in maps on disk, because `MapImage.url` is an unrestricted string a GM can set.

**The service forwards the client's address.** It sends `X-Forwarded-For` to the room server, which reads it with its existing `TRUST_PROXY=1`, so ADR 0051's per-address limits stay per client. Otherwise every AI would share one address, and one client's wrong invite codes could stop every AI on the site from joining.

**Its own limits, far below ADR 0051's.** 60 commands per minute per seat, 240 per room, 30 AI chat messages per room, and 40 joins per 15 minutes per room and address. These stop a runaway AI. They aren't a security boundary, since a script can reach Socket.IO directly, where ADR 0051's limits apply. Browser players are never counted.

**Orders come from one person the AI's user names, by id.** Going back to the AI's window for every move is the worst part of playing. So `wait_for_turn` takes `ordersFrom`, a participant id, and marks mentions from that id `isOrder`. The room server sets `senderId` and a client can't name the sender (ADR 0015), so chat can't forge this. It is an id because a departed person's name can be taken by a stranger, and an argument so that a restart still loses nothing. Pings already reach every seat, so a seat keeps each person's latest ping for 60 seconds in memory, and a mention carries it as `pointedAt`. Both are read-only on the room: nothing new is sent to or stored by the room server, and invariant 4 holds.

**AI seats are labelled by name.** `join_room` appends " (AI)", so the label appears everywhere a name does, with no schema change.

## Alternatives rejected

- **Tools inside `apps/server`, calling `LiveRoom`.** Less code, but a tool bug could skip the visibility filter or authorization, and a crash in MCP code would take the game down with it.
- **A server-side table mapping handles to guest tokens.** The service would then hold a store of raw credentials, which is what ADR 0002 avoids.
- **OAuth or Session Zero sign-in.** It would need accounts, which conflicts with FR-PL-01, and it identifies one user rather than one seat per sub-agent.
- **Acting through the user's own browser seat.** The AI's chat would look like the human's, removing it would remove the human too, and for a GM it would hand over unfiltered state.
- **A `Participant.isAi` field.** It needs a schema change, and the name label covers the need for now.

## Consequences

- The seat value sits in the AI app's conversation, and so on that vendor's servers. A leak exposes one player seat in one room, which already can't see hidden information, and the GM can remove it.
- A person can name themselves "Oswin (AI)", and an AI's user could join through the browser route with any name. The label is a courtesy, not proof.
- Text from the room reaches a model. It is returned only as labelled fields and described as other people's words, which reduces prompt injection but can't prevent it. Orders are a deliberate exception to that, narrowed to one person the AI's user names and to actions in this game.
- An AI that stays at the table uses its user's AI plan while idle. Measured on Sonnet, each idle wait costs about $0.006. A wait of up to 55 seconds cuts about half of that, and ends the moment there is news. Longer isn't possible in Claude Code, which gives up on a call at 60 seconds. The guide warns against connecting this alongside tools that can reach private data.
- The app has no online status, so an abandoned AI seat looks occupied and holds a place until `leave_room` or the GM's Remove.
- Seat connections and the limiter counts live in one process's memory, so the service runs as one instance. That fits one VM.
