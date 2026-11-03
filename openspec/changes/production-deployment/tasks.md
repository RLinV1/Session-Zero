## 1. Images

- [x] 1.1 Add `.dockerignore` (node_modules, graphify-out, .git, uploads, openspec) and verify `docker build` context is small
- [x] 1.2 Add `Dockerfile.server`: multi-stage, Prisma generate, runs `tsx src/index.ts` with no watch; verify `docker build -f Dockerfile.server .` succeeds and the container answers `/health` with the compose dependencies up
- [ ] 1.3 Add `Dockerfile.web` + `deploy/Caddyfile`: Vite build served statically, proxy `/api`, `/socket.io`, `/uploads` to `server:3001`, SPA fallback; verify a room route reloads and a WebSocket connects through port 80

## 2. Production compose

- [x] 2.1 Add `docker-compose.prod.yml` with postgres, redis, s3, vision, vision-walls, a one-shot `migrate` service, server and web; no `SEED_DEV_ACCOUNT`; secrets via `${VAR:?}`; verify `docker compose -f docker-compose.prod.yml config` fails with a named variable when unset
- [x] 2.2 Add `deploy/env.production.example` (the `.env.*` path is write-blocked in this environment) with every required variable commented; verify each name matches what the server reads (`grep process.env` / `env.` in `apps/server/src`)
- [ ] 2.3 Verify end to end: `up -d --build`, sign-up works, dev login `t@gmail.com` is rejected, a GM creates a room and uploads a map, and the upload survives `docker compose restart server`

## 3. CI

- [ ] 3.1 Add an image-build job to `.github/workflows/ci.yml` (build only, no push); verify it passes on this branch and fails when `Dockerfile.web` is deliberately broken

## 4. Docs

- [ ] 4.1 Extend `docs/DEPLOYMENT.md` with the one-VM steps for AWS EC2 and GCP Compute Engine (instance size, ports 80/443, Docker install, DNS, `docker compose` commands); verify by following them on a fresh VM
- [x] 4.2 Add the managed-services section for ECS Fargate/RDS/ElastiCache/S3 and Cloud Run/Cloud SQL/Memorystore/Cloud Storage including env var mapping and the worker no-scale-to-zero note; verify every variable in the table appears in `.env.production.example`
- [ ] 4.3 Run `npm run lint && npm run typecheck && npm test` and confirm nothing regressed
