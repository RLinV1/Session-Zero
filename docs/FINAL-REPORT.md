# Session Zero: M6 Final Report

**Status:** Final · **Course:** CSE 416 · **Team:** Raymond Lin, Vincent Chen, Antonio Cottone, Christos Psimadas · **Repository:** [RLinV1/Session-Zero](https://github.com/RLinV1/Session-Zero) · **Figures as of:** 2026-11-20 (main at `299c94b9`)

Every number below came from a command run against the repository, GitHub or the team's Jira on that date. Where a source could not show something, the text says so.

---

## 1. Summary

Session Zero is a browser virtual tabletop for tabletop role-playing games. A game master (GM) uploads or picks a battle map, the app detects the grid, and players join from a link with no account. Everyone sees the same board in real time: tokens, fog of war, line of sight, initiative, dice and attacks. The GM sees everything; players receive only what their characters could see. Players can bring their own AI app to hold a seat, and a GM can have an AI app build a whole game.

The product is deployed at https://sessionzero.codes: [`DESIGN.md`](DESIGN.md) records status "deployed", on a single cloud VM behind Caddy, provisioned with the project's Terraform.

Of the 52 requirements traced in [`DESIGN.md`](DESIGN.md) §6, every row is built except FR-GM-11 (vision-based wall parsing), which is partial. Between 2026-09-09 and 2026-11-19 we merged 219 pull requests, made 1,004 commits, wrote 84 ADR files and closed 24 of 24 playtest items. AI was in every step of the loop: Claude Code turned Jira tickets into OpenSpec proposals and pull requests, review agents checked invariants, the AI drove the real app to verify UI changes, CodeRabbit reviewed 52 pull requests, and AI-run security audits drove the hardening of the live site. Section 5 gives the evidence; section 6 the costs.

---

## 2. What we built

Requirement IDs refer to [`../README.md`](../README.md); status comes from the traceability table in [`DESIGN.md`](DESIGN.md) §6. Of its 52 rows, 51 are built and 1 is partial; none is "designed, not built".

| Feature area | Requirements | What a user can do | Status |
| --- | --- | --- | --- |
| Accounts, guests, rooms | FR-GM-01, FR-GM-14, FR-GM-20, FR-PL-01, FR-PL-02, FR-PL-05, FR-PL-06 | Sign up (email verification on the live site), host as a guest, share an invite link, rejoin after a reload, revoke a guest | Built |
| Maps and grid | FR-GM-02 to FR-GM-05 | Upload or pick a map, run grid detection, preview and correct the grid | Built |
| UVTT import and export | FR-GM-06, FR-GM-07, FR-GM-12 | Import Universal VTT files and export a scene | Built |
| Walls, portals, line of sight | FR-GM-09, FR-GM-18, FR-GM-19 | Edit walls and doors, see dynamic line of sight | Built |
| Wall detection from an image | FR-GM-11 | Detect walls with a confidence score; the GM reviews every result | **Partial**: doors and windows are not classified, and the worker is off in the deployed stack |
| Tokens, roles, ownership | FR-GM-08, FR-GM-10, FR-GM-16, FR-GM-24, FR-PL-04 | Create and duplicate tokens, hide them, assign owners | Built |
| Fog of war | FR-GM-17 | Paint and reveal fog; players never receive hidden regions | Built |
| Encounters and scenes | FR-GM-13, FR-GM-25, FR-PL-07 | Encounter templates, scene switching, replay for late joiners | Built |
| Initiative, dice, attacks | FR-GM-21, FR-GM-22, FR-TAC-07, FR-TAC-09 | Turn order, public and GM-only rolls, attack rulings, damage, conditions | Built |
| Tactical tools | FR-TAC-01 to FR-TAC-06, FR-TAC-08 | Pan, zoom, snapping, movement ruler, drawings, pings, area templates | Built |
| Sync and recovery | FR-SYNC-01 to FR-SYNC-04, FR-REC-01 to FR-REC-03 | Server-authoritative state, reconnection, activity log, undo | Built |
| AI at the table | FR-PL-08, FR-PL-09, FR-GM-26, FR-GM-27 | Connect your AI app as a player seat, or have it build a game for the GM to review ([`AI-PLAYERS.md`](AI-PLAYERS.md), [`AI-GAME-BUILDER.md`](AI-GAME-BUILDER.md)) | Built |

Beyond the README: a Traditional Chinese interface ([`GLOSSARY-zh-TW.md`](GLOSSARY-zh-TW.md)), freehand drawings, dice skins, game presets, an AI-driven scene studio (ADR 0073) and a guest tutorial.

**Cut or open** (from [`DESIGN.md`](DESIGN.md) §6 and §7):

- The checkpoints panel is no longer mounted in the UI (commands and events remain).
- Hosting is one VM.
- The Playwright suite is not in CI.
- The README's study with at least five independent GMs and players has not happened; our M5/M6 study used simulated personas (section 6).

---

## 3. Architecture in one page

Detail is in [`DESIGN.md`](DESIGN.md) §1 and the [architecture tour](developer/architecture.md).

```
browser <-Socket.IO-> apps/server: command -> decide -> events -> store.append -> reduce -> broadcast
(Postgres events, Redis seq, S3 images, services/vision)    apps/mcp: an ordinary client of the server
```

- **`packages/shared`**: the contract. Zod schemas for state, commands, events and protocol, plus the pure `decide`, `reduce` and visibility filters.
- **`apps/server`**: the command pipeline in `domain/liveRoom.ts`, and the stores.
- **`apps/web`**: React panels and the PixiJS board; React never touches Pixi objects.
- **`apps/mcp`**: AI seats and the game builder, using only public APIs ([ADR 0052](adr/0052-mcp-player-seats.md), [ADR 0053](adr/0053-build-pass-and-approved-templates.md)).
- **`services/vision`**: Python and OpenCV for grid and wall detection.

Every change is reviewed against seven invariants (section 5.4): state changes only through command, `decide`, events, `reduce`; both are pure; room data passes the per-viewer visibility filters; ephemeral messages are never persisted; events are append-only; authorization is on the server; positions are board coordinates.

The decisions behind them: [ADR 0001 event model](adr/0001-event-model.md), [ADR 0002 transport and identity](adr/0002-transport-and-identity.md), [ADR 0003 tactical state](adr/0003-tactical-state.md). The full ADR index is in [`DESIGN.md`](DESIGN.md) §8.

---

## 4. Final demo script (Dec 7 poster session)

Target: 5 to 7 minutes, two laptops (GM and player) plus a phone. This is the team's plan; no timed venue run has happened yet. Presenters follow the workstream owners in [`DELIVERY.md`](DELIVERY.md) §8.2: Antonio (board), Raymond (sync, persistence, AI seats), Christos (maps, grid, UVTT), Vincent (join flow, UX, i18n). The GM laptop is handed between presenters; Raymond keeps the player laptop (steps 4 to 8 need it); Antonio holds the phone in step 3. Use a fresh guest room on https://sessionzero.codes, with a pre-made account and second browser profile as fallback. No invite link, account or AI seat key goes on the poster.

| Step | Time | Presenter (planned) | What to do | What it proves |
| --- | --- | --- | --- | --- |
| 1 | 0:30 | Vincent | Start a room as a guest, pick a built-in map, show the tutorial. | No-account first use (FR-GM-01, ADR 0072) |
| 2 | 1:15 | Christos | Upload a map, show grid detection and correct one value, import a UVTT file. | FR-GM-02 to FR-GM-07 |
| 3 | 0:45 | Antonio | Place two tokens and a hidden enemy; zoom and pan on the phone; drag a token with the ruler. | FR-GM-08, FR-GM-16, FR-TAC-01 to FR-TAC-03 |
| 4 | 0:45 | Raymond | Share the invite link, join as a player, assign a token, reload the player page to show the same identity returns. | FR-PL-01, FR-PL-02, FR-PL-05, FR-PL-06 |
| 5 | 0:45 | Antonio | Paint fog, place a wall; the player screen lacks the hidden token and fog. Turn on line of sight. | FR-GM-17, FR-GM-19, FR-GM-23 |
| 6 | 0:45 | Vincent | Start initiative; the player attacks, the GM rules a hit and applies damage. | FR-GM-21, FR-GM-22, FR-TAC-09 |
| 7 | 0:30 | Raymond | Press Undo on the last GM action, then open the activity log. | FR-REC-01, FR-REC-02 |
| 8 | 0:45 | Raymond | Connect an AI app with the command from the Share dialog; it joins as a seat and moves its token. | FR-PL-08, FR-PL-09 |
| 9 | 0:45 | Vincent | Show the poster's ticket, OpenSpec change and CodeRabbit-reviewed PR (section 5); switch to Traditional Chinese. | The AI process; localization |


Total 6:45 (405 seconds). Step 8 needs an AI app connected, so it is cut first when time or network is short (6:00 without it).

**Network plan.** Primary: the live site over venue wifi; if it is unreliable, tether to a phone hotspot with the same script. With no internet, run `npm run dev` on one laptop ([`developer/setup.md`](developer/setup.md)): web on http://localhost:5173, API on :3001, in-memory store, no Docker. The GM and player are two browser profiles. Offline there is no automatic grid detection (it needs the vision service, `VISION_URL`), so Christos shows grid correction and UVTT import, and step 8 is skipped. A server restart clears the in-memory rooms, so make the room just before.


---

## 5. How we used AI

The team's emphasis is that AI automated and accelerated the workflow. The sections follow the order work moves through: ticket, plan, design, build, test, review, harden.

### 5.1 Jira ticket automation

**The Jira project.** KAN, "Virtual Table Top", on `virtualtabletop.atlassian.net`. A read-only Atlassian MCP query on 2026-11-20 returned **82 issues**, each titled with the requirement it implements (KAN-28 "FR-GM-17: Manual fog of war"):

| Measure | Count |
| --- | --- |
| Issue types | Story 75, Epic 3, Task 3, Subtask 1 |
| Status | Done 58, In Review 12, To Do 12 |

**The trail from ticket to merged code.** Three examples that can be followed end to end:

| Jira | OpenSpec change | Branch and PR |
| --- | --- | --- |
| KAN-41, undo and named checkpoints | [`archive/2026-10-03-kan-41-checkpoints`](../openspec/changes/archive/2026-10-03-kan-41-checkpoints/proposal.md) | `feat/kan-41-named-checkpoints`, [PR #71](https://github.com/RLinV1/Session-Zero/pull/71); undo itself in [PR #59](https://github.com/RLinV1/Session-Zero/pull/59) |
| KAN-28, manual fog | [`archive/2026-10-13-kan-28-manual-fog`](../openspec/changes/archive/2026-10-13-kan-28-manual-fog/) | `feat/kan-28-manual-fog`, [PR #75](https://github.com/RLinV1/Session-Zero/pull/75) |
| KAN-50, encounter templates | [`archive/2026-10-13-kan-50-encounter-templates`](../openspec/changes/archive/2026-10-13-kan-50-encounter-templates/) | [PR #88](https://github.com/RLinV1/Session-Zero/pull/88) |

The KAN-41 proposal quotes the ticket's acceptance criterion ("Named checkpoint save/restore available as the universal fallback") and notes the ticket's 15-second success metric was unmeasured, which added a Playwright measurement task.

**Numbers.** `git log --grep "KAN-"` returns **212 of 1,004 commits**, naming **39 distinct KAN keys**; **49 of 228 pull requests** carry a key in the title; **20 OpenSpec change folders** are named `kan-*` (11 archived, 9 open). The key appears in branch, commit, PR title and change folder.

**How the ticket became a proposal.** No Jira-specific command exists: `.claude/commands/opsx/` has six generic OpenSpec commands and none mentions Jira. The history shows the flow: Claude Code reads the ticket through the Atlassian MCP, `/opsx:propose` writes a change whose name carries the key (`kan-41-checkpoints`), and the proposal's "Why" cites the ticket (KAN-51, KAN-82). The KAN-28 ticket itself ends "reference this ticket key in branch names, commits, and PR titles". No exact prompt is recorded, so we quote none.

**Who moved the status.** Changelogs of three issues, read-only: Christos moved KAN-9 To Do, In Progress (2026-09-27), In Review (2026-09-28) under his own account; Raymond's account moved it to Done and back to In Review on 2026-10-03. KAN-28 and KAN-41 went straight from To Do to Done, by Raymond's account, on 2026-10-03 (KAN-41 the day its change was archived). So status moved under people's accounts, in batch sweeps rather than at each step. A changelog cannot tell a click from Claude acting through that account's token, so we claim neither.

**Honest limits.** The Jira board lags the repository. KAN-9 and KAN-10 (grid detection and preview) are In Review although `DESIGN.md` §6 marks both built; KAN-66 is To Do although a `kan-66-map-token-adjustment` change and ADR 0042 exist. Many November changes were planned straight in OpenSpec without a ticket.

### 5.2 Planning: OpenSpec, superpowers and FR traceability

- **OpenSpec** ([workflow](developer/workflow.md)) is the planning backbone: `/opsx:explore`, `/opsx:propose`, `/opsx:apply`, `/opsx:archive`. The repository holds **139 archived changes** in `openspec/changes/archive/` and **52 open change folders** in `openspec/changes/` (a clean-up on 2026-11-20 archived 48 finished ones), and **98 accepted capability specs** in `openspec/specs/`. Each change has a `proposal.md`, `design.md`, `tasks.md` and delta specs; archiving syncs the delta into the capability spec.
- **superpowers brainstorming and writing-plans**: `docs/superpowers/` holds 4 plans and 2 specs from 2026-11-01 to 2026-11-03 (movement ruler, scene switching, private scene preparation, isometric lighting).
- **FR-ID traceability**: every requirement has a README ID, `DESIGN.md` §6 maps each ID to code, and tests (`describe("... (FR-PL-02)")`), commits and PR titles carry the ID.

### 5.3 Design: ADRs, design skills and audits

- **ADRs.** `docs/adr/` has **84 files**, numbered 0001 to 0078. They are indexed in `DESIGN.md` §8; many are still Proposed pending the Real-Time Architecture owner's review (`DESIGN.md` §7). Changing an existing `packages/shared` schema requires an ADR.
- **UI design skills.** `.claude/skills/` holds 20 tracked files, among them `design-taste-frontend`, `high-end-visual-design`, `minimalist-ui`, `redesign-existing-projects` and `industrial-brutalist-ui`; `impeccable` is a plugin. For the palette the record names two: the `collapsible-sidebar-and-ui-polish` design note (2026-09-24) says it was "chosen with" `redesign-existing-projects` and `design-taste-frontend`, a cool slate neutral with one muted rust accent, after a first pass in brass on warm ink was dropped as the generic AI default. Later task lists name `impeccable` and `design-taste-frontend` for the Start page and account dialogs, and the 2026-11-01 `product-design-language` change moved the type to Geist and kept one rust primary per region. The other skills have no record of use.
- **UI audits.** [`ui-design-audit-2026-10-29.md`](audits/ui-design-audit-2026-10-29.md) checked `apps/web` against [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) and WCAG 2.2 AA with five parallel read-only subagents: 203 candidate findings, 187 accepted after every cited line was re-read, giving **63 findings: 7 Blocker, 22 Major, 34 Minor**. All seven Blockers were fixed the same day. [`ui-ai-features-audit-2026-11-10.md`](audits/ui-ai-features-audit-2026-11-10.md) covers the AI features.

### 5.4 Implementing quickly: Claude Code, subagents and custom agents

- **Claude Code with subagents.** Features were built from an OpenSpec `tasks.md` with subagents on independent slices. Commits per month: 255, 427, 322 (to the 19th).
- **`implement-fr` skill**: given an FR ID it reads the README, `CLAUDE.md`, `DESIGN.md` and ADR 0001, then follows the standard pattern: schemas, `decide` and `reduce`, visibility filters, tests, UI.
- **Custom review agents** (`.claude/agents/`): `sync-reviewer` reads a diff for event-sourcing violations (state changed outside `reduce`, non-determinism, events missing the replaced value); `visibility-auditor` traces every path new data takes to a client and flags anything that could leak GM-only information. Both are required steps in [`workflow.md`](developer/workflow.md).
- **Contribution split.** Merged by person from `git shortlog -sne` (1,004 commits), with workstreams from [`DELIVERY.md`](DELIVERY.md) §8.2:

| Person | Workstream | All commits | Non-merge commits | Merged PRs |
| --- | --- | --- | --- | --- |
| Raymond Lin | Real-time sync, persistence | 491 | 345 | 120 (RLinV1) |
| Vincent Chen | Join flow, UX, i18n | 200 | 120 | 59 (VincentChen1113) |
| Antonio Cottone | Board and canvas | 148 | 118 | 23 (AC2089) |
| Christos Psimadas | Maps, grid, wall detection | 125 | 92 | 17 (ChristosPsimadas) |
| Claude (author field) | Not a team member | 39 | 35 | none |

  Aliases are merged (three for Antonio, including `AC2089`); one more commit is by `coderabbitai[bot]`. "All commits" includes 294 merge commits, which count for whoever pressed merge. Counts do not measure effort or difficulty. 328 commits carry a `Co-Authored-By: Claude` trailer, so AI-written code is far more than the 39 authored as Claude.
- The `codex/` branch prefix (`codex/kan-68-activity-log`) shows OpenAI Codex was also used; how much is not recorded.

### 5.5 Automated testing

- **Playwright MCP and the in-app browser.** After a UI change the AI drove the real app and logged the result in the change's verification file. Logs naming Playwright include [`kan-70-creature-templates`](../openspec/changes/archive/2026-10-13-kan-70-creature-templates/verification-log.md) and `product-design-language/verification-log.md`; 25 verification files exist in `openspec/`. One log says it used the Codex in-app browser MCP because the Playwright server was not exposed. The M5/M6 persona study ran against the live site ([`M5-M6-live-usability-findings.md`](M5-M6-live-usability-findings.md)).
- **Scripted suites.** 471 test files in the repository:

| Suite | Test files | Approx. cases (per [`testing.md`](developer/testing.md)) |
| --- | --- | --- |
| `packages/shared/test` | 87 | 1,240 |
| `apps/server/test` | 123 | 1,000 |
| `apps/web/test` | 227 | 1,690 |
| `apps/mcp/test` | 20 | 210 |
| `services/vision` | 6 | 50 |
| `browser/*.spec.ts` | 14 | specs |

  Case counts are the approximations in `testing.md`; we did not run the suites to write this report.
- **CI** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs on every PR and push to `main`: `verify` (lint with the i18n guard, typecheck, Vitest suites and latency bench, vision tests, build, smoke test), `audit` (dependency advisories) and `images` (production image builds). The Playwright suite is not in CI.

### 5.6 CodeRabbit AI code review

CodeRabbit reviews our pull requests automatically. Measured with `gh api` over PRs 1 to 228 (reviews and comments by `coderabbitai[bot]`):

| Measure | Value |
| --- | --- |
| PRs reviewed by CodeRabbit | **52 of 219 merged PRs (24%)**, PR numbers 33 to 226 |
| Review submissions | 157 |
| Inline comments | 262 |
| By month PR was opened | September 19, October 28, November 5 |
| Heaviest | #226 (15 reviews, 30 comments), #128 (15, 27) |

By creation date, 28 of 71 PRs opened in October were reviewed (39%) against 5 of 94 opened in November (5%): #141, #159, #180, #215 and #226. The data shows no cause, so we state none.

Examples where a comment led to a fix commit:

1. **[PR #128](https://github.com/RLinV1/Session-Zero/pull/128), line of sight.** Commit `c06b5a03` counts UVTT imports against the shared upload budget and keeps a door or window when a stored wall is re-detected.
2. **[PR #80](https://github.com/RLinV1/Session-Zero/pull/80), fog.** It flagged a toggle whose label changed while it reported `aria-pressed` and a 20 Hz loop that ran with the fog tint hidden.
3. **[PR #88](https://github.com/RLinV1/Session-Zero/pull/88), [#91](https://github.com/RLinV1/Session-Zero/pull/91), [#92](https://github.com/RLinV1/Session-Zero/pull/92)**: fixes listed in [`DESIGN.md`](DESIGN.md) §3.

### 5.7 Security vulnerability diagnosis with AI

Security work ran in rounds, each a read-only AI audit followed by fixes in a named change or PR. Specifics are in `docs/audits/`.

| When | What | Result and fix |
| --- | --- | --- |
| 2026-10-08 | Code read of the server | Missing rate limits, forgeable proxy addresses. Fixed in `security-hardening`. |
| Early Nov | Penetration test of the API | Dependency advisories fixed in [PR #164](https://github.com/RLinV1/Session-Zero/pull/164); CI audit gate in [PR #172](https://github.com/RLinV1/Session-Zero/pull/172). |
| 2026-11-04 | Edge protection ([`edge-protection-2026-11-04.md`](audits/edge-protection-2026-11-04.md), [`EDGE-PROTECTION.md`](EDGE-PROTECTION.md)) | Rate limits verified in a throwaway Docker network; a real Cloudflare edge was not tested. |
| 2026-11-13 | Code read plus 19 read-only requests to the live site | 0 critical or high, one medium (no browser security headers), four low. Fixed in [PR #193](https://github.com/RLinV1/Session-Zero/pull/193), ADR 0069. |
| 2026-11-18 | Full-app audit in two reports: [backend](audits/full-security-audit-2026-11-18-backend.md) and [web, deployment, dependencies](audits/full-security-audit-2026-11-18-web-infra.md) | Backend: 0 critical, 3 high, 9 medium, 12 low. Web and infrastructure: 0 critical, 0 high, 6 medium, 9 low, 4 informational. Fixed in [PR #226](https://github.com/RLinV1/Session-Zero/pull/226) and [PR #227](https://github.com/RLinV1/Session-Zero/pull/227), with [ADR 0078](adr/0078-backend-audit-hardening.md). |

The full audit's findings fell into abuse and denial of service (fixed with per-address and replay budgets and caps of 500 tokens and 250,000 events per room), input trust (image URLs now origin-relative only; events are reduced before they are appended, since one could make a room unloadable), identity (email verification with single-use hashed tokens, lockouts), visibility (the player view is built from an allow-list, so a new field is GM-only until listed, ADR 0078 item 6) and deployment (network split, Redis password, non-root vision image, nightly dumps).

The audits record what stayed open (the real Cloudflare edge, Terraform against real clouds) and mark items "inferred" when found by reading rather than running.

---

## 6. Retrospective

### What worked

- **A written contract plus invariants.** The event model and the invariants in `CLAUDE.md` gave AI and humans one checklist that the review agents could apply mechanically.
- **OpenSpec as the unit of work.** One folder per change let an AI session start or resume from files instead of memory; 139 archived changes read as a project history.
- **Traceability.** FR IDs and KAN keys in commits, PRs and tests answer "what implemented this?" with a grep.
- **Fast feedback.** The playtest's 24 items (17 requests, 7 bugs) were all resolved between 2026-11-11 and 2026-11-16 ([`PLAYTEST-FEEDBACK.md`](PLAYTEST-FEEDBACK.md)). The M5/M6 persona study's P2 findings were fixed and retested by 2026-11-14.
- **AI audits found real issues.** The 2026-11-18 backend audit's three high-severity items were fixed within a day.

### What did not work

- **ADR number collisions from parallel branches.** [`workflow.md`](developer/workflow.md) records seven reused numbers (0033, 0036, 0038, 0045, 0046, 0050, 0069): 84 files for 78 numbers. AI sessions on separate branches each took "the next free number".
- **Review backlog.** Many ADRs are still *Proposed*; the one Real-Time Architecture owner could not keep pace ([`DESIGN.md`](DESIGN.md) §7).
- **Planning artifacts piled up.** 99 change folders were unarchived before the 2026-11-20 clean-up (52 remain), and Jira lags the code (section 5.1).
- **Over-scoped changes.** [PR #227](https://github.com/RLinV1/Session-Zero/pull/227) touched 103 files in one squash (+2,140, -5,236 lines), mixing email verification, backend fixes, deployment hardening and documentation. Its message lists ten sub-changes, and review needed two follow-up rounds.
- **Review noise.** CodeRabbit left 262 inline comments over 52 PRs; some were real defects, many polish, and coverage fell from 39% of October PRs to 5% of November PRs, when the largest changes landed.
- **Uneven test evidence.** Playwright is not in CI, one session lacked the Playwright MCP, and `testing.md` counts are approximations.
- **Simulated users are not users.** The M5/M6 study used AI personas against the live site. It found real friction that we fixed, but the findings document says it "is not a study of independent human participants". The README's study with five or more independent GMs and players is pending, so we make no adoption or completion-time claim.
- **Rework.** The same areas were revisited. Classified by each proposal's "Why" and the commit dates:

  - *Planned iteration, 5 (new requirement or playtest, not a defect):* flowing fog (the user asked for it, 2026-10-29); the narrower fog fade (2026-11-12, in [`PLAYTEST-FEEDBACK.md`](PLAYTEST-FEEDBACK.md)); flashy attack animations (#115); attack range and animation choice (2026-11-13); checkpoint delete and preview (#109; the proposal calls restoring "a leap of faith").
  - *Rework, 6 (fixing or reversing the same feature within days):* cloud-textured fog in #80, one day after #75; the fog tool removed from the rail and restored twice (2026-10-10 to 14; `restore-board-fog-tool` says the removal contradicted FR-GM-17); fog colour polish on 2026-10-14; the double strike on Roll damage fixed 11 days after the attack effects; fixes in #119, one day after #115; and the Checkpoints panel, unmounted on 2026-11-03.

  About half were planned and half rework, the rework within days of a first release. ADR 0047 (a direct request) is in neither group.

### What we would change

1. Reserve ADR numbers in a one-line commit to `main`, or generate them in CI.
2. Split any change over about 30 files or one capability before review.
3. Archive on merge: put `/opsx:archive` in the PR checklist and have Claude move the Jira ticket in the same step.
4. Put Playwright in CI and re-measure test counts automatically.
5. Run the human usability study early.
6. Review the Proposed ADRs weekly.
7. Run the security audit at the start of the last month.

### How AI helped and hurt, in short

Helped: ticket-to-PR conversion, consistent conventions, parallel read-only audits (63 UI and 24 backend findings), review catching defects at PR time, and a larger product than four students would otherwise ship in a term. Hurt: duplicate numbering, very large changes, drift between Jira, OpenSpec and code, and evidence that sounds stronger than it is. We mitigated each by stating the limit where the claim is made.

---

## 7. By the numbers

All figures from commands run on 2026-11-20 unless noted (`git log`, `gh`, `ls`, Atlassian MCP read-only).

| Measure | Value |
| --- | --- |
| Commits | 1,004 (2026-09-09 to 2026-11-19): Sept 255, Oct 427, Nov to the 19th 322 |
| Commits naming a Jira ticket | 212, covering 39 distinct KAN keys |
| Pull requests | 228: 219 merged, 9 closed unmerged; merged per month Sept 56, Oct 73, Nov 90 |
| Merged PRs by author | RLinV1 120, VincentChen1113 59, AC2089 23, ChristosPsimadas 17 |
| ADR files | 84 (numbers 0001 to 0078; 7 numbers used twice) |
| OpenSpec | 139 archived changes, 52 open, 98 capability specs |
| Jira issues (KAN) | 82: Done 58, In Review 12, To Do 12 |
| Requirements traced | 52 rows: 51 built, 1 partial (`DESIGN.md` §6) |
| Test files | 471 (457 Vitest, 14 Playwright); about 4,190 Vitest and 50 Python cases per `testing.md` |
| TypeScript and TSX lines | 159,020, including tests |
| CodeRabbit | 52 of 219 merged PRs; 157 reviews; 262 inline comments |
| Security audits | 5 rounds; latest: backend 3 high, 9 medium, 12 low; web and infra 6 medium, 9 low |
| Playtest items resolved | 24 of 24 |

---

## 8. Links

- Product spec: [`../README.md`](../README.md)
- Design document: [`DESIGN.md`](DESIGN.md), delivery plan: [`DELIVERY.md`](DELIVERY.md), deployment: [`DEPLOYMENT.md`](DEPLOYMENT.md)
- User guide: [`user/`](user/README.md): [getting started](user/getting-started.md), [running a game](user/running-a-game.md), [playing](user/playing.md), [board tools](user/board-tools.md), [settings](user/settings.md), [troubleshooting](user/troubleshooting.md)
- Developer guide: [`developer/`](developer/README.md): [setup](developer/setup.md), [architecture](developer/architecture.md), [adding a feature](developer/adding-a-feature.md), [testing](developer/testing.md), [localization](developer/localization.md), [workflow](developer/workflow.md)
- AI guides: [`AI-PLAYERS.md`](AI-PLAYERS.md), [`AI-GAME-BUILDER.md`](AI-GAME-BUILDER.md)
- Decisions: [`adr/`](adr/), [`../openspec/`](../openspec/)
- Evidence: [`audits/`](audits/), [`PLAYTEST-FEEDBACK.md`](PLAYTEST-FEEDBACK.md), [`M5-M6-live-usability-findings.md`](M5-M6-live-usability-findings.md), [`M5-M6-product-validation.md`](M5-M6-product-validation.md)
- Repository: https://github.com/RLinV1/Session-Zero
