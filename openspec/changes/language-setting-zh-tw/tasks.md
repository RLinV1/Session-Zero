# Tasks

Tests reference the capability as `(localization)` in their `describe` titles. Record every manual check (route, language, viewport, result, screenshot path) in `verification-log.md` in this change.

## 1. Contract, core and glossary

- [x] 1.1 Write the ADR for the localization protocol additions (optional `messageId` and `params` on `rejected`, `reject(code, id, params)` with `Decision.text`, `Accept-Language` on REST, locale-taking `formatActivity`/`activityHistory`), numbered after rechecking `origin/main`'s `docs/adr/` for the next free number; verify it names the Real-Time Architecture owner as reviewer and links this change
- [x] 1.2 Add `packages/shared/src/i18n/` core: `Locale`, `LOCALES`, `Catalog<E>`, `format` (nested message refs, English fallback for a missing entry, never an id), `resolveLocale`, and `Intl` helpers for dates, times, relative times, numbers and lists; export from `packages/shared/src/index.ts`; verify `packages/shared/test/i18n.test.ts` covers the spec's browser-preference scenarios (`zh-TW`; `zh-HK`; `ja-JP` then `zh-TW`; `zh-CN` only; bare `zh`; nothing mappable) and the fallback rule
- [x] 1.3 Write `docs/GLOSSARY-zh-TW.md` from design §10 (terms, punctuation and spacing rules, one-character condition abbreviations); verify a native Traditional Chinese reader has approved it and their name is recorded in the file

## 2. Shared text

- [x] 2.1 Move `decide`'s rejections to shared catalog ids with English and Traditional Chinese entries; `reject()` returns `message` (English) plus `text`; verify every existing shared test passes unchanged and a new test formats every rejection id in both languages, with English equal to the pre-change strings for a sample of interpolated ones
- [x] 2.2 Give `formatActivity` a Traditional Chinese twin (same exhaustive switch) and thread `locale` through `activityHistory`; verify the existing activity-log tests pass unchanged in English and new `(localization)` tests check a Traditional Chinese move sentence that keeps "Sam" and "Aria" as typed and uses the glossary's term for Prone
- [x] 2.3 Give `describeUndo`, `describePortalChange`, the replay labels and sentences and the attack-roll formatters a `locale`, with Traditional Chinese twins; serve condition labels and markers through `conditionLabel`/`conditionAbbr` (the "Scene 1" default stays room data, design.md §6); web callers keep English until their area is migrated; verify shared tests pass and `sharedPhrases.test.ts` covers each in both languages
- [x] 2.4 Read `protocol.ts` `refine` messages from the English shared catalog and add the English-text → id reverse index; verify a test fails when two validation ids share an English text, and existing protocol tests pass

## 3. Server

- [x] 3.1 Add the locale middleware (`Accept-Language` q-ordered tags → `resolveLocale` → `req.locale`, default `en`; `Content-Language` and `Vary: Accept-Language` on localized responses); verify unit tests for `zh-TW`, `zh-HK`, `fr-FR`, a q-ordered list, and a missing header
- [x] 3.2 Send `messageId` and `params` on `rejected` from `liveRoom.ts`, moving its own rejections to shared ids; verify an integration test in `apps/server/test` where a refused command over the socket carries the id, params and the unchanged English `message`
- [x] 3.3 Add `apps/server/src/i18n/{en,zh-TW}.ts` and move the REST error messages in `identity/`, `http/`, `uvtt/` and wall detection to `req.t`; `badRequest` formats zod's built-in issues with zod's `zh-TW` locale and our own via the reverse index; verify integration tests for a wrong sign-in password and an invalid sign-up email in `zh-TW` (Chinese text, same status and `field`), and the same request with `fr-FR` returning English
- [x] 3.4 Pass `req.locale` to `activityHistory` in the history route; verify an integration test that the same history returns English and Traditional Chinese sentences with identical `committed` payloads and viewer filtering

## 4. Web foundation and the language setting

- [x] 4.1 Add `apps/web/src/i18n/locale.ts` (saved `vtt.locale` with try/catch, browser default via `resolveLocale(navigator.languages)`, `storage` listener, `useLocale`, `useT`, module `t()` and `subscribeLocale`), the lazily loaded Traditional Chinese chunk awaited in `main.tsx`, and `<html lang>`, `document.title` and meta description updates; gate the browser default and saved choice to English in production builds until task 8.2; verify jsdom tests for default detection, saved choice winning, storage throwing, and `lang` changing on switch
- [x] 4.2 Add the `Accept-Language` header helper and use it at every `fetch` in `net/api.ts`, `ui/diceLookBackends.ts` and `pages/LibraryCreatures.tsx`; make `RoomConnection` format `rejected` from `messageId`/`params` in the current locale and take its own messages from the catalog; verify tests that a request carries the current locale and a rejection received after a switch shows in the new language
- [x] 4.3 Build the language control (options "English" and "繁體中文", each with its own `lang`, current one marked, keyboard operable, accessible name from the catalog) and place it in `SiteHeader`, `EntryHeader` and a Language tab of `SettingsMenu`; show it only in development builds until task 8.2; verify component tests for keyboard selection keeping focus and for switching without closing the Settings dialog
- [x] 4.4 Replace the four `toLocale*String` call sites and `formatRelative.ts` with the shared `Intl` helpers in the current locale; verify tests for "3 天前" and a Traditional Chinese chat time such as "下午3:05", and unchanged English output
- [x] 4.5 Add the Traditional Chinese system faces to `--font-ui`, `--font-mono` and the stacks in `board/boardFont.ts`, plus `:lang(zh-TW)` letter-spacing and line-height rules; verify in the browser that a token named "弓箭手" renders with no missing glyphs and the network log shows no font request beyond the Geist files
- [x] 4.6 Add the development-only pseudo-locale (`?locale=pseudo`) derived from the English catalog, excluded from production builds and from the language control; verify a production build contains no pseudo-locale code path and the dev home page renders bracketed text
- [x] 4.7 Add the `no-restricted-syntax` rules for literal JSX text and literal `aria-label`, `title`, `placeholder`, `alt` and `aria-description` values in `eslint.config.js`, scoped to a list of migrated directories that starts empty; verify a fixture with a literal "Save" button fails `npm run lint`

## 5. Web: entry, home and policy pages

- [x] 5.1 Migrate the app shell and shared UI (`App.tsx`, not-found, `SiteHeader`, `SiteFooter`, `Modal`, `EmptyState`, `Popover`, `Picker`, `SearchablePicker`, `IconAction`, `PanelSection`, `Link`) to catalogs with Traditional Chinese entries and add them to the lint scope; verify lint, typecheck and web tests pass and a pseudo-locale pass of these components shows no unbracketed text
- [x] 5.2 Migrate the entry pages (`JoinPage`, `joinFailure.ts`, sign-in, sign-up, account pages, `RequireAccount`, `safeNext` messages) and add them to the lint scope; verify the join page shows the language control before the display-name field and a pseudo-locale pass of each entry page
- [x] 5.3 Migrate the home page (`HomePage.tsx`, `pages/home/*`, demo captions, the recover demo calling `activityHistory` with the current locale) and add it to the lint scope; verify the home page in Traditional Chinese shows Chinese headings, buttons and captions with "Session Zero" unchanged, by screenshot at desktop and phone width
- [x] 5.4 Translate the privacy and terms pages with the "English version governs" note and a link that shows the English text; verify a test that the Traditional Chinese terms page has the note and that the link renders the English policy

## 6. Web: hub pages and editors

- [x] 6.1 Migrate the GM dashboard, room details fields, the library and its tabs (`LibraryPage`, `LibraryCreatures`, `LibraryEncounters`, `LibraryAnimations`, `LibraryPicker`, `DiceLooks`), and built-in creature, attack and asset display names (copied in the placer's language when placed); verify a test that placing a built-in creature in Traditional Chinese creates a token with the Chinese name, plus a pseudo-locale pass of each hub page
- [x] 6.2 Migrate the map and grid editors (`pages/mapEditor/*`, `GridForm`, `MapGridPreview`, `useGridDetection`, `mapEditorGuides.ts`, wall detection review), the encounter editor (`pages/encounterEdit/*`, `EncounterPreviewModal`) and the animation editor (`pages/animationEditor/*`); verify lint scope, typecheck, web tests, and a pseudo-locale pass through every editor step

## 7. Web: the table and the board

- [x] 7.1 Migrate the room page and GM panel (`RoomPage`, `GmPanel`) and the table chrome in `ui/` (`ToolRail`, `ParticipantsButton`, `ShareButton`, `RoomMenu`, `ReplayBar`, `TurnNotice`, `DepartureNotice`, `KeepSeatNotice`, `GuideTour` and `guide.ts`, `RollCard`, `DiceTray`, `BoardEmptyState`, `SettingsMenu`, `PreviewBanner`); verify every tool rail control has a Chinese accessible name and tooltip, and a pseudo-locale pass of the table as GM and as player
- [x] 7.2 Migrate the sidebar panels (`panels/*`: attacks, dice, chat, initiative, token roster and editor, add token, checkpoints, scenes, encounters, area effects, effects, rulings, leave table, departures, activity log); make the activity log refetch when the language changes; verify a test that switching with the log open re-renders entries in the new language, and that the leave-table modal meets its spec in Traditional Chinese
- [x] 7.3 Move the board's own text (condition markers with one-character Chinese abbreviations, ruler and area-effect captions, `animationPreview` labels, `MovementControls`, `TokenCard`, `BoardFilters`) to `t()` and relabel on locale change in `boardView.ts`; verify in the browser that switching language mid-session relabels markers without reconnecting or changing room state, by socket log and screenshot

## 8. Whole-app checks and enablement

- [x] 8.1 Widen the lint rule to all of `apps/web/src`; verify `npm run lint` passes with no `eslint-disable` for these rules other than ones that state a reason
- [x] 8.2 Show the language control and honour the saved choice and browser default in production builds; verify with a production build (`npm run build`) in the browser that a `zh-TW` browser opens in Traditional Chinese and a saved "English" choice wins over it
- [x] 8.3 Walk every spec scenario in `specs/localization/spec.md` end to end in both languages at desktop and phone widths (first visit, reload, invite link, switch at the table while connected, draft kept, blocked move refusal, wrong password, activity log switch, policy note), with a second socket client as the other viewer; verify each scenario is recorded in `verification-log.md` with a screenshot
- [x] 8.4 Have a native Traditional Chinese reader review every catalog against the glossary; verify their sign-off and any fixes are recorded in `verification-log.md`
- [x] 8.5 Add a Localization row to README §6, a language-and-type note to `docs/INTERFACE.md`, and a CLAUDE.md convention line ("UI text goes through `t()`; no literal text in components"); verify the docs render and link the glossary and ADR
- [x] 8.6 Run `npm run lint && npm run typecheck && npm test`; verify all three pass

## Workflow follow-up

- Open PRs by task group against `main`, titled with "localization", and get the Real-Time Architecture owner's review on the group 1–3 PR that carries the ADR.
- Archive the change with `/opsx:archive` after the last group merges, which creates `openspec/specs/localization/spec.md`.
