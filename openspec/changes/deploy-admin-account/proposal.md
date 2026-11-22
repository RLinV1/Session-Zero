## Why

`/admin/stats` (ADR 0080) opens only for the account ids in `ADMIN_ACCOUNT_IDS`. The Terraform templates don't write that variable, and the account has to exist before its id is known, so a fresh deploy has no admin until someone signs up, finds their id in the database, edits `.env.production` over SSH and restarts the server. The operator wants the deploy to come up with a working admin account.

## What Changes

- The GCP Terraform stack generates an admin account id and a strong password, and writes `ADMIN_ACCOUNT_IDS`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` into `.env.production`. The email comes from a new required `admin_email` variable, so no address is committed to the repo. The password is readable with `terraform output -raw admin_password`.
- On every start, the server creates that account (that exact id, already verified, display name "Admin") when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and `ADMIN_ACCOUNT_IDS` holds exactly one id that no account has yet. It never changes an existing account, so a later password change sticks.
- If another account already holds that email, the server creates nothing and logs a warning. Admin access stays tied to the id, so that other account never becomes admin.
- `docker-compose.prod.yml` passes `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the server.

## Capabilities

### New Capabilities
- `admin-account-seed`: how a deploy provides the admin account that `/admin/stats` trusts, and what the server does at start when the admin settings are present.

### Modified Capabilities

## Impact

- `apps/server`: a seed function next to `identity/devAccount.ts`, called from `src/index.ts`, with tests in `apps/server/test`.
- `deploy/terraform-gcp`: `random_uuid` and `random_password` resources, an `admin_email` variable, the three `.env.production` lines, and a sensitive `admin_password` output.
- `docker-compose.prod.yml`, `deploy/env.production.example`, `docs/DEPLOYMENT.md`.
- Existing VMs ignore startup-script changes, so they need `terraform apply -replace="google_compute_instance.vtt"` or a manual `.env.production` edit. `deploy/terraform` (AWS) is left as is, since that account is being shut down.
