## 1. Page

- [x] 1.1 Routes `/account` and `/account/new`, on the hub layer
- [x] 1.2 Share the sign-in and sign-up forms between `/signin`, `/signup` and the account page
- [x] 1.3 Signed-in overview: who is signed in, settings, change password, sign out, delete account
- [x] 1.4 Styles for the overview rows, stacking on a phone

## 2. Ways in

- [x] 2.1 Home and policy headers link to the account page
- [x] 2.2 "Your account" in the account menu

## 3. Verify

- [x] 3.1 Component tests (`test/accountPage.test.tsx`), including that `/signin` and `/signup` still honour `next`
- [x] 3.2 Run `npm run lint && npm run typecheck && npm test`
- [x] 3.3 Walk the flow in the browser, in both themes and at phone width, and record it in `verification-log.md`
