## Context

See proposal.md for why. `adminAccountIdsFromEnv` (`apps/server/src/http/adminStats.ts`) reads `ADMIN_ACCOUNT_IDS`. ADR 0080 chose ids over emails because nobody can register someone else's id. `seedDevAccount` (`apps/server/src/identity/devAccount.ts`) already shows the pattern: `store.createUser` with a fresh id and a verified timestamp, with `EmailTakenError` treated as "already there". `deploy/terraform-gcp/main.tf` renders `startup.sh.tftpl` with generated `random_password` values, and the template writes `.env.production`. The instance ignores later startup-script changes.

## Goals / Non-Goals

**Goals:**
- Zero manual steps between `terraform apply` and signing in as admin.
- Keep ADR 0080's rule: admin by id, never by email.

**Non-Goals:**
- An admin role in the database, an admin UI for granting admins, or more than one seeded admin.
- The AWS stack (`deploy/terraform`).
- Rotating the seeded password from Terraform. The admin changes it in the account page.

## Decisions

**D1. Terraform owns the id.** A `random_uuid.admin` gives the id up front, so `ADMIN_ACCOUNT_IDS` is known before the account exists, and the server creates the account with that exact id. Alternative considered: seed by email, then look up the id and grant it. Rejected because it makes the email the source of admin power, which ADR 0080 rules out, and a squatter who registered the email first would become admin.

**D2. Seed function.** `seedAdminAccount(store, env)` sits in `identity/adminAccount.ts` and is called from `src/index.ts` right after `seedDevAccount`.
- Return early unless `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and `adminAccountIdsFromEnv(env.ADMIN_ACCOUNT_IDS)` has exactly one id.
- Return if `findUserById(id)` finds an account.
- Otherwise `createUser({ id, email, displayName: "Admin", passwordHash: await hashPassword(password), emailVerifiedAt: now })`.
- On `EmailTakenError`, `console.warn("[vtt] ADMIN_EMAIL already belongs to another account; no admin account created")` and return.
- Other errors propagate, so a broken database still stops start-up as it does today.
- It runs in every environment, unlike the dev seed, because the settings are operator-supplied secrets, not a public password.

**D3. Password strength.** `random_password.admin` uses length 24 with `special = false`, matching the other generated secrets. That avoids shell and `.env` quoting problems and passes the sign-up rules (8 to 128 characters, not a common password, not the email). The server doesn't re-check it, because the operator's input is trusted configuration.

**D4. Terraform surface.**
- `variable "admin_email"`: string, no default, so `apply` asks for it if `terraform.tfvars` lacks it.
- Template variables `admin_id`, `admin_email`, `admin_pass` become three lines in the `ENVEOF` block.
- `output "admin_password"`: sensitive.
- `output "admin_email"`.
- `terraform.tfvars.example` gains a commented `admin_email` line with a placeholder address.
- `docker-compose.prod.yml` adds `ADMIN_EMAIL: ${ADMIN_EMAIL:-}` and `ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}` next to `ADMIN_ACCOUNT_IDS`, so other hosts can leave them unset.

**D5. Tests first.** `apps/server/test/adminAccount.test.ts` uses the memory store:
- creates the account (id, email, verified, password works)
- a second run changes nothing, including after a password change
- missing settings create nothing
- two ids create nothing
- a taken email creates nothing and leaves the other account intact

The `/admin/stats` integration test gains one case: the seeded account opens it, and the squatter account in the taken-email case gets 404.

## Risks / Trade-offs

- [The admin password sits in instance metadata, Terraform state and `.env.production`] → This is the same exposure as the database and SMTP secrets today (DEPLOYMENT.md). The admin should change the password after first sign-in, since a changed password is never overwritten.
- [The taken-email case leaves the deploy without an admin] → The warning in the server log says why. The operator picks another `admin_email` and redeploys, or fixes it by SSH.

## Migration Plan

New VMs get it automatically. The running VM needs `terraform apply -replace="google_compute_instance.vtt"`, which is safe while it holds no data. A VM with data can instead have the three lines added to `.env.production` and the server restarted. Rolling back the code leaves an ordinary account behind, which is harmless.
