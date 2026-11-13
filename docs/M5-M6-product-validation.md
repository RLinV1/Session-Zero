# M5/M6: validate the first playable session

Status: proposed experiments, not user-research results. Prepared 2026-11-13 from the class memo, README §8, and `docs/QA-grid-sample.md`.

## The decision we need to make

Can Session Zero earn a place in a real GM's workflow by making a supplied map playable quickly, with players joining and acting without the team coaching them?

Our working audience is GMs running short online encounters who already have a map image and want little preparation. This is a hypothesis to test with users. Isometric buildings are optional presentation; their engineering checks do not demonstrate demand or adoption.

The repository documents extensive automated QA and promises structured usability testing with at least five independent GMs and players. The documents reviewed do not contain completed first-use study results. That is an evidence gap, not proof nobody has tested the product. First-use success/time targets are explicitly still hypotheses in `docs/QA-grid-sample.md`.

Browser access and invitation links alone are insufficient differentiation: [Owlbear Rodeo already supports anonymous players joining rooms by link](https://docs.owlbear.rodeo/docs/rooms/). [Roll20 also provides game creation, maps, layers and invitations](https://help.roll20.net/hc/en-us/articles/360039223834-Roll20-Crash-Course). Measure a narrower benefit instead of asserting that competitors are difficult.

## Priorities and evidence

| Priority | Risk to test | Evidence needed | Change justified by a failure |
| --- | --- | --- | --- |
| 1 | A new GM cannot reach a playable map unaided | Completion, time, first blocking step and help requests | Fix that step: grid, upload, token ownership, invitation or publishing |
| 2 | Players cannot join or act reliably on their devices | Join-to-first-move time, permission confusion, phone usability, reconnect outcome | Fix access, control discovery or recovery before adding scope |
| 3 | The product offers no compelling advantage over an existing workflow | Equivalent task comparison and an actual second-session commitment | Narrow the audience/workflow or reconsider the value proposition |

## Execute over the next two work cycles

**Before recruiting:** assign one study owner and one observer; use the deployed app in a private test room; verify the public URL, upload, invitations and persistence with a GM and a separate player browser. Remove dev credentials from the public setup. Give every run the deployed commit and device/browser. Local Docker checks establish engineering readiness only.

**Cycle 1 — observe:** recruit at least five independent target GMs, outside the implementation team, each paired with a player where possible. Explain this is a product test, request permission for notes/recording, and use maps participants have permission to upload. Do not collect room secrets or participant emails in the public repository.

Use the same neutral task: “You are running a short encounter tonight. Set up this map with the intended scale, add a character and an enemy, keep one area hidden, invite your player, and have them move their character and roll.” Provide the goal and map, not a click-by-click tutorial. Start timing on the landing page. Record the initial attempt before offering help; if someone is stuck or wants to stop, assist and mark the remaining task as assisted. Stop at 15 minutes or on request.

Afterward ask: What did you expect at the blocking step? What would you normally use? What would make you choose this for your next game? Would you schedule a second session using your own map? Avoid leading with the new isometric feature. If they want it, separately observe the optional outline-and-height workflow and record its added preparation cost.

For GMs who already use a competing tool, repeat an equivalent map task in their usual tool. Alternate the order across participants and use comparable maps, recording prior experience. Report the small sample and learning effects; this is directional evidence, not a market-wide performance claim.

**Cycle 2 — fix and retest:** rank observed blockers by how many people they prevented from completing, then severity, then effort. Fix the top one or two; retest with fresh participants where possible. Invite the initial participants to a real follow-up encounter within seven days. A scheduled session and an attended session are different outcomes; record both. Do not send outreach automatically from this repository work.

## Proposed decision rules — agree before observing

These are team-selected learning gates, not validated benchmarks or statistical proof:

- At least four of the first five GMs complete the core task unaided within ten minutes; separately report grid-only time and total time.
- At least four of five paired players join, move and roll unaided within two minutes of receiving the invitation.
- No observed hidden-information leak, lost saved scene, or unrecoverable reconnect. Any such failure takes priority over speed.
- At least two GMs schedule a second encounter using their own material within seven days; separately count actual return sessions and why others declined.

If setup fails, fix setup and retest before promotion. If setup succeeds but nobody wants to return, investigate audience/value rather than adding features. If people return but encounter reliability problems, prioritize persistence and recovery. If the narrow workflow has no plausible pull after serious attempts, present that conclusion and discuss alternatives with the instructor; the memo says alternative-credit arrangements are not finalized.

## Evidence log template

Keep identifying notes privately; publish anonymous aggregates and consented excerpts only. Record unsuccessful attempts as well as successful ones.

| Run | Commit | Device / prior VTT experience | Map type | Unaided completion | Grid / full setup time | Player join-to-action | Help / blocker | Fix tested | Follow-up scheduled / attended |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Pending | — | — | — | — | — | — | — | — | — |

For each fix preserve: observed problem → chosen change → before/after result → remaining uncertainty. Do not substitute automated test counts, screenshots, or developer demos for independent use.

## Presentation evidence

For M5 show the target audience, the competing workflow, the riskiest assumption, and the first observations. For M6 show the ranked failures, the changes made, and repeat observations. In the final presentation show the full learning chain, a real-user outcome, unsuccessful experiments, and what would need another year of work. Use measured results when available; leave pending results explicitly pending.

The immediate user/team actions are to name the study owner, select a publicly reachable build, recruit the first five GM/player pairs, and book observation times. The next engineering work should be selected from those observations.
