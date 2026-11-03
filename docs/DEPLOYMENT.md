# Deployment

How to run the VTT outside a laptop, on AWS or Google Cloud. This is based on the code and
`docker-compose.yml` as of this branch (see also `docs/DESIGN.md` §2).

## 1. What the app is made of

| Part | What it is | Needed for |
|---|---|---|
| `apps/server` | Express + Socket.IO on port 3001 (`/health`, `/api`, `/socket.io`, `/uploads`) | Everything |
| `apps/web` | React + PixiJS, built by Vite into static files | Everything |
| Postgres 17 | Event store (`PostgresRoomStore`, Prisma migrations) | Persistent rooms and accounts |
| Redis 7 | Event sequence numbers, BullMQ wall-detection jobs | More than one server instance, wall detection |
| S3-compatible storage | Uploaded maps and token art (`S3AssetStore`) | Uploads in production |
| `services/vision` | Python/OpenCV grid detection (HTTP :8000) and wall worker (BullMQ) | FR-GM-11 grid and wall detection |

The server serves no web files. The web app needs its own static host that also proxies
`/api`, `/socket.io` and `/uploads` to the server (this is what `vite.config.ts` does in dev).

## 2. Options

### Option A: keep using `npm run dev` (no containers, no Postgres)

Fine for local work, demos on one laptop, and CI. Not fit for a real deployment. Limitations:

1. **State is lost on every restart.** With no `DATABASE_URL` the server uses `MemoryRoomStore`
   (`apps/server/src/index.ts`). Rooms, events, accounts and checkpoints disappear when the process
   exits, crashes, or `tsx watch` reloads after a file edit. Nothing can be recovered, which also
   defeats event history, undo and encounter replay (ADR 0013, 0019, 0025).
2. **One process only.** With no Redis, sequencing is in-process. Postgres without Redis is
   "single instance only" (the server logs this). Two server instances would hand out clashing
   sequence numbers, so you cannot scale out or do zero-downtime deploys.
3. **No wall or grid detection.** `VISION_URL` defaults to `127.0.0.1:8000`, where nothing runs.
   Wall detection also needs Redis for its BullMQ queue. Both features fail without the Python service.
4. **Uploads go to local disk** (`UPLOAD_DIR`), served by `express.static`. They are lost when the
   host or its disk is replaced, are not shared between instances, and have no CDN. The server
   refuses to start in production without `S3_ENDPOINT` for exactly this reason.
5. **Dev server is not a production server.** `vite` dev serves unbundled modules with HMR, and
   `tsx watch` recompiles on the fly. It is slower, uses more memory, and exposes dev tooling.
   It exits when a dependency is missing instead of being restarted by an orchestrator.
6. **No process supervision, TLS, or health-based restarts.** A crash means downtime until someone
   restarts it. WebSockets need HTTPS and `TRUST_PROXY`/`COOKIE_SECURE` behind a load balancer;
   `npm run dev` has neither.
7. **Dev-only behaviour.** `SEED_DEV_ACCOUNT=1` (a known login) must never be set in production.
   Cookies are not `Secure` over plain HTTP, so sessions are weaker.
8. **Not reproducible.** It depends on whatever Node version and `node_modules` are on the machine
   (`engines.node >= 22`). Docker pins this.

### Option B: Docker Compose on one VM (simplest real deployment)

`docker compose up -d --build` starts Postgres, Redis, SeaweedFS (S3), vision, vision-walls,
server and web. Good for a class demo on one EC2 or Compute Engine VM. Limitations:

1. The current `Dockerfile` runs `npm run dev` (Vite dev server) and bakes in the repo. Fine for
   a demo, not for production: build the web app with `npm run build --workspace=@vtt/web`
   and serve it from nginx/Caddy.
2. `docker-compose.yml` sets `SEED_DEV_ACCOUNT=1` and uses `vtt/vtt` database credentials.
   Change both before exposing the VM to the internet.
3. Everything lives on one machine. The VM is a single point of failure; data is on Docker volumes
   (`pgdata`, `redisdata`, `s3data`), so back them up.
4. No managed backups, patching or failover.

### Option C: managed services (recommended for anything lasting)

Run only the stateless containers yourself; use the cloud for state.

| Concern | AWS | Google Cloud |
|---|---|---|
| Server + vision containers | ECS Fargate (or App Runner) | Cloud Run (needs WebSocket support and session affinity off or fine because Redis sequences) |
| Postgres | RDS for PostgreSQL 17 | Cloud SQL for PostgreSQL |
| Redis | ElastiCache | Memorystore |
| Uploads | S3 (set `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) | Cloud Storage with HMAC keys (S3 interoperability endpoint `https://storage.googleapis.com`) |
| Web (static) | S3 + CloudFront, with `/api`, `/socket.io`, `/uploads` routed to the server | Cloud Storage + Cloud CDN, or serve from the same Cloud Run service behind a load balancer |
| TLS + domain | ALB + ACM | HTTPS load balancer + managed cert |

Limitation to plan for: the vision worker (`wall_worker.py`) runs a loop that polls Redis, so it needs an
always-on container (Fargate service, or Cloud Run with min instances 1 and CPU always allocated), not scale-to-zero.

## 3. Server environment variables

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | `postgres://user:pass@host:5432/vtt` |
| `REDIS_URL` | `redis://host:6379` (required for more than one server instance) |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Required; startup fails without them |
| `VISION_URL` | URL of the vision service, for example `http://vision:8000` |
| `CLIENT_ORIGIN` | The public web origin, for example `https://vtt.example.com` (CORS and write-origin check, ADR 0016) |
| `COOKIE_SECURE` | `1` (HTTPS) |
| `TRUST_PROXY` | Set when behind a load balancer so client IPs and HTTPS are read from headers |
| `SEED_DEV_ACCOUNT` | Never set |

Deploy step order: provision Postgres, Redis, bucket, then run `npm run prisma:migrate --workspace=@vtt/server`
(`prisma migrate deploy`) once per release, then roll out the server.

## 4. Suggested path for this project

1. Today: keep `npm run dev` for development.
2. Demo/grading: Option B on one VM. Add a production web build and Caddy for HTTPS. Remove `SEED_DEV_ACCOUNT`.
3. Anything longer-lived: Option C. Needs a production `Dockerfile` for the server (no `tsx watch`, no Vite dev server).

The production Dockerfile, a static web build step, and infra scripts do not exist yet. Propose them with OpenSpec
(`/opsx:propose`) before implementing.
