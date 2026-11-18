# Setup

Requires **Node 22** (`.nvmrc`). The repository is an npm workspace: `packages/*` and
`apps/*` install together from the root. Docker is optional.

```bash
npm install
```

## Pick a mode

| Mode | Command | Persistence | Detection | Use it for |
| --- | --- | --- | --- | --- |
| In-memory | `npm run dev` | None. Every server restart (including each `tsx watch` reload) clears all rooms and accounts. | Off | UI work, most features |
| Containers for data, app on host | `docker compose up -d postgres redis s3 vision vision-walls` then `npm run dev:db` | Postgres, Redis, SeaweedFS | On | Anything touching persistence, reconnection, uploads, detection |
| Whole stack in Docker | `docker compose up -d --build` | Yes | On | Checking the containers themselves (no hot reload) |

Both dev modes serve the web app on <http://localhost:5173> (Vite, which proxies `/api`,
`/socket.io` and `/uploads`) and the API on `:3001`. `npm run dev:db` runs pending Prisma
migrations before starting, so pulls that add migrations need no extra step.

The startup log tells you which store you got:

```
[vtt] using Postgres event store                    # persistent
[vtt] DATABASE_URL unset — using in-memory store    # lost on restart
```

The compose stack seeds a dev account, `t@gmail.com` / `password` (`SEED_DEV_ACCOUNT=1`).
Never set that variable in production.

### The AI seat server

`apps/mcp` is not part of `npm run dev`. Start it separately when you work on AI seats or
the game builder:

```bash
npm run dev:mcp      # :3002, talks to the room server on :3001
```

## Joining as a player locally

Guest identity is stored per origin in `localStorage`. To be a GM and a player on one
machine, open the invite link in a private window, or swap `localhost` for `127.0.0.1`.

## Environment variables

Every service is optional in development; the server falls back when a variable is unset.

| Variable | Used by | Unset in development means |
| --- | --- | --- |
| `DATABASE_URL` | server | In-memory room, identity and library stores |
| `REDIS_URL` | server | Seq from Postgres alone; grid and wall detection report unavailable |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | server | SeaweedFS at `127.0.0.1:8333` if it answers, else local disk (`UPLOAD_DIR`) |
| `S3_AUTODETECT=0` | server | Skip the SeaweedFS probe (faster start without Docker) |
| `VISION_URL` | server | Grid detection unavailable |
| `CLIENT_ORIGIN` | server | Allowed browser origin; required in production |
| `COOKIE_SECURE`, `TRUST_PROXY` | server | Production cookie and proxy settings |
| `HTTP_LOG` | server | Request logging off |
| `SEED_DEV_ACCOUNT=1` | server | Seed the dev account (development only) |
| `PORT`, `HOST` | server, mcp | Default ports |
| `ROOM_SERVER_URL` | mcp | Room server address for AI seats |
| `STUDIO_M0`, `STUDIO_M0_*` | mcp | The Studio M0 proof endpoint stays off |

Production refuses to start without real S3 credentials, `CLIENT_ORIGIN` and a Postgres
password. See `deploy/env.production.example`.

## Database

The Prisma schema is `apps/server/prisma/schema.prisma`, with migrations in
`apps/server/prisma/migrations/`. To create a migration after changing the schema:

```bash
export DATABASE_URL=postgres://vtt:vtt@127.0.0.1:5432/vtt
npx prisma migrate dev --schema apps/server/prisma/schema.prisma --name <what_changed>
```

To apply existing migrations: `npm run prisma:migrate --workspace=@vtt/server`.
`docker compose down -v` deletes every volume, which resets a broken local database.

## Common problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| "Internal error" creating a room | Pending migrations | `npm run prisma:migrate --workspace=@vtt/server` with `DATABASE_URL` exported |
| `P1012` from Prisma | `DATABASE_URL` not exported | `export` it before running the migrate script |
| `EADDRINUSE` on :3001 or :5173 | An earlier dev server is still running | `kill $(lsof -ti tcp:3001) $(lsof -ti tcp:5173)` |
| An account vanished, or the password is "wrong" | It was made in in-memory mode and the server restarted | Use `npm run dev:db` for anything you want to keep |
| First start takes about 20 seconds | The server probes for SeaweedFS | Set `S3_AUTODETECT=0`, or start the `s3` container |
| `docker compose` not found | The Compose plugin isn't where the CLI looks | `mkdir -p ~/.docker/cli-plugins && ln -sfn "$(which docker-compose)" ~/.docker/cli-plugins/docker-compose` |
