## Context

Today `Dockerfile` copies the whole repo and runs `npm run dev`; `docker-compose.yml` runs Vite and `tsx watch`-style commands with `SEED_DEV_ACCOUNT=1` and `vtt/vtt` credentials. The server (`apps/server/src/index.ts`) listens on 0.0.0.0:3001, falls back to in-memory storage without `DATABASE_URL`, and refuses to start in production without S3 settings. `npm start` runs `tsx src/index.ts` (no compile step). The server does not serve web files; Vite proxies `/api`, `/socket.io`, `/uploads` in dev. See `proposal.md` for motivation and `docs/DEPLOYMENT.md` for the options.

## Goals / Non-Goals

**Goals:**
- A reproducible production stack that runs on one VM with `docker compose`.
- Same images usable on managed services (ECS Fargate, Cloud Run).
- No change to application code or shared contracts.

**Non-Goals:**
- Terraform/CDK or other infra-as-code.
- Multi-region, autoscaling, or zero-downtime rollout automation.
- Compiling the server to JS (stays on `tsx`, see decisions).

## Decisions

1. **Server image runs `tsx src/index.ts` without watch.** The repo has no server build step; adding one is a larger change. Cost: slower cold start and `tsx` in the image. Alternative (add `tsc` build) rejected as out of scope.
2. **Multi-stage build, `npm ci --omit=dev` for runtime stage where possible.** Prisma client is generated in the build stage (`postinstall`). If `tsx` must stay a runtime dependency, the stage keeps it.
3. **Web image = Vite build + Caddy (or nginx).** Caddy gives automatic HTTPS on a VM with one config line, which suits the demo path. nginx is the fallback when TLS is terminated by a cloud load balancer. Decision: Caddy, with the proxy rules in `deploy/Caddyfile`. WebSocket upgrades work by default.
4. **Migrations as a one-shot compose service** (`migrate`, runs `prisma migrate deploy`, `restart: "no"`), with `server` depending on `service_completed_successfully`. This replaces the dev compose's migrate-on-every-start.
5. **Compose `${VAR:?message}` for secrets** so a missing password fails at `docker compose config` time, not at runtime.
6. **Object storage:** self-hosted SeaweedFS on the VM path (matches dev), S3 or Cloud Storage (HMAC keys) on the managed path. Both use the existing `S3_*` variables, so no code change.
7. **Cloud Run caveat:** the wall worker polls Redis and must not scale to zero. Documented, not enforced.

## Risks / Trade-offs

- `tsx` at runtime adds start-up time and image size → acceptable for a class project; revisit with a real build.
- Single VM is a single point of failure → documented; managed path is the upgrade.
- Cloud Run WebSocket behavior (timeouts of up to 60 minutes per connection, reconnect required) is unverified for this app → client already reconnects; verify during apply on a real deploy.
- Vision image is large (OpenCV, ONNX model) → first build is slow; pushed to a registry for managed deploys.

## Migration Plan

Additive. Existing dev workflow is untouched. Rollback: remove the new files; nothing else depends on them.

## Open Questions

- Caddy or nginx? Defaulting to Caddy; confirm if the team prefers nginx.
- Which cloud will the demo actually run on? Not needed to build the VM path, needed before writing cloud-specific steps beyond the outline.
