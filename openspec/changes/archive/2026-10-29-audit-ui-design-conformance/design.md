# Design

## Context

See proposal.md (Why) for motivation. This change produces a report, not code, so the design is about method: how to judge, how to gather evidence, and how to keep the audit honest and free of side effects.

Constraints found while inspecting the repo:

- **The docs and the code disagree on routes.** `apps/web/src/router.ts` serves `/`, `/signin`, `/signup`, `/gm-dashboard`, `/library`, `/join/:code`, `/encounters/edit/:id` and `/r/:roomId`. INTERFACE §11.2 and CONTRACT §13.1/§13.3 describe `/login`, `/rooms`, `/r/:id/prepare` and `/r/:id/log`, and say `/library` is deferred. These differences are doc conflicts, not violations (see Decision 4).
- **Hardcoded colours are concentrated in a few files.** Outside `board/` they sit mainly in `styles.css` (67, mostly inside `:root`), the map-editor canvases (`WallCanvas.tsx` 22, `FogCanvas.tsx` 12), `diceSkin.ts`, `MapGridPreview.tsx`, `tokenColors.ts`, `ParticipantsButton.tsx` and `HomePage.tsx`. Many of them are drawing colours, not chrome (see Decision 2).
- **Reduced motion has two inputs.** Code checks both the `prefers-reduced-motion` media query and the client setting `reducedAnimations` (`Die3D.tsx:177`, `board/effects.ts:146`, `board/animationPreview.ts:368`, `board/ping.ts`, `board/fx.ts`, `board/nukeFx.ts`). The built-in browser can emulate colour scheme and viewport but not `prefers-reduced-motion` (see Decision 7).
- **Fonts and icons are installed.** `@fontsource/geist-sans`, `@fontsource/geist-mono` and `@phosphor-icons/react` are dependencies, so principles 4 and 6 test how they are used, not whether they are installed.
- **Isolated servers exist.** `.claude/launch.json` has `server-isolated` (:3101, in-memory store, `SEED_DEV_ACCOUNT=1`) and `web-isolated` (:5273). The seeded account is in `apps/server/src/identity/devAccount.ts`.
- **The Playwright MCP browser is not a clean second client.** Another actor has driven it before. The built-in browser pane is the default here.
- **The working tree is already dirty.** `.claude/launch.json`, `CLAUDE.md`, `README.md`, `docker-compose.yml`, `eslint.config.js` and `package.json` are modified, and `scripts/` is untracked. None of these are ours to touch.

## Goals / Non-Goals

**Goals:**
- Every principle 1–30 ends with a status, Pass / Partial / Fail / Not built, backed by evidence a reviewer can re-check: a `file:line`, or a viewport plus the action and the measured value.
- Zero false positives in the findings list. Each candidate is re-read or re-measured before it is reported.
- The audit is reproducible from the verification log alone.

**Non-Goals:**
- Fixing anything, including one-line fixes. Fixes become separate changes.
- Auditing sync, visibility or server code beyond what principles 26–30 see from `apps/web`. The `sync-reviewer` and `visibility-auditor` agents cover those in later passes.
- Judging aesthetic quality outside the written rules ("looks generic", "feels cramped").
- Usability testing with people (README §8). This audit only prepares for it.
- Auditing pixels inside the Pixi canvas for WCAG. README §6 scopes AA to non-canvas UI. Canvas affordances are checked only for a DOM equivalent (principle 23).

## Decisions

### 1. The rubric is the 30 principles, with documents in a fixed order of authority

The rubric is principles 1–30 exactly as listed in the request, each tied to its source section:

- §11.9 / §13.8 for 1–7
- §13.3 / §11.11 for 8–11
- §13.5 for 12–15
- §11.10 / §13.8 for 16–18
- §13.8 / §11.11 for 19–25
- CLAUDE.md invariants and §13.6 for 26–30

When two documents disagree, the order of authority is FRONTEND-CONTRACT, then INTERFACE, then CLAUDE.md, then `styles.css :root`, which is the source of the token values. A finding cites the winning section. If a lower-ranked document says otherwise, that goes in Doc conflicts, not the finding.

*Alternative considered:* audit straight from the full text of both docs. That was rejected because it makes coverage unverifiable. A fixed numbered list lets the summary table prove that every rule was looked at.

### 2. Art versus chrome

Principle 1 (tokens only) applies to **chrome**: text, backgrounds, borders, focus, buttons, panels, HUD labels and overlays drawn as DOM. **Art** is exempt:

- Pixi/FX visuals in `board/**`.
- 2D canvas drawing of walls, fog and grid in `pages/mapEditor/*Canvas.tsx` and `MapGridPreview.tsx`.
- Dice skin materials in `ui/diceSkin.ts`.
- Animation thumbnails.
- User-choosable palettes such as `ui/tokenColors.ts`.

Inside an art file, a literal is still flagged when it colours chrome. Examples: a DOM label, a button, a selection outline that marks UI state, or text drawn over the board that carries meaning.

*Alternative considered:* flag every literal outside `:root`. That was rejected because it would bury the real drift under hundreds of intentional art colours. The opposite choice, exempting whole directories, was also rejected, because chrome inside the art files would then never be checked.

### 3. Severity

Severity is the first rule that matches:

- **Blocker.**
  - Fails a WCAG 2.2 AA success criterion in non-canvas UI: contrast, keyboard access, focus visible, name/role/value, target size, or a missing non-drag alternative.
  - Or breaches authority: a player-visible control that issues a GM-only command, or GM-only data in the player DOM or accessibility tree.
- **Major.** Breaks a CONTRACT/INTERFACE rule in a way a user would notice in normal use. Examples: layout overflow, a missing interface state, wrong motion, a destructive dialog that doesn't name its target, or a React-boundary breach that causes visible lag.
- **Minor.** Token or style drift a user is unlikely to notice: an off-scale spacing value, a radius of 5 instead of 6, a literal colour equal to a token.

Within a severity, findings are sorted by principle number, then by file. Each finding gets an ID `UI-NNN` in that order.

*Alternative considered:* score impact × likelihood. That was rejected because it is too subjective to apply consistently across 30 rules.

### 4. Three buckets: violation, not built, doc conflict

- **Violation.** Something exists and contradicts the rule.
- **Not built.** The rule governs a surface that does not exist yet. Examples: a `/rooms` hub with the §13.3 layout, mobile GM thresholds for a prepare sheet that is not a route. These get the status *Not built* in the summary and appear in the doc-conflicts section, never as findings.
- **Doc conflict.** The docs contradict each other, or contradict what is deliberately built. Examples: `/library` is built though §13.1 defers it; `/signin` exists where the docs say `/login`; prepare and log are in-room panels rather than routed sheets. These are listed with both references. The audit does not decide which side is right.

### 5. Static pass: five parallel Explore subagents, then verification

There is one read-only Explore subagent per principle group: A (1–7), B+C (8–15), D (16–18), E (19–25) and F (26–30). Each gets:

- the principle text,
- the cited doc sections,
- the art/chrome rule,
- and an instruction to return **candidates** only, each with `file:line`, the quoted code and the principle number.

Explore agents read excerpts, so their output is not evidence. The main agent re-reads every candidate's lines before accepting it, and drops or reclassifies the ones that don't hold up. The count of dropped candidates per group is logged, which makes the false-positive rate visible.

*Alternative considered:* one agent sweeps everything. That was rejected because of context size and because a single pass tends to under-cover groups D and E.

### 6. Runtime pass: three participants with separate storage

| Participant | Where | Identity |
| --- | --- | --- |
| GM | Built-in browser tab at `http://localhost:5273` | Seeded dev account from `devAccount.ts` (test credential, loopback only) |
| Player (UI under test) | Second built-in browser tab at `http://127.0.0.1:5273` | Guest join via the invite link |
| Scripted player | `socket.io-client` script in the scratchpad | `POST http://127.0.0.1:3101/api/invites/:code/join`, then connect with `auth: { roomId, guestToken }` |

`localhost` and `127.0.0.1` are different origins, so the GM's cookie and the guest's localStorage seat never mix. The scripted player is a clean remote sender and receiver. It generates pings and previews the GM sees, and it timestamps the previews the GM sends (principle 15).

Only the `server-isolated` and `web-isolated` configs are used. The user's `:3001`/`:5173` servers and the `vtt` database are not touched. All rooms live in memory and disappear when the server stops.

*Alternative considered:* the gm-view-as-player mode. That was rejected because it is a GM-side simulation. Principle 14 needs a real player's session, socket payloads and DOM.

### 7. Measurement methods

Measurements run in page context through `javascript_tool`, reading only. The page is never changed.

- **Overflow (9).** `documentElement.scrollWidth > clientWidth` at 375×812, 667×375, 800×600 and 1280×800, set with `resize_window`.
  - Tab wrapping: the tablist's tab `offsetTop` values all match.
  - Panel placement: `getBoundingClientRect` of the board and panel against the §13.3 table.
- **Contrast (25).** WCAG relative luminance from computed `color` against the effective background. The effective background is found by walking ancestors and compositing alpha. Measure every text style in use (body, muted, labels, error, accent-ink on accent, disabled) and every control boundary (`--border-strong` against the adjacent surface). Done in both themes, since `theme.ts` supports light.
- **Focus (21).** Move focus with real `Tab` key presses, not `.focus()`, so `:focus-visible` applies. Then read the computed `outline-*` and `outline-offset`, including on accent-filled buttons.
- **Size (3).** Control `getBoundingClientRect().height`. Hit targets are measured under the mobile preset, which emulates a coarse pointer, against 44×44.
- **Fonts (4).** Computed `font-family` and `font-variant-numeric` on HP, initiative, dice result and seq elements.
- **Reduced motion (7).** CSS `@media (prefers-reduced-motion)` cannot be emulated in this browser, so those rules are verified statically. At runtime:
  - (a) Turn on the in-app `reducedAnimations` setting, then trigger a ping, an attack animation and a dice throw.
  - (b) Override `window.matchMedia` for the reduced-motion query in the page and repeat. This exercises the JS paths that query lazily (`effects.ts`, `Die3D.tsx`, `animationPreview.ts`).
  - Paths that cache the query at load time are noted as *not runtime-verified*.
- **Preview rate and expiry (15).**
  - Rate: the scripted player timestamps the ephemeral messages it gets while the GM drags a token, against ≤20 Hz.
  - Expiry: the scripted player sends one ping and one preview, then stops. Use screenshots or the DOM, plus a static check of the expiry constants, against 1 s for previews and 1.5 s for pings.
- **States (16).**
  - Empty: a fresh room and an empty roster.
  - Error: `/join/not-a-code`, and a forbidden command sent by the scripted player, observing what the sender is told.
  - Loading: static check plus a screenshot taken right after a reload. Network throttling isn't available; that limitation is logged.
  - Offline: `preview_stop` on `server-isolated` mid-session. This runs **last**, because restarting loses the in-memory room.
- **Authority (14, 27).** Diff the player tab's tool rail, menus and accessibility tree (`read_page`) against the GM's. Check that any extra control the player sees is refused by the server, by sending its command from the scripted player.

### 8. Proof that nothing was modified

Before the first task, record `git status --porcelain` and `git diff | shasum`. After the last task, record them again. The only allowed differences are the new `docs/audits/ui-design-audit-2026-10-29.md` and the files under `openspec/changes/audit-ui-design-conformance/`. The scratchpad script sits outside the repo.

### 9. Report shape

`docs/audits/ui-design-audit-2026-10-29.md` has these sections, in this order:

1. Scope and environment: commit SHA, branch, dirty files present, servers used.
2. Summary table: principle number, short name, status, finding count.
3. Findings by severity: ID, principle, location, what the doc says (section), what the code does, a one-line suggested fix.
4. Not built.
5. Doc conflicts.
6. Limitations: everything not runtime-verified, and why.
7. Verification log: copied from the change's `verification-log.md`, with an action and observation for each step.

The top 10 findings in the chat reply come from the top of section 3.

## Risks / Trade-offs

- **[Risk]** The seeded dev account's password is public, and someone could mistake this for using a real credential. → Use it only on loopback (`localhost:5273`), as the seed file documents, and never write its value into the report or the log. Refer to "the seeded dev account".
- **[Risk]** Explore subagents report plausible but wrong `file:line` candidates. → Decision 5: re-read every candidate, and log the drop counts.
- **[Risk]** Reduced-motion CSS and loading skeletons can't be fully exercised in this browser. → Verify them statically, and list them under Limitations rather than claiming a Pass.
- **[Risk]** Stopping the server for the offline check destroys the session. → Run it last. Capture all other evidence before it.
- **[Risk]** Another session is using the user's own dev servers or the shared browser. → Use the isolated ports. Use the built-in browser, not Playwright. Use origin separation for the two tabs.
- **[Trade-off]** Severity rules are coarse, so some Majors will feel Minor and the reverse. A consistent ranking is worth more than a fine-grained one.
- **[Trade-off]** A single snapshot audit goes stale as the branch moves. The report records the commit SHA so readers know what it describes.

## Migration Plan

Not applicable: nothing ships. To roll back, delete `docs/audits/ui-design-audit-2026-10-29.md`.

## Open Questions

- Should findings be turned into Jira or OpenSpec changes one-to-one, or grouped by owner? This can wait until the report exists, and it doesn't affect the audit itself.
