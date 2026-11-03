## Why

The only supported way to run the app is `npm run dev` or the dev `docker-compose.yml`. Both run the Vite dev server and `tsx watch` and ship a known dev login, so neither can be put on AWS or Google Cloud. A deploy path is needed for the class demo and any longer-lived hosting. `docs/DEPLOYMENT.md` describes the options but nothing it relies on exists yet.

## What Changes

- Add a production image for the server that runs the compiled/started server directly (no `tsx watch`, no dev tooling) and applies Prisma migrations as a separate step.
- Add a production web image: a Vite build served as static files by a small reverse proxy that routes `/api`, `/socket.io` (WebSocket) and `/uploads` to the server and serves `/health`-style checks.
- Add `docker-compose.prod.yml` that runs the production images with Postgres, Redis, S3-compatible storage, vision and the wall worker, with secrets and origins taken from environment variables, no `SEED_DEV_ACCOUNT`, and no default `vtt/vtt` credentials.
- Add `.env.production.example` listing every required variable.
- Extend `docs/DEPLOYMENT.md` with exact steps for one VM (EC2 or Compute Engine) and a managed-services outline for AWS and GCP.
- Add a CI job that builds the production images.
- Add a Terraform configuration in `deploy/terraform/` that creates one EC2 VM, security group and Elastic IP, and starts the production stack on it from a startup script.
- No change to app behavior, shared schemas, events or the dev workflow.

## Capabilities

### New Capabilities
- `production-deployment`: what a production run of the app must look like: images that contain no dev tooling or dev accounts, required configuration that fails fast when missing, a single public origin that serves the web app and proxies API, WebSocket and uploads, and a documented path to AWS and GCP.

### Modified Capabilities
<!-- None: `upload-storage` already requires S3 in production; this change only supplies the deployment that satisfies it. -->

## Impact

- New files: `Dockerfile.server`, `Dockerfile.web`, `deploy/nginx.conf` (or Caddyfile), `docker-compose.prod.yml`, `.env.production.example`.
- Edited: `docs/DEPLOYMENT.md`, `.github/workflows/ci.yml` (image build job), possibly `.dockerignore`.
- Existing dev `Dockerfile` and `docker-compose.yml` stay unchanged.
- Runtime dependencies: a reverse proxy image (nginx or Caddy). No new npm dependencies.
- Operators need an AWS or GCP account; cost and account setup are outside the repo.
