## 1. Contract and docs
- [ ] 1.1 Add `DeleteAccountRequest` zod schema to `packages/shared` and export it
- [ ] 1.2 Add an ADR for account deletion (order, failure model, no cascade)

## 2. Server
- [ ] 2.1 `IdentityStore.deleteUser` in memory and Postgres stores
- [ ] 2.2 `domain/accountDeletion.ts` orchestrator reusing `deleteRoomFully` and library deletes
- [ ] 2.3 `DELETE /api/auth/account` route: password check, shared limiter, cookie clear, socket close
- [ ] 2.4 Server integration tests (FR-GM-01): success, wrong password, signed out, rooms/library/objects gone, foreign room survives

## 3. Web
- [ ] 3.1 `deleteAccount` in `accountStore.ts`
- [ ] 3.2 Delete-account dialog in `AccountMenu` (typed email + password), using impeccable and design-taste-frontend
- [ ] 3.3 Component tests for the confirmation gate

## 4. Policies and assets
- [ ] 4.1 Rewrite `PolicyPages.tsx` Terms and Privacy; update `sitePolicies.test.tsx`
- [ ] 4.2 Rename the blaster clip and credit to a neutral name; update `fxSoundRecipes.ts` and `sfx/CREDITS.md`
- [ ] 4.3 Replace user-facing trademark names; update `img/CREDITS.md`
- [ ] 4.4 Test that no source references another origin (fonts, scripts, images, audio)

## 5. Verify
- [ ] 5.1 Run `npm run lint && npm run typecheck && npm test` once, then check the flow in the browser with Playwright
