## 1. Server seed

- [x] 1.1 Write failing tests in `apps/server/test/adminAccount.test.ts` for create, rerun unchanged, rerun after a password change, missing settings, two ids, and a taken email; verify they fail for the missing function
- [x] 1.2 Implement `seedAdminAccount` in `apps/server/src/identity/adminAccount.ts` per design D2 and call it from `src/index.ts`; verify the tests from 1.1 pass
- [x] 1.3 Add an admin-stats integration case: the seeded account gets 200 from `/api/admin/stats` and the taken-email squatter gets 404; verify it passes

## 2. Deploy

- [x] 2.1 Add `admin_email`, `random_uuid.admin`, `random_password.admin`, the three `.env.production` lines and the `admin_password`/`admin_email` outputs to `deploy/terraform-gcp`, plus the example tfvars line; verify `terraform validate` passes
- [x] 2.2 Pass `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the server in `docker-compose.prod.yml` and document both in `deploy/env.production.example` and `docs/DEPLOYMENT.md`; verify `docker compose -f docker-compose.prod.yml config` renders with them unset

## 3. Finish

- [x] 3.1 Run `npm run lint && npm run typecheck && npm test` once and fix every failure
- [ ] 3.2 After merge, redeploy with `terraform apply -replace="google_compute_instance.vtt"`, then sign in with `admin_email` and `terraform output -raw admin_password` and open `/admin/stats`
