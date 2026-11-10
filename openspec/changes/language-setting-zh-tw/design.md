# Design

## Context

See proposal.md for why. What the code looks like today:

- **Web UI text is inline.** About 130 React components and the Pixi board hold their English as JSX text, attribute literals (152 literal `aria-label`s alone), and strings in arrays and objects (`SettingsMenu`'s tab labels, `SiteFooter`'s `POLICY_LINKS`, `SiteHeader`'s `THEME_LABEL`). There is no i18n library and no locale anywhere. Four call sites format dates with the browser's default locale (`toLocaleString()`, `toLocaleTimeString([])`), and `formatRelative.ts` writes "3 d ago" by hand.
- **Shared code writes English for people.** `decide()` builds 146 rejections through `reject(code, message)`, 32 of them interpolated. `formatActivity` composes activity sentences with English grammar (articles, plurals, "hid"/"revealed"). `describeUndo` returns `{ verb, noun }` and `describePortalChange` returns `{ past, verb, gerund }`, which callers glue into English sentences. Condition labels and abbreviations live in `conditions.ts`, replay labels in `replay.ts`, protocol `refine` messages in `protocol.ts`. `scenes.ts` falls back to "Scene 1" for a room with no stored scene names.
- **The server writes English too.** About 140 `{ error: "..." }` and `badRequest(...)` messages across `identity/`, `http/`, `uvtt/` and the wall-detection routes, plus a dozen rejections in `domain/liveRoom.ts` outside `decide`.
- **Wire shapes.** `rejected` is `{ clientCommandId, code, message }`. The socket `error` and `connect_error` paths already use codes the client maps. REST errors are `{ error, field?, issues? }`. `HistoryResponse` entries carry a ready-made `sentence`.
- **Preferences.** `theme.ts` and `ui/clientSettings.ts` already show the house pattern: a module-level value in `localStorage` with try/catch, a `useSyncExternalStore` hook, a pre-render apply in `main.tsx`, and a `storage` listener so other tabs follow.
- **Fonts.** `--font-ui` and the board's `BOARD_FONT` stacks are Geist then Latin system faces; neither names a CJK face. Pixi caches label textures by text and style.
- zod 4.6.7 is installed and ships a `zh-TW` locale (`zod/v4/locales/zh-TW`).

Constraints: `decide` and `reduce` stay pure (invariant 2), so they cannot read a locale. Changes to `packages/shared` protocol types need an ADR and the Real-Time Architecture owner's review.

## Goals / Non-Goals

**Goals:**
- One message mechanism that works in pure shared code, the server, React and the Pixi board, with typed parameters.
- Compile-time completeness: a missing Traditional Chinese entry fails `npm run typecheck`.
- English output byte-identical to today for clients that ask for nothing, so existing tests, scripts and AI players are unaffected.
- No new runtime dependency; `Intl` does plurals, dates, relative times and lists.

**Non-goals:**
- Simplified Chinese, right-to-left languages, or a translation-management service. The design leaves room for them; this change adds none.
- Translating content people typed, built-in map artwork, or generated images.
- Localizing logs, metrics, ADRs, OpenSpec documents or developer error output.
- Per-account language storage (decided: this browser only).

## Decisions

### 1. Typed catalogs in TypeScript, no i18n library

A catalog is a TypeScript object whose entries are either a string or a function of typed parameters:

```ts
// English is the source and the type.
export const en = {
  "settings.title": "Settings",
  "dashboard.lastOpened": ({ when }: { when: string }) => `Last opened ${when}`,
  "activity.wallCount": ({ n }: { n: number }) => (n === 1 ? "1 wall" : `${n} walls`),
} as const;
// Every other language must have every key, with compatible parameters.
export const zhTW = {
  "settings.title": "設定",
  "dashboard.lastOpened": ({ when }) => `上次開啟：${when}`,
  "activity.wallCount": ({ n }) => `${n} 面牆`,
} satisfies Catalog<typeof en>;
```

`Catalog<E>` maps each key to `string` or a function taking that key's parameter type; `satisfies` makes a missing or extra key a type error, which is the "No untranslated text ships" check. `t(key, params)` is typed from the English entry, so a wrong or missing parameter is also a type error. Functions handle plurals and word order without a placeholder syntax; Chinese entries simply ignore plural logic.

A message that has to travel (a rejection from `decide`, a nested noun inside a sentence) is data: `{ id, params }`, where a parameter is a string, a number, or another `{ id, params }`. User content is always passed as a plain string, so it can never be looked up and translated.

*Alternatives:* **i18next/react-i18next**: mature, but its keys and interpolation are stringly typed unless augmented, it wants an instance per locale on the server, and its React binding does not reach Pixi or pure shared code without the same wrapper we would write anyway. **FormatJS (react-intl)**: ICU syntax is powerful, but message parsing at runtime, a larger bundle, and the same reach problem. **Lingui**: good extraction tooling, but it needs a compile step and macros in a Vite + vitest + tsc setup that has none today. Our needs (two languages, typed parameters, three runtimes) are small enough that about 150 lines of core code beat any of them.

### 2. Where catalogs live

| Catalog | Location | Holds | Used by |
| --- | --- | --- | --- |
| Core | `packages/shared/src/i18n/` | `Locale`, `LOCALES`, `Catalog<E>`, `format`, `resolveLocale`, Intl helpers | everything |
| Shared text | `packages/shared/src/i18n/messages/{en,zh-TW}/` | rejections, validation, activity sentences, conditions, undo, portals, replay, default scene name | server, web |
| Server text | `apps/server/src/i18n/{en,zh-TW}.ts` | REST error messages | server |
| Web UI | `apps/web/src/i18n/{en,zh-TW}/` one file per area (`common`, `home`, `entry`, `account`, `dashboard`, `library`, `room`, `board`, `dice`, `attack`, `mapEditor`, `encounter`, `policy`, …) | all UI text | web |

Keys are dotted by area (`room.leave.confirm`). The core is pure (no I/O, no globals), so `decide` can import message ids without breaking invariant 2. `resolveLocale(tags)` encodes the spec's mapping (`zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant*` → `zh-TW`; `en*` → `en`; skip the rest) once, for the browser default and the server's `Accept-Language` alike.

### 3. Web locale store and loading

`apps/web/src/i18n/locale.ts` follows `theme.ts`: `vtt.locale` in `localStorage` (try/catch, in-memory when storage throws), `resolveLocale(navigator.languages)` when nothing is saved, a `storage` listener so other open tabs follow, and `useLocale()` / `useT()` hooks on `useSyncExternalStore`. A module-level `t()` and `subscribeLocale()` serve non-React code (the board, `RoomConnection`).

English is bundled. The Traditional Chinese web and shared catalogs are one lazily imported chunk. `main.tsx` awaits it before the first render when the starting locale is `zh-TW`, so there is no English flash; switching loads it first and flips the locale only once it has loaded, so a switch is never half-applied. `<html lang>`, `document.title` and the meta description are set with the locale (the same pre-render and route-hook pattern `theme.ts` uses for `data-theme`).

### 4. Command rejections are formatted on the client

`reject(code, id, params?)` returns `{ ok: false, code, message, text: { id, params } }`, where `message` is the English formatting of `text`, so every existing assertion on `.message` and every non-browser client still sees today's English. `liveRoom.ts` sends `rejected` with the new optional `messageId` and `params` beside `message`. `RoomConnection` formats `{ messageId, params }` in the current locale when the id is known and falls back to `message` otherwise; its own messages ("Not connected") come from the web catalog. The socket `error` message keeps mapping by `code`.

*Alternative:* the server formats with a per-connection locale (a `locale` field in `HandshakeAuth` and a new `setLocale` client message). Rejected: it adds connection state and two schema changes, and a rejection already shown would stay in the old language. Client formatting needs only the additive fields and is always in the language on screen.

### 5. REST is formatted on the server, from `Accept-Language`

Every web request goes through one header helper that sets `Accept-Language` to the current locale (it is a CORS-safelisted header, so `fetch` may set it). An Express middleware resolves `req.locale` with `resolveLocale` over the header's q-ordered tags, defaulting to `en`, and sets `Content-Language` and `Vary: Accept-Language`. Routes call `req.t(id, params)`.

Field errors: zod's built-in issue messages are produced per parse with zod's bundled `zh-TW` locale error map when `req.locale` is `zh-TW`. Our own `refine` messages in `protocol.ts` become constants read from the shared English catalog, and a reverse index (English text → id) translates them in `badRequest`. A unit test fails if two validation ids share an English text, which would make the index ambiguous.

Activity history is REST, so `formatActivity(event, actor, before, locale)` and `activityHistory(..., locale)` take the request locale; the web's activity log keys its query on the locale so switching refetches. The home page's recover demo calls the same function with the current locale.

*Alternative:* return ids on REST too and format on the client. Rejected for the activity log, whose sentences need the historical state only the server has, and then not worth splitting REST into two styles.

### 6. Shared English-grammar helpers become messages

`formatActivity` becomes one catalog function per event type in each language, receiving names and nested messages as parameters; the English functions reproduce today's output exactly, and the existing activity tests are the regression guard. `describeUndo` and `describePortalChange` return message refs (`undo.move`, `portal.opened`) instead of English verb fragments, and their callers render whole phrases from the catalog. Condition labels and abbreviations come from the shared catalog by condition id; in Chinese the board marker uses a one-character abbreviation (倒 for Prone). The "Scene 1" fallback is a catalog entry because it is not stored; a stored name is content.

### 7. The board relabels on locale change

`boardView.ts` reads `t()` for its own text (condition markers, ruler and area-effect captions, empty-state hints, animation preview labels) and subscribes to locale changes the way it already relabels when fonts arrive: it rebuilds those texts once. Token names are content and are not touched.

### 8. Fonts: system Traditional Chinese faces after Geist

`--font-ui`, `--font-mono` (for any Chinese inside it) and the board's four stacks gain `"PingFang TC", "Noto Sans CJK TC", "Noto Sans TC", "Microsoft JhengHei"` directly after the Geist face, so Chinese glyphs come from a Traditional Chinese face (Han unification would otherwise pick Japanese or Simplified glyph shapes from a generic fallback). No web font is added: a CJK web font is megabytes, and the spec forbids third-party font requests. `:lang(zh-TW)` rules remove Latin letter-spacing on headings and loosen line height where QA finds cramped text.

### 9. Lint guard and pseudo-locale

`eslint.config.js` adds `no-restricted-syntax` for `apps/web/src/**/*.tsx`: `JSXText` containing two or more Latin letters, and literal or template-literal values of `aria-label`, `title`, `placeholder`, `alt` and `aria-description`. This is core ESLint, no plugin. It cannot see strings in arrays and objects, so a dev-only pseudo-locale (`?locale=pseudo`, derived from English by accenting letters and bracketing each string) makes any untranslated text stand out on screen during the walkthrough. The pseudo-locale is excluded from production builds and from the language control.

### 10. Translation conventions

Translations use Taiwan Mandarin vocabulary, full-width punctuation, 「」 for quotations, and a half-width space between Chinese and Latin letters or digits ("3 天前", "GM 已移除"). A glossary in `docs/GLOSSARY-zh-TW.md` fixes game terms before the bulk translation. Proposed core terms, to be confirmed by a native-speaking reviewer before translation starts:

| English | 繁體中文 | | English | 繁體中文 |
| --- | --- | --- | --- | --- |
| GM | GM（主持人） | | Hit points (HP) | 生命值（HP） |
| Player | 玩家 | | Armor class (AC) | 護甲等級（AC） |
| Room / table | 房間／遊戲桌 | | Initiative | 先攻 |
| Token | 棋子 | | Advantage / disadvantage | 優勢／劣勢 |
| Map / grid | 地圖／網格 | | Critical hit | 重擊 |
| Scene / encounter | 場景／遭遇 | | Area effect | 範圍效果 |
| Fog of war | 戰爭迷霧 | | Cone / circle / line / square | 錐形／圓形／直線／方形 |
| Wall / door / window | 牆／門／窗 | | Blinded / Charmed / Frightened | 目盲／魅惑／恐懼 |
| Line of sight | 視線 | | Grappled / Invisible / Paralyzed | 被擒抱／隱形／麻痺 |
| Library | 素材庫 | | Poisoned / Prone / Restrained | 中毒／倒地／束縛 |
| Checkpoint | 存檔點 | | Stunned / Unconscious / Concentrating | 震懾／昏迷／專注 |
| Undo / replay | 復原／重播 | | Invite link | 邀請連結 |
| Activity log | 活動紀錄 | | Sign in / sign up / sign out | 登入／註冊／登出 |

## Risks / Trade-offs

- **[Volume: roughly 1,500 to 2,000 strings across ~240 files]** → Migrate area by area, each area landing with its Chinese catalog, so the typecheck gate holds after every task. The lint rule turns on per directory as each area is migrated, then for all of `apps/web` at the end.
- **[Strings the lint rule cannot see]** (labels in arrays and objects, `throw new Error("...")` shown to users) → pseudo-locale walkthrough of every route and dialog, recorded in the verification log.
- **[Translation quality]** machine-assisted drafts can read stiffly or misuse game terms → glossary first, one reviewer who reads Traditional Chinese natively signs off on each area's catalog in its PR.
- **[English drift]** refactoring `formatActivity`, `describeUndo` and `reject` could change English output → existing English assertions stay unchanged and must pass; new tests cover the Chinese side.
- **[Layout]** Chinese is usually shorter than English but its glyphs are taller and do not hyphenate; fixed-width chips and the tool rail may clip → screenshot pass in both languages at desktop and phone widths, with `:lang(zh-TW)` fixes.
- **[Bundle size]** the Chinese chunk is downloaded only by Chinese viewers; English viewers pay only for the core and the English catalog that replaces today's inline strings.
- **[Cached REST responses in the wrong language]** → `Vary: Accept-Language` on localized responses; most of them are already `no-store`.
- **[Mixed languages at one table]** a GM in Chinese places a built-in creature, and English players see a Chinese name → intended by the spec (copied text becomes content); the GM can rename it.

## Migration Plan

No data migration and no stored-state change. The protocol fields are optional and additive, so old clients and new servers, or new clients and old servers, keep working in English.

Rollout is the `feat/i18n-zh-tw` branch, landing in PRs area by area. The language control is built early but shown only in development builds until every area is migrated, so production viewers never meet a half-translated app; the last task group turns it on. Browser defaults follow the same gate: until then a production build resolves every visitor to English. Rollback is reverting the merges; a saved `vtt.locale` value is ignored by older builds.

## Open Questions

- Glossary sign-off: which team member reviews the Traditional Chinese terms and each area's catalog. This changes who approves, not what is built.
