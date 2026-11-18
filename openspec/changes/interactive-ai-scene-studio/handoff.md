# Implementation handoff

## M2 manual acceptance, 2026-11-17

- The owner tested the fresh isolated M2 stack at `0cd8818e28b887b8d5c62b9c31b313f7e80f2adc`
  in ChatGPT Work with the temporary personal plugin `Session Zero Studio M2 Manual (Fresh)`.
  The Studio resource was `ui://session-zero/studio.08d67fe46f615e81.html`.
- The owner reported that the exercised behavior worked well enough to close task 3.7.
  They observed that a build created after OAuth consent was outside the existing grant.
  That matches D7: consent covers the selected build IDs, and a new build needs a new grant.
  The report was an overall acceptance and included no per-check matrix, original byte
  comparison, or save-to-display measurements.
- Stack readiness was verified separately: clean checkout, Node 22.23.2, fresh migrated
  Postgres, private S3 startup checks, a real detector candidate, public signup and health
  endpoints, and matching OAuth discovery and bearer challenge.
- Full M2 code review remains pending. Review from base
  `2bcfa0a1f772a94a907f2c6597aed41d0cef0234` through implementation tip
  `0cd8818e28b887b8d5c62b9c31b313f7e80f2adc`. The manual stack was left running for the owner.

## Latest session — M2 chat-attachment intake, 2026-11-17

- Worktree `/private/tmp/session-zero-studio-m2`, branch `feat/interactive-ai-scene-studio-m2`.
  Started clean at `9481a162`, the interim exact-host fix, on top of M2 implementation
  `bd9daa1a`. M2 remains unmerged. This session covers the FR-GM-26 policy amendment and
  local commits and checks. The next session owns stack preparation and the user owns task
  3.7 acceptance.
- [D9](design.md#d9-original-file-intake) records the regional composer hostname pattern,
  the interim fix's provenance, the exclusion of widget and Azure Blob origins, the removal
  of the merged M1b view upload paths and origin-only refusal logging. The embedded view
  and refusal messages offer chat reattachment or the existing owner build upload page in
  English and zh-TW. Expired links still ask for reattachment in chat.
- The eventual PR description for **Raymond's Real-Time Architecture review** should call out
  the FR-GM-26 change from exact hosts to the bounded composer prefix and the removal of the
  merged M1b picker/device/tool path. Include the trust boundary, origin-only logging and the
  existing owner upload as the fallback. `CLAUDE.md` requires an ADR for changes to existing
  `packages/shared` schemas. This patch changes no such schema, so the D9 amendment is the
  design record for this review.

### User-reported ChatGPT Work run, 2026-11-17

The user ran ChatGPT Work on `sz-studio-m2-e9216bcf` and reported these observations.

> - The grid suggestion showed.
> - Walls, windows, Blocked and Difficult Base terrain, and visible and
> - Saved changes appeared in the already-open Studio without reopening it.
> - Camera and focus stayed put.
> - Only failure: composer imports refused with "origin" (diagnosed above; interim fix 9481a162).

The placement line ends at “visible and” in the received report. This records the observed
run with its intake failure. Task 3.7 was open at the time. Individual results were pending
for zh-TW, fullscreen/narrow, close recovery, disabled permissions and refused saves,
multi-map/encounter separation, and disconnect/reconnect with a newly created build.

### Independent review

- The security review found that Unicode case folding could hide an IDNA-mapped raw
  hostname. The parser now folds ASCII case only, with a regression for the Unicode
  spelling and a positive uppercase HTTPS control.
- The review also found that the existing website upload is reachable by file link.
  The fallback discloses that visibility in English and zh-TW. The browser test uses
  the real owner form with a synthetic PNG and checks that the open Studio sees it.
- Re-review confirmed both fixes and found no further issues in the requested scope.
  Composer hostnames can still change outside the chosen pattern. The policy constrains
  destinations and retains its transport and decode bounds. Individual descriptors
  remain untrusted.

### Local verification and affected files

- Node 22.23.2 lint and typecheck passed. `npm test` passed 5,406 tests including the
  latency benchmark, with 65 skips for optional services. Tests ran with `COOKIE_SECURE=0`
  and `DATABASE_URL` and `REDIS_URL` unset. The MCP Studio bundle built and loaded as
  `ui://session-zero/studio.08d67fe46f615e81.html` from the production build.
- Playwright consent and intake passed all 60 cases across desktop and narrow/touch
  Chromium, Firefox and WebKit, using test-owned loopback memory/disk fixtures. The
  fallback case verifies English and zh-TW guidance, the build-page URL, and an actual
  synthetic owner upload visible in Studio. A WebKit teardown race was fixed by stopping
  polling and draining bridge callbacks after the assertions. Both complete WebKit
  projects and the fallback case on the other four projects passed the reruns.
- The updated `studio-preparation.spec.ts` typechecked. Its Postgres/S3 and real-detector
  browser run and the ChatGPT Work retest remain for the next stack. The user-reported
  observations above are the only M2 real-host evidence recorded here.
- The change updates server `studioDownload.ts`, the two server catalogs and server
  regressions, MCP Studio tools/resource and intake tests, and the embedded
  `SceneStudio.tsx` and English/zh-TW catalogs. It also updates both intake and preparation
  browser specs, this OpenSpec change and the M2 runbook.
- OpenSpec validation passed in normal mode. Strict mode still reports the two baseline
  requirement-length warnings for native geometry and reopening. The amended intake
  requirement is within the length limit. `git diff --check` passed.

### Next stack-preparation session

Use the clean M2 branch tip and [M2 runbook](../../../apps/mcp/README.studio-m2.md). Prepare
fresh isolated Postgres and authenticated S3 with private/public buckets and run the real
`services/vision` detector. Use Node 22.23.2 and the runbook's explicit loopback endpoints,
migrations and synthetic fixtures. Configure the fresh HTTPS tunnel origin as
`STUDIO_PUBLIC_ORIGIN` on server/MCP and `CLIENT_ORIGIN` on the server. Update the URL of
`Session Zero Studio M2 Manual` to that origin plus `/mcp/studio`, refresh tools and use a new
`studio_open` call. The existing plugin points at the stopped stack's dead tunnel.
Retest composer originals and the owner-page link, then let the user report the pending
qualification steps. The manual stack is stopped.

## Previous M2 research session, 2026-11-17

**Phase 2 authorized:** the user approved recording the Phase 1 design and beginning
implementation. D13 and ADR 0073 record that design before dependent product code.

- **Base verified:** remote main `2bcfa0a1f772a94a907f2c6597aed41d0cef0234`, checked against GitHub and `git ls-remote`. PR #212 merged as `d23a0b65001ef1d544a314c1779ea711f68b3a72`; PR #216 merged as `cd31b0552154e899d4daf06e6d2ad9968ac43fbc`. Both complete PR heads are ancestors of this base, including M1b fixes through `7eadf503` and its final handoff. Main also contains #219's legacy attack-dice test typecheck fix.
- **Approval update from the user:** after the initial prerequisite audit found the historical owner-review rows still pending, the user reported that Raymond approved everything and explicitly waived other approval gates. This satisfies the M1 prerequisite for this session. It is user-reported approval, not a newly discovered GitHub review or a claim that the glossary owner separately reviewed the terms. The older records below retain their historical scope.
- **Existing host evidence:** [M1 qualification](evidence/m1-host-2026-11-16.md) records actual ChatGPT discovery/DCR/consent/read/disconnect and map/token original intake, source view and reopen/recovery. Independent fixes were re-reviewed through `7eadf503`. M1 did not prepare map items or use a real detector; it does not qualify M2.
- **Isolation:** created branch `feat/interactive-ai-scene-studio-m2` and worktree `/private/tmp/session-zero-studio-m2` from that exact main. Other worktrees and uncommitted files are preserved. Use explicit `fnm exec --using=22.23.2` for Node commands: shells do not all resolve the same Node version.
- **Authorization:** tasks 3.1–3.7 only; research/discuss before product code. The user subsequently authorized the real ChatGPT test, temporary tunnel and synthetic-account steps autonomously, superseding the original request for a separate host-run approval. The Phase 1 design still awaits the user's go-ahead before product code. Commit/push and PR to main are authorized after implementation; no merge or deployment.
- **Research:** see research.md's M2 section for existing layers/tools, context and status gaps, traffic budget, proposed design and verification order. These are proposals, not an agreed implementation design. No M2 task is complete; no product code, dependency install or test service has been started.
- **Preserve active stacks:** read-only inspection found `cse416` development services and manual project `sz-studio-m1b-cce5e8a7` (Postgres 55434, S3 18334, vision 18889). Do not reuse these or their databases/buckets. Existing Playwright configuration forces memory persistence and vision 18889; it cannot be used unchanged for M2 proof.

## Planning and M1 baseline

- Date: 2026-11-16 (planning 2026-11-14).
- Repository: `RLinV1/Session-Zero`, locally named `Virtual-Tabletop`. The existing Git remote still uses the older `Virtual-Tabletop` URL; it was not changed.
- Original planning baseline: `origin/main` at `a86160f584c44c8e8998bc56966e214ff04b5a08`. Current implementation bases are recorded per session below.
- Planning branch: `docs/interactive-ai-scene-studio-plan`.
- Planning worktree: `/private/tmp/session-zero-studio-planning`. Artifacts are repo-relative; a later worktree need not use this temporary path.
- Original worktree: `/Users/chrispsimadas/.codex/worktrees/ef7e/Virtual-Tabletop`, on `feat/mcp-scene-preparation`. Its pre-existing edits and untracked files are outside this change and must remain untouched.
- **M1b (2026-11-16):** tasks 2.3–2.8 implemented and verified on `feat/interactive-ai-scene-studio-m1b` from exact M1a `a422cc78`, draft PR #216. Required real ChatGPT intake/identity/recovery passed; independent fixes re-reviewed through `7eadf503`. Architecture-owner code and glossary-owner reviews remain pending. No M2 started.
- **M1a (2026-11-16):** delegated access on `feat/interactive-ai-scene-studio-m1a` from `origin/main` `4033fd4c`, unmerged PR #212. M1b stacks on it and all of M1 merges whole. First real-host discovery/DCR/consent/read/disconnect qualification passed in the M1b session.
- Feature implementation: the planning session changed none. The **M0 session (2026-11-14)** migrated `apps/mcp` to MCP SDK 2.x and added the flag-gated, fixture-only `/mcp/studio-m0` proof endpoint; see "Latest implementation session" below. No migration, deployment or production runtime configuration was changed.
- Planning-context maintenance: `openspec/config.yaml` was corrected to acknowledge implemented accounts, guest rooms, grid detection and build/terrain support; it does not claim the Studio exists.
- OpenSpec progress is in tasks.md; local, real-host and production proof remain distinct. CLI artifact `done` / `isComplete` means planning files exist, not that runtime tasks or external reviews passed.
- First-release image/UVTT boundary: **confirmed by the user on 2026-11-14**. ADR 0073 architecture review: **accepted by Raymond on 2026-11-16 at `6f645f29`** (reported by the user, with Raymond present); ADR 0073 is now Accepted. M0 design amendments: **decided by the user on 2026-11-16** and applied to design.md (research.md "Design amendment decisions"). M0: **complete on 2026-11-16**, including a real-host run of the post-review server (see "M0 close-out" below). Production: **unverified**.

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

The user wants autonomous implementation in fresh bounded sessions after the design is agreed. The latest session below records authorization for M1b and its real ChatGPT test. That authorization does not start M2 or permit merging/deployment; later milestones require their own instruction.

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

## Latest implementation session — M1b, 2026-11-16

**Authorization and scope:** the saved M1b starter required research/discussion before code.
The user approved the researched D8/D9 design and autonomous implementation, including the
exact two download origins, 40-million-pixel bound and private-file publication refusal.
Design/ADR were recorded in `1a2f7639` before dependent code. The user then authorized the
real ChatGPT test and its registration, connection, selected-build consent and testing clicks.
Optional AWS test-bucket authorization was unused: no AWS CLI/MCP/account operation was needed.
Only tasks 2.3–2.8 were implemented; no M2 overlays, authoring context, revisions or publication aliases.

**Base:** `a422cc78e1c8b3cf1533e152e6ac74681411e421`, the unchanged unmerged M1a head in
PR #212. New worktree `/private/tmp/session-zero-studio-m1b`, branch
`feat/interactive-ai-scene-studio-m1b`. Main initially advanced from `4033fd4c` to
`c007fba33235db37c486907a6918b863d0965b68` (privacy/terms and guest tutorial animation).
During qualification it advanced another five commits to
`8c4f82a1d58fb224067fdc76a6fe274c6286c18d`: legacy attack-dice read upgrades/room render
recovery (#215) and tutorial pacing/practice-map changes (#214). The legacy upgrade touches
the same store files in imports/build-item/encounter conversion, outside Studio auth/media/jobs;
future main integration must retain both. No main merge/rebase. M1a and other branches/worktrees
were untouched; the original M1a worktree remains clean.

**Delivery:** [draft PR #216](https://github.com/RLinV1/Session-Zero/pull/216), base
`feat/interactive-ai-scene-studio-m1a`, head `feat/interactive-ai-scene-studio-m1b`.
Final product revision `7eadf5039f2689bf51f697e0ee044f43595688c5`; the final documentation
commit records host evidence and these check results. Exact pushed head is reported in the
session's final response/PR. Neither PR is merged. GitHub has no status checks attached to
this stacked base (the repository's PR workflow targets main); local results below do not
imply green hosted CI. The connector lacked create-PR permission, so the authenticated local
GitHub CLI created/updates the authorized PR.

| Commit | Content |
| --- | --- |
| `1a2f7639` | Approved exact D8/D9/ADR private layout, intake, recovery and cleanup before code; saved starter approval/corruption note. |
| `6dc65192` | Separate M1a correction: redact malformed credential JSON bodies. M1b only. |
| `a0f8e014` | Private disk/S3 adapters, intake/delivery, persistence/migrations/jobs, attachment/open/app-only tools, static en/zh-TW view, tests and host runbook. |
| `21bf18b9` | Actual 14-day sweep in both stores; true mobile viewport in synthetic host fixture. |
| `6128a46a` | M1a parser follow-up: case-insensitive OAuth/Studio routes. M1b only. |
| `334faed8` / `cce83927` | Review fixes: all S3 filenames qualified; owner session rechecked after private reads; stronger parser proof and safe probe cleanup. |
| `d6182741` | Test-only fix accepts revoked-or-swept grant after proving initially live. Independently re-reviewed. |
| `1e3b5b07` / `2729d389` | Earlier local evidence, handoff, M2 starter and initial PR receipt. |
| `1a8fbdce` | Host-found retained-status localization fix, regression and correct isolated Vite launch command. Independently reviewed and rechecked in ChatGPT. |
| `9eb51538` | Recovery refinement recorded in D8/ADR before dependent fix: pause failed refreshes until explicit Retry/open. |
| `28b09e99` | Prevent repeated dismissed host reconnect prompts; cancellation regression. |
| `7eadf503` | Review fixes: capture operation build/generation/kind before awaits; stale picker/device/import/binding results cannot affect another build; regression tests. Independently re-reviewed. |
| final documentation commit | Actual-host evidence, final checks/cleanup, tasks, research, review disposition and refreshed M2 starter. |

**Delivered:** new private originals/WebP previews use a separate disk directory or explicit
private S3 bucket, never public uploads/mirror/fallback. Guarded intake preserves exact original
hash, raw/oriented dimensions and canonical identity, counts preview quota bytes, deduplicates
receipts/content and retains per-file outcomes. Downloads enforce the approved exact origins,
public pinned DNS, size/time/redirect bounds and no forwarded credentials. The credential-free
content-hashed view obtains images only through authorized app-only calls and `data:` URLs;
open results contain identifiers/status. Reopen/reauthorization recovers saved state; foreign
bindings clear it. Failed refreshes pause until explicit recovery; pending UI operations remain
bound to their initiating context. Durable cleanup covers late writes, discard, account removal,
14-day abandonment and restart. Private dependencies cannot publish before M5; legacy/public
behavior remains valid. No shared room schema or delegated authority change.

**Checks:** Node 22.23.2, existing lockfile, fresh `npm ci`. On final product `7eadf503`,
`npm run lint && npm run typecheck && npm test && npm run build` passes: shared 1,885;
MCP 283; server 1,151 / 64 optional skips; web 1,937; benchmark 2. Full isolated Postgres/S3
server suite: 1,381 passed / five optional skips, including all six real private-S3 cases.
The first final database run inherited HTTPS `COOKIE_SECURE=1`, failing two existing HTTP-cookie
assertions; the entire suite passed after explicitly restoring `COOKIE_SECURE=0`, with no code
change. All 78 relevant Playwright checks pass across six fresh-server browser projects,
including true narrow layouts, cancellation pause/Retry and delayed operation context races.
Earlier unchanged-backend proofs include actual Docker Postgres/S3 restart with recovered
grant/source/retried deletion, additive migrations/schema diff, local MCP container build/health,
and actual selective-public S3 controls. OpenSpec strict validation and local links pass.
[Earlier local evidence](evidence/m1b-2026-11-16.md) preserves revision-specific counts.

**Actual host:** [durable redacted qualification](evidence/m1-host-2026-11-16.md), ChatGPT web
Work / Plus / GPT-6.1 Terra · Light in native Chrome. Actual discovery/DCR, cancelled consent,
selected-build consent, granted reads/unselected refusal, composer map+token originals,
inline/expanded source/identity, host picker and device intake/deduplication, en/zh-TW,
reopen/reload, website disconnect and explicit Retry/same-owner reauthorization passed.
Independent recorded/disk/owner-download hashes match both committed fixtures; two files
remain after repeat selections, with zero prepared items. The final `7eadf503` resource passed
disconnect dismissal and explicit Retry in a fresh conversation. Deliberate host expiry/corrupt
batch, second-owner reauthorization and narrow/keyboard host exercises were not repeated;
automated/M0 evidence remains separately labelled. Old cached template cards may need Refresh
tools plus a new open call after a resource-version change; permanent old-template replay is
not claimed.

**Independent review:** the separate read-only reviewer established and re-reviewed the core
S3 suffix, owner-session race and mixed-case redaction defects, including the stronger parser
assertion and test-isolation fix. It reviewed the host localization change, then reproduced
two context races in the recovery fix. `7eadf503` resolves stale binding and pending picker/
descriptor/device/import effects. Final independent re-review through `7eadf503`: no remaining
findings. The subsequent 78 browser checks pass. This is not architecture-owner review.

**Isolation and cleanup:** earlier local project `sz-studio-m1b-20261116` was removed before
the host run. Host/final-check project `sz-studio-m1b-0fcf88a7` used Postgres17 on55434,
authenticated SeaweedFS on18334 and separate throwaway buckets/config. The host used private
local disk. One root Vite command briefly launched the owned process on default5173; it was
stopped immediately without test requests and the runbook now uses the workspace command
with `--strictPort` on5189. No existing development service/database/bucket was used or changed.
Website discard/account deletion left zero synthetic users/builds/files/grants/tokens and zero
private files; three generated-key-only delayed verification jobs remained under their safety
lease. The temporary M1 ChatGPT app was uninstalled; earlier M0 apps were untouched. Synthetic
test chats/artwork remain in ChatGPT history/Library. Tunnel stopped, then server/MCP/Vite;
no listeners on3109/3119/5189. Compose `down -v` removed both containers, volumes and network;
the owned credential/config/media directory was deleted. No raw authenticated logs or account
profile screenshots were committed. No AWS, production, DNS or edge changes.

**Remaining gates and merge plan:** tasks 2.3–2.8 are verified; architecture-owner code review
and glossary-owner review remain pending. Keep PR #212 and #216 unmerged until the user directs
the whole-M1 merge to main. Production is unverified. The [M2 starter](fresh-session-prompt.md)
names **that whole-M1 merge into main** as its base and requires the actual host/review records;
do not use an unmerged M1b head or start M2 now.

## Previous implementation session — M1a, 2026-11-16

**Authorization:** the user's M1a starter (saved in [fresh-session-prompt.md](fresh-session-prompt.md) "M1a"): tasks 2.1–2.2 only; commit, push and open a PR, no merge; no production, DNS, edge or cloud change; real ChatGPT check optional and only on the user's yes. Recorded approvals: ADR 0073 accepted by Raymond at `6f645f29` (reported by the user); M0 amendments approved by the user on 2026-11-16; implementation choices inside D7 pre-approved in the starter. Nothing on the starter's stop list (external IdP or OIDC, `packages/shared` schema change, owner-choice/publication/room/GM/library authority for a delegated credential, other authority or privacy change) was needed or done.

**Base and branch:** `origin/main` `4033fd4cbfbf192e0006d2297be153832bad7947` (PR #209), unchanged when fetched. Worktree `/Users/chrispsimadas/Projects/VirtualTableTop/studio-m1a`, branch `feat/interactive-ai-scene-studio-m1a`. No other worktree or branch was touched; the user's running `cse416` dev stack and its database were not used.

| Commit | Content |
| --- | --- |
| `67bae769` | Task 2.1: the implementation record in design.md D7 and ADR 0073, before dependent code. |
| `faac0408` | Server: authorization server (`http/studioOAuth.ts`), records and both adapters, additive migration `20261116120000_studio_delegated_access`, `/api/studio/builds/*` with `grantGuard` and the write-time recheck, password change and account deletion, catalog text. |
| `f668ceff` | MCP: `/mcp/studio` verified by introspection; pass and Studio tools share one definition; `/mcp/build` tools unchanged (names, schemas, order). |
| `e954e50b` | Test typing fix. |
| `079895cb` | Web: consent page `/studio/connect`, connections on the build page, en/zh-TW, Vite proxy and `deploy/Caddyfile` discovery routes (repository only), Playwright spec. |
| `16ee1de5` | Independent review fixes (below). |
| later commit | These records, glossary terms, starters. |

**What now exists:** see design.md D7 "M1a implementation record". Everything is off unless `STUDIO_PUBLIC_ORIGIN` is set on both `apps/server` and `apps/mcp`; no deployment file sets it. The delegated tools are the pass tools' reads and draft writes (no upload, removal, choices, pass or publication). Build files are still the existing public `/uploads` files: M1a adds no private media, so the Studio must not be offered to users with private artwork before M1b.

**Checks (all local; no real host):**
- `npm run lint && npm run typecheck && npm test` on `16ee1de5`'s code: exit 0. Shared 1,885; MCP 279 (19 files); server 1,095 passed, 57 skipped (Postgres-only); web 1,937; scripts 2.
- Server suite with `DATABASE_URL` on an isolated throwaway Postgres 17 container (`studio-m1a-test-pg`, port 55433, database `vtt_m1a_test`): 1,311 passed, 4 skipped. `prisma migrate deploy` applied cleanly, and `prisma migrate diff` against the schema reported no drift.
- Postgres race test: a revocation waits for a delegated write that holds the grant; with the `FOR SHARE` line removed the test fails (mutation check run and reverted).
- Playwright `browser/studio-connect.spec.ts` on chromium-desktop, chromium-touch, firefox-narrow and webkit-desktop: 20 passed (consent, refusal, unregistered redirect, zh-TW, sign-in return, disconnect, no sideways scroll). Screenshots stay in Git-ignored `test-results/`.
- `deploy/Caddyfile`: `caddy adapt` with stock `caddy:2` (rate-limit plugin block removed) succeeds and includes the new paths.
- Independent diff review: a separate agent reviewed `4033fd4c..079895cb`. It found no leak of data or authority across owners and reported 10 findings, all fixed in `16ee1de5`: a per-address lockout of shared AI host addresses; an open redirect via registered URIs on the consent page; a registration flood holding the client cap; a race test that proved nothing; the write-time clock; partial batch reporting; racing code or refresh reuse; foreign-key races in sweep and deletion; an untranslated "Unnamed app"; bidi characters in client names. The fixes were not re-reviewed by a second independent pass.

**Evidence labels:** all of the above is [L] local. The real ChatGPT check (optional) was **not run**; M1a is unqualified in a real host. Production: unverified and untouched.

**State left behind:** the throwaway Postgres container `studio-m1a-test-pg` is stopped and removed at the end of the session (see the final report). No tunnel, no ChatGPT connector change, no account data used.

**Pending:**
1. Merge plan (user decision, 2026-11-16, after this session): PR #212 stays open and unmerged; M1b is built on this branch and all of M1 merges to main together. Architecture owner review of the code is not recorded; ADR 0073 lists it as open for the PR.
2. Real ChatGPT run against `/mcp/studio` with a synthetic dev account (DCR, consent, a granted build read, disconnect). The user chose to do it once, at the end of M1b (task 2.8). A local smoke launch of this branch with Studio on (isolated Postgres, uploads on local disk) served the discovery documents and an OIDC 404; nobody clicked through the consent page before it was shut down.
3. Glossary rows added for 建置, AI 應用程式, 連接／中斷連線 and 允許 are marked pending glossary owner review.
4. Deployment prerequisites when it is time: `STUDIO_PUBLIC_ORIGIN` on both services and the Caddyfile routes; not before M1b's private storage.

**Next:** M1b (tasks 2.3–2.8) on a branch from this branch's head, as a stacked PR onto it; starter in [fresh-session-prompt.md](fresh-session-prompt.md) "M1b". Note for local runs: outside production apps/server uses any object storage it finds at 127.0.0.1:8333, which can be the user's dev SeaweedFS; set `S3_ENDPOINT` or `S3_AUTODETECT=0`.

## M0 close-out, 2026-11-16

**Authorization:** the user was present. At their request the agent restarted the quick tunnel and test server, created and connected a new personal plugin "Session Zero Studio M0 (test 2)" in their Chrome, fixed the region drag, and recorded results. The user ran the chats and the device file picker, and ran an independent code review in a separate session. No M1, PR, merge, production change or provisioning.

**Commits on `feat/interactive-ai-scene-studio-m0`:**

| Commit | Content |
| --- | --- |
| `63b1e91a` | Region drag no longer starts the browser's native image drag; cancel handling and clamping. Confirmed live by the user. |
| `f87ebac7` | Review fixes: thin-crop marker crash, evidence log can't reject, bounded `STUDIO_M0_ACCESS_TTL`, non-form OAuth bodies answer 400. |
| `bc105bee` | Review fixes: queued atomic `clients.json`, DCR cap (100) with unused-client expiry, revocation limited to the caller's own token family. **Behavior change:** revoking an access token also revokes its refresh token. |
| `fadf121d` | Review fixes: view URI hashed once; imports checked without a full raw decode and capped at 5 per workspace; **one `createMcpHandler` per route** with the Express request carried in `AsyncLocalStorage`, instead of one handler per request. This changes how every `/mcp`, `/mcp/build` and `/mcp/studio-m0` request is served. |
| `3517078b` | Cleanup: dead code, unused `@modelcontextprotocol/express`, player tool schemas wrapped in `z.object`. |
| later commit | These records. |

**Results (real ChatGPT web, same surface; details in the evidence file's "Follow-up run"):**
- Device upload (`uploadFile`) and `selectFiles`: byte-identical; both use `sediment://` ids and the Azure Blob origin, with 10-minute links (the composer link on 2026-11-14 lasted 5).
- `ui/message` while the model was answering: the host **stopped the current answer** and posted the request; the model read it by id within ≈5 s (2/2). No refusal or timeout was ever returned. Task 1.7 is checked on this basis.
- "Show the Studio again" did not make the model reopen it; the existing view stayed in place. A second open call was not tested.
- Region drag fixed and confirmed.
- New host facts 10–13 are in research.md.

**Checks:** on `3517078b`, `npm run lint`, `npm run typecheck` and `npm test` exit 0; the MCP workspace has 18 files / 271 tests. The implementing agent read the review commits, including the request-serving change, and found no defect. Through the tunnel, the reviewed server answered health 200, an unauthenticated MCP request 401 and a JSON token request 400.

**Qualification:** M0 is qualified. The post-review server (`3517078b`) passed a real-host run after the review: reconnect, a model import of a chat attachment, open, and app-only media calls (evidence file, "Follow-up run"). That run also showed chat-attachment import works when the user asks the AI to set up the Studio with the attached map, which led to the revised intake decision (research.md amendment 15).

**State left behind:**
- Tunnel and test server stopped at the end of the session; the `ripe-resort-…` address is dead, so both ChatGPT test plugins now point at nothing.
- ChatGPT: plugin "Session Zero Studio M0 (test 2)" installed; the old "Session Zero Studio M0 (test)" still points at a dead address. New test chats and the `m0-device-upload` fixture are in the user's history and Library.
- Fixture file outside the repo: `/Users/chrispsimadas/Projects/VirtualTableTop/m0-upload-fixture/m0-device-upload.png` (synthetic).

**Design decisions (2026-11-16):** all proposed amendments approved, with 5a (own OAuth server) and 6a (≈8-hour tokens); intake revised so chat attachments are a primary route; the "Send selection" interruption warning declined. Applied to design.md D2/D7/D8/D9 and ADR 0073.

**Next:** merge or otherwise publish the M0 branch (it also carries the unmerged planning commit), then start M1a from a starter prompt naming the merged base. M1 was not started.

## M0 overnight session, 2026-11-14 (autonomous)

**Authorization:** the user authorized autonomous overnight work to complete M0. That covered driving their logged-in Chrome to add a test connector and run ChatGPT test chats, installing `cloudflared` for a quick tunnel, and committing and pushing the branch with no PR. It did not authorize M1, a PR, a merge, production changes or cloud provisioning, and none were done.

**Branches/commits:** research on `docs/interactive-ai-scene-studio-m0-research` (`497eda71`, from planning commit `5159b88a`). M0 on `feat/interactive-ai-scene-studio-m0`, which descends from it:

| Commit | Content |
| --- | --- |
| `5f0d7919` | `apps/mcp` moved from `@modelcontextprotocol/sdk` 1.32.2 to `server` 2.4.0 / `node` 2.1.2 / `core` + `client` 2.4.0 / `express` 2.0.2, with `ext-apps` 2.0.4 (exact pins). 2025-era requests keep the per-request JSON transport; 2026-07-28 requests are served by `createMcpHandler` in JSON mode. New `test/protocolEras.test.ts`. One test adjusted: v2 answers an unknown tool with a protocol error instead of an `isError` result. |
| `2190ec48` | Flag-gated `/mcp/studio-m0` (`STUDIO_M0=1`, `STUDIO_M0_ONLY=1`): inline `ui://` view, 9 tools, fixture store, bounded downloader, overlay-marker crops, stub OAuth server and resource check. `test/studioM0.test.ts`. |
| `90e11bc8` | Fixes found in the live run: stop answering the OIDC well-known path, content-versioned view URI, persisted DCR clients, media-size probe, expiry hint and operator descriptor replay. |
| later commits | Evidence, `apps/mcp/README.studio-m0.md`, research/tasks/handoff updates. Resolve the exact HEAD with Git. |

The predecessor planning branch is unmerged; this branch carries it. Nothing outside `apps/mcp`, `package-lock.json` and this change folder was modified. `/mcp` and `/mcp/build` behavior is unchanged apart from the SDK swap and the unknown-tool error form.

**What now exists:** a proof endpoint only. It touches no Session Zero builds, accounts, storage, room server, shared contracts or web UI, and its state is in memory. It is off unless `STUDIO_M0=1`.

**Results (real ChatGPT web, Work mode, Plus, GPT-6.1 Terra · Light):** see the research.md section "M0 host results" and [evidence/m0-2026-11-14.md](evidence/m0-2026-11-14.md).
- Pass: view render and fullscreen panel; SDK v2 / protocol `2026-07-28` (no `initialize`); DCR + PKCE + `resource`; app calls carry the bearer; mounted-view refresh in ≈2.3 s; reopen recovers backend state; byte-identical originals by two routes; 5-minute descriptor expiry refused with HTTP 403; model-visible crops 2/2 with a refusing control; selection request traced to the model's read; expired/revoked/foreign access refused with no bytes; `data:` media up to 8.4 MB.
- Design-affecting findings (research.md "New host facts"): template/tool snapshotting per connector version; tool results are retained and re-delivered regardless of later authorization; `blob:` images blocked; two different host file origins; Library retention of attachments; no token refresh on 401; OIDC default when advertised.

**Checks:**
- Automated: `npm run lint` and `npm run typecheck` exit 0; `npm test` exit 0, with 5,101 passed and 56 skipped. The skips are server optional-service tests; the MCP workspace has 17 files / 260 tests, up from 245.
- Local probes: recorded in research.md.
- Actual host: everything above.
- Deployed/production: none.
- Diff review: by the implementing agent only, so an independent review is pending.

**State left behind:**
- Tunnel and server **stopped**. The trycloudflare URL is dead, so the ChatGPT connector "Session Zero Studio M0 (test)" now points at nothing. It is **still installed** in the user's ChatGPT (Plugins → Personal → … → Uninstall to remove).
- Test chats remain in the user's ChatGPT history ("Open Test View", "Describe Image Mark", "Import error reported", "Open Session Zero View", "Import Map File Report").
- The synthetic `e2-fixture-map` is in the user's ChatGPT Library.
- `cloudflared` remains installed via Homebrew.
- Private evidence, keys and the fixture registration are in Git-ignored `apps/mcp/.local/studio-m0/`.

**Pending before M0 is fully qualified (all three resolved on 2026-11-16; see the close-out section):**
1. **View device upload** (`uploadFile`): needs a person at the browser, since a native file picker opens inside the sandbox. Run the README steps; in the Studio view, use "Upload from this device" with a synthetic PNG; confirm the stored SHA-256 matches. The tunnel URL will be new, so recreate the connector or edit its URL, then **Refresh tools**.
2. **`ui/message` refusal/timeout** (task 1.7): try "Send selection to chat" while the model is still answering, and record what the host does.
3. **Independent diff review** (task 1.9) of `5f0d7919..HEAD` in `apps/mcp`, then rerun the repository checks.

**Review status:** product review of the packet and the ADR 0073 architecture review remain **pending**. No reviewer has seen this work.

**Next:** finish the three pending M0 items, then review the design amendment candidates in research.md (D2, D7, D8, D9) with the user and the Real-Time Architecture owner before M1. M1 (M1a delegated access, M1b private storage and intake) is **not authorized** by this session and was not started.

## Research session — M0 research, 2026-11-14 (before the M0 run)

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
