# Tasks

The user answered the five review questions on 2026-11-08, and the answers are in `design.md`. **The user chose on 2026-11-09 not to wait for `mcp-ai-players` to land.** This work is on `feat/mcp-game-builder`, which holds a copy of that uncommitted work as its own commit. This branch can't merge until `mcp-ai-players` has.

## 1. Groundwork

- [x] 1.1 Copy the `mcp-ai-players` work onto this branch, merge `origin/main`, and check that `apps/mcp` builds and its tests pass
- [ ] 1.2 Check the next free ADR number on `origin/main`, write ADR 0053 (new pass credential, the exception to ADR 0024 and 0033) and get the Real-Time Architecture owner's review before group 3. Verify by the owner's sign-off recorded in the ADR
- [ ] 1.3 Test the riskiest assumption first: put a stub tool at `/mcp/build` and try it from Claude Code, the Claude app and ChatGPT. Record in the verification log whether each connects with no sign-in and passes the `pass` argument. If a chat app refuses, stop and bring it back to the user

## 2. Shared contract

- [x] 2.1 Add `packages/shared/src/build.ts` (pass, profile, draft creature, draft map, draft encounter, flags, limits), reusing `CreatureFields`, `AttackPreset` and `GridSpec`. Verify with unit tests named for FR-GM-26, including a d3, a Max HP over the limit and over-long text
- [x] 2.2 Add a pure function that turns a draft encounter into `EncounterTemplateData`, converting squares to board coordinates, and refusing off-map squares and footprints across walls. Verify with unit tests at sizes 1 to 4, on offset grids, and after a grid correction

## 3. Build store and pass

- [ ] 3.1 Add the additive migration and `BuildStore` with memory and Postgres versions. Verify with the same store tests against both
- [ ] 3.2 Add the signed-in routes to start, list and read a build, and make and cancel a pass. Verify with integration tests: 401 signed out, 404 for another user, limit of 3 open builds, pass shown once and stored as a hash
- [ ] 3.3 Add the pass check for `/api/build/*`, with per-pass and per-address limits. Verify with tests that every existing library, room and account route and the socket treat a pass as no credential, and that expired or cancelled passes are refused
- [ ] 3.4 End passes on password change, and add builds and their stored files to account deletion (ADR 0050). Verify with integration tests

## 4. Files

- [ ] 4.1 Add pass and browser upload routes reusing `imageUploader`, `receiveUvtt` and the shared upload budget, with a real check of each file's contents. Verify with tests for a PDF, an SVG named `.png`, oversize, a false size, a bad UVTT and each build limit
- [ ] 4.2 Add the `build` scope to `DetectionTarget` and queue detection on upload. Verify the result can be read for a draft map, with a stand-in detector
- [ ] 4.3 Add the small-copy route for `view_file`. Verify it returns only this build's files and is no more than 1500 pixels on a side

## 5. Drafts and MCP tools

- [ ] 5.1 Add the draft item routes (save by key, remove, check), including "the user edited this" and "already published" refusals. Verify with integration tests
- [ ] 5.2 Add `/mcp/build` and the 8 tools, forwarding the client address and scrubbing `pass` from logs. Verify over real HTTP with the MCP SDK's client, including that a seat is refused and that `/mcp` doesn't list these tools
- [ ] 5.3 Write the field guide returned by `get_build`, including the size table, what is optional and what has no field, and whose build it is. Verify a test reads it from the tool result

## 6. Review and publish

- [ ] 6.1 Add the publish route, cookie and same-origin only, one transaction, adds only, with name clashes numbered and encounter dependencies included. Verify with integration tests on both stores, including failure on the last item and the 50-template limit, and a test that a pass is refused
- [ ] 6.2 Add discard, remove-what-was-published and the 14-day sweep. Verify that existing library items are never touched, that items already deleted are skipped and that rooms are not deleted
- [ ] 6.3 Build the build page: drop zone, flags first, editing, grid overlay and confirm, select and publish, start a room, copy notes, cancel pass, rights notice. Verify with component tests, then in a browser at desktop and phone width
- [ ] 6.4 Add the library entry and the message to copy to the AI. Verify the copied message holds the right address and pass

## 7. Docs

- [ ] 7.1 Add FR-GM-26 and FR-GM-27 to the README, the service and routes to `CLAUDE.md` and `docs/DESIGN.md`, and the terms line. Verify with a repo search for the new IDs
- [ ] 7.2 Write `docs/AI-GAME-BUILDER.md`: connecting, the path for each AI app, what can't be stored, `poppler` for PDFs, not connecting beside private tools, cost and limits. Verify by following it from a fresh account

## 8. Whole-feature checks

- [ ] 8.1 Run `visibility-auditor` and `sync-reviewer` on the diff and fix their findings, each with a test that failed first
- [ ] 8.2 Break the important protections one at a time and confirm a test fails each time: pass scope, publish refused for a pass, file content check, user-edit refusal, adds-only publish, ownership of drafts
- [ ] 8.3 Run a real build from a local folder with Claude Code and measure it as `mcp-ai-players` did. Replace the projection in `design.md` with the measured number
- [ ] 8.4 Run a real build from the Claude app and ChatGPT using the browser drop, and fill in the guide's support table from the results
- [ ] 8.5 Start a room from a published build with a browser player and an AI player, and confirm hidden tokens are withheld from both
- [ ] 8.6 Plant instructions in the materials for a real AI, and confirm nothing outside the draft changes
- [ ] 8.7 Check the production stack in Docker under its own project name with real Postgres and object storage, and leave the dev containers alone
- [ ] 8.8 Run `npm run lint && npm run typecheck && npm test` and log the results

## Workflow follow-up

- Archive this change after review and merge.
- Possible later changes: OAuth at `/mcp/build`; ChatGPT's `openai/fileParams`; a "claim your character" link; a bulk "hand out characters" panel; an account-wide storage cap; user-defined presets.
