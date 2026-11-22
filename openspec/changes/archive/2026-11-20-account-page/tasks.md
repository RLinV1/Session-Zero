## 1. Page

- [x] 1.1 Route `/account`, on the hub layer
- [x] 1.2 Signed-in overview: who is signed in, password, sound and graphics, sign out, delete account
- [x] 1.3 Labelled groups split by hairlines, stacking on a phone
- [x] 1.4 The shared header's account control on the page

## 2. Ways in

- [x] 2.1 Home and policy headers link to `/signin` and `/signup`, which land on `/gm-dashboard`
- [x] 2.2 "Your account" in the account menu is the link to the page
- [x] 2.3 Signed out, `/account` goes to `/signin` with no `next`; `/account/new` shows the create-account form

## 3. Account menu

- [x] 3.1 Rebuild on the shared popover: rows, Escape and outside press, focus back to its button
- [x] 3.2 Move changing the password and deleting the account to the page; say so on the Privacy page

## 4. Verify

- [x] 4.1 Component tests (`test/accountPage.test.tsx`), including that `/signin` and `/signup` still honour `next`
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test`
- [x] 4.3 Walk the flow in the browser, in both themes and at phone width, and record it in `verification-log.md`
