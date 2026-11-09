# Design

## Context

See `proposal.md` for why and the specs for the required behavior. These facts come from reading `origin/main` and the uncommitted `mcp-ai-players` work, and they shape the approach:

- **The MCP work isn't committed.** `apps/mcp`, ADR 0052 and the `/mcp` Caddy route exist only in the worktree `.claude/worktrees/mcp-ai-players`. This change builds on them, so that change must land first.
- **The MCP server has no accounts.** It holds player seats and stores nothing. ADR 0052 chose no OAuth, because joining a table needs no account (FR-PL-01). Building is different: it writes to someone's account.
- **The cookie is the only account credential.** `resolveOwner` and `requireAccount` take the session cookie (or a read-only legacy device token). Nothing lets another program act for an account.
- **A template can only come from a live room.** ADR 0024 and ADR 0033 say the server builds every template from room state and no board crosses the API.
- **Creating a room needs only the cookie.** `POST /api/rooms` takes an optional `templateId` and `preset`, and the caller's browser becomes the GM. So going live needs no GM seat for the AI.
- **A creature is small.** `CreatureFields`: name (60), size (up to 10 squares), HP, Max HP, AC, up to 8 attacks, the 12 conditions, colour, and one image.
- **An attack is one group of dice.** Count 1 to 20, sides 4, 6, 8, 10, 12, 20 or 100, modifier -99 to 99. No "1d12 + 1d6", no d2 or d3, no flat damage.
- **A preset is code.** `GAME_PRESETS` has one entry, Free Mode, and a room stores its id. There is no user-defined preset.
- **Grid detection only suggests.** The upload never sets a grid (KAN-09). Library uploads queue detection, and the GM saves the grid in the editor.
- **Wall detection needs a room.** Its routes require a room's GM credential and that room's current map, and only 4 jobs can run at once on the whole server. The library map editor reaches it through a temporary room.
- **UVTT is exact.** `POST /api/library/uvtt/imports` validates the file in a bounded worker and writes the image, grid and walls in one row.
- **Upload checks trust the browser.** `imageUploader` filters on the declared type. Only maps get their real size read. There is a shared budget of 300 uploads per 15 minutes per account, but no limit on how many assets an account holds.
- **What real AI apps support today:** see the table in D2.

## Goals / Non-Goals

**Goals:**
- The worst that a leaked pass or a hostile rulebook can do is put wrong data in one draft that a person then reviews.
- `Command`, `DomainEvent`, `RoomState`, `decide`, `reduce` and `visibility.ts` don't change. No AI ever holds a GM seat.
- Reuse what exists: the library, the map editor, UVTT import, grid detection, room creation, the file budget.
- The MCP server stays stateless: a restart loses nothing, and it stores no secrets.

**Non-Goals:** see the proposal. In addition, this runs as one instance like the rest of the app, so its limits stay in process memory.

## How it works

```
 GM's browser (signed in)             GM's AI app                    Session Zero
 ───────────────────────              ───────────                    ────────────
 Start a build ───────────────────────────────────────────────────▶  draft + pass
 Copy message ──────────▶  reads rules and sheets (in its own app)
 Drop art (any app)  ─────────────────────────────────────────────▶  draft files
                           curl art (if it has a shell) ──────────▶  draft files
                           save creatures, maps, encounters ──────▶  draft items
 Review, fix, confirm grids ──────────────────────────────────────▶  draft items
 Publish ─────────────────────────────────────────────────────────▶  library items
 Start room ──────────────────────────────────────────────────────▶  normal room
                                                                     (GM is the browser)
```

## Decisions

### D1. Everything goes into a private draft first

A **build** is a private draft on an account: files, a game profile, and draft creatures, maps and encounters. The AI writes only there. Nothing is in the library or usable in a room until the user publishes.

| Option | Verdict |
|---|---|
| **A draft, published by the user** | **Chosen.** Review comes first. A wrong or hostile build touches nothing the user has. |
| Write straight to the library with an "AI made this" tag | Unreviewed items appear in the library. Every library query and the delete rules must learn the tag. |
| Give the AI a GM seat in a temporary room | The GM's view is unfiltered, and the MCP server refuses GM seats for that reason. |
| Have the server drive a temporary room with commands | Keeps ADR 0024's rule literally, but adds a large moving part and leaves half-built rooms on failure. |

### D2. Sign-in: a build pass given as a tool argument

Starting a build shows a **build pass**, a random 256-bit value shown once. The server stores only its hash (the same approach as ADR 0002). The AI passes it as an argument on each tool call, and the MCP server forwards it to the room server as a Bearer header.

**Why not something else:**

| Option | Claude Code | Claude app | ChatGPT | Work | Verdict |
|---|---|---|---|---|---|
| **Build pass, as a tool argument** | Yes | Should work with a "No sign-in" connector | Should work with a no-auth tool, in developer mode | Small | **Recommended for now** |
| Build pass as a request header | Yes | Beta, limited organizations only, set by an org Owner | Can't send custom keys | Small | Doesn't reach chat apps |
| OAuth 2.1 sign-in | Yes | Yes | Yes | Medium: the MCP SDK (1.32.2) has the protocol endpoints, but we'd write storage for clients, codes and tokens, a consent page, a way to tie a token to one build, and a list of connected apps | **Next step**, if a chat app refuses the pass or we list the connector publicly |
| The user's password or cookie | | | | | **Never** |

Sources: [Claude connector authentication](https://claude.com/docs/connectors/building/authentication), [Claude remote MCP](https://claude.com/docs/connectors/custom/remote-mcp), [OpenAI Apps SDK authentication](https://developers.openai.com/apps-sdk/build/auth). "Should work" means the documentation allows it. It has not been tested with the real apps, and the same test is still open for `mcp-ai-players` (its task 10.5).

**The trade-off, stated plainly.** The pass sits in the AI app's conversation, and so on that vendor's servers, as a seat value already does (ADR 0052). It is acceptable here because of what it can reach: one draft, for 24 hours, cancellable with one click. OpenAI's guide says servers offering write actions should sign users in, so a public listing will probably need OAuth. If OAuth is added, it replaces only how the pass reaches the server: the same limits apply behind it.

**Decided by the user on 2026-11-08: use the pass for now.** Task 1.3 tests it in the real apps first. OAuth comes next if a chat app refuses the pass or the connector is listed publicly.

**OAuth would not remove every code.** The AI app holds an OAuth token and the model never sees it, so a model running `curl` from a local folder couldn't use it to upload. That path would still need a short upload code, or the user would drop the files in the browser.

**Why it's a pass per build, not per account.** It keeps the damage small, and a user can hand one build to one AI without trusting it with anything else.

### D3. What a pass may and may not do

**May:** read its own build; upload files to it; see small copies of those files; add, change and remove draft items the user hasn't edited.

**May not:** read or change the library; read other builds; list or enter rooms; hold a seat; publish; delete anything outside its draft; change the account; make or extend a pass.

Enforcement is by construction, not by checks scattered around. Pass requests are handled only by one new route family, `/api/build/*`. `resolveOwner`, `requireAccount` and the socket handshake aren't changed and don't know passes exist, so every existing route treats a pass as no credential. The room's identity layers (ADR 0017) gain one small, separate layer beside them.

### D4. A separate address, `/mcp/build`

Build tools live at `/mcp/build`, in the same service.

- An AI playing at a table reads text from strangers. Keeping build tools off that connection means table chat can never reach them.
- If OAuth comes later, it can guard this address alone, and joining a table stays account-free (FR-PL-01).
- The player tools' cost per turn doesn't grow.

The cost is that a user adds a second connector. The Caddy route `/mcp/*` already covers it.

### D5. How files get there

Tool calls are JSON limited to 64 KB, and image data can't go through a model at any sensible cost. A 25 MB map is about 33 MB of base64, or millions of tokens, and the model has no way to copy it exactly. So files never pass through the model.

| AI app | Rules and sheets | Art and maps | Status |
|---|---|---|---|
| **Claude Code, or any app with a shell** | Reads local files | `curl -F file=@goblin.png` with the pass, one command per file or a loop | Expected to work. PDFs need `poppler` installed (see Cost) |
| **Claude app** | User attaches them to the chat | **User drops them on the build page** | Browser path works regardless. The connector is untested |
| **ChatGPT** | User attaches them to the chat | **User drops them on the build page** | Browser path works regardless. The connector is untested |
| **Any other MCP app** | However it reads files | **User drops them on the build page** | Browser path always works |

**What can't work, honestly:**
- A chat app has no standard way to send a chat attachment to an MCP server. [ChatGPT has its own `openai/fileParams`](https://developers.openai.com/apps-sdk/reference), which passes a download link. It only serves ChatGPT, and using it means our server fetching a link. Claude's connector docs describe nothing similar. It's a possible follow-up, not part of this plan.
- A chat app's code sandbox may not be able to reach our site. We don't rely on it.
- An AI can't "see" a dropped image by itself, so `view_file` returns a small copy when it needs to tell which picture is which. Filenames usually make this unnecessary.

**Why the pass and not one-time upload links.** A link adds a table and an expiry, and buys no safety: the pass can already upload up to the build's limits. The upload route takes the same pass and a normal multipart body, so it reuses `imageUploader` and `receiveUvtt`.

**The server fetches nothing.** No tool takes a web address, which closes off server-side request forgery.

### D6. Where the result lands and how it goes live

Publishing turns drafts into **ordinary library items**: map and token art (`library_assets`), creatures (`library_creatures`) and encounter templates (`encounter_templates`). Then "Start a room" uses `POST /api/rooms` with `templateId`, from the browser, so the browser is the GM. A room starts from one encounter, and the GM applies the others from the library as usual.

- **Only the browser publishes.** Publish routes need the cookie and pass `requireSameOrigin`. This is the promise that a person looks before anything is used. Decided by the user on 2026-11-08: a person always approves publishing, and no tool or pass can do it.
- **Publish is one transaction** and only adds. Files don't move: the new library row points at the object already stored.
- **Publish can be partial and repeated.** Publishing an encounter brings along its map, creatures and art. This also solves maps that aren't ready: unselect that encounter, publish the rest, and come back.
- **The GM assigns characters.** Decided by the user on 2026-11-08: characters arrive with no owner, and the GM gives each one to a player with the existing **Controlled by** control. A "claim your character" link is a possible later change, and would need a schema change and an ADR.

### D7. Templates from an approved draft (needs ADR 0053)

The server builds `EncounterTemplateData` itself at publish time, from the draft and the current library values. Draft tokens are stored **by square** and converted to board coordinates then, using the grid the user confirmed, so correcting a grid can't misplace tokens (invariant 8). A token's square is the **top-left square it covers**, and its whole footprint must be on the map. This differs from the player tools, where a square is the one at the token's center, because the two connectors are separate and the top-left is what a person placing a large creature on a map names. A token with no square is accepted in the draft but must be placed or removed before its encounter can be published, so nothing is dropped without the user seeing it. `imageUrl` comes only from the published art. Validation uses the unchanged shared schema, and the checks `token.create` makes (`footprintCrossesWall`, on-map, HP at most Max HP) are applied too. Owners and initiative are never set.

This is an exception to "the server builds every template from live room state". That rule exists so that a forged board can't be stored. Here the client still sends no board: the server assembles one from fields that were each validated, after its owner approved them. It only affects that owner's own rooms, and apply re-validates it as for any template.

### D8. Reading the materials

The AI reads them in its own app, on the user's plan. Session Zero never receives a rulebook and never calls a model.

**Sheet to field:**

| On a sheet | In the app | When it doesn't fit |
|---|---|---|
| Name | `name`, shown to players | Over 60 characters: flagged |
| HP, wounds | `maxHp`, and `hp` if different | Missing or vague: blank and flagged |
| AC, defence, guard | `ac` (0 to 99) | Several defence numbers: the game profile says which one is used |
| Size word | Squares: tiny, small, medium 1; large 2; huge 3; gargantuan 4, unless the game sheet says otherwise | Unknown word: flagged |
| Attack, one dice group | An attack, with to-hit and damage | Two dice groups, flat damage, d2 or d3: that roll is blank and flagged, and the text is kept |
| Save-based effect | An attack with damage only | The save and area are not carried over |
| More than 8 attacks | The first 8 that have rolls | The rest are not carried over |
| The 12 conditions | `conditions` | Others, such as bleeding: not carried over |
| Art | A file in the build | None: a colour disc |
| Class, level, abilities, skills, saves, speed, spells, gear, notes | **No field** | Not carried over |

Blank means blank: the server refuses nothing for being blank, the review page shows it, and the flag says why. A real test (see Cost) showed Sonnet and Haiku both leaving missing values blank and flagging them, on sample sheets with "HP ??", "around 14 maybe" and a planted instruction.

**Readings are different from missing values.** In that test both models also read "+5" as a d20 roll, and "Guard" as AC, though the sample rulebook never said so. That is a reasonable guess, and a guess all the same. So the game profile records the to-hit die, which number is the defence and which is HP. Where the game sheet doesn't say, the AI must flag that reading once in the profile, and the review page shows it first.

**The field guide lives in the tool result** (`get_build`), so the AI has the rules when it needs them. The test showed it must also give the size-word table and say colour is optional, or the AI flags those on every character.

**A game sheet is not a preset.** Presets are code, and the only one is Free Mode, which has every feature on. A game sheet becomes a small **game profile**: its name, which features it uses (so a game with no AC raises no flags for blank AC), what one square is worth, and notes for the GM. The room uses Free Mode.

**Copying characters to the table:** `not carried over` text stays on the build page, and the GM can copy it to a player. The app has no character-notes field, and adding one would change `Token`.

### D9. Maps

| Input | What happens | Grid status |
|---|---|---|
| **UVTT file** | Existing validator gives the image, grid, walls and doors | Confirmed, because the file is exact |
| **Plain image, grid detection works** | Existing detection runs on upload, via a third `DetectionTarget` scope (`build`). The AI can read the suggestion and propose it | Waiting for the user |
| **Plain image, user gives the size** | The AI proposes it | Waiting for the user |
| **Plain image, nothing known** | Flagged as needing a grid | No grid |

The build page draws the proposed grid over the map with number fields and a confirm control. Detection is shared by every user, so a build is limited to 20 maps. A correct grid can't be assumed: KAN-09 requires that a person accepts it.

**Walls.** A UVTT file brings them. For a plain image, this change runs no wall detection: it needs a room, holds one of only 4 server-wide job slots, and a build could take them all. After publishing, the GM uses wall detection in the existing map editor. The AI can't draw walls: a model's sense of pixel positions isn't good enough, and a wrong wall changes what players can see.

### D10. Safety

**Hostile text in the materials.** A PDF can say "ignore your instructions." We can't stop a model being fooled, so the design limits what a fooled model can do: there is no tool that reads, deletes or publishes anything outside the draft. The worst case is wrong values in a draft, which a person reviews. Tool descriptions and results also say material text is data. In the test, both models ignored the planted instruction and reported it.

On top of that:
- An AI with a shell could be told to run other commands. The guide warns against broad shell permission and against connecting this next to tools holding private data, like the player guide.
- Draft text is plain text only, with length limits. No draft field is rendered as HTML, markdown or a link.
- **Wrong-account trick:** someone sends a victim a message containing the attacker's pass, so the victim's AI uploads into the attacker's build. `get_build` names the account, and the tool description tells the AI to say whose build it is before uploading.

**Uploads.** The same types and sizes as the browser, plus reading what the file really is from its bytes with `sharp`, which is stricter than today's filter. Real image size is read for every file, not only maps.

**Not overwriting or deleting.**
- The AI can only write draft items in its own build.
- If the user edited an item, the AI's save is refused.
- Publishing only adds, and a name clash gets a number.
- Discarding deletes only draft items and unpublished files.

**Removing what a build made.** Each published item records its library id. "Remove" goes through the same delete and usage warning as the library. Rooms are never deleted, and a room using a removed image shows the usual stand-in (ADR 0004).

**Limits:**

| What | Limit |
|---|---|
| Open builds per account | 3 |
| Pass lifetime | 24 hours |
| Files per build | 100, of which 20 maps |
| Storage per build | 500 MiB |
| One image / one UVTT | 25 MiB / 40 MiB, as the browser |
| Uploads per account | The existing shared budget of 300 per 15 minutes |
| Requests per pass | 120 per minute |
| Draft items | 200 creatures, 20 encounters, 500 tokens per encounter |
| Text | Flag 200, not-carried-over 2,000, game notes 8,000 characters |
| Abandoned build | Closed after 14 days without a change |

The user accepted these values on 2026-11-08. They are estimates, not measurements. These limits are in the room server, so a script can't skip them. There is no account-wide cap on published library items today; this change doesn't add one, and it's listed as a follow-up.

**Copyright.** The rulebook goes only to the user's own AI app, under that app's terms. We refuse PDFs and store no passages: flags may name a page but not quote it, and the text limits stop a book being pasted into notes. Art and maps follow the existing terms ("Upload only what you have the right to use"), repeated when starting a build and publishing. Rooms share art with the people at the table, and game text and art are usually protected even when the rules themselves may not be. Decided by the user on 2026-11-08: this is a notice on the page, with no required tick box. This is not legal advice, and the team should agree on the wording.

### D11. MCP tools

Eight tools at `/mcp/build`, each taking `pass`:

| Tool | Purpose |
|---|---|
| `get_build` | Whose build, field guide, files, drafts, limits, the upload command |
| `view_file` | A small copy of one of its files |
| `save_game_profile` | Game name, features, square size, notes |
| `save_creatures` | Up to 20 per call; each succeeds or fails alone; upsert by key |
| `save_map` | Turn an uploaded file into a draft map, optionally proposing a grid |
| `save_encounter` | Name, map, tokens by square with hidden stated |
| `remove_draft_item` | Removes an unedited draft item |
| `check_build` | Every problem and flag, in plain words |

Tools are named `save_*` and take a key so that a retry is harmless, as the `mcp-ai-players` tests showed AIs do retry. The inputs use camelCase, because that test also showed mixed naming wastes calls.

### D12. Data model

One additive migration. Stores come in pairs, so `BuildStore` gets memory and Postgres versions.

```
builds(id, owner_gm_id, name, status open|closed, game_profile jsonb,
       pass_hash unique null, pass_expires_at null, created_at, updated_at)
build_files(id, build_id, kind map|token, object_key, url, original_name, width, height,
            size_bytes, grid jsonb null, board jsonb null, ...upload analysis columns,
            published_asset_id null)
build_items(id, build_id, kind creature|map|encounter, key, data jsonb, flags jsonb,
            not_carried_over, edited_by_user, published_id null, updated_at,
            unique(build_id, kind, key))
```

`/uploads/<key>` is public to anyone with the random key, as for all uploads today. Draft file addresses appear only on the owner's build page, and `view_file` returns pictures, never addresses.

ADR 0050 removes account data with an explicit list and no cascades, so builds and their object keys must join that list.

## Cost

Using the method in `mcp-ai-players/verification-log.md`: real `claude -p` runs, with cost from the CLI's own `total_cost_usd`. The full record is in `verification-log.md`. **No building tools exist yet**, so the read-and-map part is measured, and the tool-call part is a projection from measured rates.

**Measured: reading a 30-page rulebook and 6 messy sheets, and mapping them to fields:**

| Model | Cost | Turns | Output tokens |
|---|---|---|---|
| Sonnet, rulebook as text | $0.36 | 13 | 8,595 |
| Haiku, rulebook as PDF | $0.03 | 18 | 19,855 |

The fitted rates from the earlier log (cached read $0.10, cache write $4 and output $10 per million) reproduce the Sonnet run exactly. Haiku's PDF read worked only because the test PDF wasn't compressed. **Sonnet couldn't read the PDF at all on this machine, because `pdftoppm` isn't installed**, so the guide must tell Claude Code users to install `poppler` or export text.

**Projected: a typical build** (30-page rules, 6 characters, 8 pieces of art, 2 maps, 2 encounters), about 12 more turns:

| Part | Sonnet |
|---|---|
| Read and map (measured) | $0.36 |
| A cold start, since the test reused a warm cache | $0.15 |
| 12 tool turns at about 95,000 tokens cached | $0.11 |
| Tool schemas and results | $0.04 |
| Two map images and small art previews, at 3,200 tokens per map (measured earlier) | $0.03 |
| Upload commands, map and encounter inputs | $0.03 |
| **Total** | **about $0.75** |

On Haiku, about $0.10, going by the 10-to-1 ratio measured earlier. Quality is less sure: Haiku tried to store a d3, which the server would refuse and cost a retry.

A 200-page rulebook would come to about $2 on Sonnet, mostly from re-reading it each turn. The guide should suggest giving the AI only the pages it needs. Dollars are what the same use costs on the API, and on a subscription it counts toward usage limits. A real measurement with the finished tools is a task.

## What changes where

| Area | Change | ADR or review? |
|---|---|---|
| `apps/mcp` | New `/mcp/build`, 8 tools, `view_file` image work | Covered by 0053 |
| `apps/server` | **Must change.** New `build/` routes and store, migration, sweep, `DetectionTarget` scope, pass ended on password change, builds in account deletion | 0053 |
| `packages/shared` | New `build.ts` only | No existing schema changes |
| `apps/web` | Build page, library entry, copy message | |
| `Command`, `DomainEvent`, `RoomState`, `decide`, `reduce`, `visibility.ts` | **None** | |
| Existing rule changed | ADR 0024 and 0033's "only from a live room" gains the exception in D7. ADR 0017 gains a new credential | **ADR 0053, reviewed by the Real-Time Architecture owner (Raymond)** |

ADR 0053 is the next free number: `origin/main` stops at 0051, and `mcp-ai-players` holds 0052. Recheck before pushing, because numbers have collided before.

## Risks / Trade-offs

- [The pass sits in the AI vendor's logs] → One draft, 24 hours, cancellable, can't publish. See D2.
- [Chat apps may refuse a no-sign-in connector] → Test the real apps first. If they do, OAuth moves up, and the tools don't change.
- [Models misread a sheet without any sign] → A number can look fine and be wrong. The review page puts values side by side for a person to check. This can't be fully removed.
- [Published names can spoil a surprise] → Token names reach players. The page marks which names are visible, and the AI must state hidden or not for every token.
- [Draft art is public to anyone with its random address] → Same as all uploads today.
- [The browser drop adds a manual step for chat users] → Accepted: it's the one path that works for every app.
- [Storage growth] → Build limits, plus the 14-day close. Published items are not capped today.
- [Grid detection load] → 20 maps per build. It's shared by everyone, so a large build can slow others briefly.
- [One model tested] → Only Claude models were run, on made-up materials. Real rulebooks and other AI apps are untested.

## Migration Plan

1. `mcp-ai-players` merges first.
2. Additive migration: the old code ignores the new tables.
3. Server, then web and MCP, in one deploy, as usual.
4. Test with real AI apps before writing the support table in the guide.

To roll back: remove the routes and `/mcp/build`. Published items are ordinary library items and keep working. Draft files would remain in storage until the migration's tables are cleaned up.

## Open Questions

These can be answered later without changing the design:

- Do the Claude app and ChatGPT accept the `/mcp/build` connector with no sign-in, and pass the argument through? (Task in group 8.)
- Is `openai/fileParams` worth a ChatGPT-only path later?
- Should there be an account-wide cap on library storage? This is an existing gap, wider than this change.
