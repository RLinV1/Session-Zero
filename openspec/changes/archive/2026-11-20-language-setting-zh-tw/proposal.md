# Proposal

## Why

Session Zero is English-only. Every label, button, tooltip, error, empty state and policy page is a hard-coded English string, and the server adds more English of its own: about 100 command rejections from `decide` ("That spot is blocked by a wall."), about 140 REST error messages, and every activity-log sentence. Players and GMs who read Traditional Chinese cannot use the product in their own language, and there is no setting to pick one.

Adding one more language now also makes the product ready for others: once the UI reads text from catalogs instead of string literals, the next language is a translation job, not a code change.

## What Changes

- **A language setting.** Viewers choose between English and 繁體中文 (Traditional Chinese, `zh-TW`). The choice is saved in this browser, like the theme, and applies at once on every page without a reload.
  - It can be changed from the header of the home and hub pages, from the entry pages (sign-in, sign-up, join), and from a new Language section of the Settings dialog at the table.
  - With no saved choice, the first visit follows the browser's preferred languages: a Traditional Chinese preference (`zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant`) opens in Traditional Chinese; anything else opens in English.
- **The whole web app in Traditional Chinese:** every page and dialog, the board's own text (labels, condition markers, ruler and preview text), accessible names and tooltips, empty states and errors, the guided tours, the document title and meta description, and the privacy and terms pages.
- **Server text in the viewer's language.** Command rejections, REST errors and field errors, and activity-log sentences are produced in the viewer's language. Shared text that the client renders itself (condition names, undo labels, replay points) uses the same catalogs.
- **Locale-aware formatting.** Dates, times, relative times, numbers and lists use the chosen language. The page's `lang` attribute follows the choice, and a Chinese-capable system font follows Geist in every font stack so Chinese text never falls back to a mismatched face.
- **User content is never translated.** Room names, display names, token names, chat, scene names and anything a GM typed stay exactly as written. Text the app copies into a room (a built-in creature's name when placed, a preset attack's name) is written in the language of the person who placed it and is room data from then on.
- **A guard against new hard-coded text.** Lint fails on English literals in JSX text and in accessible-name attributes, and the build fails if the Traditional Chinese catalog is missing an entry the English one has.
- **Protocol (additive):** a command rejection carries a message id and parameters next to its existing English `message`, so the client can show it in the current language. REST requests carry the chosen language in `Accept-Language`. Clients that send neither (tests, scripts, AI players) keep getting English. This needs an ADR because it extends `packages/shared` protocol types.

## Capabilities

### New Capabilities
- `localization`: the viewer's language choice and its default, which text follows it (the web UI, board text, server-produced messages, formatting) and which never does (user content), the supported languages, and the rule that requirements quoting English UI text are met in other languages by that text's translation.

### Modified Capabilities

None. Existing specs quote English UI text; the `localization` capability states once that the Traditional Chinese UI meets those requirements with the catalog translation of the quoted text, so no existing requirement changes.

## Impact

- **packages/shared:** a small message-catalog module (message ids, parameters, formatting, plural and list helpers) with English and Traditional Chinese catalogs for shared text: `decide` rejections, protocol validation messages, activity-log sentences, condition labels, undo and portal descriptions, replay labels. `reject()` takes a message id; `Decision` keeps its English `message` and adds the id and parameters. `formatActivity` and `activityHistory` take a locale. The `rejected` server message gains optional `messageId` and `params` (ADR).
- **apps/server:** a request locale resolved from `Accept-Language` (English when absent or unsupported). REST errors in identity, rooms, library, uploads, UVTT and wall detection routes are produced from a server catalog; zod's own issue messages use zod's bundled `zh-TW` locale for Chinese requests. The history route formats sentences in the request locale. Live-room rejections outside `decide` use message ids too.
- **apps/web:** a locale store (saved choice, browser default, `<html lang>`), a typed `t()` with React and non-React access, English and lazily loaded Traditional Chinese catalogs, every component's literal text moved to catalogs (about 130 components and the Pixi board), a language control in `SiteHeader`, `EntryHeader` and `SettingsMenu`, locale-aware date and number formatting, CJK font fallbacks in `styles.css` and `board/boardFont.ts`, and `Accept-Language` on every API request.
- **Lint:** `no-restricted-syntax` rules in `eslint.config.js` for literal JSX text and literal `aria-label`, `title`, `placeholder` and `alt` values in `apps/web`.
- **Docs:** a new ADR, a glossary of Traditional Chinese game terms in `docs/`, a Localization row in README §6, and an INTERFACE.md note on language and type.
- **Dependencies:** none added. Formatting uses the browser's and Node's `Intl`.
- **Tests:** existing tests keep running in English (jsdom and Node default to `en-US`). New tests cover the setting, defaults, switching, catalog completeness, server messages per language, and the lint guard.
