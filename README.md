# Virtual Tabletop (VTT) — Project Specification

**Course:** CSE 416  
**Team:** Antonio Cottone, Raymond Lin, Vincent Chen, Christos Psimadas  
**Timeline:** 13 weeks  
**Team size:** 4  
**License:** MIT  

---

## Getting Started

Requires **Node 22** (see `.nvmrc`). This is an **npm workspace** — `apps/server`, `apps/web`
and `packages/shared` are installed together from the repository root. There are two ways to
run the app. Both open at <http://localhost:5173>.

| | Without Docker | With Docker Compose |
| --- | --- | --- |
| Needs | Node 22 | Docker Desktop (or Docker Engine + Compose v2) |
| Rooms survive a restart | No (in-memory) | Yes (Postgres) |
| Map uploads | Local disk | SeaweedFS (S3) |
| Grid and wall detection | Off (no vision service) | On |
| Sign-in | Sign up as usual | Dev account `t@gmail.com` / `password` is pre-seeded |

### Option A — without Docker

```bash
git clone https://github.com/RLinV1/Virtual-Tabletop.git
cd Virtual-Tabletop
npm install
npm run dev
```

`npm run dev` starts the API server on **:3001** and the web client on **:5173**. The first
start takes about 20 seconds because the server probes for object storage before falling back
to local disk. Wait for `[vtt] server on http://localhost:3001`, then open
<http://localhost:5173>, create a room, and copy the invite link.

This works with no containers: with `DATABASE_URL`, `REDIS_URL` and `S3_ENDPOINT` unset, the
server keeps rooms in memory and stores uploads on local disk. The startup log says so:

```
[vtt] DATABASE_URL unset — using in-memory store (state is lost on restart)
[vtt] no object storage at http://127.0.0.1:8333 — storing uploads on local disk
```

Restarting the server clears every room. Grid detection and wall detection need the vision
service, so they do not run in this mode (see Option B, or
[`docs/GRID-DETECTION.md`](docs/GRID-DETECTION.md) and [`docs/WALL-DETECTION.md`](docs/WALL-DETECTION.md)).

**To join as a player on the same machine,** open the invite link in a private window, or
swap `localhost` for `127.0.0.1`. Guest identity is stored per-origin in `localStorage`, so
a second tab in the same window is still the GM.

Already cloned? Run `git checkout main && git pull`, then `npm install` again — the lockfile
changes often while the stack is being built out.

### Option B — with Docker Compose (whole stack)

Start Docker, then run from the repository root:

```bash
docker compose up -d --build
```

This builds and starts everything: Postgres, Redis, SeaweedFS (S3), the two vision services,
the app server (**:3001**) and the web client (**:5173**). The server applies the Prisma
migrations itself on start, so there is no separate migrate step. Open
<http://localhost:5173>.

- **First run is slow.** The images build from source and download base images. Later runs
  reuse the cache.
- **Rebuild after code changes.** The code is copied into the image, so run
  `docker compose up -d --build` again. Nothing hot-reloads.
- **Watch it start.** `docker compose ps` should show every service `Up`, and
  `docker compose logs -f server` should end with `[vtt] server on http://localhost:3001`.
- **Ports must be free.** Compose publishes 3001, 5173, 5432, 6379, 8333 and 8000. Stop any
  `npm run dev` first, or the containers fail to bind.
- **Dev account.** Compose sets `SEED_DEV_ACCOUNT=1`, so you can sign in as `t@gmail.com` /
  `password`. Never set it in production.

Stop it with `docker compose down`. Add `-v` to delete the data volumes too, which is the reset
when a migration goes wrong.

### Option C — infrastructure in Docker, app from source

Use this to get persistence while you edit code with hot reload:

```bash
docker compose up -d postgres redis s3 vision vision-walls
export DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt
npm run prisma:migrate --workspace=@vtt/server
REDIS_URL=redis://localhost:6379 \
S3_ENDPOINT=http://localhost:8333 \
npm run dev
```

`export` first, and in that order: `prisma:migrate` reads `DATABASE_URL` from the
environment and fails with `P1012` without it. **Re-run it after every pull that touches
`apps/server/prisma/`** — here `docker compose up` does not migrate, so a database left behind
the code fails at runtime rather than at startup. Add `VISION_URL=http://127.0.0.1:8000` to
use grid detection. Uploads use SeaweedFS whenever it answers on `127.0.0.1:8333`, even
without `S3_ENDPOINT` (`S3_AUTODETECT=0` skips the check; production refuses to start without
`S3_ENDPOINT`).

Two lines on startup tell you which mode you are in:

```
[vtt] using Postgres event store                    # persistent
[vtt] DATABASE_URL unset — using in-memory store    # not persistent
```

### Verifying and building

```bash
npm run lint && npm run typecheck && npm test
npm run build
```

`npm test` runs the pure-kernel unit tests and the multi-client integration tests over real
sockets. The Postgres store tests skip unless `DATABASE_URL` is set:

```bash
DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt npm test --workspace=@vtt/server
```

`npm run build` type-checks and produces the production client bundle in `apps/web/dist`.
The server runs from TypeScript via `tsx`; `npm start` launches it.

### Troubleshooting

**"Internal error" when creating a room** means pending migrations: the code expects
tables the database does not have. Check which are applied, then apply the rest:

```bash
export DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt
npm run prisma:migrate --workspace=@vtt/server
```

`EADDRINUSE` on :3001 means an earlier `npm run dev` is still running:

```bash
kill $(lsof -ti tcp:3001) $(lsof -ti tcp:5173)
```

If `docker compose` is not recognised as a command, the Compose plugin is installed where
the Docker CLI does not look for it:

```bash
mkdir -p ~/.docker/cli-plugins && ln -sfn "$(which docker-compose)" ~/.docker/cli-plugins/docker-compose
```

See [`CLAUDE.md`](CLAUDE.md) for the full command list and the architecture invariants, and
[`docs/DESIGN.md`](docs/DESIGN.md) for the system design.

---

## 0. How to Read This Document

This specification defines the intended product scope, user experience, functional requirements, verification approach, nonfunctional requirements, success metrics, team workstreams, risks, and reference material for the project.

Functional requirements are organized by the user need they satisfy and identify whether that need primarily belongs to the GM, the player, or both. Unless explicitly listed as out of scope, the document describes the functionality the team intends the application to support.

---

## 1. Product Summary

### Elevator pitch

A browser-based virtual tabletop that takes a game master from an arbitrary battle-map image to a playable, recoverable online encounter in minutes. The GM uploads a map, receives automatic grid alignment, and can optionally import or infer wall and portal data. Players join remotely through a shareable link with no account or client installation, then interact with the same synchronized board using owned-token movement, distance rulers, target pings, and area-of-effect (AoE) templates. When someone makes a mistake, the GM inspects the action log, undoes the action, and every connected browser receives the corrected state.

### One-sentence differentiator

**A low-prep, system-agnostic online VTT that combines assisted map setup, fast guest joining, tactical browser interactions, and deterministic multi-user recovery.**

### The four workflow promises

1. **Prepare quickly.** Upload a map, detect its grid automatically, and optionally import or generate walls and interactive doors.
2. **Join quickly.** Open a shareable room link with no player account and no client installation.
3. **Play remotely.** Run the encounter across a GM browser and multiple remote player browsers with synchronized tactical state and low-latency ephemeral interactions.
4. **Recover safely.** Review the action log, undo mistakes with defined multi-user semantics, or restore a named checkpoint.

### Intended audience

Game masters who run tactical encounters from imported battle maps for remote groups, want low-friction browser onboarding without complex character-sheet automation, and need dependable recovery from accidental reveals, token moves, or condition changes.

The initial release is system-agnostic. It is not intended for groups seeking automated character sheets, rules engines, commercial content marketplaces, or a dedicated in-person tabletop display system.

### Why this requires substantial engineering work

The project requires significant design and implementation effort because its features must operate correctly as one real-time multi-user system. Shared-state synchronization, permissions, reconnect behavior, undo, hidden GM information, map geometry, grid detection, and responsive canvas interactions all depend on carefully defined data models and interaction rules. The team must also validate these systems across concurrent users, varied maps, browsers, and network conditions, making the project an integration and correctness challenge rather than a simple collection of interface features.

---

## 2. Problem Statement

Existing VTTs often trade simplicity for breadth. Full-featured platforms can require substantial account setup, hosting decisions, rules configuration, or interface learning, while lightweight shared-map tools can omit deeper encounter preparation and recovery features.

The opportunity is to reduce the number of tools, configuration steps, and interface transitions between receiving a plain battle-map image and running a reliable online encounter while providing correctness guarantees under concurrency and failure that a course project can demonstrate and test.

### Product hypothesis

If map preparation, guest onboarding, tactical browser interaction, real-time synchronization, and state recovery are engineered as a single authoritative state model, remote groups can begin encounters faster and recover from mistakes without sacrificing shared-state correctness.

### Validation questions

- Can a first-time GM upload a map and prepare an encounter without documentation in under 5 minutes?
- Does automatic grid detection materially reduce setup time across diverse map styles?
- Can a player join from a shareable link and control an assigned token in under 30 seconds, and retain control across a page reload?
- Do pointer pings, drag previews, and AoE previews propagate between remote browsers with low enough latency to feel immediate?
- Can a GM recover from an accidental reveal or token move without reloading or manually reconstructing state?
- Do all connected clients converge on identical state after simultaneous edits, a forced disconnect, and a checkpoint restore?

---

## 3. Competitive Positioning

| Product | Relevant strengths | Gap or tradeoff relevant to this project |
| --- | --- | --- |
| Roll20 | Hosted, broad system support, marketplace, character sheets, dynamic lighting, undo/redo, rollback, UVTT import | Broad functionality creates onboarding and interface overhead; this project instead emphasizes rapid map-to-encounter setup for the GM and a low barrier to entry for the other players. |
| Foundry VTT | Powerful engine, extensive automation, large module ecosystem, strong lighting and wall tools | GM must choose and manage hosting; setup and module configuration can be complex for new groups. |
| Owlbear Rodeo | Fast browser onboarding, anonymous players, clean map interaction, lightweight collaboration | Intentionally lightweight; this project differentiates through assisted map preparation, an expanded feature set, and auditable recovery history. |
| Quest Portal | Modern browser clients, maps, character sheets, voice, campaign/storytelling features | Broad campaign platform; automatic map preparation and deterministic encounter recovery are not its primary focus. |
| External wall/UVTT tools (e.g. Auto-Wall, Dungeondraft) | Author or infer walls and lighting for import into established VTTs | Separate preprocessing round trip; requires manual inspection and import into another application. |

---

## 4. Primary User Experience

### GM preparation flow

1. The GM creates a room.
2. The GM uploads a battle map (JPG, PNG, WebP) or a Universal VTT (UVTT) file.
3. For plain images, the application detects a square grid and displays the estimated cell size and offset with a confidence score.
4. The GM accepts the estimate or corrects it with a compact grid-alignment tool.
5. If wall or portal data is present, the application overlays editable wall and portal segments.
6. The GM accepts, deletes, adjusts, or adds segments, and marks door states (`Open`, `Closed`, or `Locked`).
7. The GM places tokens, assigns player ownership, and creates a named checkpoint.
8. The application generates a shareable player link for remote participants.

### Live online flow

- **GM Interface:** Full control over fog, unrevealed monsters, door lock states, initiative, token ownership, and the domain recovery log.
- **Player Board:** A responsive, player-safe version of the board showing only information the player is authorized to see. Players manipulate owned tokens, measure movement, place tactical templates, ping locations, roll dice, and follow initiative.
- **Independent Viewports:** Each participant can pan and zoom locally without changing another participant's camera position.
- **Real-Time Sync:** All committed actions synchronize through an authoritative server with monotonic ordering, while ephemeral pointer and preview interactions use a non-persisted low-latency channel.
- **Reconnect Behavior:** A temporarily disconnected player automatically reconnects, rebinds to the same guest identity and token ownership, and receives the current authoritative state.

### Recovery flow

1. The GM opens the encounter activity log.
2. The log describes committed actions in plain language with actor and timestamp.
3. The GM undoes a reversible action.
4. The server appends a compensating or restore event and broadcasts the resulting state to every connected browser.

---

## 5. Functional Requirements

The functional requirements are classified by the practical need they satisfy in an online virtual tabletop. Each requirement identifies its primary user: **GM**, **Player**, or **Both**.

### 5.1 GM Need — Prepare an Encounter Quickly

A GM needs to turn a map and a set of encounter assets into a playable scene without extensive manual setup.

| ID | User | Feature / Requirement | Need Met |
| --- | --- | --- | --- |
| FR-GM-01 | GM | **Authenticated GM session** | Gives the GM a persistent, trusted identity from which to create and administer a room. |
| FR-GM-02 | GM | **Battle-map setup** | Allows one active battle map per scene and gives the GM the base surface needed to construct an encounter. |
| FR-GM-03 | GM | **Automatic grid detection** | Detects square-grid cell size and offset from an uploaded image, reducing manual map-alignment work. |
| FR-GM-04 | GM | **Grid preview and correction** | Shows the inferred grid with confidence information and manual correction controls so the GM can fix imperfect detections before play. |
| FR-GM-05 | GM | **Viewport-independent grid metadata** | Stores grid data in board coordinates so the prepared map remains aligned across different browser sizes and zoom levels. |
| FR-GM-06 | GM | **UVTT import** | Imports map image, grid dimensions/offset, wall segments, and portal metadata from `.uvtt` / `.dd2vtt` files, reducing duplicate setup work. |
| FR-GM-07 | GM | **UVTT validation** | Reports malformed imports clearly so the GM can correct a bad file instead of entering play with a partially configured scene. |
| FR-GM-08 | GM | **Token setup** | Supports token image upload, placement, rotation, size, name, and basic numeric statistics such as HP/resource bars so encounter pieces can be prepared in advance. |
| FR-GM-09 | GM | **Editable walls and portals** | Lets imported or manually created wall segments be edited and designated as doors/windows with `Open`, `Closed`, or `Locked` states. |
| FR-GM-10 | GM | **Token ownership assignment** | Lets the GM assign tokens to players before or during the encounter so control boundaries are explicit. |
| FR-GM-11 | GM | **Vision-based map parsing** | An isolated microservice utilizing a vision pipeline (OpenCV / multimodal vision model) to parse uploaded battle-map images. Automatically identifies walls and semantically classifies doors and windows, generating editable UVTT wall and portal data with interactive open/closed toggles. |
| FR-GM-12 | GM | **UVTT export** | Round-trips prepared maps, aligned grids, and portal data back out to standard UVTT format for Foundry, Roll20, and Fantasy Grounds. |
| FR-GM-13 | GM | **Reusable encounter templates** | Saves prepared map, walls, portals, and monster token roster for multi-session reuse. |

### 5.2 GM Need — Control the Encounter and Protect Hidden Information

A GM needs authority over what players can see and change while retaining control of encounter flow and a reliable way to locate encounter pieces.

| ID | User | Feature / Requirement | Need Met |
| --- | --- | --- | --- |
| FR-GM-14 | GM | **GM and player roles** | Separates administrative capabilities from normal player interaction. |
| FR-GM-15 | Both | **Server-side authorization** | Enforces GM-only and owner-only actions at the API layer so clients cannot bypass permissions by sending direct requests. |
| FR-GM-16 | GM | **Token visibility controls** | Allows the GM to hide unrevealed creatures or other tokens until they should become visible. |
| FR-GM-17 | GM | **Manual fog of war** | Lets the GM conceal rectangular or polygonal regions of the map to control exploration and information disclosure. |
| FR-GM-18 | Both | **Interactive portal states** | Closed or locked portals obstruct vision and movement while open portals permit line of sight, allowing the GM to control the environment and players to understand its current state. |
| FR-GM-19 | Both | **Dynamic line of sight** | Renders player-specific 2D raycasted visibility from wall and portal segments. *Scope limits: simple 2D geometry blocking only. No elevation, no soft shadows, no colored light sources.* |
| FR-GM-20 | GM | **Guest revocation and invite regeneration** | Lets the GM remove a participant or invalidate a compromised room link. |
| FR-GM-21 | Both | **Initiative and turn-order tracking** | Gives the GM a shared way to manage encounter order and gives players synchronized notification of the active turn. |
| FR-GM-22 | Both | **Public and GM-only dice rolls** | Supports openly shared rolls as well as hidden adjudication when the GM needs private outcomes. |
| FR-GM-23 | Player | **Player-safe state filtering** | Filters hidden tokens, unrevealed fog regions, GM-only rolls, and private metadata on the server before state is sent to player clients. |
| FR-GM-24 | Both | **Focusable token roster** | Provides an alternative to direct canvas selection for finding and selecting tokens. |

### 5.3 Player Need — Join Easily and Retain Control of Their Character

A player needs to enter a session with minimal friction and remain associated with the same identity and owned tokens even if their browser reloads or disconnects.

| ID | User | Feature / Requirement | Need Met |
| --- | --- | --- | --- |
| FR-PL-01 | Player | **Shareable guest link** | Allows a player to enter a room without creating an account or installing a client. |
| FR-PL-02 | Player | **Durable guest identity** | Stores an opaque guest token in browser `localStorage` and rebinds the player to their display name and owned tokens after reloads, backgrounded tabs, or transient disconnects. |
| FR-PL-03 | Player | **Responsive Player Board** | Provides a browser interface centered on the encounter rather than GM administration controls. |
| FR-PL-04 | Player | **Owned-token control** | Restricts persistent token manipulation to tokens assigned to the player, giving them direct control without exposing other participants' pieces. |
| FR-PL-05 | Player | **Automatic reconnection** | Reconnects after transient connection failure without requiring a manual page refresh. |
| FR-PL-06 | Both | **Full-state resynchronization** | Gives reconnecting or newly joined clients the current authoritative room state so they can resume play without reconstructing what happened manually. |
| FR-PL-07 | Player | **Encounter replay for late joiners** | Replays the action log from a chosen checkpoint so a late-arriving player can review encounter progression. |

### 5.4 Player and GM Need — Interact with the Tactical Board Clearly

Participants need to inspect the map, manipulate permitted pieces, communicate spatial intent, and understand tactical distances and effects.

| ID | User | Feature / Requirement | Need Met |
| --- | --- | --- | --- |
| FR-TAC-01 | Both | **Independent pan and zoom** | Lets each participant inspect the board at their preferred scale without changing another participant's viewport. |
| FR-TAC-02 | Both | **Continuous coordinates with optional grid snapping** | Supports free positioning when needed while allowing tactical movement to align cleanly to the encounter grid. |
| FR-TAC-03 | Player | **Movement Budget Ruler** | Personal Measure tool previews one prospective move from a selected controllable token's exact center, or between points. Editable per-room local allowance defaults to six grid cells; equal-cost, alternating (1 then 2), and Euclidean diagonals show distance, remaining allowance or excess. No per-turn tracking or movement enforcement; rulers and settings stay in the browser. |
| FR-TAC-04 | Both | **Drawing overlays** | Supports line, rectangle, and circle overlays for communicating tactical plans or marking locations; freehand drawing is excluded from the current scope. |
| FR-TAC-05 | Both | **Target Pings** | Broadcasts a short-lived animated pointer ping at a board location so participants can draw attention to a target or area without creating persistent clutter. |
| FR-TAC-06 | Both | **AoE templates, preview, and placement** | Provides circular bursts, cones, lines, and boxes that snap to grid units; participants can orient and scale an ephemeral preview before committing the final template. |
| FR-TAC-07 | Both | **Token statistics and conditions** | Displays basic numeric resources and status conditions needed to understand the current tactical state of a token. |
| FR-TAC-08 | Both | **Accessible condition markers** | Distinguishes conditions by shape or text in addition to color so status information is not color-dependent. |
| FR-TAC-09 | Both | **Shared dice expressions** | Supports expressions of the form `NdX + M` so participants can make common tabletop rolls inside the encounter. |

### 5.5 Player and GM Need — See the Same Current Encounter State

Remote participants need confidence that actions performed in one browser are reflected consistently in every other browser.

| ID | User | Feature / Requirement | Need Met |
| --- | --- | --- | --- |
| FR-SYNC-01 | Both | **Server-authoritative room state** | Establishes one trusted source of truth instead of allowing clients to resolve encounter state independently. |
| FR-SYNC-02 | Both | **Real-time persistent synchronization** | Synchronizes token, condition, initiative, portal, fog, template, and visibility changes across connected browsers. |
| FR-SYNC-03 | Both | **Ephemeral interaction channel** | Broadcasts pointer coordinates, drag previews, ping pulses, and AoE aiming without persisting temporary interaction data to encounter history. |
| FR-SYNC-04 | Both | **Ordered conflict handling** | Uses server ordering and monotonically increasing per-room sequence numbers so concurrent committed actions resolve deterministically. |

### 5.6 GM Need — Recover from Mistakes Without Rebuilding the Encounter

A GM needs to reverse accidental changes while preserving an understandable history of what occurred.

| ID | User | Feature / Requirement | Need Met |
| --- | --- | --- | --- |
| FR-REC-01 | GM | **Human-readable activity log** | Records committed domain actions with actor attribution so the GM can identify what changed and who performed it. |
| FR-REC-02 | GM | **Undo for reversible actions** | Allows accidental supported actions to be reversed without reconstructing state manually. |
| FR-REC-03 | GM | **Append-only recovery history** | Implements undo through compensating events so recovery does not silently rewrite or truncate the audit trail. |

---

## 6. Nonfunctional Requirements

| Area | Target |
| --- | --- |
| Room Capacity | 1 GM and at least 8 concurrent remote players |
| Join Time | Median under 30 seconds from opening a player link to board access |
| Reload Recovery | Player retains identity and token ownership across reload in under 3 seconds |
| Ephemeral Interaction Latency | Pings, drag previews, and AoE previews appear on other connected clients within 150 ms under the benchmark network profile |
| State Convergence | Committed actions visible to all connected clients within 500 ms |
| Reconnect Convergence | A reconnecting client reaches authoritative current state within 3 seconds after transport recovery |
| Board Performance | 60 FPS canvas pan/zoom with representative map and 100 active tokens on the benchmark desktop hardware |
| Browser Compatibility | Current desktop Chrome, Firefox, Edge, and Safari; responsive player support on iOS Safari and Android Chrome |
| Accessibility | Non-canvas UI targets WCAG 2.2 AA standards |

**Benchmark network profile.** Each client link adds 50 ms one-way delay with ±10 ms jitter in each direction (about 100 ms RTT, a residential connection). The ephemeral target is measured at the 95th percentile from the sender's send call to each receiver's handler, by `apps/server/test/ephemeralLatency.test.ts` (KAN-39).

---

## 7. Explicitly Out of Scope

Excluded from the project scope:

- System-specific character sheets or rules automation (D&D 5e / Pathfinder math).
- Automated attack resolution, saving throws, damage formulas, or spell compendiums.
- Commercial asset marketplaces.
- Built-in video calling.
- True 3D elevation, camera pitching, or volumetric lighting.
- Semantic recognition of decorative furniture/props; map parsing is restricted to walls, doors, and windows.
- Native iOS/Android app store builds; the product is browser-based.
- Physical tabletop display calibration, TV-specific rendering, or support for placing physical miniatures on a display.

---

## 8. Verification and Testing Strategy

- **Unit Testing:** Grid detection accuracy against a collection of battle maps; dice expression parsing; coordinate transform mathematics; and UVTT schema parsing.
- **Authorization Integration Tests:** Automated tests verify that unauthorized clients cannot invoke GM-only actions or modify unowned tokens via direct WebSocket payloads.
- **Visibility Filtering Tests:** Player clients receive neither hidden-token data nor unrevealed GM-only state through API responses, WebSocket events, or reconnect payloads.
- **Interaction Latency Benchmarks:** Pointer pings, drag previews, and AoE previews are benchmarked under simulated residential internet latency to verify responsive cross-client interaction.
- **Cross-Browser Tests:** Core encounter flows are exercised in current desktop Chrome, Firefox, Edge, and Safari.
- **Usability Testing:** Structured usability tests with at least 5 independent GMs and players.

---

## 9. Success Metrics

- **Core Usability:** At least 80% of first-time test players join a room from a link and control their assigned token without verbal instruction.
- **Setup Velocity:** A first-time GM uploads a map, aligns its grid, sets up walls/doors, assigns tokens, and starts an encounter in under 4 minutes.
- **Tactical Interaction:** At least 80% of test players can move a token, measure distance, place a ping, and preview an AoE template without GM assistance.
- **Audit Resilience:** Zero unrecoverable state desyncs during a live 30-minute online test encounter involving forced disconnections, concurrent edits, and accidental fog reveals.
- **Recovery Speed:** A test GM reverses an accidental reveal, token move, or condition change in under 15 seconds.

---

## 10. Team Workstreams

1. **Antonio Cottone - Board and Canvas Interaction:** Renderer, coordinate system, tokens, tactical overlays, movement rulers, AoE templates, and responsive viewport behavior.
2. **Raymond Lin - Real-Time Architecture & Persistence:** Room state, authorization, WebSocket bus, ephemeral channel, durable identity, visibility filtering, event logging, checkpoints, and undo behavior.
3. **Christos Psimadas - Map Processing & AI Pipelines:** Grid detection, UVTT import/export, vision segmentation worker, and portal geometry processing.
4. **Vincent Chen - Online UX & Product Quality:** Guest joining, player-safe board experience, tactical interaction flows, accessibility, cross-browser testing, and automated convergence test harness.

---

## 11. Principal Risks and Mitigations

| Risk | Likelihood/Impact | Mitigation |
| --- | --- | --- |
| Multi-user undo produces surprising state desyncs | High / High | Restrict reversible actions, use append-only compensating events, and retain checkpoint restore as a universal fallback. |
| Ephemeral interactions flood the network | Medium / High | Dedicated non-persisted sub-channel, client-side throttling/coalescing, and no database writes for preview traffic. |
| Hidden GM information leaks to player clients | Medium / High | Server-side visibility filtering plus automated tests for API, WebSocket, and reconnect payloads. |
| Map parsing produces noisy geometry | High / Medium | Suggested walls and portals require GM review before affecting visibility; UVTT import provides an alternate map-preparation path. |
| Player reconnect produces stale or conflicting state | Medium / High | Authoritative sequence numbers, full-state resynchronization, and deterministic reconnect tests built into the test suite. |
| Scope creep compromises the schedule | High / High | Use explicit scope review checkpoints, feature flags for incomplete optional capabilities, and dedicated stabilization time before release. |

---

## 12. Development Milestones

Priority reflects what the encounter loop needs to function end-to-end (**Must**), what makes the encounter feel complete (**Should**), or what is cut first if the schedule tightens (**Stretch**). Difficulty is a rough build-effort estimate (**Low / Medium / High**) used for sequencing, not a formal estimate.

### M1 — Core Loop (must ship; everything else depends on this working)

| ID | Feature | Priority | Difficulty |
| --- | --- | --- | --- |
| FR-GM-01 | Authenticated GM session | Must | Low |
| FR-GM-02 | Battle-map setup | Must | Low |
| FR-GM-03 | Automatic grid detection | Must | Medium |
| FR-GM-04 | Grid preview and correction | Must | Low |
| FR-GM-05 | Viewport-independent grid metadata | Must | Low |
| FR-GM-08 | Token setup | Must | Low |
| FR-GM-10 | Token ownership assignment | Must | Low |
| FR-PL-01 | Shareable guest link | Must | Low |
| FR-PL-02 | Durable guest identity | Must | Medium |
| FR-PL-03 | Responsive Player Board | Must | Medium |
| FR-PL-04 | Owned-token control | Must | Low |
| FR-PL-05 | Automatic reconnection | Must | Medium |
| FR-PL-06 | Full-state resynchronization | Must | High |
| FR-SYNC-01 | Server-authoritative room state | Must | Medium |
| FR-SYNC-02 | Real-time persistent synchronization | Must | High |
| FR-SYNC-04 | Ordered conflict handling | Must | High |
| FR-TAC-01 | Independent pan and zoom | Must | Low |
| FR-TAC-02 | Continuous coordinates with grid snapping | Must | Medium |

### M2 — Tactical Play and GM Control (should-have)

| ID | Feature | Priority | Difficulty |
| --- | --- | --- | --- |
| FR-GM-14 | GM and player roles | Should | Low |
| FR-GM-15 | Server-side authorization | Should | Medium |
| FR-GM-16 | Token visibility controls | Should | Medium |
| FR-GM-17 | Manual fog of war | Should | Medium |
| FR-GM-21 | Initiative and turn-order tracking | Should | Low |
| FR-GM-22 | Public and GM-only dice rolls | Should | Low |
| FR-GM-23 | Player-safe state filtering | Should | High |
| FR-TAC-03 | Movement Budget Ruler | Should | Medium |
| FR-TAC-04 | Drawing overlays | Should | Low |
| FR-TAC-05 | Target Pings | Should | Low |
| FR-TAC-06 | AoE templates, preview, and placement | Should | Medium |
| FR-TAC-07 | Token statistics and conditions | Should | Low |
| FR-TAC-08 | Accessible condition markers | Should | Low |
| FR-TAC-09 | Shared dice expressions | Should | Low |
| FR-SYNC-03 | Ephemeral interaction channel | Should | Medium |
| FR-REC-01 | Human-readable activity log | Should | Medium |
| FR-REC-02 | Undo for reversible actions | Should | High |
| FR-REC-03 | Append-only recovery history | Should | Medium |

### M3 — Stretch Goals (cut first if time runs short)

| ID | Feature | Priority | Difficulty |
| --- | --- | --- | --- |
| FR-GM-06 | UVTT import | Stretch | Medium |
| FR-GM-07 | UVTT validation | Stretch | Low |
| FR-GM-09 | Editable walls and portals | Stretch | Medium |
| FR-GM-18 | Interactive portal states | Stretch | Medium |
| FR-GM-19 | Dynamic line of sight | Stretch | High |
| FR-GM-11 | Vision-based map parsing | Stretch | High |
| FR-GM-12 | UVTT export | Stretch | Low |
| FR-GM-13 | Reusable encounter templates | Stretch | Medium |
| FR-PL-07 | Encounter replay for late joiners | Stretch | Medium |
| FR-GM-20 | Guest revocation and invite regeneration | Stretch | Low |
| FR-GM-24 | Focusable token roster | Stretch | Low |

Within M3, order roughly follows effort-to-value: portal states and dynamic line of sight depend on wall/portal data existing (from either manual editing or UVTT import), so they naturally come after that data model is in place. Vision-based map parsing is the highest-effort, most open-ended item and the first one to drop if the timeline gets tight.

---

## 13. Reference Notes

- [Owlbear Rodeo Documentation](https://docs.owlbear.rodeo/)
- [Roll20 UVTT Specification & Page Management](https://blog.roll20.net/posts/page-menu-updates/)
- [Foundry VTT Controls and Architecture](https://foundryvtt.com/article/controls/)
- [Universal VTT (.dd2vtt) Format Specification](https://github.com/UniversalVTT/specification)
- [Auto-Wall (MIT License, Python/OpenCV desktop detection)](https://github.com/ThreeHats/auto-wall)
