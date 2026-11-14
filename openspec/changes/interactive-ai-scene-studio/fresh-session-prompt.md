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
