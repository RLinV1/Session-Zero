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
- Product review of the complete packet: **pending**. Architecture review of ADR 0073: **pending**. M0 host experiments: **not started**. Production: **unverified**.

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

The user wants autonomous implementation in fresh bounded sessions after the design is agreed. They have authorized planning now. No fresh implementation session has been selected or authorized in this handoff. Do not interpret task files, this handoff or the presence of an M0 prompt as that authorization.

## Review points

The following are proposed defaults for the packet review, not unrecorded external approvals:

- ChatGPT web first; standard MCP Apps foundation; Claude compatibility follows available access.
- One active image-based map and encounter per working context; preserve other build items and existing UVTT workflows. Arbitrary imported source-wall topology editing is deferred.
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

**Latest implementation session:** none. The next action is product review of the planning packet, not automatic implementation.
