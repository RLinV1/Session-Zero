# Planning handoff

## Current state

- Date: 2026-11-14.
- Repository: `RLinV1/Session-Zero`, locally named `Virtual-Tabletop`. The existing Git remote still uses the older `Virtual-Tabletop` URL; it was not changed.
- Baseline inspected and used: `origin/main` at `a86160f584c44c8e8998bc56966e214ff04b5a08`.
- Planning branch: `docs/interactive-ai-scene-studio-plan`.
- Planning worktree: `/private/tmp/session-zero-studio-planning`. Artifacts are repo-relative; a later worktree need not use this temporary path.
- Original worktree: `/Users/chrispsimadas/.codex/worktrees/ef7e/Virtual-Tabletop`, on `feat/mcp-scene-preparation`. Its pre-existing edits and untracked files are outside this change and must remain untouched.
- Feature implementation: **none**. No application code, dependency, migration, deployment or runtime configuration was changed by this planning session.
- Planning-context maintenance: `openspec/config.yaml` was corrected to acknowledge implemented accounts, guest rooms, grid detection and build/terrain support; it does not claim the Studio exists.
- OpenSpec artifacts: drafted for review. All implementation tasks are unchecked. The CLI's artifact `done` / `isComplete` fields indicate that planning files exist, not that runtime tasks or external reviews passed.
- First-release image/UVTT boundary: **confirmed by the user on 2026-11-14**. Review of the complete technical packet and ADR 0073 architecture review: **pending**. M0 research: **done (documentation and local probes only; see below)**. M0 host experiments: **not started**. Production: **unverified**.

## Read order

1. [proposal.md](proposal.md): scope and exclusions.
2. [tasks.md](tasks.md): M0–M5 outcomes and verification.
3. [design.md](design.md): architecture, private working candidates, protected media and publication.
4. [requirements](specs/interactive-scene-studio/spec.md): testable behavior.
5. [research.md](research.md): observed baseline, primary sources and exact experiments.
6. [ADR 0073](../../../docs/adr/0073-interactive-scene-studio.md): architecture review packet.
7. [fresh-session-prompt.md](fresh-session-prompt.md): M0 starter to use after design approval.

## User direction carried forward

The user currently starts a build, copies its prompt into ChatGPT, supplies map/token images and switches back to Session Zero to see what happened. The Studio must address that friction during initial preparation, not only offer editing after preparation is finished.

The agreed direction is a raw-map journey with visible saved work and precise corrections inside ChatGPT, followed by final website review/publication. Users bring their own AI. Session Zero supplies deterministic tools. Private correction rounds should not require website acceptance after each edit.

The user explicitly selected **protected unpublished images**, including new Studio originals and derivatives. Do not downgrade this to unguessable public URLs for convenience. Previously public files cannot be retroactively described as never disclosed.

The user confirmed that image maps and AI-traced geometry fit the first release, with arbitrary editing of imported UVTT walls deferred and existing UVTT workflows preserved. They then asked about starting milestone research. Research can inspect code and primary documentation and update planning evidence; it does not itself authorize a runtime prototype or establish real-host qualification. The first milestone in the packet is M0; M1's auth/private-file implementation depends on the M0 findings.

The user wants autonomous implementation in fresh bounded sessions after the design is agreed. They have authorized planning now. No fresh implementation session has been selected or authorized in this handoff. Do not interpret task files, this handoff or the presence of an M0 prompt as that authorization.

## Review points

The following are proposed defaults for the packet review, not unrecorded external approvals:

- ChatGPT web first; standard MCP Apps foundation; Claude compatibility follows available access.
- One active map and encounter per working context remains the proposed implementation scope. The image-first release boundary and deferral of arbitrary imported UVTT wall editing are now confirmed.
- Scoped OAuth for the hosted release; existing passes can support controlled proof/local workflows.
- Immutable candidates, stable authoring identities and server-enforced scopes. Conflicts preserve stale work and require regeneration; no automatic merge.
- Website-only final publication. Private working candidates can advance through chat corrections without an intermediate owner acceptance.
- M1 likely splits into M1a identity/delegation and M1b private storage/intake. M2 is the first useful visual preparation demonstration; M5 qualifies the complete journey.
- Future rehearsal, repainting, multi-owner collaboration, partial acceptance and public directory submission are outside the first release.

## Known baseline facts that matter

- Main contains AI terrain PR #194. It already uses native Base terrain, grid binding, owner choices, previews, blocked-footprint checks and transactional publication.
- The old standalone branch is reference only. Do not merge it, import its service/infrastructure or substitute its prior tests for this integration.
- Ordinary owner edits lock an entire build item. The new Studio proposal path must preserve that protection and close legacy overwrite paths for enrolled targets.
- Current setup writes protect against overlapping handler writes, but do not carry the AI's original inspected revision. Explicit revision tokens are required for Studio corrections.
- Existing draft files can be publicly read by random URL. Private files require a genuinely private storage/delivery plane, including fallback and direct-store paths.
- Current browser framing protections make whole-site embedding the wrong default. Serve an MCP UI resource with shared rendering components.
- The original builder capability specs remain in active changes, and some durable specs lag implemented behavior. Reconcile affected boundaries before final archival without rewriting unrelated changes during this planning step.
- Real connector qualification remains outstanding in the builder/terrain records. Earlier Cloudflare browser challenges did not determine origin MCP availability.

## Verification record

Planning checks to retain with this packet:

- OpenSpec root resolved to this worktree; no new project root or global store was created.
- `openspec validate interactive-ai-scene-studio --strict`: passes for the drafted proposal/design/specs/tasks.
- Markdown structure, relative links and whitespace: passes for all eight planning Markdown files and 17 local links. The capability contains 20 requirements and 43 scenarios; all 48 future tasks are unchecked.
- Final Git diff is checked before delivery. The planning packet is retained on its local documentation branch; use the reported planning commit as a fresh-session base. No push or merge is performed by this planning session.
- Runtime tests and builds are not claimed for planning-only Markdown/context edits. No real ChatGPT experiment or production probe was performed in this planning session.

## Starting a later milestone

After product review, M0 is the first implementation/proof session. Use its explicit starter. Check out the planning branch or a descendant containing this packet before starting; fetching main alone will not recover an unmerged local planning commit. A fresh session should verify `git status`, branch, baseline and predecessor before editing.

For M1 and later, require the predecessor's actual commits and evidence. Start from latest main only when that predecessor has merged; otherwise name the predecessor branch/commit explicitly. Do not silently overwrite or move branches already used by another worktree. Record new mainline changes that affect the plan.

The default authority is to complete only the selected milestone's implementation, tests, review and handoff. Commit/push/PR actions must follow the actual user request and applicable instructions. Merging, production changes, external consent and new paid services require their own authorization; do not treat a milestone title as blanket permission.

## Required handoff after each implementation session

Replace this section's latest-session entry with concrete facts and retain useful history separately:

- Selected milestone and exact completed/unfinished task IDs.
- Starting and ending branches/commits, with predecessor and merge status.
- What behavior now exists, including contract/storage changes and compatibility behavior.
- Which research questions were resolved, sources and selected approaches.
- Checks run and outcomes; distinguish automated, local-browser, actual-host and deployed evidence.
- Durable redacted screenshot/recording/request references. Do not commit credentials, private user art or authenticated URLs.
- Known defects, external prerequisites and exact reproduction steps. Never describe an unavailable check as passing.
- Product/architecture review status with the actual reviewer and reviewed revision when supplied.
- The next permitted milestone and a self-contained starter naming its base and remaining decisions.

**Latest implementation session:** none. The next action is product review of the planning packet and of the M0 research recommendation below, not automatic implementation.

## Latest research session — M0 research, 2026-11-14

**Requested scope:** research M0 only, without implementing application code or building the prototype. Requested deliverables: resolve or investigate SDK/ext-apps compatibility, rendering and refresh, original-image transfer and model-visible crops, selection-to-chat, and scoped OAuth with protected images. Then recommend one approach and a bounded M0 plan, and update this file and research.md. No deployment, provisioning or M1.

- **Branch/worktree:** new branch `docs/interactive-ai-scene-studio-m0-research` from planning commit `5159b88a`, worktree `/Users/chrispsimadas/Projects/VirtualTableTop/studio-m0-research`. A new branch was used because `docs/interactive-ai-scene-studio-plan` is already checked out in `/private/tmp/session-zero-studio-planning`; that worktree was not touched. `origin/main` is `16a9262a` (+1 web-only commit since `a86160f5`, irrelevant to M0 paths).
- **Preserved:** `feat/mcp-scene-preparation` (`2d19d1ec`, local-only) and its worktree's uncommitted files were read, never modified. The original session worktree was not edited.
- **Changed:** `research.md` (new "M0 research — 2026-11-14" section; R9 note) and this file. No code, dependency, lockfile, tasks.md checkbox, deployment, tunnel, OAuth registration or host connection.
- **Checks:** documentation-only change; runtime tests not claimed. Local protocol probes ran against installed SDK packages outside the repo (recorded in research.md Q1). Primary sources were read on 2026-11-14 (R1–R3, R14–R21).

### Conclusions (details and labels in research.md)

| Question | Status | Conclusion |
| --- | --- | --- |
| SDK/ext-apps | Recommendation; local probes only | Migrate `apps/mcp` to SDK v2 (`server` 2.4.0, `node` 2.1.2, `core`/`client` 2.4.0) with `createMcpHandler({ legacy: "stateless" })` and ext-apps 2.0.4. v1 1.32.2 returns HTTP 400 to `2026-07-28` requests (observed locally), and ChatGPT was seen sending `2026-07-28` (old branch). |
| Render/refresh | Documented; unobserved | One `open` tool carries `resourceUri`. The spec does not deliver later tool results to an open view, so poll app-only reads while visible and recover from the backend on reopen. |
| Originals / crops | Documented, plus prior observation without a view | fileParams original transfer and model-visible MCP image blocks were observed on 2026-11-12 (old branch, no MCP Apps view). Widget file helpers are OpenAI extensions with undocumented limits. Crops must be tool results; image model-context is unsupported on web. |
| Selection→chat | Documented; unobserved | Save a request through an app-only tool first, then `ui/message` naming its ID (ChatGPT defaults to `send: true`). Track handed off vs observed via the model's later read. |
| OAuth / media | Proposed; unobserved | Session Zero as authorization server issuing opaque hashed delegated tokens, verified by `apps/server` via introspection. Media goes through app-only host-proxied tool bytes rendered as `data:`/`blob:`, with no public URL. Whether app calls carry the bearer is unobserved. |

**Design amendment candidates (not applied; need review):** D2 could state that polling is required by the spec, not optional. D8 could record that `data:` is the spec's default-allowed image scheme while `blob:` is unproven. D7 could name the proposed introspection-based grant verification. D9 already excludes bulk bytes in JSON tool arguments, so the view-file route must use host file helpers.

### Required user decisions and access before M0 execution

1. **Authorization to start M0** with the recommended approach: the SDK v2 migration of `apps/mcp` plus a flag-gated fixture-only `/mcp/studio-m0`. The packet's product review remains pending; this research is not that approval.
2. A **ChatGPT web account** whose plan and workspace policy allow adding a custom MCP server with OAuth (old branch path: Plugins → + → Add custom MCP server). The user performs the chat actions and consent, and transcribes or screenshots results, because browser automation was unreliable last time.
3. An **authorized public HTTPS development endpoint**: a user-chosen tunnel to local `apps/mcp`. No production, DNS or edge change is implied.
4. **OAuth test setup:** the stub authorization server rides the same tunnel. The user copies the exact ChatGPT callback URL and signs in with the fixture test identity. An external IdP (such as Cognito) needs separate provisioning authorization and is not the default.
5. **Fixtures:** synthetic, non-sensitive map PNG and token art generated in the session. No private art.
6. Chrome with devtools access to capture console/CSP output from the view.

### Proposed M0 execution steps

1. Preflight per tasks.md 1.1: verify this branch/commit, fetch main, confirm `apps/mcp`/build paths are unchanged, then record surface, plan, model and browser (E0).
2. Migrate `apps/mcp` to v2 with exact pins. Run the existing MCP tests plus local dual-era probes for `/mcp`, `/mcp/build` and `/mcp/studio-m0`, then `npm run lint && npm run typecheck && npm test`.
3. Build `/mcp/studio-m0` (fixture store, inline `ui://` view, eight M0 tools, stub AS, bounded downloader) with unit tests for auth refusal/expiry/revocation, download bounds and hash checks.
4. Ask the user for items 2–4 above. Then run E1 → E6 in real ChatGPT web in that order, because rendering and auth gate the rest. Record each result with its label.
5. Run E7: independent diff review and repository checks. Update research.md, this handoff and tasks.md, checking only boxes whose real-host criterion passed. Raise any host limitation as a concrete design amendment before M1.

Unresolved questions are numbered 1–10 in research.md. None blocks starting M0. Items 2, 4, 5 and 6 are what E5/E6/E2 exist to answer.
