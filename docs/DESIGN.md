# Design Document — Session Zero

**Course:** CSE 416 · **Team:** Antonio Cottone, Raymond Lin, Vincent Chen, Christos Psimadas ·
**Last updated:** 2026-11-18 · **Status:** deployed

The name comes from the "session zero" of tabletop RPGs, the meeting before a campaign where the group agrees on what to play and makes characters; the app is where that preparation starts ("Your game starts here.").

Session Zero is **deployed**: the production stack (`docker-compose.prod.yml`) runs on a
single cloud VM behind Caddy, provisioned with the project's Terraform (§2, *Production*).

Requirements live in [`../README.md`](../README.md) and are referenced by ID (FR-PL-02).
This document covers architecture, stack, repository, data and identity, deployment, and what
the running build does today. Individual decisions are recorded as ADRs (§8); this document
summarizes them and links out rather than repeating them.

| Document | Contents |
| --- | --- |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Production stack, one-VM setup on AWS or Google Cloud, Terraform, managed-service mapping |
| [`DELIVERY.md`](DELIVERY.md) | Slice sequencing, task split, cut order |
| [`INTERFACE.md`](INTERFACE.md) | Page inventory, information architecture, design system |
| [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) | Accepted frontend decisions; overrides older statements |
| [`GRID-DETECTION.md`](GRID-DETECTION.md) | How automatic grid detection flows (FR-GM-03) |
| [`WALL-DETECTION.md`](WALL-DETECTION.md) | How automatic wall detection flows (FR-GM-11) |
| [`GAME_PRESETS.md`](GAME_PRESETS.md) | Game presets (ADR 0027) |
| [`DICE-SKINS.md`](DICE-SKINS.md) | Dice looks and image skins |
| [`AI-PLAYERS.md`](AI-PLAYERS.md) | User guide: connecting your own AI app to a room (FR-PL-08, FR-PL-09) |
| [`AI-GAME-BUILDER.md`](AI-GAME-BUILDER.md) | User guide: having your AI app build a game from your materials (FR-GM-26, FR-GM-27) |
| [`user/`](user/) | User guide: hosting as a GM, playing, the board tools, settings |
| [`developer/`](developer/) | Developer guide: setup, architecture tour, adding a feature, testing, localization, workflow |
| [`PLAYTEST-FEEDBACK.md`](PLAYTEST-FEEDBACK.md) | Playtest requests and bug reports, with how and when each was resolved |
| [`M5-M6-live-usability-findings.md`](M5-M6-live-usability-findings.md) | Simulated first-use study against the deployed site, and its fixes |
| [`GLOSSARY-zh-TW.md`](GLOSSARY-zh-TW.md) | Traditional Chinese terminology for the zh-TW catalog |
| [`adr/`](adr/) | Architecture decision records — index in §8 |
| [`../openspec/`](../openspec/) | Change proposals (`changes/`) and the accepted capability specs (`specs/`) |

---

## 1. Architecture

```
  Browser (GM)         Browser (player)        Browser (player)
       │                      │                       │
       │  HTTP /api/*         │  WebSocket            │
       └──────────┬───────────┴───────────┬───────────┘
                  │                       │
         ┌────────▼───────────────────────▼────────┐
         │          App Server (Node)              │
         │                                         │
         │  Express routes        Socket.IO gateway│
         │  /api/auth/*           handshake auth   │
         │  /api/rooms/*          committed channel│
         │  /api/invites/*        ephemeral channel│
         │  /api/library/*                         │
         │  /api/uploads                           │
         │                                         │
         │  ┌───────────────────────────────────┐  │
         │  │  LiveRoom — per-room FIFO queue   │  │
         │  │  decide() → events → append →     │  │
         │  │  reduce() → filter → broadcast    │  │
         │  └───────────────────────────────────┘  │
         │  BullMQ producers: grid-detection,      │
         │  wall-detection                         │
         └───┬──────────────┬─────────────┬────────┘
             │  :5432       │  :6379      │  :8333
   ╔═════════╪══════════════╪═════════════╪═══════════════════════╗
   ║  Docker Compose        │             │    docker-compose.yml ║
   ║ ┌───────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐                ║
   ║ │  PostgreSQL  │ │   Redis   │ │ SeaweedFS  │                ║
   ║ │  event log   │ │  seq,     │ │  map and   │                ║
   ║ │  snapshots   │ │  BullMQ   │ │  token art │                ║
   ║ │  accounts    │ │  queues,  │ │  library   │                ║
   ║ │  library     │ │  wall job │ │  assets    │                ║
   ║ │  memberships │ │  images   │ │            │                ║
   ║ └──────┬───────┘ └─────┬─────┘ └─────┬──────┘                ║
   ║     pgdata          redisdata     s3data       (named volumes)║
   ║                        │                                     ║
   ║ ┌──────────────────────┴───────────────────┐                 ║
   ║ │  Vision (services/vision) — one image    │                 ║
   ║ │  vision        FastAPI, private HTTP     │ :8000           ║
   ║ │                grid detection (ADR 0028) │                 ║
   ║ │  vision-walls  BullMQ consumer, OpenCV + │                 ║
   ║ │                ONNX wall detection       │                 ║
   ║ └──────────────────────────────────────────┘                 ║
   ╚══════════════════════════════════════════════════════════════╝

   Development: the App Server and the web client run on the host;
   `docker compose up -d --build` also runs them in containers.
   Each service is optional: with DATABASE_URL, REDIS_URL or
   S3_ENDPOINT unset the server falls back to in-memory state,
   Postgres-only sequencing, and uploads on local disk (dev only,
   and only when no S3 store answers at 127.0.0.1:8333).

   Production: the same services run from docker-compose.prod.yml
   on one VM, with Caddy in front serving the built web app and
   proxying /api, /socket.io, /uploads and /health to the server
   (see §2, Production).
```

`packages/shared` is the contract both sides import: zod schemas, `decide`, `reduce`,
visibility filters, plus pure helpers both sides need (dice, geometry, sight, terrain and
movement cost, UVTT parsing, the activity-log formatter, replay points). Pure TypeScript, no I/O, so the rules are
unit-testable without a network or a browser.

### The one rule

Persistent state changes only along this path:

```
Command → decide() → DomainEvent[] → store.append → reduce() → filter → broadcast
```

`decide` and `reduce` are pure and deterministic; IDs come from `DecideContext.newId`.
Nothing else mutates `RoomState`. Events are append-only; undo (`history.undo`) emits a
compensating event (`ActionUndone`, `MapNukeUndone`, `InitiativeStartUndone`,
`RollDamageUnapplied`), never a delete. Events that replace data carry the old value, which
is what makes undo, the activity log, checkpoints and replay possible.

### The command surface

88 commands produce 85 event types. Grouped by area:

| Area | Commands |
| --- | --- |
| Map | `scene.setMap`, `scene.setGrid`, `scene.importUVTT`, `scene.savePreparation`, `scene.linkMap` (ADR 0070) |
| Sight and style | `scene.setLineOfSight`, `scene.setSightRange`, `scene.setIsometric` |
| Scenes | `scene.create`, `scene.prepare`, `scene.copyCurrent`, `scene.rename`, `scene.switch`, `scene.delete` |
| Terrain | `terrain.paint`, `terrain.effect.create`, `terrain.effect.rename`, `terrain.effect.remove` |
| Tokens | `token.create`, `token.duplicate`, `token.move` (optional `via` path, ADR 0055), `token.placeStaged` (carried party tokens, ADR 0068), `token.setAppearance`, `token.configure`, `token.setImage`, `token.setStats`, `token.setConditions`, `token.setOwners`, `token.setHidden`, `token.delete` |
| Groups | `group.create`, `group.rename`, `group.delete`, `group.assign` |
| Walls and portals | `wall.add`, `wall.update`, `wall.remove`, `wall.clear`, `wall.applyDetected`, `portal.set`, `portal.setState` |
| Fog | `fog.add`, `fog.replace`, `fog.remove` |
| Drawings | `drawing.add`, `drawing.remove` (ADR 0064) |
| Areas | `template.place`, `template.update` (ADR 0058), `template.remove` |
| Turn order | `initiative.start`, `initiative.advance`, `initiative.endTurn`, `initiative.previous` (ADR 0060), `initiative.add`, `initiative.remove` (ADR 0065), `initiative.end` |
| Dice and attacks | `dice.roll`, `dice.rollGroup`, `roll.rule`, `roll.dismiss` (ADR 0060), `roll.applyDamage` (chosen amount and conditions, ADR 0062), `nuke.detonate` |
| Area effects | `areaEffect.start`, `areaEffect.call`, `areaEffect.rollDamage`, `areaEffect.resolve`, `areaEffect.close` |
| Room settings | `room.setReducedEffects`, `room.setDefeatRemoval`, `room.setHideMapWithoutToken`, `room.setHideHp`, `room.setHideAc`, `room.setDiagonalRule`, `room.setDifficultTerrain`, `room.setJoinsLocked` |
| Participants | `participant.rename`, `participant.leave`, `participant.revoke`, `participant.revokeMany`, `participant.resolveDeparture`, `participant.setDiceLook`, `participant.clearDiceLook` |
| Chat | `chat.send` |
| Recovery | `history.undo`, `checkpoint.create`, `checkpoint.restore`, `checkpoint.delete`, `encounter.apply` |

### Two channels, one socket

| Channel | Carries | Persisted | Ordered | Delivery |
| --- | --- | --- | --- | --- |
| Committed | Commands in, events out | Yes, with `seq` | Yes | Reliable |
| Ephemeral | `ping`, `tokenDragPreview`, `tokenMovePreview` (answered with `tokenMoveFeedback`: clear, blocked or unknown), `diceDrop`, `templatePreview` (area aiming, and live edits of a placed area) | No | No | `volatile.emit`, dropped under backpressure |

Pointer chatter must never queue ahead of committed state, which is why the ephemeral
channel gets no sequence number and no persistence (FR-SYNC-03). Ephemeral relays still
pass the visibility rules: a GM-only area aim is never relayed to players, and a cleared
aim says whether it was GM-only so players do not learn of it. A latency benchmark
(`npm run test:bench --workspace=@vtt/server`) guards the channel's round-trip time.

The ruler's marks (Range and Movement modes) are per-viewer and never sent anywhere. Drawings
are no longer local: since ADR 0064 they are committed with `drawing.add` and saved with the
scene (see §6, FR-TAC-03/04). Public dice rolls of every kind, attacks included, are thrown on
every participant's board from the committed roll event, not from a separate relay.

### Request paths

| Action | Path |
| --- | --- |
| Sign up / sign in | `POST /api/auth/signup`, `/signin`, `/signout`, `/password`; `GET /api/auth/me` |
| Create a room | `POST /api/rooms` (account required) → `RoomCreated` + `ParticipantJoined`, returns invite code |
| Join by link | `POST /api/invites/:code/join` → `ParticipantJoined`; `GET /api/invites/:code/seat` checks for an existing seat |
| Regenerate invite | `POST /api/rooms/:roomId/invite` (GM only, FR-GM-20) |
| My rooms | `GET /api/gm/rooms`, `GET /api/me/rooms` (joined rooms) |
| Delete a room | `DELETE /api/rooms/:roomId` (ADR 0009) |
| Upload room art | `POST /api/uploads` (GM only, 25 MB, PNG/JPEG/WebP, format and size read from the file) |
| Library | `/api/library` (maps and token art), `/creatures`, `/encounters`, `/animations`, `/dice`, `/:id/board` (walls and fog prepared on a library map), `/uvtt/imports` |
| UVTT | Import into a room via `scene.importUVTT` or into the library; export a room's scene as `.uvtt` |
| Grid detection | `GET /api/rooms/:roomId/grid-detection`, `POST …/retry` (also per library map) |
| Wall detection | `POST /api/rooms/:roomId/wall-detection`, `GET …/preview`, `GET …/walls` |
| History | `GET /api/rooms/:roomId/history` (activity log), `/replay`, `/replay/:pointId`, `/checkpoints/:id/preview` |
| Connect | Socket.IO handshake carries `{ roomId, guestToken }`; server replies `welcome` with a filtered snapshot |
| Act | `command` → `ack` with a seq, or `rejected` with a code |
| Recover | Client detects a seq gap, sends `resync`, gets a fresh `welcome` |

Every payload containing room data passes through `filterStateForViewer` or
`filterEventForViewer` first — snapshots, events, REST responses (history, replay,
checkpoint preview) and ephemeral relays alike. A seq a viewer may not see arrives as
`redacted`, so their counter advances without leaking the content.

HTTP request budgets are per server process and return `429` with `Retry-After` when exhausted:

| Action | Budget | Scope |
| --- | --- | --- |
| Sign up | 50/hour | IP address |
| Sign in | 150/15 minutes | IP address |
| Invite joins | 150/15 minutes | IP address and room |
| Invite requests, any code | 300/15 minutes | IP address |
| Replay | 150/minute | Participant and room |
| Wall detection | 50/15 minutes | Room |
| Image uploads | 300/15 minutes | Account, shared across rooms and library |
| UVTT import attempts | 25/minute | Account for library imports; GM and room for room imports |

Failed password guesses remain limited to 10/15 minutes per email, and failed current-password
checks to 10/15 minutes per account. Room capacity, file sizes and worker concurrency are separate limits.

Every account also has an upload allowance, which answers `409` because waiting does not help:

| Allowance | Limit | Counts |
| --- | --- | --- |
| Library items | 1,000 | Uploaded maps and token art. Built-in maps do not count |
| Image storage | 2 GB | Library art, images uploaded to rooms the account owns, and dice pictures. A room with no owner has its own 2 GB |

Going over a limit only stops new uploads; nothing an account already holds is removed or hidden.

Each seat also has socket limits, shared across its connections ([ADR 0051](adr/0051-seat-limits-and-room-lock.md)):
800 commands per 20 seconds and 1,800 per 5 minutes for a player, 3,000 per 30 seconds for the GM, 30 resyncs a minute, 40 live messages
a second, 8 open connections and 120 new connections a minute.

---

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Board renderer | PixiJS v8 | WebGL masks are what keep 100 tokens plus fog at 60 FPS; canvas2d will not. |
| App shell | React + TypeScript | Where the WCAG 2.2 AA target lives, and agents are strong at React, so UI parallelizes across four people. |
| Build | Vite | Instant HMR during canvas work, zero-config production build. |
| Transport | Socket.IO | Rooms map one-to-one onto Session Zero rooms; reconnection, acks and `volatile.emit` are built in. |
| Server | Node + Express | Sharing the kernel and protocol types with the client removes a whole class of desync bug. |
| Validation | zod | Express validates nothing on its own; zod guards every trust boundary (FR-GM-15). |
| Database | PostgreSQL + Prisma | An append-only event table with snapshots is inherently relational, and migrations stop four people fighting over schema drift. |
| Cache and bus | Redis | Atomic `INCR` gives the per-room seq; BullMQ queues and short-lived wall-job images live here. |
| Object storage | SeaweedFS → S3/R2 | Map images do not belong in Postgres, and SeaweedFS speaks S3 so local dev needs no cloud account. |
| Jobs | BullMQ | Grid and wall detection are async, and BullMQ rides the Redis already required. |
| Map analysis | Python + FastAPI + OpenCV + ONNX Runtime | Grid and wall detection are solved in the Python CV ecosystem; a learned wall model (`models/walls.onnx`) runs beside the rule-based detector. Isolating it matches the boundary FR-GM-11 specifies. |
| Auth | argon2id, opaque session cookies | Memory-hard hashing; server-side sessions store only the token's SHA-256 and revoke instantly. |
| Tests | Vitest + Playwright + Python `unittest` | Vitest shares Vite's transform; Playwright (`npm run test:browser`) drives real browsers through the UVTT flow; the vision service has its own suite. |
| CI | GitHub Actions | Free for the repo, and the whole matrix is one YAML job. |
| Local services | Docker Compose | Everyone runs identical versions of Postgres, Redis, SeaweedFS and the vision service with one command. |
| Hosting | One cloud VM running `docker-compose.prod.yml`, provisioned by Terraform (AWS EC2 or Google Compute Engine) | Holds persistent WebSocket connections, which serverless cannot; the same compose file as development keeps production and local stacks alike; cheapest option that runs the vision service. |
| Edge | Caddy | Serves the built web app, proxies the backend on one origin, and obtains TLS certificates on its own. |

### Running the backing services

Every stateful dependency runs in Docker, declared in [`../docker-compose.yml`](../docker-compose.yml).
Nobody installs Postgres, Redis or SeaweedFS locally, so a broken environment is fixed by
deleting a volume rather than by debugging one laptop.

| Service | Image | Ports | Volume | Holds |
| --- | --- | --- | --- | --- |
| `postgres` | `postgres:17` | 5432 | `pgdata` | Event log, snapshots, accounts, library, memberships |
| `redis` | `redis:7-alpine` | 6379 | `redisdata` | Sequence numbers, BullMQ queues, wall-job images |
| `s3` | `chrislusf/seaweedfs` | 8333 | `s3data` | Uploaded map, token and library images |
| `vision` | `services/vision` | 8000 (loopback) | — | Grid detection over private HTTP |
| `vision-walls` | `services/vision` | — | — | Wall detection worker on the `wall-detection` queue |
| `server` | repo `Dockerfile` | 3001 | — | Applies migrations, then serves API and sockets |
| `web` | repo `Dockerfile` | 5173 | — | Vite dev server |

```bash
docker compose up -d postgres redis s3 vision vision-walls
npm run prisma:migrate --workspace=@vtt/server

DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt \
REDIS_URL=redis://localhost:6379 \
S3_ENDPOINT=http://localhost:8333 \
npm run dev
```

Credentials are `vtt`/`vtt` and `vtt`/`vttvttvtt` — local development values committed on
purpose. Production refuses to start with the development S3 credentials and must supply
its own. `docker compose down` keeps the data; `down -v` discards it, which is the reset
when a migration goes wrong. The compose `server` sets `SEED_DEV_ACCOUNT=1`, which signs
in as `t@gmail.com` / `password` without sign-up; never set it in production.

**The inner loop runs on the host.** The server and web client run outside Docker for
day-to-day work, because the inner loop wants Vite HMR and `tsx watch`.
`docker compose up -d --build` runs the whole stack, app included, in containers (no hot
reload); see the README's Getting Started.

**Containers are optional, deliberately.** Each service is selected by an environment
variable and the server falls back when one is absent: no `DATABASE_URL` means an in-memory
store, no `S3_ENDPOINT` means the compose SeaweedFS at `127.0.0.1:8333` if it answers and local disk
otherwise (never in production, which refuses to start without it), no `REDIS_URL` means sequencing from
Postgres alone and grid and wall detection reporting themselves unavailable. A fresh checkout
runs with no containers, which is what keeps CI free of a service matrix. Startup states the mode:

```
[vtt] using Postgres event store                    # persistent
[vtt] DATABASE_URL unset — using in-memory store    # lost on every reload
```

In-memory mode loses every room on restart, including the restart `tsx watch` performs on
each save. Any manual test of persistence or reconnection must run against the containers,
and the Postgres store tests skip themselves until `DATABASE_URL` is set.

**Vision.** The vision service lives in `services/vision`, in its own image so the CV
dependency tree stays out of the Node services. Two processes run from it:

- `vision`, the private grid detector (FR-GM-03). The app server's `grid-detection` BullMQ
  worker calls it over the HTTP contract in ADR 0028, stores the result, and the GM reviews
  it in the grid preview (FR-GM-04). See [`GRID-DETECTION.md`](GRID-DETECTION.md).
- `vision-walls`, which consumes the `wall-detection` queue (FR-GM-11, ADR 0029). The app
  server stores the image bytes once in Redis under a content-hash key, enqueues a job
  naming that key, hears completion from BullMQ's queue events, validates the result, and
  tells the room's GM. Detected walls carry a confidence (ADR 0038) and are applied only
  after the GM reviews the preview. See [`WALL-DETECTION.md`](WALL-DETECTION.md).

### Production

The app is deployed as the one-VM production stack described in
[`DEPLOYMENT.md`](DEPLOYMENT.md) §4 (OpenSpec change `production-deployment`).

| Piece | What it does |
| --- | --- |
| `docker-compose.prod.yml` | `postgres`, `redis`, `s3` (SeaweedFS), `vision`, a one-shot `migrate` (`prisma migrate deploy`), `server` and `web`. `vision-walls` sits behind the `walls` profile and is **off by default**. |
| `Dockerfile.server` | Production server image: runs the TypeScript with `tsx` (no build step, no watch), with a `/health` container health check. |
| `Dockerfile.mcp` | The AI seat server (`apps/mcp`, ADR 0052), limited to 768 MB. Caddy proxies `/mcp` to it. Nothing depends on it, so if it stops, browser play carries on. |
| `Dockerfile.web` | Vite build served by Caddy (`deploy/Caddyfile`): static files with an SPA fallback, `/api`, `/socket.io`, `/uploads` and `/health` proxied to `server:3001`, with per-address limits ([`EDGE-PROTECTION.md`](EDGE-PROTECTION.md)). |
| `deploy/env.production.example` | Every required variable. Compose refuses to start, naming the variable, without `POSTGRES_PASSWORD`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` or `CLIENT_ORIGIN`. |
| `deploy/terraform/`, `deploy/terraform-gcp/` | One VM on AWS or Google Cloud: firewall (22 from one CIDR, 80, 443), static IP, generated secrets, Docker install, clone and `up -d --build`. The host defaults to `<ip>.sslip.io` so Caddy can issue a certificate without a domain. |

Only ports 80 and 443 are published; Postgres, Redis, S3, vision and the MCP server stay on the compose
network. Production runs with `NODE_ENV=production`, `COOKIE_SECURE=1`, `TRUST_PROXY` and no
`SEED_DEV_ACCOUNT`, and the server refuses to start without real S3 credentials. CI builds
all the images on every push so a broken Dockerfile fails before deploy.

Releases are `git pull` and the same `up -d --build`: `migrate` runs first, then the server
restarts. Data lives on the `pgdata`, `s3data` and `redisdata` volumes of that one VM, so
backups are manual and the VM is a single point of failure — acceptable for the course, and
[`DEPLOYMENT.md`](DEPLOYMENT.md) §5 maps the same images onto managed services (RDS or Cloud
SQL, ElastiCache or Memorystore, S3 or Cloud Storage) if that changes.

### Choices we did not make

- **Konva over PixiJS** — friendlier API, but dynamic line of sight needs cheap masking. Line of sight shipped on Pixi masks (`board/sightMask.ts`), which settled this.
- **Fly.io or Railway** — the original hosting plan. A plain VM with the production compose file runs the Python vision service and the Node stack side by side with no platform-specific config.
- **JWT for sessions** — stateless verification buys nothing with one app server, and opaque tokens revoke instantly.
- **Fastify over Express** — built-in schema validation would serve FR-GM-15 directly. Worth revisiting as the socket surface grows.
- **A CRDT** — rejected. CRDTs converge without a referee; this system *needs* one. Merge-anything semantics contradict authorization and hidden information.

---

## 3. Repository and CI

npm workspaces, one install from the root.

```
packages/shared    the contract: schemas, decide, reduce, visibility filters, and pure
                   helpers (dice, geometry, sight, terrain, movement, scenes, uvtt,
                   activityLog, replay, undo). No I/O.
apps/server        Express + Socket.IO.
  domain/            liveRoom.ts is the pipeline; roomRegistry, room lifecycle,
                     grid and wall detection, encounter templates, shipped maps
  http/              REST routes: rooms, library, creatures, encounters, animations, uploads
  identity/          accounts, argon2id passwords, sessions, rate limiting
  membership/        joined-rooms list and seat recovery
  uvtt/              UVTT validation (worker pool), preparation, export
  store/             memory and Postgres room stores, Redis seq, S3 assets, library,
                     identity and membership stores
  ws/socket.ts       the Socket.IO gateway
apps/mcp           MCP server: users' own AI apps hold player seats. An ordinary client of
                   apps/server, over REST and Socket.IO only (ADR 0052). /mcp/build has the
                   game builder's tools, kept apart from the player tools (ADR 0053).
                   studio/ is the interactive AI scene studio (ADR 0073), which shows a
                   build inside the AI conversation; studioM0/ is its earlier
                   flag-gated proof endpoint.
apps/web           React panels + PixiJS board.
  board/             boardView.ts and everything Pixi: tools, fog, sight mask, path
                     movement and ruler, effects and sound, dice throws
  i18n/              English and Traditional Chinese (zh-TW) catalogs; all UI text goes
                     through t() and lint enforces it (ADR 0054)
  lighting/          2.5D (isometric) rendering for maps marked isometric (ADR 0048)
  net/               roomConnection.ts is the sync client; REST client and identity
  pages/             home (with the guest tutorial), GM dashboard, library, room, map
                     editor, encounter editor, AI builds, privacy and terms
  panels/            the room's side panels (Play, Tokens, Dice, Manage, chat, …)
  ui/                shared components, including the Settings dialog
browser/           Playwright specs (UVTT, grid detection, scenes, terrain, guest
                   onboarding and tutorial, security headers)
services/vision    Python grid detector (FastAPI) and the BullMQ wall-detection worker.
deploy/            Caddyfile, production env template, Terraform for AWS and Google Cloud
Dockerfile.server,
Dockerfile.web,
docker-compose.prod.yml   the production images and stack (§2, Production)
openspec/          change proposals and accepted capability specs
```

```bash
npm install
npm run dev           # server :3001, web :5173 (proxies /api, /socket.io, /uploads)
npm run dev:db        # same, on the compose Postgres and Redis (migrates first)
npm run lint
npm run typecheck
npm test              # shared + server + web vitest suites, then the latency bench
npm run test:browser  # Playwright
npm run build
```

Conventions: commands are `noun.verb`, events are `PastTense`, tests and PR titles carry the
FR ID. Changes are planned with OpenSpec (`/opsx:propose`). Schema changes in
`packages/shared` need an ADR and review by the Real-Time Architecture owner.

### Testing approach

Quality is checked in layers, from the cheapest and most frequent to the slowest. Each
layer catches a kind of failure the one below it cannot:

| Layer | Runs | Catches |
| --- | --- | --- |
| Unit tests | Every `npm test`, every CI run | Wrong rules: authorization, validation, reduction, filtering, geometry |
| Integration tests | Every `npm test`, every CI run | Wrong behaviour over the wire: convergence, reconnection, leaks in real payloads |
| End-to-end browser tests | `npm run test:browser`, before merging UI flows | Broken user journeys in real browsers, on desktop and phone sizes |
| Manual browser checks | Per change, recorded in OpenSpec tasks or a `QA-*.md` log | What automation misses: look, feel, multi-person play |
| Audits | Dependencies on every CI run; sync and visibility agents on every relevant change; security, UI and edge reviews at milestones | Known-vulnerable packages, sync-invariant violations, GM-only leaks, security gaps, design and accessibility drift |
| Code review | Every pull request on GitHub, by an AI review agent and a teammate | Bugs, missed edge cases, unreviewed schema changes |

Before declaring any task done, a developer runs `npm run lint && npm run typecheck && npm test`.
About 4,200 automated cases run today (§4, *Tests*).

#### Unit tests

The kernel in `packages/shared` is pure, so its rules are tested without a server, a
database or a browser (`packages/shared/test`, Vitest, ~1,240 cases). A fixture room
(`test/fixtures.ts`) holds a GM and two players. Two helpers drive every test:

- `run` sends a command through `decide` and `reduce`;
- `attempt` returns the decision, so a test can assert a refusal.

Dice draw from a fixed sequence, so every result is reproducible. Every feature's unit tests
cover four things:

1. **Authorization.** Who may send the command, and that everyone else gets `forbidden`. This is the README §8 "authorization" requirement at the rule level.
2. **The event.** What the event carries, including the replaced value that undo needs (invariant 6).
3. **Reduction.** The state after the event, and after undoing it where undo applies.
4. **Visibility.** `filterStateForViewer` and `filterEventForViewer`, for the GM and for a player, for anything hidden.

The pure helpers each have their own suites: path cost, line of sight, terrain, dice pools,
the UVTT parser, the activity log and replay. `apps/web/test` (~1,690 cases) unit-tests the
web app's pure helpers and its components with Vitest and Testing Library. Board geometry,
the sync client's seq handling and the i18n lint guard are tested there too. The vision
service has 50 Python `unittest` cases for grid and wall detection.

#### Integration tests

`apps/server/test` (~1,000 cases) starts a real server on a random port with in-memory
stores (`startServer` in `test/helpers.ts`). It connects several `TestClient`s over real
Socket.IO, as a GM and players would. These tests check what single-process unit tests can't:

- **Convergence.** Every client ends with the same state after concurrent commands, and a client that reconnects or resyncs catches up (FR-SYNC-01–04, FR-PL-05, FR-PL-06).
- **Forged payloads.** A player sends GM-only commands or commands for tokens they don't own straight down the socket, and is refused (README §8, FR-GM-15).
- **Leaks.** `TestClient.rawLog` keeps every raw payload a client received. Tests search it for hidden names, positions and rolls. That proves the data never arrived, not just that the UI doesn't show it (FR-GM-23). Snapshots, events, REST responses, replay and ephemeral relays are all covered.
- **The HTTP surface.** REST routes, uploads, rate limits and abuse limits (`abuseLimits`, `joinRateLimit`, `accountRateLimits`), and response headers (`apiHardening`).
- **Postgres.** The Postgres stores have their own tests, which run when `DATABASE_URL` is set. CI runs the AI build store tests against a real Postgres service.
- **Latency.** `ephemeralLatency.test.ts` sends pings, drag previews and area aims through a TCP proxy that adds 50 ms ± 10 ms each way. It requires p95 delivery at or under 150 ms (README §6, FR-SYNC-03). It runs last in `npm test`.

`apps/mcp/test` (~210 cases) tests the AI seat and game builder tools against a test room
server. It uses REST and Socket.IO only, as the real MCP server does (ADR 0052).

#### End-to-end browser tests

Playwright specs in `browser/` drive the built app end to end. Playwright starts its own
server on port 3109 with an in-memory store, and a web server on port 5189. Each spec runs in
six projects:

| Engine | Desktop (1440 × 1000) | Phone size (390 × 844) |
| --- | --- | --- |
| Chromium | `chromium-desktop` | `chromium-touch` (touch) |
| Firefox | `firefox-desktop` | `firefox-narrow` |
| WebKit (Safari) | `webkit-desktop` | `webkit-touch` (touch) |

Together these cover the README §8 cross-browser requirement. The specs cover:

- UVTT import, persistence and export;
- grid detection;
- scenes;
- terrain;
- guest onboarding, the guest tutorial and its demo fight;
- dragging on the home page;
- security headers.

`VTT_TEST_CSP=1` runs them against the production build (`vite preview`) to check the
Content-Security-Policy. Traces and screenshots are kept on failure. The browser suite needs
browser binaries and takes minutes, so it isn't part of CI. It runs locally before merging
changes to the flows it covers.

#### Manual browser checks

Tasks in an OpenSpec change's `tasks.md` say how each one is verified ("Verify with …"). For
UI changes that usually includes a check in a real browser, often with a GM and a player in separate browser contexts (or
`localhost` and `127.0.0.1`, so each has its own storage). The check runs against an isolated
in-memory server, never against production rooms. Larger checks are written up as
verification logs in `docs/`:

- [`QA-checkpoint-restoration.md`](QA-checkpoint-restoration.md)
- [`QA-grid-sample.md`](QA-grid-sample.md)
- [`QA-grid-preparation.md`](QA-grid-preparation.md)
- [`QA-classical-grid.md`](QA-classical-grid.md)
- [`QA-condition-icons.md`](QA-condition-icons.md)
- [`QA-room-previews.md`](QA-room-previews.md)
- [`QA-guest-gm-hosting.md`](QA-guest-gm-hosting.md)

Agents ran some checks through the Playwright MCP server and Claude in Chrome. The M5/M6
first-use study ([`M5-M6-live-usability-findings.md`](M5-M6-live-usability-findings.md)) ran
simulated user personas against the deployed site. The team also playtested in person;
[`PLAYTEST-FEEDBACK.md`](PLAYTEST-FEEDBACK.md) lists what came out of that and when each item
was fixed.

#### Auditing

| Audit | When | What it found or guards |
| --- | --- | --- |
| Dependency audit (`npm run audit`, `scripts/audit-ci.mjs`) | Every CI run, as its own job | Fails on any new high or critical advisory in a production dependency. Accepted advisories are allowlisted in the script with a reason and an exit condition. |
| Security review, 2026-10-08 | Code read of the server | Missing guess and join limits, per-connection chat limits, racing guess limits, forgeable proxy addresses. Fixed in OpenSpec change `security-hardening`. |
| Penetration test, early November | Against the API | Findings fixed in PR #164 (zod and multer upgrades, 2026-11-05), the `/api` header hardening (F-02, 2026-11-10) and the CI audit gate (F-03, PR #172). |
| Security review, 2026-11-13 | Code read plus 19 read-only requests to the deployed site | No critical or high findings. One medium (no browser security headers on HTML) and four low. Fixed in change `security-review-findings`, PR #193, with ADR 0069 on sign-up disclosure. |
| Edge protection ([`audits/edge-protection-2026-11-04.md`](audits/edge-protection-2026-11-04.md)) | Before the rate-limited Caddy edge shipped | Verified per-address limits on the real images in a throwaway Docker network ([`EDGE-PROTECTION.md`](EDGE-PROTECTION.md)) |
| Sync review (`sync-reviewer` agent, `.claude/agents/sync-reviewer.md`) | On every change that touches state, commands, events, the server pipeline or the web sync client, before the PR is reviewed | Reads the diff for event-sourcing and sync violations: state changed outside `reduce`, non-determinism in `decide` or `reduce` (`Date`, `Math.random`, I/O), events missing the replaced value undo needs, and ordering or seq problems (invariants 1, 2, 5, 6) |
| Visibility audit (`visibility-auditor` agent, `.claude/agents/visibility-auditor.md`) | Before merging anything that touches `packages/shared` or `apps/server`, or adds state | Traces every path new data takes to a client and flags anything that could leak GM-only information to players: hidden tokens, fog, GM rolls, private metadata, in snapshots, events, REST responses or ephemeral relays (invariant 3, FR-GM-23) |
| UI design and accessibility ([`audits/ui-design-audit-2026-10-29.md`](audits/ui-design-audit-2026-10-29.md), [`audits/ui-ai-features-audit-2026-11-10.md`](audits/ui-ai-features-audit-2026-11-10.md)) | At milestones | Checked `apps/web` against [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) and [`INTERFACE.md`](INTERFACE.md), WCAG 2.2 AA, and the visibility and coordinate invariants. Its WCAG blockers were fixed on 2026-10-29. |

#### Continuous integration

GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs on every
pull request to `main` and on every push to `main`. Three jobs run in parallel:

| Job | Steps |
| --- | --- |
| `verify` | `npm ci` → Prisma client → lint (including the i18n no-literal-text guard) → typecheck → `npm test` (all Vitest suites and the latency bench) → AI build store tests against a Postgres 17 service → vision `unittest` → `npm run build` → start the server and poll `/health` |
| `audit` | `npm run audit` on the committed lockfile |
| `images` | Build the server, web, MCP and vision production images (no push), and validate the Caddyfile with the web image's own Caddy |

The `/health` smoke test runs with no `DATABASE_URL`, using the in-memory fallback. That
fallback is why a fresh checkout and CI need no other containers.

#### Code review on GitHub

Work reaches `main` through pull requests on GitHub, and CI runs on each one. The pull
request template ([`.github/pull_request_template.md`](../.github/pull_request_template.md))
asks the author to state the FR ID, the commands and events added, the authorization rule and
the visibility rule. The author then confirms a checklist:

- typecheck and tests pass;
- a multi-client integration test covers convergence;
- no state changes outside `reduce`, and events carry replaced values;
- hidden data is filtered in snapshots, events and REST;
- any schema change links its ADR;
- the UI is keyboard-accessible and doesn't rely on colour alone.

Each pull request is reviewed twice, once by an agent and once by people:

- **Agent review on GitHub.** An AI code review agent, CodeRabbit, reviews pull requests on
  GitHub automatically. It reads the diff and leaves review comments on the pull request:
  bugs, missed edge cases, and departures from the project's conventions. The author fixes
  them in follow-up commits on the same branch before merging. Examples are the
  fixes on #88, #91 and #92, and the reviews of room-load isolation, room deletion, the tool
  rail and line of sight.
- **Teammates.** A teammate reviews and merges the pull request. Changes to existing
  `packages/shared` schemas, event storage or visibility also need an ADR reviewed by the
  Real-Time Architecture owner. ADRs stay *Proposed* until that review (§8).

Before a pull request is opened, the `sync-reviewer` and `visibility-auditor` agents audit
changes in their areas (see *Auditing* above). The `/code-review` and `/security-review`
commands give a further local pass on a branch.

**What isn't automated yet.** The Playwright suite isn't in CI. The README's study with at
least five independent GMs and players is still pending; the M5/M6 study used simulated
personas.

---

## 4. The Current Build

The walking skeleton (heartbeat) proved the risky paths — server-authoritative sync,
durable guest identity, and player-safe filtering. The build has since grown to cover
every M1 and M2 requirement in the README and nearly all of M3, including the stretch goals
dynamic line of sight and interactive portal states, and it is **deployed** to a public cloud
VM (§2, *Production*).

**Working today.**

- *Accounts and rooms.* A GM signs up and creates rooms from the GM dashboard; players join
  by invite link as guests with no account. A signed-out visitor can also host a guest room
  on built-in maps (ADR 0072), and the home page runs an interactive guest tutorial with a
  scripted demo fight. The GM can regenerate the invite, lock the room, revoke a
  participant, and delete the room; a room holds at most 32 players. Signed-in users see the
  rooms they have joined, and a lost seat can be recovered. A GM's room defaults (table rules,
  distance per square and unit) are saved per account and applied to each new room (ADR 0066).
- *Map preparation.* Upload a map or pick one from the library (built-in maps are seeded as
  library rows). Grid detection runs automatically and the GM corrects it in a preview.
  The map editor walks through grid, walls and fog; wall detection proposes walls with
  confidence for review; walls and portals (doors, windows; open, closed, locked) can be
  drawn and edited by hand. UVTT/dd2vtt files import into a room or the library with
  validation, and a prepared scene exports back to `.uvtt`; imported openings can all be made
  doors in one click. Changing the map can move existing tokens with it atomically (ADR 0042).
  The editor's Sight step previews line of sight with test tokens, sets an optional sight
  range, and marks a map flat or 2.5D (ADR 0048). Grid detection also uses reviewed classical
  line-segment estimates (ADR 0045). **Change map** (replace the map) and **Edit map**
  (prepare the current one) are separate, and a prepared room map can be saved back to the
  library and linked to it (ADR 0070). Walls, doors and windows are reviewed as a set.
- *Terrain.* The GM paints Difficult and Blocked terrain straight onto the live board with
  the rail's **Terrain** tool (brush or rectangle), plus up to 32 named temporary effects.
  Terrain is outlined by area in a two-tone palette and shown to everyone by default. Moves
  are costed against it, resizes must land on a clear footprint, and players see an effective
  projection of terrain in any square they can see even partly (ADR 0046, 0069).
- *Movement.* A snapped drag shows and charges the cheapest valid path to the target square,
  routing around Blocked terrain, walls and closed doors under the room's Diagonals rule
  (equal, alternating or Euclidean) and its Difficult terrain rule (on entry, on exit or
  both) (ADR 0055). Players receive the walls they can see so their clients can route (ADR
  0056). The server re-checks every leg. Tokens slide along their path on every screen and in
  replays. A token may stand where a wall only grazes its square (ADR 0063), and a snapped
  drop or placement can't stack two tokens in one square; free placement and arrow keys can.
- *Tokens.* Create tokens from scratch or from saved library creatures, place several in a
  row, duplicate to a chosen square, group them, and set image, colour, size, rotation, HP,
  conditions (painted icons), initiative score and named attacks (with range and animation).
  Token edits save without a confirmation; only deletion asks. Assign owners; players move
  only their own tokens (also with the arrow keys). Hide a token and it never reaches player
  clients. The GM has quick HP on the token card. Party tokens are carried across scene
  switches, encounter template applies and map changes, and wait to be placed (ADR 0068).
- *Line of sight.* With line of sight on, each player sees only what their tokens can see:
  walls and closed or locked doors block sight, windows and open doors do not, and an optional
  sight range limits it. Sight is computed on the server and anything outside it is concealed
  by the same filters as fog (ADR 0044). The darkness is drawn as vector shapes from every owned
  token's merged sight, so its edge is crisp at any zoom, with no fade either side. The GM can view as any token.
- *Play.* Pan, zoom, ping, and measure with a personal ruler in **Range** mode (plain
  distance) or **Movement** mode (a multi-point route costed like a drag). Manual fog in
  rectangles or polygons, drawn as flowing painted fog whose border fades inward, inside the
  fogged area. Lines, shapes and freehand drawings the whole table sees, above fog; players
  erase their own and the GM erases any (ADR 0064). Shared area templates (circles, cones,
  lines, squares) aimed live on the ephemeral channel, in colours, optionally GM-only. A click
  places a two-cell area and a drag sizes it with a live size label. Placed areas can be
  moved, resized and turned (ADR 0058), and other people's areas are clipped at the viewer's
  fog and sight (ADR 0059).
- *Combat.* Initiative with a mass roll for every checked token, mid-encounter adds and
  removals (ADR 0065), a turn banner with **End turn** for the token's owner, and a GM step
  back (ADR 0060). One dice builder for every roll, with mixed die types (ADR 0061); public or
  GM-only rolls thrown on every participant's board with 3D dice and per-player dice looks;
  group rolls across many tokens. Named attacks carry a range (Unlimited, Melee with reach,
  Ranged) that warns but never blocks (ADR 0067), and an animation the GM can preview. Attack
  rolls against one or several targets go to the GM's Rulings list (Hit, Miss, or ignore; Clear
  all). Damage resolves with a chosen amount (Half, None, or any value) and conditions (ADR
  0062). Area effects run saves, a GM call and damage across every token in an area (ADR 0046,
  area effects). Themed board animations and sound. Room chat with `@` mentions.
- *Table rules and settings.* Settings has its own button with Audio, Graphics, Preferences,
  Table (GM, shared by the room) and Language tabs. The Table tab holds Remove tokens at 0 HP
  (All, Only NPC tokens, Off; with Off a downed token is marked), Hide map from players
  without a token, Hide HP, Hide AC, Diagonals and Difficult terrain (ADR 0057). Per-browser
  choices include attack animations (All, Current turn, None), reduced animations, arrow-key
  movement and the GM's turn banner on every turn.
- *Localization.* The site is available in English and Traditional Chinese (zh-TW), except
  the AI build screens (`pages/build/`), which are still English-only and exempt from the lint
  guard. Server messages people read are catalog ids, and REST honours `Accept-Language`
  (ADR 0054).
- *Recovery.* A human-readable activity log, undo for reversible actions, and an encounter
  replay that any participant can step through from the start of an encounter (or an existing
  checkpoint), filtered as themselves. Named checkpoints (create, preview, restore, delete)
  remain in the contract, the server and the REST API, but the room's Checkpoints panel was
  taken out of the GM sidebar when scenes shipped (2026-11-03); scenes and undo now cover
  the same need in the UI.
- *Scenes.* The GM switches between named live scenes from the room header. Leaving automatically saves the board, including token identities, HP, ownership, fog, walls, portals, terrain, initiative and groups. A new scene can be prepared privately (from the current map, an encounter template or a map) and activated when ready. Inactive scenes and their names remain GM-only. Encounter templates seed reusable setups, and party tokens carry across scene switches (ADR 0045, 0068).
- *Reuse.* Encounter templates save the map, walls, portals, fog and monster roster, are
  edited in a temporary room, and are applied to a live room in one command. Game presets
  (ADR 0027) set up stats and conditions for a system.
- *Durability.* Reload and come back as the same participant with the same role. Kill the
  server and, with Postgres configured, the room is still there.
- *AI at the table.* Users connect their own AI app over MCP to hold player seats (ADR 0052),
  or to build a game from their materials as a private draft that the owner reviews and
  publishes (ADR 0053), including AI-proposed grids, walls (curved walls and cave edges) and
  terrain (ADR 0071). The AI build page is a workspace for reviewing and editing the draft.
- *Resilience.* A render error inside a room shows a recovery screen with Reload and Back to
  home, not a blank page. Named attacks saved before mixed dice are upgraded as they are read
  from stored events and encounter templates (ADR 0061 amendment).
- *Deployment.* The production stack runs on a cloud VM over HTTPS at
  <https://sessionzero.codes> (§2, *Production*). The GM dashboard shows board previews of
  hosted rooms; the site has privacy and terms pages that cover AI seats and the game builder.

The playtest requests and bug reports, and when each was fixed, are tracked in
[`PLAYTEST-FEEDBACK.md`](PLAYTEST-FEEDBACK.md).

**Tests.** About 4,200 automated cases (approach in §3, *Testing approach*): ~1,240 unit tests over the pure kernel
(`packages/shared/test`), ~1,000 server tests including multi-client integration tests over
real sockets and Postgres store tests that run when a database is configured
(`apps/server/test`), ~1,690 web tests (`apps/web/test`), ~210 MCP server tests
(`apps/mcp/test`), 50 Python tests for the vision service, and Playwright browser specs for
UVTT, grid detection, scenes, terrain, guest onboarding and the guest tutorial.

**Not built yet.** Wall detection does not yet classify doors and windows, and its worker is
off by default in production. The interactive scene studio (ADR 0073) is still in progress; see §7.

**Run it — no containers.** A fresh clone plays without Docker, because the store,
sequencer and asset sink each fall back when their environment variable is unset (§2).
Grid and wall detection need Redis and the vision containers, and report themselves
unavailable otherwise.

```bash
npm install && npm run dev
```

Open <http://localhost:5173>, sign up, create a room, copy the invite link, and open it in a
private window to join as a player. Rooms live in memory and die on every server restart,
including the restart `tsx watch` performs each time you save a file.

**Run it — with persistence.** Needed to exercise the Postgres event store, S3 uploads,
Redis sequencing and detection, and therefore needed for any manual test of restart
survival, reconnection or recovery. Use the commands in §2, or
`npm run dev:db`, or `docker compose up -d --build` for the whole stack. The startup line
tells you which store you got: `using Postgres event store` or
`DATABASE_URL unset — using in-memory store`.

**Run it — production.** `docker compose --env-file .env.production -f
docker-compose.prod.yml up -d --build` on a VM, or `terraform apply` in `deploy/terraform`
(AWS) or `deploy/terraform-gcp` (Google Cloud). See [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 5. Data and Identity

### Schema

| Table | Key | Purpose |
| --- | --- | --- |
| `rooms` | `id`, unique `invite_code` | One room; the invite code is the share link |
| `events` | `(room_id, seq)` | Append-only log. The composite key *is* the ordering guarantee (FR-SYNC-04) — a duplicate seq is a constraint violation, not an application bug |
| `snapshots` | `(room_id, seq)` | Periodic state for fast load; derivable, never authoritative |
| `checkpoints` | `id` | Named restore points (FR-REC, ADR 0019) |
| `credentials` | `token_hash` | Guest token → participant, with `revoked_at` (FR-GM-20) |
| `users` | `id` | Accounts: email and argon2id password hash |
| `sessions` | `token_hash` | Sign-ins; only the cookie token's SHA-256 is stored |
| `gm_identities` | `id` | Owners of rooms and library items: one per account, plus legacy GM device identities from before accounts (ADR 0004) |
| `room_members` | — | Which participant a person is in a room; access, not game state, never sent to participants |
| `library_assets` | `id` | Reusable map and token images, with prepared walls and fog for maps (ADR 0037) |
| `library_creatures` | `id` | Saved creatures (ADR 0012, 0020, 0023) |
| `encounter_templates` | `id` | Reusable encounters (ADR 0024) |
| `library_animations` | `id` | Custom attack animations (ADR 0038) |
| `dice_looks` | `id` | Saved dice looks and image skins |
| `asset_refs` | — | Projection of which library assets a room's current state references; derived, never read back into state |
| `room_uploads` | — | Images uploaded inside a room, so room deletion can remove them (ADR 0009) |

Room state is the fold of its events. Scenes, terrain and line-of-sight settings are part of
that state, so they needed no new tables. Snapshots are an optimization and can be deleted
without data loss. Library, account and membership tables are ordinary CRUD data beside the
log, not room state.

### Identity

**Players** are guests. The browser generates an opaque token, keeps it in
`localStorage`, and the server stores only its SHA-256 — so the server never holds a secret
it could leak. Socket.IO replays the handshake `auth` on every automatic reconnect, so a
dropped client rebinds to the same participant with no extra round trip (FR-PL-02,
FR-PL-05). A signed-in player's seat is also recorded in `room_members`, so they can find
their rooms again and recover a seat from another browser.

**GMs** have accounts (FR-GM-01): argon2id password hashes, opaque session cookies stored
hashed, and rate-limited sign-in and join. A signed-out GM may also start a guest room on
built-in art only, as decided in [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1 and
[ADR 0072](adr/0072-guest-gm-hosting.md). A guest GM is a device identity (`gm_identities.guest`);
creation is limited to 20 per hour per address and 3 per browser. Guest rooms expire after
30 days without play, and a free account can move them in with the legacy claim. Rooms and library items created by
a pre-account GM device identity can be claimed by an account (`/api/gm/legacy/claim`).

`participants` is the identity the game uses. Tokens are owned by participants, not
accounts, so guests are first-class and accounts remain a hosting requirement only.

### Visibility

Hidden information never leaves the server. Both filters in `visibility.ts` are updated
together whenever a new kind of hidden data is added. Today that covers hidden tokens,
tokens under fog or outside the viewer's line of sight that the viewer does not own, fog
regions, walls (players get only the stretches they can see, clipped at fog and sight, ADR
0056), GM-only portals and areas, other people's areas outside the viewer's fog and sight
(clipped, ADR 0059), GM-only rolls and rulings, canonical terrain layers and effect names
(players get only an effective projection), other tokens' HP and AC when the table hides
them, and every other token, area and portal while a player owns no visible token and the
table hides the map from such players (ADR 0057), inactive scenes and their names, checkpoint names, and private metadata. A player's sight polygon is
computed server-side and added to their filtered state; scene switches and sight changes
reach players as filtered snapshots, never as raw events.
Authorization is decided in `decide()`; the client's `can.*` helpers are UI hints with no
security value. The GM can "View as player" to check what players see; replays and
checkpoint previews are built through the same filters.

---

## 6. Requirements Traceability

**B** = built · **~** = partial · **D** = designed, not built.

| ID | Requirement | Where | |
| --- | --- | --- | --- |
| FR-GM-01 | Authenticated GM session; guest hosting on built-in art ([ADR 0072](adr/0072-guest-gm-hosting.md)) | `identity/`, `users`, `sessions`, argon2id | B |
| FR-GM-02 | Battle-map setup | `POST /api/uploads` or library → `scene.setMap` | B |
| FR-GM-03 | Automatic grid detection | `grid-detection` queue → `vision` (ADR 0028) | B |
| FR-GM-04 | Grid preview and correction | `MapGridPreview`, `GridForm`, map editor | B |
| FR-GM-05 | Viewport-independent grid metadata | `GridSet`, board coordinates | B |
| FR-GM-06 | UVTT import | `scene.importUVTT`, `/api/library/uvtt/imports` (ADR 0041, 0043) | B |
| FR-GM-07 | UVTT validation | `uvtt/validateFile.ts` in a worker pool, zod | B |
| FR-GM-08 | Token setup | `token.create/configure/setImage/setStats`, creatures, duplicate (ADR 0026, 0033) | B |
| FR-GM-09 | Editable walls and portals | `wall.*`, `portal.set` (ADR 0029, 0030) | B |
| FR-GM-10 | Token ownership assignment | `token.setOwners`, roster UI | B |
| FR-GM-11 | Vision-based map parsing | `wall-detection` queue → `vision-walls` (ADR 0029, 0038) | ~ |
| FR-GM-12 | UVTT export | `uvtt/exportScene.ts` | B |
| FR-GM-13 | Reusable encounter templates | `encounter_templates`, `encounter.apply` (ADR 0024, 0033) | B |
| FR-GM-14 | GM and player roles | `Participant.role` | B |
| FR-GM-15 | Server-side authorization | `decide()`, zod at every boundary | B |
| FR-GM-16 | Token visibility controls | `token.setHidden` + filters | B |
| FR-GM-17 | Manual fog of war | `fog.*` + filters (ADR 0016, 0032) | B |
| FR-GM-18 | Interactive portal states | `portal.setState`, movement and sight blocking | B |
| FR-GM-19 | Dynamic line of sight | `sight.ts` on the server, `sightMask.ts` (ADR 0044) | B |
| FR-GM-20 | Guest revocation, invite regeneration | `participant.revoke/revokeMany`, `room.setJoinsLocked`, `POST /api/rooms/:id/invite` | B |
| FR-GM-21 | Initiative and turn order | `initiative.*`, mass roll, mid-encounter edits, player End turn, turn banner (ADR 0022, 0060, 0065) | B |
| FR-GM-22 | Public and GM-only rolls | `DiceVisibility` + filters, rulings and damage resolution (ADR 0060, 0062) | B |
| FR-GM-23 | Player-safe state filtering | `visibility.ts` | B |
| FR-GM-24 | Focusable token roster | `TokenRoster.tsx` | B |
| FR-GM-25 | Scene switching | `scene.create/switch/prepare/…`, `savedScenes` (ADR 0045) | B |
| FR-PL-01 | Shareable guest link | `rooms.invite_code` | B |
| FR-PL-02 | Durable guest identity | Hashed `localStorage` token, `room_members` | B |
| FR-PL-03 | Responsive Player Board | `RoomPanel`, `MyTokens` | B |
| FR-PL-04 | Owned-token control | Ownership check in `decide()` | B |
| FR-PL-05 | Automatic reconnection | Handshake replay | B |
| FR-PL-06 | Full-state resynchronization | `welcome` + `resync` | B |
| FR-PL-07 | Replay for late joiners | `/api/rooms/:id/replay`, `ReplayBar` (ADR 0025) | B |
| FR-PL-08 | Connect your own AI | `apps/mcp`, Share dialog, [`AI-PLAYERS.md`](AI-PLAYERS.md) (ADR 0052) | B |
| FR-PL-09 | Several AI seats at one table | `apps/mcp`: one seat per `join_room`, `seat` on every tool (ADR 0052) | B |
| FR-GM-26 | AI game builder | `/mcp/build`, pass routes `/api/build/*`, `BuildStore`, the owner's per-build choices for AI-set grids and walls, `domain/mapOverlay.ts` (ADR 0053), [`AI-GAME-BUILDER.md`](AI-GAME-BUILDER.md) | B |
| FR-GM-27 | Review and publish a build | Owner routes `/api/builds/*`, `domain/buildPublish.ts`, `pages/build/` with walls drawn in review (ADR 0053) | B |
| FR-TAC-01 | Independent pan and zoom | `boardView.ts` | B |
| FR-TAC-02 | Continuous coords, grid snapping | `snapTokenCenter`, cheapest-path drags, no stacking on snapped drops, wall clearance (ADR 0055, 0063) | B |
| FR-TAC-03 | Movement budget ruler | Personal ruler in Range and Movement modes; path cost in `movement.ts` under the room's Diagonals and Difficult terrain rules (ADR 0046, 0055) | B |
| FR-TAC-04 | Drawing overlays | `drawing.add`/`drawing.remove`, `RoomState.drawings`, `simplifyStroke.ts` (ADR 0064) | B |
| FR-TAC-05 | Target pings | Ephemeral `ping` | B |
| FR-TAC-06 | AoE templates | `templatePreview` → `template.place`/`template.update`, clipped at fog and sight, `areaEffect.*` (ADR 0007, 0021, 0040, 0046, 0058, 0059) | B |
| FR-TAC-07 | Token statistics and conditions | `token.setStats/setConditions`, 0 HP rule and downed marker (ADR 0049, 0057) | B |
| FR-TAC-08 | Accessible condition markers | `ConditionMarker.tsx`, painted icons | B |
| FR-TAC-09 | Shared dice expressions | `dice.ts`, server-rolled, mixed dice pools, `dice.rollGroup`, attack range (ADR 0061, 0067) | B |
| FR-SYNC-01 | Server-authoritative state | `LiveRoom` | B |
| FR-SYNC-02 | Real-time persistent sync | Postgres store | B |
| FR-SYNC-03 | Ephemeral interaction channel | `volatile.emit` | B |
| FR-SYNC-04 | Ordered conflict handling | `(room_id, seq)` primary key | B |
| FR-REC-01 | Human-readable activity log | `activityLog.ts`, `/history`, `ActivityLog.tsx` | B |
| FR-REC-02 | Undo for reversible actions | `history.undo` (ADR 0013) | B |
| FR-REC-03 | Append-only recovery history | Compensating events, insert-only schema | B |

**Why the partials are partial.**
FR-GM-11 detects walls, with confidence, but does not yet classify doors and windows; the
GM reviews every result on its preview before applying it, and adds portals by hand. The
`vision-walls` worker is behind the `walls` compose profile and off in the deployed stack,
so production wall detection must be switched on explicitly.
FR-TAC-04 draws lines, rectangles, circles and freehand strokes that the whole table sees,
saved with the scene and drawn above fog and darkness (ADR 0064). Freehand goes beyond the
README's original scope; strokes are simplified in the browser and bounded on the server.

FR-TAC-03 is built as a personal ruler with no per-turn tracking. Its Range mode measures
plain distance; its Movement mode costs a multi-point route exactly as a token drag is
costed, under the room's shared Diagonals and Difficult terrain rules (ADR 0055). The
earlier per-browser movement budget and diagonal preference were replaced by those room
rules so every participant sees the same cost.

---

## 7. Open Decisions

- **Sight updates.** Owned-token moves resync their owner with a full snapshot while line of sight is on (ADR 0044). Diff-style sight updates can come later without a schema change if this costs too much on large tables.
- **Door and window detection.** Whether `vision-walls` classifies portals or the GM keeps placing them by hand, and when the worker is turned on in production.
- **Hosting beyond one VM.** The deployed VM is a single point of failure with manually backed-up volumes. Moving to managed Postgres, Redis and object storage ([`DEPLOYMENT.md`](DEPLOYMENT.md) §5) needs no code change, only environment variables.
- **Legacy GM device identities.** `gm_identities` still holds pre-account device rows; a follow-up removes them and renames the table to `owners`.
- **Duplicate names.** Participant and token names are not unique (KAN-61, KAN-62).
- **Proposed ADRs.** Many ADRs below are implemented but still marked *Proposed* pending Real-Time Architecture review. The November work (ADRs 0055–0072) adds to that backlog.
- **Interactive scene studio.** ADR 0073 is accepted. Milestones M0 through M3 merged between 2026-11-16 and 2026-11-18 (`apps/mcp/src/studio/`, OpenSpec change `interactive-ai-scene-studio`). This document does not yet describe the studio in detail; its scope and remaining milestones live in that change.
- **Checkpoints in the UI.** `CheckpointsPanel.tsx` is no longer mounted. Either bring it back (for example under Manage or the activity log) or retire the panel and its strings.
- **Human usability study.** The M5/M6 findings ([`M5-M6-live-usability-findings.md`](M5-M6-live-usability-findings.md)) come from simulated personas; an independent human follow-up study is still pending.

### Prior art for map analysis

Wall and portal detection (FR-GM-11) adapts existing MIT-licensed work rather than starting from scratch. Both references implement the same pipeline shape — colour masking → morphological cleanup → contour tracing → segment simplification and endpoint welding — so the approach is well-trodden. Attribution is carried in [`../services/vision/THIRD_PARTY_NOTICES.md`](../services/vision/THIRD_PARTY_NOTICES.md).

| Reference | What we take from it | Licence |
| --- | --- | --- |
| [`ThreeHats/auto-wall`](https://github.com/ThreeHats/auto-wall) — **primary** | Python/OpenCV implementation of the detection pipeline; closest to our service architecture and directly adaptable | MIT |
| [`DimitroffVodka/foundry-auto-wall`](https://github.com/DimitroffVodka/foundry-auto-wall) — secondary | A later derivative of the same project; useful for its centreline tracing mode, which fixes the double-wall artefact thick drawn lines produce | MIT |

Our output target is UVTT wall and portal geometry (FR-GM-06, FR-GM-12), not Foundry `WallDocument`s, so the serialization layer is ours.

---

## 8. ADR Index

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](adr/0001-event-model.md) | Server-authoritative event log with per-viewer filtering | Proposed |
| [0002](adr/0002-transport-and-identity.md) | Socket.IO transport and browser-generated guest identity | Accepted |
| [0003](adr/0003-tactical-state.md) | Stats, conditions, initiative and rolls | Accepted |
| [0004](adr/0004-asset-library.md) | GM device identity and the asset library | Accepted |
| [0005](adr/0005-grid-line-style.md) | Grid line style | Accepted |
| [0006](adr/0006-participant-lifecycle.md) | Participant lifecycle | Accepted |
| [0007](adr/0007-shared-area-templates.md) | Shared area templates | Accepted |
| [0008](adr/0008-token-image-changes.md) | Changing a token's image | Accepted |
| [0009](adr/0009-room-deletion.md) | Room deletion | Accepted |
| [0010](adr/0010-attack-roll-context.md) | Attack context on dice rolls | Accepted |
| [0011](adr/0011-attack-rulings.md) | GM rulings on attack rolls | Accepted |
| [0012](adr/0012-library-creatures.md) | Library creatures | Accepted |
| [0013](adr/0013-undo.md) | Undo for reversible actions | Proposed |
| [0014](adr/0014-dice-drop-relay.md) | Dice drops on the ephemeral channel | Proposed |
| [0015](adr/0015-room-chat.md) | Room chat | Proposed |
| [0016](adr/0016-manual-fog.md) | Manual fog of war | Accepted |
| [0019](adr/0019-checkpoints.md) | Named checkpoints | Accepted |
| [0020](adr/0020-creature-templates.md) | Creature colour, starting conditions, adding several tokens | Proposed |
| [0021](adr/0021-area-lines-and-aim.md) | Line templates and shared area aiming | Proposed |
| [0022](adr/0022-token-initiative-memory.md) | Initiative scores saved on tokens | Proposed |
| [0023](adr/0023-creature-starting-hp.md) | Creature templates keep starting HP and named attacks | Proposed |
| [0024](adr/0024-encounter-templates.md) | Reusable encounter templates | Accepted |
| [0025](adr/0025-encounter-replay.md) | Encounter replay | Proposed |
| [0026](adr/0026-token-groups-and-duplicate.md) | Token groups, duplicate, undo for creation and encounter starts | Proposed |
| [0027](adr/0027-game-presets.md) | Game presets | Proposed |
| [0028](adr/0028-grid-detection-http-contract.md) | Private grid detection HTTP contract | — |
| [0029](adr/0029-walls-and-wall-detection.md) | Walls and automatic wall detection | Accepted |
| [0030](adr/0030-portals.md) | Portals: doors and windows on walls | Accepted |
| [0031](adr/0031-map-editor-command-context.md) | Detection identity and map editor command context | Proposed |
| [0032](adr/0032-atomic-fog-replace.md) | Atomic fog replacement | Accepted |
| [0033](adr/0033-duplicate-at-position.md) | Duplicate at a chosen square | Proposed |
| [0033](adr/0033-encounter-template-editor.md) | Editing encounter templates in temporary rooms | Proposed |
| [0034](adr/0034-shared-token-attacks.md) | Shared token attacks | Proposed |
| [0035](adr/0035-chat-mentions.md) | Chat mentions | Proposed |
| [0036](adr/0036-checkpoint-delete-preview.md) | Deleting and previewing checkpoints | Proposed |
| [0036](adr/0036-seeded-shipped-maps.md) | Shipped maps seeded as library rows | Proposed |
| [0037](adr/0037-library-map-board.md) | Walls and fog prepared on a library map | Proposed |
| [0038](adr/0038-attack-styles-nuke-and-animations.md) | Attack styles, the GM nuke, reduced animations, library animations | Proposed |
| [0038](adr/0038-wall-confidence.md) | Confidence on detected walls | Proposed |
| [0039](adr/0039-multi-target-attacks.md) | Multi-target attacks | — |
| [0040](adr/0040-area-color-and-square-centre.md) | Area colours, hatched GM-only areas, squares placed by centre | Proposed |
| [0041](adr/0041-uvtt-scenes-and-portals.md) | UVTT scenes, portal metadata and atomic geometry | Proposed |
| [0042](adr/0042-map-token-adjustment.md) | Atomic token adjustment when applying a map | Proposed |
| [0043](adr/0043-library-uvtt-import-and-atomic-placement.md) | Library UVTT import and atomic map placement | Proposed |
| [0044](adr/0044-line-of-sight.md) | Line of sight | Proposed |
| [0045](adr/0045-classical-lsd-grid-estimates.md) | Versioned private classical LSD grid estimates | Proposed |
| [0045](adr/0045-persistent-room-scenes.md) | Persistent room scenes | Proposed; implementation authorized |
| [0046](adr/0046-area-effects-and-group-rolls.md) | Area effects and group rolls | Proposed |
| [0046](adr/0046-terrain-tactical-movement.md) | Terrain and tactical movement | Proposed; Raymond review required |
| [0047](adr/0047-longer-animations-for-the-nuke-siren.md) | Longer animations for the nuke's siren | Proposed |
| [0048](adr/0048-map-isometric-flag.md) | 2.5D map style flag | Proposed |
| [0049](adr/0049-auto-remove-defeated-tokens.md) | Auto-remove defeated tokens | Proposed |
| [0050](adr/0050-account-deletion.md) | Account deletion | Proposed |
| [0050](adr/0050-encounter-keep-map-setup.md) | Keep the map's setup when applying an encounter template | Proposed |
| [0050](adr/0050-terrain-effect-client-id.md) | Optional client effect id on `terrain.effect.create` | Proposed |
| [0051](adr/0051-seat-limits-and-room-lock.md) | Seat limits and locking a room | Proposed |
| [0052](adr/0052-mcp-player-seats.md) | AI player seats over MCP | Proposed |
| [0053](adr/0053-build-pass-and-approved-templates.md) | Build passes, templates from an approved draft, and AI-set grids and walls by the owner's choice | Proposed |
| [0054](adr/0054-localized-messages.md) | Localized messages: ids on rejections, `Accept-Language` on REST | Proposed |
| [0055](adr/0055-path-movement.md) | Path movement: cheapest-path drags, room Diagonals and Difficult terrain rules | Proposed |
| [0056](adr/0056-visible-walls-for-players.md) | Players receive the walls they can see | Proposed |
| [0057](adr/0057-table-rules.md) | Table rules: three-way 0 HP removal, hidden map, hidden HP and AC | Proposed |
| [0058](adr/0058-edit-placed-area-templates.md) | Editing placed area templates | Proposed |
| [0059](adr/0059-areas-clipped-at-fog.md) | Areas visible in part, clipped at fog and sight | Proposed |
| [0060](adr/0060-player-end-turn-and-ruling-dismissal.md) | Players end their own turn, the GM steps back, rulings can be ignored | Proposed |
| [0061](adr/0061-dice-pool-formulas.md) | Dice formulas with several die types; old attack dice upgraded on load | Proposed |
| [0062](adr/0062-resolve-attack-damage.md) | Resolving attack damage with a chosen amount and conditions | Proposed |
| [0063](adr/0063-token-wall-clearance.md) | Token wall clearance | Proposed |
| [0064](adr/0064-shared-drawings.md) | Shared drawings: persisted per scene, public, erasable by the drawer or GM, not undoable | Proposed |
| [0065](adr/0065-initiative-order-edits.md) | Editing the turn order mid-encounter | Proposed |
| [0066](adr/0066-gm-room-defaults.md) | A GM's defaults for new rooms: saved per account, carried on `RoomCreated` | Proposed |
| [0067](adr/0067-attack-range-and-shapes.md) | Attack range, the range kind on rolls, and the arrow and pierce shapes | Proposed |
| [0068](adr/0068-carry-party-tokens.md) | Carry tokens across template applies and scene switches | Proposed |
| [0069](adr/0069-sign-up-email-disclosure.md) | Sign-up discloses a taken email, bounded by a per-address limit | Accepted |
| [0069](adr/0069-terrain-visible-in-part.md) | Terrain sent for squares a player can partly see | Proposed |
| [0070](adr/0070-save-map-to-library.md) | Save a room's map to the library, and link it | Proposed |
| [0071](adr/0071-ai-build-terrain.md) | The AI game builder proposes permanent terrain | Proposed |
| [0072](adr/0072-guest-gm-hosting.md) | Guest GM hosting: a signed-out GM starts a room on built-in art, expiring after 30 days idle, movable into an account | Proposed |
| [0073](adr/0073-interactive-scene-studio.md) | Versioned Studio proposals and protected draft artwork | Accepted |

Numbers 0033, 0036, 0038, 0045, 0046 and 0069 were each used twice, and 0050 three times, by parallel branches; ADR 0017 (accounts) is
referenced in code but lives in `openspec/changes/user-accounts/design.md`, not `docs/adr/`.
