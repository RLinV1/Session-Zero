## 1. Shared contract

- [ ] 1.1 Add `VerifyEmailRequest`, `ResendVerificationRequest`, `SignUpResponse` and the `email_unverified` sign-in code to `packages/shared/src/auth.ts`; verify with unit tests in `packages/shared/test/auth.test.ts` (shape, trimming and lowercasing of the email, token length bounds)
- [ ] 1.2 Write a short ADR in `docs/adr/` recording the production sign-up response change; verify the file exists and is linked from the ADR index if one exists

## 2. Storage

- [ ] 2.1 Add Prisma migration: `users.email_verified_at` (backfilled with `now()` for existing rows) and table `email_verification_tokens`; verify `npx prisma migrate dev` applies cleanly on a database that already has users and they read as verified
- [ ] 2.2 Extend `IdentityStore` with token create (replacing earlier tokens of the user), consume (single-use, expiry-checked, returns the user), `markEmailVerified`, sweep of expired tokens, and `createUser` accepting `emailVerifiedAt`; implement in the memory and Postgres stores and verify with a store contract test run against both
- [ ] 2.3 Make `deleteUser` remove the user's tokens and add the expired-token sweep to the existing session sweep; verify an account deletion test with a pending token passes

## 3. Mailer

- [ ] 3.1 Add `nodemailer` and `@types/nodemailer` to `apps/server`; add `Mailer` interface, SMTP implementation and an env reader that returns the config or throws naming the missing variables; verify unit tests for missing, partial and full environments
- [ ] 3.2 Add the verification email catalog ids (subject, body, link text) to `apps/server/src/i18n` in English and zh-TW using `docs/GLOSSARY-zh-TW.md` terms; verify the catalog parity test passes
- [ ] 3.3 Add `verificationRequired(env)` and wire startup: in production without mail config the server refuses to start; verify with a test that `buildApp` in production mode without a mailer throws and in non-production does not

## 4. Routes

- [ ] 4.1 Change `POST /api/auth/signup`: non-production creates a verified user and starts a session as before; production creates an unverified user, sends the link, starts no session, returns `SignUpResponse`; mail failure is caught, logged without the token, and answered as sent; verify with integration tests in `apps/server/test/accounts.test.ts` for both modes and for a failing mailer (FR-GM-01)
- [ ] 4.2 Add `POST /api/auth/verify`: consume token, mark verified, start session; one answer for unknown, expired and reused tokens; verify tests for success, expiry (fake clock), reuse, superseded token, and that a GET to the page route never consumes it
- [ ] 4.3 Add `POST /api/auth/verify/resend` with always-204 behaviour, mail only for an unverified account, and the two new limiters in `accountLimits`; verify tests for unknown address, verified address, per-address and per-client limits with `Retry-After`
- [ ] 4.4 Make `POST /api/auth/signin` return 403 `email_unverified` for an unverified account after a correct password in production, and keep the ordinary failure for a wrong password; verify tests including timing path parity (the dummy hash still runs for unknown addresses)
- [ ] 4.5 Mark the seeded dev account verified in `seedDevAccount`; verify `devAccount.test.ts` still passes and the account signs in on a non-production server

## 5. Web

- [ ] 5.1 Update `accountStore.signUp` for `SignUpResponse`, add `verifyEmail` and `resendVerification` calls in `net/api.ts`; verify with `accountStore` unit tests
- [ ] 5.2 Show the "check your email" panel after production sign-up, with resend, and map `email_unverified` on the sign-in form to a message plus resend; verify with component tests in `apps/web/test/accountPage.test.tsx`
- [ ] 5.3 Add the `/verify-email` route and page: submit the token once on mount, sign in and continue to `safeNext`, or show the expired-link state with resend; verify with component tests for good token, bad token and double mount
- [ ] 5.4 Add all strings to the English and zh-TW catalogs with no literal text in components; verify `npm run lint` passes (it enforces `t()`)

## 6. Docs and verification

- [ ] 6.1 Document `SMTP_*`, `MAIL_FROM`, `CLIENT_ORIGIN` and the deploy order in `docs/DEPLOYMENT.md`, and note the verification mode in the README account section; verify the variable names match the code
- [ ] 6.2 Run `npm run lint && npm run typecheck && npm test` once and verify all pass
- [ ] 6.3 Drive the real app with Playwright in non-production mode: sign up, land signed in with no email step; then in a production-mode run with the mailer pointed at a local capture, sign up, read the captured link, open it, confirm sign-in; verify screenshots and the result are reported
- [ ] 6.4 After deploy (by the operator), sign up with a real address on `https://sessionzero.codes` and confirm the email arrives from `noreply@sessionzero.codes` and the link signs in
