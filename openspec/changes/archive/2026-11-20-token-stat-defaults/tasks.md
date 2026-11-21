# Tasks

## 1. Defaults

- [x] 1.1 Add `apps/web/src/panels/tokenDefaults.ts` with `DEFAULT_HP` (100), `DEFAULT_AC` (0) and `statsWithDefaults`. Verify in `apps/web/test/tokenDefaults.test.ts`: all blank, typed values kept, blank HP follows Max HP, blank Max HP follows a positive HP, HP 0 uses 100.
- [x] 1.2 Use it in `AddToken.tsx` on submit; add placeholders and the hint line.

## 2. Layout

- [x] 2.1 Move Size, Rotation and Hidden from players into a collapsed `<details>` **Advanced settings**; style its summary like Custom roll.

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test`.
- [x] 3.2 Playwright (run from a script with `playwright-core`; the Playwright MCP browser profile was locked by another session): open Add token, check the layout, add a token with blank stats and check it shows 100/100 HP and AC 0.
