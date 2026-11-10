# Tasks

The user answered the five review questions on 2026-11-08, and the answers are in `design.md`. **The user chose on 2026-11-09 not to wait for `mcp-ai-players` to land.** This work is on `feat/mcp-game-builder`, which holds a copy of that uncommitted work as its own commit. This branch can't merge until `mcp-ai-players` has. **The user also chose on 2026-11-09 to start group 3 before the Real-Time Architecture owner's sign-off.** Task 1.2 stays open, and this branch must not merge until that review is done. If it changes the pass design, groups 3 to 5 will need rework. **On 2026-11-10 the user added AI-set grids and walls as per-build choices (group 9).** This reverses the earlier rule that the AI doesn't draw on maps, so ADR 0053 gains a section and task 1.2's review covers it.

## 1. Groundwork

- [x] 1.1 Copy the `mcp-ai-players` work onto this branch, merge `origin/main`, and check that `apps/mcp` builds and its tests pass
- [ ] 1.2 Check the next free ADR number on `origin/main`, write ADR 0053 (new pass credential, the exception to ADR 0024 and 0033, and AI-set grids and walls by choice) and get the Real-Time Architecture owner's review before group 3. Verify by the owner's sign-off recorded in the ADR
- [ ] 1.3 Test the riskiest assumption first: put a stub tool at `/mcp/build` and try it from Claude Code, the Claude app and ChatGPT. Record in the verification log whether each connects with no sign-in and passes the `pass` argument. If a chat app refuses, stop and bring it back to the user

## 2. Shared contract

- [x] 2.1 Add `packages/shared/src/build.ts` (pass, profile, draft creature, draft map, draft encounter, flags, limits), reusing `CreatureFields`, `AttackPreset` and `GridSpec`. Verify with unit tests named for FR-GM-26, including a d3, a Max HP over the limit and over-long text
- [x] 2.2 Add a pure function that turns a draft encounter into `EncounterTemplateData`, converting squares to board coordinates, and refusing off-map squares and footprints across walls. Verify with unit tests at sizes 1 to 4, on offset grids, and after a grid correction

## 3. Build store and pass

- [x] 3.1 Add the additive migration and `BuildStore` with memory and Postgres versions. Verify with the same store tests against both
- [x] 3.2 Add the signed-in routes to start, list and read a build, and make and cancel a pass. Verify with integration tests: 401 signed out, 404 for another user, limit of 3 open builds, pass shown once and stored as a hash
- [x] 3.3 Add the pass check for `/api/build/*`, with per-pass and per-address limits. Verify with tests that every existing library, room and account route and the socket treat a pass as no credential, and that expired or cancelled passes are refused
- [x] 3.4 End passes on password change, and add builds and their stored files to account deletion (ADR 0050). Verify with integration tests

## 4. Files

- [x] 4.1 Add pass and browser upload routes reusing `imageUploader`, `receiveUvtt` and the shared upload budget, with a real check of each file's contents. Verify with tests for a PDF, an SVG named `.png`, oversize, a false size, a bad UVTT and each build limit
- [x] 4.2 Add the `build` scope to `DetectionTarget` and queue detection on upload. Verify the result can be read for a draft map, with a stand-in detector
- [x] 4.3 Add the small-copy route for `view_file`. Verify it returns only this build's files and is no more than 1500 pixels on a side

## 5. Drafts and MCP tools

- [x] 5.1 Add the draft item routes (save by key, remove, check), including "the user edited this" and "already published" refusals. Verify with integration tests
- [x] 5.2 Add `/mcp/build` and the 8 tools, forwarding the client address and scrubbing `pass` from logs. Verify over real HTTP with the MCP SDK's client, including that a seat is refused and that `/mcp` doesn't list these tools
- [x] 5.3 Write the field guide returned by `get_build`, including the size table, what is optional and what has no field, and whose build it is. Verify a test reads it from the tool result

## 6. Review and publish

- [x] 6.1 Add the publish route, cookie and same-origin only, one transaction, adds only, with name clashes numbered and encounter dependencies included. Verify with integration tests on both stores, including failure on the last item and the 50-template limit, and a test that a pass is refused
- [x] 6.2 Add discard, remove-what-was-published and the 14-day sweep. Verify that existing library items are never touched, that items already deleted are skipped and that rooms are not deleted
- [x] 6.3 Build the build page: drop zone, flags first, editing, grid overlay and confirm, select and publish, start a room, copy notes, cancel pass, rights notice. Verify with component tests, then in a browser at desktop and phone width
- [x] 6.4 Add the library entry and the message to copy to the AI. Verify the copied message holds the right address and pass

## 7. Docs

- [x] 7.1 Add FR-GM-26 and FR-GM-27 to the README, the service and routes to `CLAUDE.md` and `docs/DESIGN.md`, and the terms line. Verify with a repo search for the new IDs
- [x] 7.2 Write `docs/AI-GAME-BUILDER.md`: connecting, the path for each AI app, what can't be stored, `poppler` for PDFs, not connecting beside private tools, cost and limits. Verify by following it from a fresh account

## 8. Whole-feature checks

- [x] 8.1 Run `visibility-auditor` and `sync-reviewer` on the diff and fix their findings, each with a test that failed first
- [x] 8.2 Break the important protections one at a time and confirm a test fails each time: pass scope, publish refused for a pass, file content check, user-edit refusal, adds-only publish, ownership of drafts
- [x] 8.3 Run a real build from a local folder with Claude Code and measure it as `mcp-ai-players` did. Replace the projection in `design.md` with the measured number
- [ ] 8.4 Run a real build from the Claude app and ChatGPT using the browser drop, and fill in the guide's support table from the results
- [x] 8.5 Start a room from a published build with a browser player and an AI player, and confirm hidden tokens are withheld from both
- [x] 8.6 Plant instructions in the materials for a real AI, and confirm nothing outside the draft changes
- [x] 8.7 Check the production stack in Docker under its own project name with real Postgres and object storage, and leave the dev containers alone
- [x] 8.8 Run `npm run lint && npm run typecheck && npm test` and log the results

## 9. AI-set grids and walls (by choice)

- [x] 9.1 Amend ADR 0053 with AI-set grids and walls by per-build choice, and why (KAN-09, ADR 0029, 0030, 0041). Verify that it's part of the review in 1.2
- [x] 9.2 In `build.ts`, add the choices and the draft map setup (openings, grid-corner lines, marks) with limits. Add the grid agreement check, and a pure function that turns a map's setup into a `LibraryMapBoard` with the confirmed grid, cutting walls under doors. Verify with unit tests for FR-GM-26: half steps, off-map corners, a corrected grid, 501 lines, tolerances just inside and just outside, offsets compared across a cell, and a door on a solid wall
- [x] 9.3 Server: the second migration, the choices on both stores, setting them at start and from the owner's page, the setup read and save routes for a pass, grid status worked out from the choice and detection, and publish using the map's resulting board for the library map and its encounters. Verify with integration tests on both stores: a pass can't change the choices, a save is refused when walls are off, after a user edit or after publishing, and published walls are in the library map and the template
- [x] 9.4 The overlay picture: `view_file` with `overlay` and `region`, drawn on the server with a numbered grid, walls and numbered openings, at most 1500 pixels on a side. Verify that a region's corner carries the right numbers, and that openings are numbered as `get_map_setup` lists them
- [x] 9.5 MCP: `get_map_setup`, `save_map_setup` and the `view_file` options, plus guide text on the choices, checking the grid and hard cases. Verify over real HTTP with the SDK client, including the refusals when off
- [x] 9.6 Web: the two choices at start and on the build page. Walls, doors, windows, openings and marks drawn in review, with kind and state changes, removing one line or all, and publish asking first when openings are left. Verify with component tests, then in a browser at desktop and phone width
- [x] 9.7 Docs: README FR-GM-26 and FR-GM-27, `docs/AI-GAME-BUILDER.md` (the choices, what counts as a hard case, design D13's two ways), and `docs/DESIGN.md`. Verify by searching the repo
- [x] 9.8 Break the new protections one at a time and confirm a test fails each time: choice off, a pass changing choices, an edited map, the grid tolerance, publish using the drawn lines. Run `visibility-auditor` and `sync-reviewer` on the diff
- [x] 9.9 Real run: a new Lanternfall build with both choices on, from the user's folder, with Claude Code. Compare the doors, locks and windows with `adventure.md`: the Ward Gate at (23, 8) and (23, 9); 13 Chandlery doors, with the office at (21, 3) locked; windows at (4, 0), (25, 0), (0, 6) and (29, 11); the sluice gate at (24, 10), locked. Measure the cost and replace the estimate in `design.md`. Then, only with the user's go-ahead, remove the first Lanternfall build's published items and publish the new one
- [x] 9.10 Run `npm run lint && npm run typecheck && npm test` and log the results

## Workflow follow-up

- Archive this change after review and merge.
- Possible later changes: OAuth at `/mcp/build`; ChatGPT's `openai/fileParams`; a "claim your character" link; a bulk "hand out characters" panel; an account-wide storage cap; user-defined presets; drawing walls on the build page.
