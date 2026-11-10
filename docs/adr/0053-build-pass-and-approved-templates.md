# ADR 0053 — Build passes and templates from an approved draft

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Extends:** ADR 0017 (accounts, in `openspec/changes/user-accounts/design.md`), [ADR 0024](0024-encounter-templates.md), [ADR 0033](0033-encounter-template-editor.md), [ADR 0052](0052-mcp-player-seats.md)
**Change:** `openspec/changes/mcp-game-builder` · **Requirements:** FR-GM-26, FR-GM-27

## Context

A GM can already have the rules, sheets and art for a game in a folder, and an AI app that can read them. The game builder lets that AI do the typing: creatures, maps and encounters go into a private draft, and the GM reviews and publishes them.

Two existing rules stand in the way:

- **The session cookie is the only account credential.** Nothing lets another program act for an account (ADR 0017).
- **The server builds every template from live room state, and no board crosses the API** (ADR 0024, ADR 0033). A draft encounter has no room.

A third rule was added to this ADR on 2026-11-10, when the user asked for the AI to set up maps as well:

- **Only a person sets a map's grid and walls.** A detected grid is a suggestion until someone saves it (KAN-09, ADR 0028). Walls come from a UVTT file, or from detection a GM applies in the map editor (ADR 0029, 0037). Doors and windows are set by hand, and a UVTT file's openings stay GM-only until someone makes them doors (ADR 0030, 0041).

No `Command`, `DomainEvent`, `RoomState`, `decide`, `reduce` or `visibility.ts` change is involved, and no existing schema in `packages/shared` changes. This ADR exists because both rules above are architecture, not schema.

## Decision

**A build pass is a new, separate credential.** Starting a build shows a random 256-bit value once, and the server stores only its hash, as ADR 0002 does for guest tokens. A build has at most one live pass. A pass ends after 24 hours, when a new one is made, when the user cancels it, when the build is discarded, when the account password changes, and when the account is deleted.

**A pass reaches one route family and nothing else.** `/api/build/*` has its own pass check. `resolveOwner`, `requireAccount` and the socket handshake are not changed and don't know passes exist, so every existing route treats a pass as no credential. That is enforcement by construction, rather than a check repeated on each route.

**What a pass may do:** read its own build, add files to it, see small copies of those files, and add, change or remove draft items the user hasn't edited.

**What a pass may not do:** read or change the library, read another build, list or enter rooms, hold a seat, publish, delete anything outside its draft, change the account, or make or extend a pass.

**Only the owner's browser publishes.** Publish routes need the session cookie and pass `requireSameOrigin`. No tool and no pass can do it. A person always looks before anything is usable.

**The server may build a template from a draft its owner approved.** At publish, the server assembles `EncounterTemplateData` itself from the draft and the library values at that moment. Tokens are stored by square and converted to board coordinates with the grid the user confirmed, so correcting a grid can't misplace them (invariant 8). Validation uses the unchanged shared schema, plus the checks `token.create` makes: on the map, not across a wall, HP at most Max HP. Owners and initiative are never set, and `imageUrl` comes only from published art.

This is the exception to ADR 0024 and ADR 0033. Those rules exist so that a forged board can't be stored. The client still sends no board: the server assembles one from fields it validated one by one, after the owner approved them. It affects only that owner's rooms, and applying the template re-validates it as for any other.

**The pass is a tool argument, on its own address.** The AI sends it on each tool call at `/mcp/build`, and the MCP server forwards it as a Bearer header, as ADR 0052 does for a seat. It is an argument because chat apps can't send custom headers on a no-sign-in connector. The build tools are kept off `/mcp`, so an AI reading strangers' chat at a table doesn't hold them. The MCP server stores nothing.

### AI-set grids and walls, by the user's choice

**Two choices per build, both off unless the owner ticks them:** letting the AI set grids, and letting it set walls, doors and windows. They are stored on the build and only the owner's cookie routes change them. A pass can read them and can't change them.

**A grid counts as confirmed without the user only when two methods agree.** With grids allowed, the AI's proposed grid is confirmed when grid detection suggested one and the two match: cell size within half a pixel, and each offset within one pixel, compared across the cell. Anything else waits for the user. The status is worked out each time it is read, so turning the choice off sends such grids back to waiting. KAN-09's rule that a person accepts the grid is met in advance by the person ticking the choice, and again at publish, from a page that draws the grid.

**With walls allowed, the AI changes only its draft map's setup.** It can set each imported UVTT opening as a door or window, open, closed or locked, or leave it for the user with a reason. It can draw walls, doors and windows as lines between grid corners, in half-square steps. It can also mark places it couldn't work out. Lines are stored in grid units and converted to board coordinates with the confirmed grid at publish, as tokens are (invariant 8). A drawn door cuts the wall under it with the UVTT importer's own overlap rule. The result is an ordinary `LibraryMapBoard`, validated with `libraryBoardProblem` like any other, and the map's encounters copy it as they copy a UVTT file's walls today.

**Nothing changes about who sees what.** The draft is never in a room. A published board reaches players only through the existing filters, where plain walls stay GM-only and players get the portals they can see (ADR 0030). The review page draws every wall, door and window, and only the owner's browser publishes.

## Alternatives rejected

- **Write straight to the library with an "AI made this" tag.** Unreviewed items would appear in the library, and every library query and delete rule would have to learn the tag.
- **Give the AI a GM seat in a temporary room.** A GM's view is unfiltered, which is why the MCP server refuses GM seats (ADR 0052).
- **Have the server drive a temporary room with commands.** This keeps ADR 0024's rule literally, but adds a large moving part and leaves half-built rooms behind on failure.
- **A pass per account.** A leaked pass would reach everything the account has. One per build means a user can hand one build to one AI without trusting it with anything else.
- **OAuth now.** It is the planned next step if a chat app refuses the pass or the connector is listed publicly, and it would replace only how the pass arrives. A model running `curl` from a local folder still needs something it can put in a command.
- **The user's password or cookie.** Never.
- **The AI's grid on its own.** A few pixels off drifts tokens and walls across a large map, and nothing would catch it before review.
- **The AI placing walls by pixel.** Models misjudge pixel positions. Reading a corner off a grid with numbered columns and rows is something they do well, and most battle maps put walls on grid lines. Curved walls are left for the user.
- **Server wall detection in builds.** It needs a room, holds one of 4 server-wide job slots, and runs the server-side model the user wanted to avoid. The user's AI already reads the materials, which say where the doors are.
- **Letting a build change maps already in the library.** Publishing stays add-only. A map published before this existed gets doors from a new build of the same files, or in the map editor.

## Consequences

- The pass sits in the AI app's conversation, and so on that vendor's servers, as a seat value already does. A leak exposes one draft for at most 24 hours, it can be cancelled with one click, and it can't publish. OpenAI's guidance says servers offering write actions should sign users in, so a public listing will probably need OAuth.
- A fooled model can put wrong values in one draft, which a person then reviews. It can't reach anything else, because no tool exists to do so.
- Account deletion (ADR 0050) has to list builds and their stored files, because it removes data by an explicit list with no cascades.
- A template can now come from two places. Anything that assumes a template began in a room must not assume that any more. Today nothing reads a template's origin.
- Draft art is public to anyone with its random address, as all uploads are today.
- With the walls choice on, a wrong wall can change what players see and where tokens can go. A person sees every wall before publishing, hard cases are marked for them, and the map editor can fix anything later.
- A grid confirmed by agreement is only as independent as the AI's check. An AI can copy detection's suggestion without looking. The guide tells it to check the picture first, and the review page marks such grids.

## Review

Sign-off is recorded here. Server work (group 3 of the change's tasks) waits for it. The section on AI-set grids and walls was added on 2026-11-10 and is part of the same review.

- Real-Time Architecture owner: not yet reviewed.
