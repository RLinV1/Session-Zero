# M5/M6: live usability findings and fixes

Date: 2026-11-14. Site: https://sessionzero.codes.

## Scope and method

This is a simulated first-use study using GPT-6 Luna agents as user personas, with real requests to the deployed application. It is not a study of independent human participants. The agents receive a goal and role rather than a click-by-click walkthrough; source-code assistance and workarounds are recorded when used.

The study covers the guest onboarding journey, desktop and phone controls, a dedicated authenticated GM account and board, a browser player, and a player using the public MCP server. All participants and rooms are clearly named QA fixtures. Passwords, cookies, room invites and MCP seats are excluded from this report.

## M5: audience, assumption and initial observations

- Audience: a GM preparing a short encounter and players joining from a browser or AI app.
- Riskiest assumption: people can reach their first playable turn without implementation-team coaching, including discovering token control and map preparation.
- Initial observations: the homepage's Start action detoured through sign-in, the new guest room stacked two prompts over the board, and browser players needed clearer movement and attack cues. A dedicated real GM account and board were created successfully.
- The competing workflow comparison and independent human follow-up study remain pending; no adoption claim is made from this run.

## Findings and fixes

### Readout

- **Too many decisions before play:** Start led through sign-in; two prompts competed on first open; guest retention returned after Not now and reload. Fixes make guest setup direct, defer retention during the walkthrough, and remember dismissal per room.
- **Core actions were hard to discover:** Select explained panning but omitted token movement; Choose a target was disabled; a named damage shortcut could disappear behind Custom roll. The hints and actions now explain and expose the next step.
- **Multiplayer and MCP worked in the tested scenario:** separate players moved owned characters, chatted, rolled attacks, received GM rulings and advanced the turn. A hidden GM fixture stayed out of the MCP player's view.

### Ranked findings

| ID / severity | Observed behavior and user impact | Fix or disposition | Retest / evidence |
| --- | --- | --- | --- |
| F01 / P2 | A fresh visitor clicked Start a room and reached `/signin?next=%2Fgm-dashboard`; a smaller Continue as guest GM link was needed to reach `/start`. Same on phone. It looked account-gated before the first table. | Hero and closing start links now point to `/start`. That route already redirects signed-in GMs to their rooms. | Rendered-link tests failed before the change, then passed. Desktop and phone Playwright checks reached guest setup and created a room. `guest-flow.json`, `desktop-start.png`, `mobile.json`. |
| F02 / P2 | The guest-retention card and tutorial invitation appeared together. On phone, the Chat bubble also overlapped retention. A later browser retest found the tutorial could cover Change map after closing the editor. | Retention is hidden while the walkthrough is present, then available after declining or finishing it. Editor lessons point to the Edit map button when the editor is closed, letting the card dock clear of those controls. | Desktop and phone checks confirmed one initial prompt. The map-control overlap was reproduced in the browser and addressed with the fallback anchor. `desktop-room-created.png`, `phone-room-first-open.png`, `phone-room-no-tour.png`. |
| F03 / P2 | Decline the tutorial, press guest-retention Not now, reload: retention returns while the tutorial stays dismissed. A dismissal had to be repeated. | Uses the existing guarded browser-preference helper with a per-room key and a room-keyed notice. A different room still explains retention; blocked storage falls back to this visit. | Reopening regression failed before the fix; same-room persistence and different-room tests pass. Desktop and phone browser reload regressions pass. `retention-reload.json`, `reload-fresh-{initial,after-dismiss,after-reload}.png`. |
| F04 / P2 | The browser player's Select hint said Drag to pan, without explaining token movement. The tester discovered movement by dragging their own character. | English and Traditional Chinese hints now lead with moving tokens the viewer controls, distinguish dragging empty space to pan, and mention scroll or pinch zoom. | Live owned-token movement succeeded. Trying another player's token did not move it or advance the sequence. The copy clarifies existing permissions; it does not expand them. |
| F05 / P2 | In Attack, a Target picker appeared above a disabled Choose a target button. The apparent primary instruction could not be clicked. | Choose a target now starts board targeting for named and custom attacks when visible targets exist. The picker placeholder names the action. No-target and rolling guards remain. | Named/custom regressions failed on the disabled button, then passed. Tests verify targeting starts without sending a premature dice command and remains disabled with no visible targets. |
| F06 / P2 | After a hit ruling, the browser player found damage through Attack options → Custom roll → Damage, selected the target again and manually matched the weapon formula. | Investigation reproduced a contributing case: the named damage shortcut was hidden whenever Custom roll was open, including a remembered preference. A ready named damage shortcut now remains visible. This is not established as the sole cause of the live observation. | A regression starts with a confirmed named hit and Custom roll remembered open, then uses the named damage button and verifies its saved damage expression and attack context. |
| F07 / P3 | At 390 × 844 the browser player saw a roughly 370 × 210 map. End turn and tabs were visible; Attack required scrolling below Initiative. | The full-map fit was functional, not clipped. The movement hint now names pinch zoom. Camera and panel order remain a fresh-user retest item rather than an unproven redesign. | Essential phone controls were observed. No unscrollable control was demonstrated. |
| F08 / P3 | MCP view reported a 48 × 27 map, while its annotated image included column -1 through 47 and row -1 through 26. The labels initially looked inconsistent. | Inspection confirmed thin partial edge cells, consistent with grid offsets 8 and 18 on 70-pixel squares. This is not an invalid-coordinate bug. The AI player guide now explains edge cells and check_move. | Filtered `mcp-player-map.jpg` inspected; ordinary checked movement succeeded. Coordinate semantics unchanged. |
| F09 / info | The MCP join response combined a seat with a long brief. A tester initially wanted a clearer sensitive-key cue. | The existing brief already identifies the seat as a character key and restricts sharing to the acting sub-agent. No protocol defect was established and no seat is published here. | Seat reuse worked through a fresh connection. |
| F10 / info | The MCP player initially wondered whether Waiting for GM meant to wait or repeat a roll. | This is expected tabletop workflow. The guide now explicitly says the roll succeeded, not to reroll, and to wait for ruling/application before continuing. | Hit ruling, damage application and subsequent player view all worked. |
| F11 / monitor | The live browser logged an inline-script hash warning and a blocked Cloudflare Insights beacon. Page and room still loaded and connected. | No user-facing failure was attributed to these warnings. Production CSP/proxy configuration needs separate inspection. CSP was not relaxed to permit arbitrary inline or external scripts. | Recorded in the guest GM's notes; gameplay and room connection still succeeded. |

### What needs a fresh first-use retest

The map fit and collapsed Attack section still require a new observer after the clearer cues are deployed. The damage-discovery observation has a locally reproduced contributing case, but exact live-version attribution is unknown. No completion-time or adoption claim is justified by this run.

## M6: retest and remaining uncertainty

The changes follow **observed friction → narrow change → regression check**. The original guest-editor and account-migration fixes merged in [PR #199](https://github.com/RLinV1/Session-Zero/pull/199) after GitHub lint, typecheck, tests, vision tests, build, smoke test, audit and image builds passed. The follow-up is based on that main commit and adds no isometric or building functionality.

All six final desktop and phone browser scenarios passed: the landing workflow, guest dismissal across reload, and editor tutorial. Two additional landing checks confirmed paragraph text fits on both screen sizes. Component regressions cover persistent guest dismissal and named damage visibility; lint, full typecheck and production build passed. Read CI and delivery status from the follow-up PR. A local build or Git merge is not a production deployment; repeat the same first-use tasks after deployment.

A successful automated retest establishes that the reported interaction works under the tested conditions. It does not establish independent first-use success or willingness to return. The five-independent-participant, competitor comparison and return-session gates remain unmeasured.

## Evidence and coverage

- GM setup: authenticated signup returned 201; dedicated room creation returned 200.
- Guest first-use persona: desktop 1440 × 1000 and phone 390 × 844; six illustrated maps, usable two-column phone picker, no document overflow, successful room creation and connection at sequence 3. Map edits, token moves and dice were outside that persona's first-use pass.
- Browser player Mira: invite opened a name-and-Join flow; an assigned character was visible; moving one square east advanced the sequence; a role-play chat appeared; selecting the visible training target and rolling produced 13 to hit. The GM ruled Hit. Mira later rolled 4 damage through Custom roll. Attempting to move Rowan's token made no change. Phone tabs and End turn were visible; Attack required scrolling.
- MCP player Rowan: joined the public Streamable HTTP endpoint; received an owned token and named Training bow; obtained a filtered view and JPEG map; checked and moved one square north; sent chat; rolled 22 to hit, then 3 damage after the GM ruled Hit; ended their turn, making Mira active in round one.
- GM coordination: created a real authenticated account and dedicated room, assigned player ownership, placed a visible training target and a hidden fixture, and started turn order. Setup used authenticated requests and GM commands, so it was assisted rather than an unaided UI completion.
- Combat state: applying Rowan's 3 damage changed the target from 12 to 9 HP. A fresh MCP connection retained ownership, Hit, Applied damage and 9 HP. Mira's 4-damage application was briefly delayed by runner approval capacity, then succeeded after access resumed; the final GM snapshot confirmed 5 HP. A completed whole combat round is not claimed.
- Hidden information: Rowan's view and map showed the player characters and visible target, omitting the GM-hidden fixture. This is one scenario, not an exhaustive security audit.
- Deployed version: no commit was exposed. The live guest GM observed a nine-step tutorial; the merged main-based workspace has the expanded tutorial from PR #199. The merge alone does not establish that the live site updated.

Detailed local evidence is collected under `output/live-ux-luna/` and `output/live-game/`. Private fixture files are not included in the committed documentation.

Useful local evidence includes `findings.md`, `guest-flow.json`, `retention-reload.json`, the guest GM's before/after screenshots, `gm-notes.md`, `mcp-player-notes.md`, `mcp-player-map.jpg`, and component/browser verification logs. Browser-player observations above were reported during the live run; not every intermediate state has a screenshot. Fixture folders are locally excluded from Git, and contain no files intended for publication.

DNS/localhost permission failures and automatic approval-review usage limits were runner constraints, not product bottlenecks. Access resumed, browser reload checks passed, and the delayed damage application completed. A full combat round and post-deployment first-use verification remain follow-up work.

## Landing-page follow-through

The bottom of the landing page now explains map → invite → play, compares guest rooms with free accounts, and includes two short actual session quotes under “At the table,” attributed to AI player roles. It does not invent customer names, star ratings or independent human testimonials. The detailed methodology remains in this report.
