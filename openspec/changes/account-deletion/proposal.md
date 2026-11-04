## Why

A deployed app that stores email addresses must let people remove them. Today the privacy page tells users to "ask any of us through the CSE 416 course", which does not work for a public deployment. The terms and privacy pages also still read as a course-project handout, and the asset credits mention trademarked names and third-party sources that could be taken down.

## What Changes

- New `DELETE /api/auth/account`: the signed-in user confirms with their password; the server deletes their rooms, library, uploads, sessions, seat credentials, memberships and finally the account itself, and closes any open sockets.
- New `IdentityStore.deleteUser` (memory and Postgres), plus an orchestrator that reuses `deleteRoomFully` and the library delete paths so nothing is removed by a second, divergent code path.
- Account menu gets a "Delete account" dialog: states what is lost, requires the typed email and the password, then signs out and returns to the home page.
- Rewrite the Terms of use and Privacy pages for a deployed service: self-serve deletion, retention, hosting, no third-party loads, an honest note that built-in art is AI-generated, a contact route, and removal of "student project / ask the team" wording.
- Asset audit: every shipped asset is own work, AI-generated for this project, CC0, or an OFL font served from our own origin. Neutral wording replaces trademark names (a sound credited as "Star Wars Blaster", "Dungeons & Dragons" in the UI) in user-facing text and credits. No CDN or hotlinked asset is loaded at runtime.

## Capabilities

### New Capabilities
- `account-deletion`: self-serve, complete, irreversible removal of an account and everything it owns.
- `site-policies`: what the Terms and Privacy pages must say and which assets the app may ship.

### Modified Capabilities

## Impact

- `apps/server`: `identity/routes.ts`, `store/identityStore.ts`, memory and Postgres implementations, a new `domain/accountDeletion.ts`, tests.
- `apps/web`: `account/AccountPages.tsx`, `account/accountStore.ts`, `pages/PolicyPages.tsx`, `test/sitePolicies.test.tsx`.
- `packages/shared`: a new `DeleteAccountRequest` zod schema. No existing schema changes. An ADR records the deletion rules.
- Docs: new ADR, `public/sfx/CREDITS.md`, `public/img/CREDITS.md`.
- No new dependencies. No Prisma migration: deletion lists children explicitly, as ADR 0009 does.
