## 1. Contract

- [x] 1.1 Add `ForgotPasswordRequest` and `ResetPasswordRequest` to `packages/shared` with tests in `packages/shared/test/auth.test.ts` (valid input, bad email, short password, missing token); verify the shared tests pass
- [x] 1.2 Write `docs/adr/0081-signup-recovery.md` (endpoints, shared per-email limit, production no longer answers 409); verify the file exists and is linked from the change

## 2. Storage

- [x] 2.1 Add the `PasswordResetToken` Prisma model and migration (`password_reset_tokens`, indexes on `user_id` and `expires_at`); verify `prisma generate` succeeds and the migration applies on the dev database
- [x] 2.2 Write failing store tests in `apps/server/test/identityStore.test.ts` for create, consume, expiry, reuse, supersede by version, verification on consume, and deletion removing reset tokens, for both stores; then implement `createPasswordResetToken` and `consumePasswordResetToken` in the memory and Postgres stores until they pass
- [x] 2.3 Remove `replaceUnverifiedCredentials` from `IdentityStore`, both stores and their tests; verify typecheck shows no remaining references

## 3. Server routes

- [x] 3.1 Write failing integration tests for the repeat sign-up branch: unverified takeover attempt, verified repeat sign-up notice, shared per-email limit with `/verify/resend`, identical response bodies, development 409 unchanged; rewrite the existing tests in `apps/server/test/emailVerification.test.ts` that assert replacement
- [x] 3.2 Change the `EmailTakenError` branch of `POST /api/auth/signup` per design D1 until 3.1 passes
- [x] 3.3 Add the recovery emails (`identity/recoveryEmails.ts`, shared `siteLink`) with English and Traditional Chinese catalog ids in `apps/server/src/i18n`; verify a unit test checks the links, the escaping and the zh-TW subject
- [x] 3.4 Write failing tests in `apps/server/test/passwordReset.test.ts` for request (existing, unknown, both limits), reset (happy path, squatter reclaim, sessions ended, build passes and Studio grants ended, weak password keeps the token, bad tokens give one 400, page load does not consume); then add the limits and the two endpoints per design D4 until they pass

## 4. Web

- [x] 4.1 Add API client methods and account store actions for forgot and reset; verify typecheck
- [x] 4.2 Add the `/forgot-password` and `/reset-password` pages, router entries, and a "Forgot password?" link on sign-in, with all text in the en and zh-TW catalogs; verify lint passes (no literal UI text)
- [ ] 4.3 Verify in the running app with Playwright: request a reset in development (mail logged), open the link, set a password, land signed in on the dashboard; a used link shows "link no longer works"

## 5. Finish

- [ ] 5.1 Mark the `email-verification` change's "Address already registered" scenario as superseded by this change; verify `openspec validate signup-recovery-hardening` passes
- [ ] 5.2 Run `npm run lint && npm run typecheck && npm test` once and fix every failure
