# Tasks

**Status:** Draft for review. No implementation milestone has started. All boxes below refer to future work; creating the planning packet does not complete them.

Read [design.md](design.md), the [requirements](specs/interactive-scene-studio/spec.md), [research.md](research.md), [handoff.md](handoff.md) and [ADR 0073](../../../docs/adr/0073-interactive-scene-studio.md) before selecting a milestone. Trace this work to FR-GM-26/27 and native terrain behavior. M0–M5 are sequential outcomes, not a claim that every milestone will fit one chat or one PR.

## Execution contract

- Start each selected milestone with a bounded inspection of the current code and its named research questions. Record conclusions and dated primary sources; do not reopen the complete product design for routine choices.
- Each task's verification is part of the task. For runtime changes, finish the applicable repository lint, typecheck, tests and build, focused browser checks and a diff review before reporting completion. Use isolated services for persistence checks; do not alter the user's development database to make tests pass.
- Keep automated, local-browser, actual-host and production evidence distinct. A missing prerequisite is pending work, not a passing test. M0 qualification gates later host-dependent work; local preparation can continue only within the selected scope.
- Work autonomously within approved scope. A new user-facing behavior, authority/privacy change, required architecture review or unapproved external action needs a concrete decision; continue unaffected work. Never invent approval or inherit the old terrain task's review exception.
- Default to one branch/PR per bounded milestone. If a milestone is too large, split it into named submilestones before coding. M1a (delegation) and M1b (private storage/intake) are the first likely split; M3 can split contracts/store from tool integration.
- Update handoff.md with the actual base, changed commits, checks, redacted evidence and next starting instructions. Preserve unrelated edits and the old standalone branch. No automatic merge, public listing or production deployment is authorized by this packet.
- Keep the parent change open until its requirements are delivered. Resolve affected active-builder/durable-spec discrepancies before final archival; do not archive another change just to satisfy this checklist.

## 1. M0 — Prove the actual ChatGPT integration

**Purpose:** Resolve host and transport assumptions before building the product around them. **Dependency:** Product approval to start this proof. **Scope:** A small integration spike in the existing MCP service with non-sensitive fixtures and an authorized testing endpoint. New production infrastructure is outside this milestone.

**Investigate:** SDK compatibility, actual file handoff, model-visible images, mounted-view updates, message submission, delegated authentication and private media under CSP. See research.md for exact experiments.

- [ ] 1.1 Refresh the baseline, inspect applicable instructions, preserve other worktrees and record actual client/model/access conditions; verify the readiness record names the exact commit and any missing host/operator prerequisite.
- [ ] 1.2 Diagnose reachability by layer using available authorized operator checks and a real MCP exchange; verify origin, proxy path and test-endpoint results are recorded separately, with Cloudflare challenges classified as edge barriers.
- [ ] 1.3 Prove a compatible MCP SDK/ext-apps path with a small UI resource in the actual ChatGPT web client; verify it renders and expands when offered, and record exact dependency versions and console results.
- [ ] 1.4 Prove original-file intake using a fixture hash and decoded dimensions, plus an expired-descriptor failure; verify bytes are checked independently of the model and no thumbnail is accepted silently.
- [ ] 1.5 Prove model-visible derived imagery using an overlay-only marker and an image-omitted control; verify the recorded prompt and textual metadata do not reveal the answer, and label this a visibility test rather than a map-accuracy benchmark.
- [ ] 1.6 Update a saved value through another actual tool call and reopen the view; verify the mounted view refreshes and the reopened view recovers backend state rather than only widget-local state.
- [ ] 1.7 Submit a selected-region request and trace its ID into the AI's subsequent tool read; verify consent/composer/timeout behavior and that host acknowledgement is not reported as completed work.
- [ ] 1.8 Exercise the proposed OAuth and authenticated-media mechanisms with test identities and fixtures in the host; verify discovery, denied/expired access and CSP behavior, and identify every stub versus application integration.
- [ ] 1.9 Record selected versions, the proposed internal grant-verification/media path, fixture-only limitations and evidence; verify an independent diff review and the applicable checks pass, and update handoff.md with M0's actual qualification status.

**Exit:** Actual ChatGPT evidence covers the required experiments; uncertain or unavailable experiments remain unchecked. If the host cannot support a required interaction, revise the design with the user before dependent implementation. A standalone reference harness alone does not pass M0.

## 2. M1 — Connected workspace and protected file intake

**Purpose:** Open the correct build and move artwork into it from chat with the privacy selected by the user. **Dependencies:** Qualified M0 path; architecture review for credential/private-media changes. **Likely session split:** M1a access, M1b storage/intake.

**Investigate:** Existing account/pass separation, current public/static storage routes, host file metadata and grant propagation to the build API. Resolve the exact implementation choices in the ADR before dependent integration.

- [ ] 2.1 Record product and architecture review disposition for this boundary and finalize the tested auth/media design; verify required sign-off is linked to the reviewed revision before dependent implementation, with no inferred prior approval.
- [ ] 2.2 Add build-scoped delegated access through the existing identity and HTTP service boundary; verify foreign-build, room-credential, forged-owner, expired, revoked and write-time-revocation cases, and that owner choices/publication remain unavailable to delegation.
- [ ] 2.3 Add private Studio asset persistence and delivery without moving existing public assets; verify originals and derivatives cannot be read through unauthorized API, `/uploads`, encoded paths, local fallback or direct object-storage access, on both supported storage modes.
- [ ] 2.4 Add embedded Add files and explicit host attachment import where supported, reusing validation and quotas; verify original identity, canonical dimensions/orientation, partial multi-file outcomes, safe remote-download limits, expiry and idempotent retry.
- [ ] 2.5 Register the credential-free Studio UI resource and open/build-binding operation; verify the real host shows build/owner identity and the source map, and identifiers alone confer no authority.
- [ ] 2.6 Recover authorized saved state after closing/reopening and reauthorization; verify another owner's view remains refused and private response caching does not disclose previous content.
- [ ] 2.7 Verify new grants/media are covered by discard, account deletion and abandoned-build cleanup, while legacy and published media remain valid; exercise both stores and an isolated persistence restart.
- [ ] 2.8 Complete focused security/upload/browser checks, required repository checks and diff review; verify a real ChatGPT map-plus-token-art intake and update handoff.md with durable redacted evidence.

**Exit:** An owner opens their build in ChatGPT, supplies originals there and sees the protected map after reopening. No user-facing Studio with private artwork is enabled until its access plane is proved.

## 3. M2 — Watch preparation from a raw map

**Purpose:** Deliver the first useful visual milestone with the existing builder's authoring tools. **Dependency:** M1. **Scope:** Unified display and actual saved progress; revisioned corrections follow in M3/M4.

**Investigate:** Reusable map/grid/terrain/geometry/token layers, view refresh cost, existing tool outputs and unfinished-grid/error semantics.

- [ ] 3.1 Extract shared map rendering and website/embedded adapters using existing map-coordinate behavior; verify source, grid, effective walls/openings, terrain and encounter placements agree with native builder data at representative scales.
- [ ] 3.2 Add explicit active map/encounter context while preserving other build items; verify a context switch does not reinterpret coordinates or mutate another map/encounter.
- [ ] 3.3 Display batches saved by existing build tools in an already-open Studio, with visible-only refresh and teardown cleanup; verify save-to-display latency and aggregate tool traffic against the configured interval and rate limits.
- [ ] 3.4 Display unfinished, awaiting-input, saved, invalid and uncertain states using actual backend outcomes; verify a failed save retains the last saved overlay and no simulated reasoning or percentage is shown.
- [ ] 3.5 Guide initial grid/geometry/terrain/token preparation using the current native rules and owner choices; verify unconfirmed grids remain inspectable and blocking issues are actionable without claiming publication readiness.
- [ ] 3.6 Add English/zh-TW controls, keyboard review, narrow/fullscreen layouts and stable focus/camera behavior; verify relevant browser workflows and hosts without Apps retain useful tools and a website path.
- [ ] 3.7 Run a real ChatGPT preparation from an original image plus token art; verify the grid, geometry, Base terrain and placements appear without returning to the website, then finish required checks/review and hand off evidence.

**Exit:** The user can watch a raw image become a prepared private draft inside ChatGPT. This is an internal useful preview of part of the feature; it does not claim the M3–M5 revision/correction guarantees already exist.

## 4. M3 — Versioned, scoped proposals

**Purpose:** Make precise correction safe before adding its full interaction UI. **Dependencies:** M2; architecture review of authoring contracts and enrollment. **Scope:** Builder contracts, persistence, tool integration and deterministic validation.

**Investigate:** Existing array identities, setup save races, edited-item locks, source/grid binding, dependency versions and snapshot size. Record exact wire contracts and measured limits before coding their consumers.

- [ ] 4.1 Finalize the authoring contracts, lifecycle states, error semantics, measured history/byte bounds and compatibility strategy in the reviewed ADR/design; verify architecture disposition and a requirement-to-test mapping before dependent schema changes.
- [ ] 4.2 Add immutable bounded revisions, stable authoring IDs and guarded working pointers to memory/Postgres; verify persistence/restart, retry idempotency, history limits and restore-as-new-revision behavior without copying image bytes per revision.
- [ ] 4.3 Capture source/grid/encounter and relevant creature/art dependencies in requests and revisions; verify source replacement, grid correction, cropped-edge cells and stale dependencies cannot be silently reinterpreted.
- [ ] 4.4 Implement semantic correction operations and server-derived layer/cell/object/destination scopes; verify out-of-scope and mixed invalid corrections write nothing, including crossing-wall and multi-cell-token cases.
- [ ] 4.5 Enroll targets and make legacy writes revision-aware or refuse them, retaining ordinary-build behavior; verify stale legacy replacement cannot overwrite a candidate and an AI proposal cannot mutate an owner-edited materialized item.
- [ ] 4.6 Apply write-time authority/choice/revision checks across all authoring paths; race owner edits, two AI proposals, revocation and retries in both stores and verify only an allowed current proposal advances the pointer.
- [ ] 4.7 Adapt tool reads/writes to explicit inspected revision tokens and actionable conflicts; verify native geometry, portal cutting, terrain binding and footprint checks still apply through the real HTTP/MCP stack.
- [ ] 4.8 Complete required checks, diff review and focused regression tests, including existing builder/terrain publication; verify no new room command/event/GM authority was introduced and update the handoff.

**Exit:** A correction can be submitted against a named base, checked, retained and promoted safely. Stale work survives for inspection; owner changes cannot be overwritten silently. Exact UI polish is M4.

## 5. M4 — Select, ask, compare and refine

**Purpose:** Deliver the correction interaction inside ChatGPT and the website. **Dependency:** M3. **Scope:** Selection, saved requests, host handoff and visual revision comparison.

**Investigate:** Selection under existing camera transforms, object extents, crop/overlay fidelity, actual host message semantics and stale widget instances.

- [ ] 5.1 Add rectangle and object selection with a keyboard alternative, visible scope and complete crossing-object extents; verify selection after pan/zoom, cropped-edge cells and large tokens uses canonical map coordinates.
- [ ] 5.2 Persist correction requests with their base and retrieve exact image/structured context; verify a second view's selection cannot change an earlier request and private crops retain their parent's authorization.
- [ ] 5.3 Submit readable correction instructions only on user action and expose prepared/handoff/observed/saved/error states; verify real host composer/consent/timeout behavior, with no automatic retry loop or false completion.
- [ ] 5.4 Render same-camera before/after, change list focus, removal marks, token arrows and portal/visibility changes; verify keyboard access and shape/text cues as well as color in browser and embedded layouts.
- [ ] 5.5 Support another private correction against the current candidate, rejection and restore without mandatory website acceptance; verify candidate ancestry and stale-state conflicts in two views and after reopening.
- [ ] 5.6 Provide the website's saved-request/copyable-prompt handoff and non-Apps fallback; verify neither claims it can wake an unrelated AI chat automatically.
- [ ] 5.7 Complete a real ChatGPT doorway, courtyard-terrain and hidden-sentry correction sequence, including one refinement; verify scope, observed results and matching website state, then finish required checks/review and handoff.

**Exit:** The user points at a problem and sees/refines a saved proposed repair inside ChatGPT without visiting the website between rounds.

## 6. M5 — Exact owner review, publication and full qualification

**Purpose:** Close the journey from raw artwork to an ordinary playable saved encounter. **Dependency:** M4 and review of publication/private-media boundaries. **Scope:** Existing owner publication integration, recovery and complete workflow evidence; production rollout remains separately authorized.

**Investigate:** Publish dependency closure, reused library values, private-media aliases, rollback visibility, quotas, retained publication receipts and native player filtering.

- [ ] 6.1 Open website review for an exact candidate with the versions of every dependency actually used; verify a new candidate or changed library/grid/profile/art dependency is announced and cannot silently change the review.
- [ ] 6.2 Materialize and publish the owner-selected candidate under current version/authority checks through the existing atomic add-only path; verify foreign/delegated/pass requests are refused and retries do not duplicate items.
- [ ] 6.3 Add commit-gated ordinary library delivery for published private media; inject publication failures and verify no would-be public alias, storage URL or static fallback exposes artwork before a successful commit.
- [ ] 6.4 Preserve native confirmation and validation, including stale terrain, blocked footprints, portal cutting, hidden states and quotas; verify refusal leaves library rows and private media unchanged.
- [ ] 6.5 Start a room through the existing path and inspect raw player payloads; verify reviewed geometry, terrain and placements persist, hidden content is withheld and no Studio history or GM credential reaches AI/player clients.
- [ ] 6.6 Exercise reload/restart, expiry/reauthorization, old widgets, concurrent tabs, discard and abandoned/account cleanup after partial publication; verify published media is retained and ordinary view reads do not extend build retention.
- [ ] 6.7 Qualify the complete raw-map-to-correction-to-owner-publication journey in actual ChatGPT web using representative architectural/cave maps and token art; record correction effort, remaining uncertainty and real results instead of claiming general model accuracy.
- [ ] 6.8 Run the repository-required checks, relevant browser suites and independent diff review; perform a Claude compatibility smoke check only if access is available and authorized, otherwise label it unqualified without implying ChatGPT's results cover it.
- [ ] 6.9 Reconcile affected active-builder/durable-spec discrepancies, update user/client support guidance, and review the final handoff/receipts; verify all release claims name their actual evidence and archive only when the parent requirements are truly satisfied.

**Exit:** The complete agreed journey is qualified in ChatGPT web, owner-only publication is preserved, and native rooms contain the reviewed result. A production deployment is claimed verified only after a separately authorized production check of the actual deployed revision; otherwise production remains explicitly unverified.
