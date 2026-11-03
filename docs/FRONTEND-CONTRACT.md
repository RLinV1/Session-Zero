# Frontend Implementation Contract — Virtual Tabletop

Part of the [design document](DESIGN.md) — see also [`DELIVERY.md`](DELIVERY.md) and
[`INTERFACE.md`](INTERFACE.md).

Accepted decisions from the frontend review of 2026-09-22, written as implementation
requirements. **This document overrides** older statements in `DESIGN.md`,
[`INTERFACE.md`](INTERFACE.md) and [`DELIVERY.md`](DELIVERY.md) wherever they conflict.

It does not change the built/not-built matrix in `DESIGN.md` §6; accepting a decision here
is not evidence that it ships.

> Section numbers (§13.x) are kept from when this was `DESIGN.md` §13, so existing
> references still resolve.

---

## 13.1 Product scope, identity and entry

**Play requires an authenticated account to create a room.** Keep FR-GM-01 and the
non-null `rooms.owner_user_id`. Do not introduce unclaimed-room authority, expiry or
ownership transfer in the Core Loop. Home explains “Free account required to host;
players join without one” beside the primary action.

- Signed-in Play creates one room and opens its table. Signed-out Play opens login/signup
  with a same-origin return intent; successful authentication continues room creation.
- Creation is idempotent. A retry with the same request key returns the existing result,
  rather than creating another room. Failed creation preserves the authenticated session.
- Accounts represent people; GM/player role remains per room. An authenticated player
  may follow an invite and create a player membership without signing out.
- Guest invite entry remains exactly display name → Join. A known guest gets Resume as
  their existing name. The server validates invite/access before exposing room details.
- Account creation is never required or promoted before a guest enters play.
- An explicit Leave table action, after a confirmation that lists what the player loses,
  ends that player's seat: every tab and device on that credential gets a session-ended
  screen, and the credential is refused afterwards. It never closes the room or affects
  other participants. The GM does not leave; their Home link closes only their socket and
  returns them to their rooms. The departed player's tokens stay as they are until the GM
  reassigns, unassigns or deletes them (ADR 0006). Closing the browser is not treated as a
  reliable session-end event.
- Guest-to-account linking is a later enhancement. When enabled, offer it only after
  Leave table, link only the current room, require proof of both guest and account
  credentials, and preserve the participant ID. Never silently merge all browser seats.
  If the account already has a different membership, require GM-assisted reassignment;
  do not automatically union authority or tokens. Linking must be atomic and rebind or
  invalidate existing guest sessions. Do not ship the offer before this backend exists.
- Until linking exists, cross-device guests are new participants; the GM can reassign
  tokens after confirming identity socially. Explain browser-local identity without
  presenting an account prompt on the join path.
- Core scope includes GM authentication, room hub, invite join, preparation, table and
  ownership controls. Tactical Play adds encounter/recovery surfaces. Saved assets,
  `/library`, co-GM ownership and account claiming are deferred; omit their navigation.
- Existing prototype rooms need an explicit migration: only a verified existing GM
  credential may claim an owner account. Do not infer ownership from an invite code or
  participant name. Until migration is available, retain legacy access without allowing
  creation of further unowned rooms; announce any later removal before it occurs.

**Access changes.** Revocation takes effect immediately in that room, including open
sockets and subsequent commands. Clear cached room data and previews, close overlays,
and show an access-removed screen. Other rooms remain accessible. Invite regeneration
only prevents new admissions through the old code; existing members can resume. Known
members using an old invite may resume after credential verification; unknown visitors
receive an expired-link explanation. Regeneration does not revoke account sessions.

**Identity edge cases.** Two tabs with the same credential are one participant with
separate camera/UI state. Duplicate display names are allowed; ownership menus include
a secondary participant identifier. Storage failure uses a tab-local credential with a
persistent warning that reload loses identity. Cache guest lookups by room and token
hash, never by token hash alone. A browser-wide guest token can grant memberships in
multiple rooms, so its compromise is not limited to one room.

## 13.2 Preparation drafts and replacing a live map

**Preparation remains private until Apply.** Draft assets, estimates, geometry and
previews are accessible only to the GM. They are excluded from player snapshots,
events, ephemeral traffic and asset URLs. Merely hiding a preparation sheet is not a
privacy boundary.

Use a server-persisted draft associated with a room, GM participant and base scene
revision. Persist acknowledged edits; indicate Saving / Draft saved / Save failed.
Closing a sheet preserves acknowledged drafts. If edits remain unsaved, offer Keep
editing or Discard unsaved changes. Reopening loads the draft. Discard draft is an
explicit action; abandoned draft assets are garbage-collected only after a defined
retention window (seven days), with active references protected.

**Preparation sequence:** choose/upload image → manually align grid → optionally request
analysis → review suggested changes → place/configure draft tokens → Apply. Manual
alignment remains usable when analysis fails or detects no grid. A late analysis result
never overwrites manual edits: offer Preview suggestion and Accept suggestion explicitly.
A result is tied to the draft asset revision and rejected if that asset has changed.

**Apply to the current map:** grid/geometry edits are committed atomically after validating
the draft's base revision. Players see the old accepted state until publication succeeds.
If live scene content changed since the draft began, show a stale-draft conflict and let
the GM reload/reconcile; never silently overwrite concurrent state. Camera-only changes
and ephemeral traffic do not invalidate a draft.

**Replacing an active map during play:**

1. Uploading a replacement creates a separate draft scene. The encounter continues on
   the current scene while the GM prepares it.
2. Apply opens a confirmation explaining that everyone will switch scenes, current
   tokens/fog/drawings/templates/initiative will not transfer, and the previous scene
   will be recoverable. The replacement starts fully concealed to players; GM preview
   remains visible. Ownership can be assigned to draft tokens before publication.
3. In one authoritative transaction, validate the expected active scene/revision, save
   an automatic checkpoint of the old scene, activate the prepared scene and append the
   scene-change event. If checkpoint creation or publication fails, change nothing.
4. Send each participant a filtered replacement snapshot. Cancel old-scene gestures and
   pending previews, clear selection, and fit the new map once. Ordinary viewport resize
   still preserves deliberate camera positioning.
5. Reject late commands targeting the previous scene with `scene_changed`. Never replay
   them onto the new map. Announce “The GM changed the scene” without a blocking modal.

No automatic coordinate scaling or token migration is included. The confirmation names
what is reset and what remains: room membership, invites, dice history and append-only
activity history remain. The previous scene and its referenced assets remain retained
while recoverable checkpoints reference them.

## 13.3 Responsive layout and navigation

Use these CSS-pixel defaults, subject to usability validation. Minimum board sizes are
layout allocation targets; they must not force horizontal page overflow at narrow widths
or text zoom. When space is insufficient, collapse the panel and use the mobile layout.

| Context | Board and panel | Supported work |
| --- | --- | --- |
| Desktop, ≥1024px | Board plus 320px right panel; panel collapsible; target board ≥640×360 | All workflows |
| Tablet, 720–1023px | 280px side panel only when board retains ≥440px width and viewport ≥400px height; otherwise bottom panel | All workflows when preparation viewport meets its size threshold |
| Portrait/mobile fallback | Board first, bottom panel second; target board height 280px; panel normally 40% of available height, expandable to 70% | Full player play and routine GM controls |
| Landscape phone | 240px side panel only with ≥360px board width and ≥320px usable height; otherwise collapsed panel opens as a sheet | Same mobile workflows; no orientation-only override |

Use `100dvh`, safe-area padding, `minmax(0, 1fr)` tracks, and independent panel scrolling.
At short heights or while the keyboard is open, prioritize the focused field in a sheet;
collapse the panel rather than squeezing the board and controls into unusable strips.
A collapsed panel retains an accessible opener and the connection indicator on the board.
Tabs never wrap into ambiguous rows; icon-plus-short-label controls fit the available width.

**Mobile GM support:** invite copy, participant revocation, ownership, token name/resources/
conditions, hide/reveal a selected token, initiative, dice, activity log and eligible undo.
Detailed map upload/alignment, wall editing, fog drawing, scene replacement and checkpoint
restore require at least a 720×480 CSS-pixel viewport. Show a clear larger-screen explanation
when invoked below this threshold; do not discard an existing draft after a resize. This
limits complex GM editing without limiting the responsive player requirement.

**Hub:** 224px navigation at desktop, compact navigation at tablet, and a labeled menu
sheet below 720px. Room list maximum width 880px; page gutters 16/24/32px by breakpoint.
Rows have a 56px thumbnail and flexible name; secondary metadata stacks on mobile. Use
one semantic navigation link per room and separate sibling buttons for other actions.
Ordering is last played descending with room ID as a stable tie-breaker; never-played
rooms follow played rooms, newest first. Last played means the server-recorded most
recent authorized table entry, not a background heartbeat. Count non-revoked members and
label it “members”; expose online presence separately if available.

**Entry:** forms max-width 400px; body copy ≤65ch. Home stacks text and map below 720px.
The two-line headline is a default-content goal, not a clipping requirement: allow extra
lines at large text sizes. Use minimum-height chapters with natural document scrolling,
not pinned scroll or forced viewport heights. Provide static reduced-motion demonstrations.

**Sheets and routes:** mount a room session provider above `/r/:roomId` and its nested
prepare/log/settings routes. Opening a sheet pushes a route; Back closes it without
unmounting the room session. A direct sheet URL first loads the room underneath. Close
returns to the room route, replacing the route when there is no in-app parent history.
Escape and the visible Close button dismiss; backdrop dismissal is disabled to avoid
accidental closure. Dirty-state handling follows §13.2. Leaving the room uses an explicit
Leave action; it is not hidden to preserve a socket.

Preparation sheet max-width 1120px; log/settings 800px; 24px desktop outer gap. Mobile
sheets use available viewport width/height. Sheet bodies scroll; headers/actions remain
reachable without obscuring focused controls. Only the topmost modal receives interaction.

## 13.4 Connection, concurrency and recovery

**Offline means inspectable, not editable shared state.** Keep pan, zoom, token inspection,
local selection and draft form typing available. Disable committed actions, dice rolls,
Apply and network-dependent analysis. Do not queue gameplay commands for automatic replay.
Clearly label the board stale and explain disabled actions inline. Re-enable shared writes
only after identity verification and an authoritative snapshot, not merely socket reconnect.
A persisted preparation draft can retain unsent local edits but must reconcile its base
revision before upload or Apply after reconnect.

Track commands as pending → acknowledged/rejected, with a separate unknown-outcome state
when transport fails. An acknowledgment alone must not bypass authoritative event/snapshot
application. Persist command IDs/results server-side with their room/participant scope;
repeated identical IDs return the original outcome. Reusing an ID with different content
is rejected. For room creation, use account scope. Resolve unknown outcomes through a
command-status read or a retry of the same ID after resync; do not generate a new ID.
If result retention has expired, return an explicit expired status and reconcile current
state without replay. Retain results for at least 24 hours and document this API boundary.

Use the current shared protocol as the integration baseline: `clientCommandId`, `welcome`,
`event`, `redacted`, `ack`, `rejected`, `resync`. Hidden events emit a redacted sequence
advance so clients do not mistake filtering for packet loss. A real sequence gap triggers
resync. Duplicate events do not reapply state. Snapshot replacement resets authoritative
state and transient previews, not independent camera/tab preferences for the same scene.
The existing numeric sequence contract requires safe-integer validation; before exceeding
that range, migrate all producers/consumers together to decimal strings. Do not silently
change only the frontend representation.

**Undo:** initially only token moves. The server returns eligibility and a plain-language
reason for ineligible events. A move can be undone only if the token still exists in the
same scene, no later mutation changed that token, and the move has not already been
compensated. Changes to unrelated tokens do not block undo. Recheck eligibility atomically
when requested; a stale enabled button is not authorization. Append compensation with
actor, timestamp and reference to the original event. No redo in this milestone.

**Checkpoint restore:** GM-only, explicit confirmation showing checkpoint name/time and
what changes. Restore scene encounter state (map/grid/geometry/fog/tokens/resources/
conditions/templates/drawings/initiative), not memberships, roles, credentials, invites,
dice history or audit history. Save an automatic pre-restore checkpoint atomically, append
a restore event, advance scene revision, and send filtered snapshots. Reject old-revision
commands and clear pending gestures. Revalidate token owner references against current
memberships; revoked or missing owners become unassigned. Restore cannot recover access
rights or make a participant unrevoked. A reveal cannot erase information players already
saw; the confirmation says so when relevant.

## 13.5 Tool interactions and player-safe rendering

Keep tool selection separate from administrative layer targeting. Players have permitted
Select/Move, Ruler, Ping, Draw and AoE tools. Only GMs receive fog/wall/layer administration.
Server authorization remains mandatory regardless of visible controls.

- Mouse: primary pointer acts with the selected tool; middle-drag or Space+drag pans;
  zoom controls and wheel zoom anchor on the board. Space shortcuts do not run in fields.
- Touch: in Select mode, one-finger drag on an owned token moves it; drag on empty board
  pans; pinch zooms. A second finger cancels any uncommitted token drag before zoom begins.
  Drawing/measurement uses an explicit selected tool, preventing accidental map edits.
- Escape cancels the current gesture before closing a containing sheet. Pointer cancel,
  loss of permission, scene switch or disconnect discards the gesture.
- Click/tap selects. Roster selection opens the same inspector. A Move control supports
  grid-step directional buttons and numeric position fields as a non-drag alternative.
  Initiative has Move up/Move down controls in addition to drag reordering.
- Ping is an explicit tool with one click/tap, not a touch long-press dependency. Drawings
  and AoE support first-point/second-point placement and numeric size/angle controls;
  preview → Place or Cancel is explicit. Creators may edit/delete their own objects; GMs
  may edit/delete any. Freehand remains out of scope.
- Grid snapping is a local placement preference and does not snap existing objects on
  toggle. Default on when an accepted grid exists. Coordinates are map-image pixels from
  the top-left; cell size/offset use those coordinates. Persist token centers, not DOM
  positions; zoom and device pixel ratio never enter persisted geometry.
- Movement ruler defaults to one unit per orthogonal or diagonal grid step; an optional
  alternating diagonal mode is a room setting. Budgets are advisory warnings, not move
  rejection rules. Units, diagonal mode and token budget are visible beside the ruler.

**Visibility contract:** clients receive only authorized tokens, resources, rolls and
geometry. Player fog is a derived visible-area mask or equivalent safe projection, not
private GM concealment instructions. Dynamic LoS uses a server-derived visible region;
do not ship secret walls just to raycast them in the player browser. Masks must also
clip ephemeral effects. The server filters drag previews and associated token IDs by
recipient visibility; client clipping alone is insufficient. Remove newly hidden tokens
from all client caches, inspectors, selection and accessible DOM representations.

The full base map image is accessible to any participant receiving its asset URL; a fog
mask is visual concealment, not protection of those source pixels. For current scope,
FR-GM-23 protects hidden entities/private metadata, not secrecy of an already-delivered
image. Use maps without baked-in secrets. Secure image-region streaming would be a
separate requirement and is not claimed here.

Preview messages include scene ID, per-sender generation and increasing preview counter.
Discard stale/out-of-order values. Coalesce preview sends to at most 20Hz; render local
motion independently. Token/ruler/AoE previews expire after one second without refresh;
pings expire after 1.5 seconds. Clear a preview on commit/cancel/disconnect/scene change.
Reduced-motion mode replaces pulses with a static marker for the same duration.

## 13.6 Components, state ownership and implementation boundaries

React owns routes, DOM controls, forms and accessible representations. Pixi owns drawing
and pointer-frequency visuals. The renderer consumes authorized state; it never decides
permissions. Keep geometry transforms and reducers independently testable.

| Component | Main inputs | Local state / events | Reused pieces |
| --- | --- | --- | --- |
| Entry/Auth/Join pages | Session, invite validity, resumable participant | Fields, submitting, join/resume/create | Field, InlineError, Button |
| RoomList | RoomSummary array, request state | Open/create, retry, cursor | RoomRow, Skeleton, EmptyState |
| TableShell | Room ID, capabilities, connection | Active tab/sheet | BoardViewport, EncounterPanel |
| BoardViewport | Authorized scene, tokens, previews | Camera, selection, gesture | RendererAdapter, BoardControls |
| TokenRoster/Inspector | Tokens, participants, editable fields | Selection, edit draft, assign/move | TokenRow, ResourceField, ConditionBadge |
| InitiativeTracker | Entries, active entry, capabilities | Edit/reorder/advance | InitiativeRow, MoveButtons |
| DicePanel | Allowed audiences, roll results | Expression/audience, pending roll | ExpressionField, RollResult |
| PreparationSheet | Draft/base revision, assets, analysis job | Grid/token edits, preview/apply | UploadField, GridEditor, JobStatus |
| ActivityLogSheet | Events, undo eligibility, checkpoints | Load older, undo/save/restore | EventRow, ConfirmDialog |
| SettingsSheet | Members, invite/expiry, capabilities | Copy/regenerate/revoke | ParticipantRow, InviteLink |

Suggested folders: `app/` for routes/providers; `ui/` for primitives; `features/` for
identity, rooms, preparation, encounter and recovery; `board/` for renderer/gestures;
`services/` for REST/socket adapters; `state/` for stores; `styles/` for shared tokens.
Wire/domain schemas remain in `packages/shared`; do not create parallel local definitions.

Use the selected Zustand store for authoritative room state and narrow subscriptions.
Keep pending commands/previews separate from accepted state, camera/tool/tab preferences
local to the session, and input drafts local to their feature. A rejection removes only
that command's preview; it must not restore an obsolete whole-room snapshot. Hooks such
as `useRoomSession`, `useRoomCommands`, `useBoardViewport` and `useAnalysisJob` isolate
lifecycles. Do not send pointer updates through a whole-app React render loop.

## 13.7 Data and service contracts

These are target contracts to add to shared schemas, not undocumented replacements for
existing endpoints. REST handles account/session, room lists, assets, private drafts,
analysis jobs and history reads. Authoritative encounter changes use committed commands;
scene Apply/restore must use the same transaction/event path even if submitted through REST.

| View / operation | Required fields and behavior |
| --- | --- |
| Session | User summary, room participant, capabilities; never credential hashes |
| RoomSummary | ID, name, thumbnail URL/null, lastPlayedAt/null, memberCount, myRole |
| SceneView | Scene ID, revision, asset dimensions, grid/null, authorized tokens/overlays, safe visibility projection |
| TokenView | ID/name/art, center/size/rotation, permitted resources/conditions, owner reference if authorized, canMove/canEdit |
| Draft | ID, base scene/revision, draft revision, asset revision, grid/geometry/tokens, updatedAt, save status |
| AnalysisJob | ID, draft/asset revision, queued/running/succeeded/failed/cancelled, stage, result/confidence, structured failure |
| Activity page | Event ID/seq, actor display label, timestamp, plain-language domain payload, undo eligibility/reason, nextCursor |
| Checkpoint | ID/name/time, scene summary, restore eligibility; snapshot fetched only through authorized restore path |
| API error | Stable code, safe message, fieldErrors where relevant, request/command ID, retryability |

Lists use cursor pagination: room pages 25 rows, history pages 50 events with Load older.
No search/filter system in the first release. Preserve visible rows on refresh failure
and expose a retry; an initial failure is distinct from an empty result. Virtualize only
if measured list performance requires it.

Upload defaults: JPG/PNG/WebP, ≤20 MiB compressed, ≤16 megapixels and ≤8192px on either
edge. Validate decoded size/type server-side as well as client-side. Reject SVG for map
and token uploads. UVTT is stretch and needs separate container/schema limits before its
upload control ships. Upload shows byte progress when available; analysis shows named
stages, never fabricated percentages. Poll job status every two seconds while the sheet
is visible, backing off to ten seconds for prolonged jobs; pause while offline. Cancel
prevents a result from applying even if the worker cannot immediately stop. Retry creates
a new job tied to the current asset revision.

Dice defaults: accept `NdX + M` with optional whitespace and signed modifier; 1–100 dice,
2–1000 sides, modifier between −10000 and 10000. Parse/validate and roll on the server.
Players roll publicly; GMs choose public or GM-only, default public. Pending/unknown rolls
retain the same command ID on retry. Empty dice history invites a first roll, not a spinner.
Initiative ties keep stable existing order; GM can reorder. Advancing past the last entry
increments the round. Removing the active entry selects the next remaining entry; an empty
list has no active turn. Players inspect initiative but cannot edit it.

## 13.8 Tokens, component states and accessibility

Adopt [`INTERFACE.md`](INTERFACE.md) §11.9's ground/panel/text/accent palette. Use Geist and Geist Mono with system
fallbacks, self-hosted when available; numeric values also set tabular figures. Use one
Phosphor outline icon family with a consistent optical stroke; do not mix icon families.

Pages outside the table (home, sign-in, sign-up, join, not found, GM dashboard, library)
support a light and a dark theme, following one stored choice that defaults to the system
preference; §11.9 lists the light values. The table and the encounter editor stay dark.

| Token family | Selected defaults |
| --- | --- |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64px |
| UI type | 14px compact secondary, 16px body, 18px panel heading, 24/32px page headings; line-height 1.5 body / 1.2 heading |
| Hero type | Fluid 36–72px; allow wrapping rather than fixed line count |
| Control/overlay radius | 6px / 12px |
| Control height | 40px regular; coarse-pointer hit area at least 44×44px |
| Borders | 1px decorative `--border`; control boundary uses `--border-strong` (`#6a7280`) |
| Error text | `--danger` (`#e0685c`), 5.2:1 on panel |
| Primary button | Accent background, `--accent-ink` bold label (4.7:1, see below) |
| Focus | 2px `--focus` (`#e08a62`) outline, 2px offset, visible on accent-filled controls too |
| Surface states | Hover `#202b33`, selected `#30302a`; selection also has glyph/border/ARIA state |
| Overlay shadow | `0 16px 48px rgb(15 20 24 / 45%)` |
| DOM layers | Board 0, controls 10, menus 20, sheet backdrop 30, sheet 40, confirmation 50 |

Validate foreground/background pairs in actual use. From the shipped palette, body on
panel is 13.8:1, muted on panel 5.8:1 and danger on panel 5.2:1. Accent ink on accent is
4.7:1 since `--accent` was darkened to `#b3552d` (it was 4.4:1), and 5.1:1 on the destructive
fill `--danger-strong`. `--border` on panel is 1.2:1 and is decorative, not the only means of
recognizing an input or selected control; `--border-strong` (3.6:1) carries that, including
the boundary of every input and select.

**Shared states:** buttons have default/hover/focus/pressed/disabled/pending; tabs and tool
buttons add selected/pressed semantics. Pending buttons retain label/width and show a
textual action state. Forms preserve entered values on failure, associate inline errors
with fields and focus an error summary on failed submission. Success is communicated
next to the action; not every save needs a toast. Disabled actions explain why when it
is not self-evident. Destructive confirmations identify the affected room/person/scene.

**Data states:** initial loading uses content-shaped skeletons; refresh keeps accepted
content visible; empty states identify the next allowed action; errors show a specific
retry when safe; offline keeps accepted content with a stale indicator. Skeletons are
hidden from assistive technology and their container exposes busy state. Analysis uses
stage text, not a skeleton pretending to be the completed map.

**Keyboard and semantics:** use native links/buttons/inputs. Label every field and
icon-only control. Tabs support arrow navigation and associated tabpanels. Modal sheets
have a name, focus containment, inert background and focus return; if the opener no
longer exists, focus the closest stable heading/control. Menus and tooltips are never
the only path to an action. No global shortcut fires while typing in an input.

**The focusable token roster is required with token interaction, not cuttable stretch.**
It and the inspector provide selection, movement, statistics and condition access. The
non-drag controls in §13.5 are required. Test keyboard operation, single-pointer alternatives,
200% text zoom and narrow-width reflow; never force 14px labels onto essential error text
just to preserve a panel size. Respect the 44px coarse-pointer target even in dense mode.

Announce connection changes, accepted/rejected user actions, active-turn changes and scene
replacement through restrained live regions. Do not announce seq increments, every drag
sample or other users' every movement. Reduce motion across home demos, pings, transitions
and drag settling, whether the system asks for it or the in-app Reduced animations setting
does; the two count the same. Continuous decorative pulsing is removed: active turn and connection
use static labeled indicators by default. Animate only transform/opacity, and do not spring
an authoritative token through misleading intermediate positions.

Accessibility references: [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and
[non-drag alternatives](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements).

## 13.9 Delivery order and acceptance gates

These gates refine [`DELIVERY.md`](DELIVERY.md); they do not claim additional features are already shipped.

1. **Foundations:** shared tokens/primitives, capability contracts and persistent room
   provider. Agree required schema migrations first; benchmark the renderer with a
   representative large map and 100 tokens early rather than after polishing screens.
2. **Identity/rooms:** account creation/session, authenticated room creation, hub and guest
   join/resume. Verify reload identity, storage failure, duplicate request handling and
   two-tab behavior. Core invite-to-board target remains under 30 seconds.
3. **Playable board:** viewport, token setup/ownership, roster and non-drag controls.
   Verify permissions through direct API/socket attempts as well as hidden controls.
4. **Preparation:** manual grid alignment and private persisted drafts, then detection.
   Verify a player sees neither draft metadata nor asset access; analysis failure must
   leave manual preparation usable. Stale results cannot overwrite edits.
5. **Publication:** atomic Apply and scene replacement with automatic checkpoint.
   Test checkpoint failure, concurrent live changes, duplicate Apply, late old-scene
   commands, and reconnect during publication using two browser contexts.
6. **Tactical state:** initiative, dice, filtered ephemeral tools, fog and conditions.
   Test duplicate/out-of-order previews, TTL cleanup, private-roll routing and unknown
   outcomes. Keep committed/ephemeral latency benchmarks separate.
7. **Recovery/access:** eligibility-based move undo, checkpoint restore, revocation and
   invite regeneration. Confirm restore does not restore revoked membership or erase
   history, and undo cannot overwrite a later edit of the same token.
8. **Responsive/accessibility verification:** test desktop and mobile layouts, short
   landscape, software keyboard, rotation after manual pan, focus return, screen reader
   announcements, contrast and non-drag alternatives. Build these behaviors throughout
   earlier steps; this gate is verification, not the first accessibility implementation.
9. **Release evidence:** lint/typecheck/build, domain tests, multi-client integration,
   required browser coverage and representative benchmarks. Targets remain 60 FPS,
   ≤150ms ephemeral propagation, ≤500ms committed propagation and ≤3s reconnect convergence
   under the documented benchmark conditions. Measure onboarding with independent users.

**Explicitly deferred:** saved-asset library, automatic participant merging, co-GM,
unclaimed rooms, redo, secure map-tile streaming and advanced mobile map editing. Stretch
wall/portal/LoS work retains [`DELIVERY.md`](DELIVERY.md)'s dependencies, including server-side visibility projection.
Password reset remains out of course Core Loop scope; real-world release requires a
recovery path rather than orphaning account-owned rooms.

**Documentation follow-through:** update the `DESIGN.md` §6 matrix only with implementation evidence.
Mirror the roster's earlier delivery, accepted account scope and precise map-pixel secrecy
boundary into README requirements before declaring corresponding acceptance complete.
Keep screenshots and implementation-status assertions current; no nonexistent reference
image should be treated as a design dependency.
