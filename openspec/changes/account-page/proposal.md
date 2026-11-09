## Why

The account's own controls (password, sign out, deletion) existed only inside the header's account menu, so there was no page that is simply "your account".

The first version of this page also caught signing in: the home page's "Sign in" led to `/account` and stayed there, so a person who signed in landed on settings they hadn't asked for, with nothing to do next. Signing in should lead to the person's rooms, which is what an account is for (`DESIGN.md` §5), and the account page should open only when someone asks for it. That version also departed from `INTERFACE.md`: the sign-in form sat on the hub layer rather than the entry layer (§11.3), the page had no account control in its header (§11.9, "One header"), and the menu stacked five identical boxed buttons with permanent deletion among them (§11.9, "Space and materiality").

## What Changes

- **A new account page at `/account`, for signed-in people.** "Your account" in the account menu is the way there. Signed out, `/account` goes to `/signin`. It shows who is signed in and the controls for password, this browser's sound and graphics, signing out and deleting the account, in labelled groups split by hairlines with deletion last.
- **Signing in leads to the person's rooms.** "Sign in" and "Create account", on the home and policy pages, go to `/signin` and `/signup`, which return to `next` or land on `/gm-dashboard`. An old `/account/new` link shows the create-account form.
- **A shorter account menu.** It uses the shared popover: who is signed in, "Your account", sound and graphics, and "Sign out", as rows rather than boxed buttons. Changing the password and deleting the account move to the account page. The Privacy page says where deletion now is.

## Capabilities

### New Capabilities
- `account-page`: the page where a person finds their account's controls, and where signing in leads instead.

### Modified Capabilities
- `account-deletion`: "Delete account" is offered on the account page rather than in the account menu.

## Impact

- **apps/web:** `account/AccountPages.tsx`, `pages/home/AccountLinks.tsx`, `pages/PolicyPages.tsx`, `router.ts`, `App.tsx`, `theme.ts`, `ui/SiteHeader.tsx`, `styles.css`; test `test/accountPage.test.tsx`.
- **docs/INTERFACE.md:** the page inventory and the layers.
- No change to `packages/shared`, the server, or what the app stores.
