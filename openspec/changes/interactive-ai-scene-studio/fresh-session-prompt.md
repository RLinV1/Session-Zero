# Fresh-session starter — M0

Use this text after reviewing and accepting the packet. The file itself does not authorize execution. Paste it as a new user request in a fresh chat attached to a worktree containing the planning commit. Later milestone handoffs must generate an equivalent starter naming that milestone and its actual predecessor.

```text
Implement and qualify only M0 of Session Zero's interactive-ai-scene-studio change. I have reviewed the product plan and am selecting this proof milestone. Follow the repository's OpenSpec apply workflow for this selected scope; do not implement M1–M5 automatically.

STARTING POINT
- Repository: RLinV1/Session-Zero, locally named Virtual-Tabletop.
- The planning packet starts on docs/interactive-ai-scene-studio-plan, based on main a86160f584c44c8e8998bc56966e214ff04b5a08. Verify the actual planning commit and any updates; do not assume that an unmerged local branch is available from origin/main.
- Read the applicable repository/user instructions, CLAUDE.md and all files in openspec/changes/interactive-ai-scene-studio, plus docs/adr/0073-interactive-scene-studio.md. Confirm the planning review and architecture statuses from actual evidence.
- Inspect status and worktrees before changing anything. Use a clean isolated M0 branch from the planning commit or its approved descendant. Fetch main to identify relevant changes; do not reset another branch or discard unrelated edits.
- Preserve feat/mcp-scene-preparation and its uncommitted files. It is an older standalone UVTT service reference, not this product's implementation base.
- Use Node 22 and the existing npm workspace/lockfile. Inspect current code and nearby tests first; implement only unmet M0 work.

PRODUCT BOUNDARIES
- Extend the existing /mcp/build service and private-build HTTP boundary. Session Zero supplies deterministic tools and never invokes a backend authoring model. The user's ChatGPT performs AI work.
- The complete product journey is raw map/token intake, visible preparation inside ChatGPT, scoped correction/comparison, then final owner publication on the website.
- Unpublished Studio artwork must be protected. M0 uses non-sensitive fixtures to prove the mechanism; it does not authorize silently making real draft files public.
- Retain owner authority, room isolation and ordinary builder behavior. Do not grant an AI a GM seat, library enumeration, owner-choice changes or publication.

M0 DELIVERABLE
Complete tasks 1.1–1.9 in tasks.md, including these actual ChatGPT web experiments:
1. Record the host surface, model, access conditions, test endpoint and exact code/dependency versions. Diagnose origin, proxy path and client access separately. A Cloudflare browser challenge proves neither that the origin is running nor that it is down.
2. Render a small MCP Apps UI from the existing service boundary. Prove the selected SDK integration in the actual host; a standalone basic-host example is only supporting evidence.
3. Transfer an original fixture, independently match its hash/dimensions, and demonstrate expired file-descriptor handling.
4. Demonstrate model-visible derived imagery with an overlay-only visual marker and an image-omitted control. Do not put the expected marker answer in text or metadata. This verifies visual delivery, not overall model accuracy.
5. Change saved state through a later independent tool call and prove the already-open view refreshes. Close/reopen it and prove backend recovery.
6. Select a region, submit a readable correction request and trace that saved request into a subsequent AI tool read. Record consent/composer/timeout behavior; acknowledgement alone is not completion.
7. Prove the OAuth and private-media transport approach with test identities/assets. Identify every stub and what has actually integrated with the application. Record the selected versions, grant-verification mechanism, CSP needs and denied/expired-access behavior for M1's reviewed implementation.

AUTONOMY AND EVIDENCE
- Make reasonable reversible implementation choices within M0 and continue through tests and fixes without routine confirmation. Keep the spike bounded; avoid implementing the complete future schema, OAuth product, private storage migration or correction editor prematurely.
- Verify changing platform behavior against primary documentation and actual experiments. Update research.md with conclusions, dates and reproducible evidence.
- Use existing authorized host/operator access. If consent, credentials or a new external action is needed, prepare the exact experiment first, ask for the specific missing action, and continue independent M0 work. Do not fabricate host observations or bypass required architecture review.
- No new cloud provisioning, paid model/API use, production deployment or edge-policy change is authorized by this prompt. An authorized development endpoint/tunnel proves only its own path. Prepare reviewable instructions for any missing access.
- If the host cannot perform a required experiment, retain the harness and instructions and report that task as pending. Do not replace real-host evidence with scripted MCP calls or mark M0 qualified. If a finding changes product behavior, privacy or authority, propose a concrete design amendment before dependent work.
- Run focused meaningful checks, repository-required checks appropriate to runtime changes, relevant browser verification and a final diff review. Exercise existing player/build routes if the shared MCP transport changes. Isolate databases/services and preserve the user's development environment.

FINISH
- Update tasks.md, research.md and handoff.md with the actual implementation, checks, host evidence, review status, limitations and next starting base. Keep every unfinished experiment unchecked.
- Return a reviewable diff and concise PR description, plus branch/commit identifiers if commits were requested. Do not push, merge, archive the parent change or start M1 without further instructions.
```

# M1a

The starter the user pasted on 2026-11-16 to begin M1a, saved as given. The user's four pre-paste checklist notes that followed it in the same message (about the pre-approval bullet, push/PR, the optional real-ChatGPT check and where the sign-in server runs) are not part of the starter and are left out. The pre-approval bullet was kept by the user, so implementation choices inside D7 were treated as pre-approved.

```text
Implement only M1a ("delegated access") of Session Zero's interactive-ai-scene-studio change: tasks 2.1 and 2.2 in tasks.md. Do not start M1b (tasks 2.3–2.8: private storage, intake, Studio UI resource, reopen recovery) or later milestones.

STARTING POINT
- Repository RLinV1/Session-Zero (local folder Virtual-Tabletop). Base: origin/main at 4033fd4cbfbf192e0006d2297be153832bad7947, the merge of PR #209 (M0). Fetch main and use its current head if it has moved, recording the exact commit.
- Create a new worktree and branch feat/interactive-ai-scene-studio-m1a from that base. Do not touch other worktrees or branches, including feat/ai-build-terrain, feat/mcp-scene-preparation and any uncommitted files in them.
- Read CLAUDE.md, every file in openspec/changes/interactive-ai-scene-studio/ (start with handoff.md "M0 close-out", then design.md D7 and D8, and research.md "M0 host results" and "Design amendment decisions"), docs/adr/0073-interactive-scene-studio.md, docs/adr/0053-build-pass-and-approved-templates.md and docs/adr/0002-transport-and-identity.md.
- Use Node 22 and the existing npm workspaces and lockfile.

APPROVALS ALREADY GIVEN (record them; do not ask again)
- ADR 0073 was accepted by Raymond (architecture review) on 2026-11-16 at commit 6f645f29.
- On 2026-11-16 I approved the M0 design amendments now in design.md D7. They include:
  - Session Zero runs its own OAuth authorization server, linked to existing accounts.
  - ChatGPT registers as a public client through dynamic client registration and uses authorization code + PKCE (S256) with the resource parameter.
  - Tokens are opaque, stored hashed, bound to the Studio resource and to the selected builds, and verified by apps/server.
  - Access tokens last about 8 hours.
  - No OIDC is advertised and no external identity provider is used.
  - Host request metadata (openai/subject, openai/userLocation and similar) is never an authorization input and is not logged or stored.
- Implementation choices that stay inside design D7 as amended are pre-approved: record them in ADR 0073 / design.md (task 2.1) and continue. Stop and ask me before:
  - using an external identity provider or adding OIDC;
  - changing schemas in packages/shared (that needs an ADR and the Real-Time Architecture owner);
  - giving a delegated credential any owner choice, publication, room, GM or library-enumeration authority;
  - any other change to authority or privacy beyond D7.

WHAT M1a DELIVERS
1. Task 2.1. Inspect the current account, session and build-pass code first, including:
   - apps/server/src/identity/sessions.ts;
   - apps/server/src/http/build.ts, with its /api/builds/* (owner session) and /api/build/* (pass) split;
   - apps/server/src/store/buildStore.ts;
   - the Prisma schema;
   - apps/mcp/src/buildTools.ts.

   Then record the exact implementation in ADR 0073 / design.md D7 before writing dependent code:
   - where the authorization server lives (expected: apps/server, on the website origin, so consent uses the owner's existing signed-in session);
   - client, grant and token records, with hashing, expiry, refresh-token rotation and revocation of a whole token family;
   - how apps/mcp verifies a token: HTTP introspection, because apps/mcp never imports apps/server;
   - how the build API accepts a delegated grant next to, and separate from, the build pass;
   - a bounded number of dynamic client registrations.

   Use the M0 stub (apps/mcp/src/studioM0/auth.ts and test/studioM0*.test.ts) only as a reference for what ChatGPT actually sent. It is not the base.
2. Task 2.2. Build-scoped delegated access through the existing identity and HTTP service boundary:
   - Discovery endpoints: protected-resource metadata for the Studio MCP resource and authorization-server metadata. No openid-configuration.
   - A consent page on the website. A signed-in owner picks which build or builds to grant. UI text goes through t(), in English and zh-TW, using docs/GLOSSARY-zh-TW.md terms. Server text uses catalog ids (ADR 0054).
   - The owner can see and revoke grants from the build page.
   - A new authenticated Studio MCP route in apps/mcp (for example /mcp/studio) that verifies the bearer token through apps/server and exposes only existing build-reading and proposal-safe operations within the grant.
   - Leave the flag-gated /mcp/studio-m0 endpoint as it is.
   - Additive migrations with both store adapters (memory and Postgres).
3. Verification that must exist as tests, with FR IDs in the describe names. Each of these must be refused or have no effect:
   - another owner's build (foreign build);
   - a room or player credential;
   - a forged owner id or forwarding header;
   - an expired token;
   - a revoked token;
   - revocation between read and write (write-time recheck);
   - a token issued for a different resource;
   - any attempt to change owner choices or publish with a delegated token.

   Also show that passes and owner sessions behave exactly as before.

PRIVACY AND DATA
- Use synthetic accounts and fixtures only. Never use my real account data or private art.
- Run persistence checks on isolated services (docker compose Postgres in a separate project or database). Never touch my development database.
- Never commit credentials, tokens, signed URLs or raw authenticated request logs.

CHECKS AND HANDOFF
- Before reporting done, run npm run lint && npm run typecheck && npm test and the relevant browser checks for the consent and revoke UI. Then have an independent diff review done in a separate session or by a separate agent, and fix what it finds.
- Optional final check, only if I say yes when you ask: connect real ChatGPT web (Work mode) to a local dev stack through a Cloudflare quick tunnel, using a synthetic dev account. Record the result separately from local tests.
- Commit and push the branch, then open a PR to main when checks pass. Do not merge.
- No production deployment, DNS, edge or cloud changes.
- Update tasks.md (tick only what is verified), handoff.md (base, commits, checks, evidence, pending items) and research.md for any new findings.
- Save this starter in fresh-session-prompt.md under an "M1a" heading.
- Finish by writing the M1b starter, naming the M1a merge as its base.
```

# M1b

Rewritten on 2026-11-16 at the user's request, after the M1a session: M1b is built on top of the unmerged M1a branch, and all of M1 merges to main together. Written for a ChatGPT agent, which first researches and discusses, then builds. The file itself authorizes nothing. Session note (2026-11-16): the pasted M1b starter had truncated/corrupted lines; the intact saved text below was used to recover those passages. The user subsequently approved the Phase 1 design and autonomous M1b build, including the publication refusal, exact origins and pixel ceiling. Optional AWS test-bucket authorization was offered; isolated local services were selected and AWS access is unused. The real-host run/tunnel still requires a separate yes. Before pasting, check the "APPROVALS" block: it repeats only approvals the user gave for M1a, and the bullet marked for the user decides whether D8 and D9 storage choices are pre-approved.

```text
You are joining Session Zero, a browser virtual tabletop (repository RLinV1/Session-Zero), to research, discuss and then build M1b ("protected storage and intake") of its interactive-ai-scene-studio change: tasks 2.3–2.8 in openspec/changes/interactive-ai-scene-studio/tasks.md. Do not start M2 (visible preparation) or later milestones.

HOW TO WORK
- Phase 1, research and discuss (no product code yet). Read the material below and inspect the code it names. Then reply to me with: (a) your understanding of what M1b must deliver and what already exists; (b) a proposed design for each open choice: the private storage layout on both storage modes, how /uploads and the local express.static fallback are excluded, the intake and download path, the UI resource and open tool, recovery, and cleanup; (c) risks and anything that conflicts with the design or needs my decision; (d) the order you'll build in and how you'll test each part. Wait for my go-ahead before writing product code. Doc-only edits that record the agreed design are fine once I agree.
- Phase 2, build. Record the agreed design in design.md D8 and D9 and in ADR 0073 before any code that depends on it. Then implement, test and hand off as described below.
- CLAUDE.md is this repository's agent instruction file. Its invariants, conventions and commands apply to you exactly as written.
- If your environment can't run something this prompt requires (Docker, Postgres, an S3-compatible store, Playwright browsers), say exactly which, don't substitute a weaker check silently, and don't tick a task whose proof needs it.

STARTING POINT
- Base: branch feat/interactive-ai-scene-studio-m1a at its current head (944ed2cb or later; record the exact commit). It is open as PR #212 and is deliberately NOT merged: M1b stacks on it and all of M1 merges to main together. Do not merge, rebase or force-push the M1a branch.
- Create a new worktree and branch feat/interactive-ai-scene-studio-m1b from that head. If main has moved, tell me what changed and whether it touches M1; don't merge main in without asking. Do not touch other worktrees or branches, including feat/ai-build-terrain, feat/mcp-scene-preparation and any uncommitted files in them.
- If M1a code needs a fix, make it on the M1b branch with its own commit and say so in the handoff; don't push to the M1a branch.
- Read CLAUDE.md; every file in openspec/changes/interactive-ai-scene-studio/ (start with handoff.md "Latest implementation session — M1a", then design.md D7 "M1a implementation record", D8 and D9, and research.md "M0 host results", "Design amendment decisions" and "M1a findings"); docs/adr/0073-interactive-scene-studio.md; docs/adr/0053-build-pass-and-approved-templates.md; docs/adr/0002-transport-and-identity.md (its public-bucket decision is what D8 isolates from); docs/adr/0054-localized-messages.md (server text catalog); and docs/GLOSSARY-zh-TW.md.
- Use Node 22 and the existing npm workspaces and lockfile.

WHAT ALREADY EXISTS (M1a, unmerged)
- Session Zero's own OAuth server in apps/server: /api/oauth/*, the consent page /studio/connect and the discovery documents, with no OIDC and no external identity provider. Grants are bound to chosen builds. /api/studio/builds/* rechecks the grant at write time. /mcp/studio in apps/mcp verifies every request through apps/server introspection. All of it is off unless STUDIO_PUBLIC_ORIGIN is set on both services.
- /mcp/studio offers only reads and draft writes. It has no upload and no UI resource yet. Build files are still the existing public /uploads files, which is why Studio must not reach real users before M1b.
- The M0 fixture endpoint /mcp/studio-m0 stays as it is (reference for host behavior only).
- M1a has local evidence only. No person has clicked through the consent flow against a real host yet; the one real ChatGPT run is planned for the end of M1b (task 2.8) and covers M1a's sign-in too.

APPROVALS
- ADR 0073 accepted by Raymond on 2026-11-16 at 6f645f29. The user approved the M0 amendments to D2, D7, D8 and D9 the same day (research.md "Design amendment decisions"), and the M1a implementation choices inside D7.
- [User: keep or delete this bullet before pasting] Implementation choices inside design D8 and D9 as amended are pre-approved once I've agreed to your Phase 1 design: record them in ADR 0073 / design.md before dependent code and continue.
- Stop and ask before: changing schemas in packages/shared; making any new Studio upload or derivative publicly readable, even temporarily or by an unguessable URL; adding a download origin beyond the two in D9 (*.oaiusercontent.com and the observed Azure Blob host); any cloud provisioning, bucket-policy or production change; giving a delegated credential owner-choice, publication, room, GM or library-enumeration authority; any other change to authority or privacy beyond D7–D9.

WHAT M1b DELIVERS
1. Task 2.3. A private storage plane for new Studio originals and derivatives, separate from /uploads, the local express.static fallback and the public-read bucket policy, on both supported storage modes (local disk and S3-compatible). Existing public assets keep working unchanged. Record the exact design (object naming, bucket or prefix, how the local fallback is excluded, cache headers) in D8 before coding. Tests must show originals and derivatives can't be read through an unauthorized API call, /uploads, encoded or traversal paths, the local fallback or direct object-store access, on both modes, and that private responses and errors are not shared-cacheable.
2. Task 2.4. Intake into a granted build: the open/set-up tool accepts chat attachments directly (openai/fileParams), plus the view's Add files (host file picker and device upload), reusing build quotas and byte/type/dimension validation. Download descriptors on receipt, with an exact-origin allowlist, size, redirect and time bounds, no credentials on the download, and no private-network targets. Verify original identity (hash), canonical dimensions and orientation, partial multi-file outcomes, expiry with re-select guidance, and idempotent retry.
3. Task 2.5. Register the credential-free Studio UI resource (a content-versioned ui:// URI) and the open/build-binding tool on /mcp/studio. The open tool returns ids and non-sensitive status only. Private images reach the view only through app-only calls that recheck the grant, rendered as data: URLs (the host blocks blob:). Identifiers alone confer no authority.
4. Task 2.6. Reopen and reauthorization recovery from the backend, with another owner's view refused and no private content in cached responses.
5. Task 2.7. Grants and private media covered by discard, account deletion and the 14-day abandoned-build sweep. Legacy and published media stay valid. Exercise both stores and an isolated persistence restart.
6. Task 2.8. Focused security, upload and browser checks, the repository checks and an independent diff review. Then prepare a real ChatGPT web (Work mode) test: a synthetic map and token art taken in through chat, which also counts as the first real-host run of M1a's sign-in (discovery, registration, consent, granted reads, disconnect). It needs a public tunnel to a local dev stack and my ChatGPT account. Write the exact steps and ask me; don't run it or open a tunnel without my yes.

PRIVACY AND DATA
- Synthetic accounts and fixtures only (for example m0-upload-fixture). Never my real account data or private art.
- Persistence and storage checks on isolated services: a separate docker compose project or database, and a separate SeaweedFS/S3 bucket and endpoint. Never touch my development database or its buckets.
- Watch out: outside production, apps/server probes for object storage at 127.0.0.1:8333 and uses whatever it finds there, which on my machine can be my dev stack's SeaweedFS. For every local server you start, set S3_ENDPOINT to your isolated store or S3_AUTODETECT=0. Likewise give DATABASE_URL explicitly, and don't use ports 3001, 5173 or 5432 if my stack is running.
- Never commit credentials, tokens, signed URLs, descriptor URLs or raw authenticated request logs.
- Never log or store host request metadata (openai/subject, openai/userLocation and similar).
- UI text goes through t() in English and zh-TW, and server text people read is a catalog id (ADR 0054). New zh-TW terms go in the glossary marked pending review.

CHECKS AND HANDOFF
- Before reporting done: npm run lint && npm run typecheck && npm test, the server suite again with DATABASE_URL on the isolated Postgres, storage tests on both modes against the isolated S3 store, and the relevant Playwright checks. Reference FR IDs in test names. Then get an independent diff review of the M1b commits (a separate session or agent that didn't write the code), fix what it finds, and say whether the fixes were re-reviewed.
- Commit and push feat/interactive-ai-scene-studio-m1b, then open a PR whose base is feat/interactive-ai-scene-studio-m1a (a stacked PR, so its diff shows only M1b). Do not merge either PR. In the PR description, say that M1 is meant to merge to main as a whole and list what remains before that (the real ChatGPT run, architecture-owner review).
- No production deployment, DNS, edge or cloud changes.
- Update tasks.md (tick only what is verified, keeping local and real-host evidence apart), handoff.md (base, commits, checks, evidence, pending items, merge plan) and research.md for new findings.
- Save this starter in fresh-session-prompt.md under the "M1b" heading (it is already there; note any edits I made before pasting).
- Finish by writing the M2 starter, naming the merge of all of M1 into main as its base.
- End with a short plain report: what was built, what was checked and how, what wasn't, and the decisions waiting on me.
```
