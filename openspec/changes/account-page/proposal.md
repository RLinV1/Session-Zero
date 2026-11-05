## Why

Signing in from the home page sends a person to `/signin`, and from there straight to the GM dashboard, whether or not they were on their way to host. The account's own controls (password, sign out, deletion) exist only inside the header's account menu, so there is no page that is simply "your account". People should be able to sign in from the home page first and stay on the home page's side of the site, then choose what to do next.

## What Changes

- **A new account page at `/account`.** Signed out, it shows the sign-in form under the site header. `/account/new` shows the create-account form. Signing in or up stays on the account page instead of moving on to the dashboard. Signed in, it shows who is signed in, with settings, change password, sign out and delete account, and the header links to the person's rooms and library.
- **The home page's header points at it.** "Sign in" and "Create account", on the home and policy pages, go to `/account` and `/account/new`. The signed-in account menu gains a "Your account" entry.
- **`/signin` and `/signup` stay as they are.** They are what a page that needs an account redirects to, and they return the person to `next`. Both pages now share their forms with the account page.

## Capabilities

### New Capabilities
- `account-page`: the page where a person signs in from the home page and finds their account's controls.

### Modified Capabilities
None. `/signin`, `/signup` and the account menu's existing actions behave as before.

## Impact

- **apps/web:** `account/AccountPages.tsx`, `pages/home/AccountLinks.tsx`, `router.ts`, `App.tsx`, `theme.ts`, `ui/SiteHeader.tsx`, `styles.css`; test `test/accountPage.test.tsx`.
- **docs/INTERFACE.md:** the page inventory.
- No change to `packages/shared`, the server, or what the app stores. Deletion itself is `openspec/changes/account-deletion`; this page only opens its dialog.
