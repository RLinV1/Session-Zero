## Why

A sign-up with an email that is registered but not yet verified replaces that account's password and mails the owner a fresh link (`apps/server/src/identity/routes.ts:132-141`). When the owner clicks it, the account is verified with the second person's password, so anyone who signs up with a classmate's address before the classmate clicks their link takes the account. There is no password reset, so the owner cannot get it back. The replacement was added on purpose (the `email-verification` change) so an owner could reclaim an address a squatter registered first. The fix has to close the takeover without losing that rescue, and it should land before the public deploy.

## What Changes

- In production, a sign-up for an email that already has an account never changes that account. It answers exactly like a new sign-up ("check your email") so the response does not reveal whether the email is registered.
- The address's owner is emailed instead. Unverified account: the verification link again, which already says to ignore it if they did not sign up. Verified account: a notice that someone tried to sign up with their email, with links to sign in and to reset the password.
- New "Forgot password": a person asks for a reset link by email, and the link opens a page where they choose a new password. Using it also marks the email verified, because it proves the person controls the inbox. This is how an owner reclaims a squatted address, and how anyone who forgot their password gets back in.
- Duplicate sign-up emails and reset emails are rate limited per email address and per client address, and over the limit nothing is sent.
- **BREAKING** (production only): sign-up no longer answers 409 for a registered email. Development (no mail configured) keeps the 409.
- Removes the credential replacement path (`replaceUnverifiedCredentials`).

## Capabilities

### New Capabilities
- `account-recovery`: what a repeat sign-up does to an existing account and which email it sends, and password reset by email link (request, link lifetime, reset page, effects on sessions and verification, limits).

### Modified Capabilities
- `sign-up-limits`: the "taken email is reported" requirement is replaced. In production a registered email is no longer disclosed by sign-up; development keeps the 409.

## Impact

- `packages/shared`: new request schemas for asking for a reset link and for resetting with a token (additions only, short ADR).
- `apps/server`: identity routes (sign-up duplicate branch, two new reset endpoints, limits), a reset-token table with a Prisma migration, memory and Postgres store methods, removal of `replaceUnverifiedCredentials`, two new emails in the server catalog (English and Traditional Chinese), account deletion removing reset tokens.
- `apps/web`: "Forgot password?" on sign-in, a request page, a reset page, router entries, catalog text in English and Traditional Chinese. Sign-up in production no longer shows "email already registered".
- Tests: existing tests in `apps/server/test/emailVerification.test.ts` and `identityStore.test.ts` that expect the replacement are rewritten. New server integration tests and store tests.
- The unarchived `email-verification` change's scenario "Address already registered" is superseded by this change.
