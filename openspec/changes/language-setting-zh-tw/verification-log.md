# Verification log — language-setting-zh-tw

Every manual check for this change: what was touched, each step and its result, and fixes made because of it.

## Environment

| Item | Value |
|---|---|
| Code | worktree `.claude/worktrees/i18n-zh-tw`, branch `feat/i18n-zh-tw` |
| API | `i18n-server` on 127.0.0.1:3301 (memory store, `SEED_DEV_ACCOUNT=1`), run from the worktree (cwd checked with `lsof`) |
| Web | `i18n-web` on 127.0.0.1:5473, `VTT_SERVER=http://127.0.0.1:3301` |
| Launch config | two temporary entries added to the main checkout's `.claude/launch.json`; backup in the session scratchpad; **to remove** at cleanup |
| Browser | built-in browser pane, origin `http://127.0.0.1:5473` (own cookie jar and localStorage) |
| Account | seeded dev account from `apps/server/src/identity/devAccount.ts` (memory store, gone on restart) |
| Room | "i18n test room" (memory store) |
| Second viewer | `viewer.mjs` socket script in the scratchpad, joined by invite as a player |

## 2026-11-10 — Language control (task 4.3, design.md §11 "Test")

| # | Step | Result |
|---|---|---|
| 1 | Open `/join/ABCDEFGHJK` at desktop width | Control top right of the entry bar: globe, "English", caret. Join card untouched. Tab title "Join the table · Session Zero" |
| 2 | Keyboard only: focus the brand, Tab | Focus on the control; accessible name "Language: English" |
| 3 | Enter | Menu opens (`aria-expanded=true`): "English" (`aria-current=true`, check, `lang=en`), "繁體中文" (`lang=zh-TW`) |
| 4 | Tab, Tab, Enter on 繁體中文 | Switched. Menu closed, focus back on the trigger, now "語言：繁體中文". `<html lang="zh-TW">`, tab title "加入遊戲桌 · Session Zero", meta description in Chinese, `vtt.locale=zh-TW` saved |
| 5 | Network | Chinese catalog loaded only on switching, as its own modules (`i18n/zh-TW/index.ts`, `common.ts`, shared `zh-TW.ts`) |
| 6 | Reload `/` and `/join/…` | Still Chinese: the saved choice wins |
| 7 | 375 × 812, join page | Fits; no sideways scroll |
| 8 | 375 × 812, home page signed out | **Failed:** brand + trigger (130 px) + theme toggle didn't fit; the toggle wrapped to its own row |
| 8a | Fix | Under 420 px the caret is hidden and the padding tightens (`styles.css`); the full language name stays |
| 8b | Recheck at 375 px | Brand, "🌐 繁體中文" (111 px) and the theme toggle share row 1; Sign in and Create account on row 2 as before; `scrollWidth` 375 |
| 9 | Light theme, desktop, menu open | Neutral trigger like the other header controls; current row on the raised surface with a rust check |
| 10 | Hub header, signed in (`/gm-dashboard`) | Your rooms · Library · Test GM ⌄ · 🌐 繁體中文 ⌄ · theme, one row; title "你的房間 · Session Zero" |
| 11 | Table: More → Settings | Dialog in Chinese: 設定, tabs 音效 · 畫面 · 🌐 語言 · 遊戲桌 |
| 12 | Settings › 語言 | Radios "English" / "繁體中文", each labelled in its own `lang`; note "只有你會看到這項變更。遊戲桌上的其他人會保留各自的語言。" |
| 13 | Second viewer joins by invite and connects (`welcome seq=4`) | Connected |
| 14 | GM picks English in Settings at 11:46:12Z, back to 繁體中文 at 11:46:19Z | Dialog stayed open on the Language tab; page not reloaded (marker kept); "Connected", seq 4 before and after; title "Table · Session Zero" then "遊戲桌 · Session Zero" |
| 15 | Second viewer's log after both switches | Nothing after its welcome: no event, presence change or reconnect |

Not yet translated (expected at this stage): the join card, home page body, dashboard body and table panels are still English; they are migrated in task groups 5–7.

Unit tests: `apps/web/test/language.test.tsx` (11) and the updated `clientSettings.test.tsx` (7) pass.

## 2026-11-10 — Wire, formatting and fonts (tasks 3.1, 4.2, 4.4, 4.5)

| # | Step | Result |
|---|---|---|
| 1 | Server tests `apps/server/test/locale.test.ts` | 8 pass: `zh-TW`, `zh-HK`, `fr-FR`, q-ordered lists, `zh-CN`, no header → English; `Vary: Accept-Language`; `/uploads` untouched |
| 2 | Web tests `languageWire.test.ts` | 4 pass: a rejection with a known id shows in the language on screen at arrival; unknown id or none falls back to the server's English; `RoomConnection`'s own messages are translated; every API request carries the chosen language |
| 3 | Web tests `languageFormat.test.ts` | 5 pass: English relative times unchanged ("5 min ago"); "剛剛", "5 分鐘前", "3 天前"; "下午3:05", "2026/11/9"; an `en-GB` browser keeps "15:05" |
| 4 | The isolated API restarted under `tsx watch` after server edits | Memory store emptied; signed in again (re-seeded account) and created "i18n font room" |
| 5 | Board font stacks drawn on a temporary canvas: "弓箭手 倒地 Aria", "30 ft 距離" | All glyphs drawn, Latin in Geist, Chinese in the Traditional Chinese face; canvas removed |
| 6 | Token "弓箭手" placed on the board (name entered by script: the tool's typing of CJK text doesn't reach React's controlled input) | Board label reads 弓箭手, no missing-glyph boxes |
| 7 | Font files the page requested | Only `geist-sans-latin-{400,500,600,700}-normal.woff2`: no Chinese web font, nothing third-party |

## 2026-11-10 — Pseudo-locale and lint guard (tasks 4.6, 4.7)

| # | Step | Result |
|---|---|---|
| 1 | Dev home page with `?locale=pseudo` | The language control's catalog text is bracketed and accented ("⟦Ļáñĝûáĝé: Éñĝļîšĥ⟧"); not-yet-migrated text (theme toggle, hero heading, Sign in) stays plain English and stands out; `<html lang="en">`; "English" in the control is the language's own name and is never pseudo-translated |
| 2 | Production build (`vite build` into the scratchpad) | Builds. No production JS file contains the pseudo-locale (`⟦`, `locale=pseudo`, `pseudoRequested`): 0 files |
| 3 | Where the Chinese catalog lands | Its own lazy chunk (2.6 KB so far); the entry chunk holds "繁體中文" once, as the menu's language name |
| 4 | `apps/web/test/lintGuard.test.ts` | 3 pass: a literal "Save" button fails lint; literal `aria-label`, `title`, `placeholder` (template literal) and `alt` fail; `t()` text, numbers and punctuation pass |

## 2026-11-10 — Shared text and server (task groups 2 and 3)

Glossary approved by Vincent Chen (task 1.3).

| # | Check | Result |
|---|---|---|
| 1 | Shared suite after moving `decide`'s 146 rejections, the undo refusals, dice parse and paint problems to catalog ids | 1,041 existing tests pass with the English unchanged; 47 whole-object assertions moved to `toMatchObject` because rejections now also carry `text` |
| 2 | `rejectionCatalog.test.ts` | Every rejection, undo refusal and noun has non-empty English and Chinese; interpolated English is byte-identical to before (footprint, portal, preset, display-name messages); nouns inside messages are translated ("那扇門已經開啟。"); validation ids have no shared English text; a zod issue maps back to its id |
| 3 | Chinese spacing | `cjk` adds a half-width space only at Han/Latin seams: "無法復原：Goblin 已不存在。", "無法復原：那個棋子已不存在。", "骰子數量須介於 1 到 20 顆" |
| 4 | `activityLog.test.ts` (shared) | Every event type (the exhaustive `cases` record) also formats in Chinese, with only typed names and dice notation left in Latin letters; "Sam 將 Aria 從 (35, 35) 移到 (105, 35)", "Sam 將 Aria 的狀態設為倒地、中毒" |
| 5 | `sharedPhrases.test.ts` | Undo phrases, portal changes with 扇/面, one distinct condition character per marker, attack-roll formatting, replay labels (a GM still sees a checkpoint's own name) |
| 6 | Server `localizedRejections.test.ts` | Over a real socket: `rejected` carries `messageId` and `params` with the English `message` unchanged, including authorization and not-found refusals |
| 7 | Server `localizedRest.test.ts` | Failed sign-in 401 "電子郵件或密碼不正確。"; sign-up field error in Chinese with `field: "email"`; `fr-FR` gets English; zod's own issues in zod's zh-TW; join refusal "這個房間已經有人使用「Mara」這個名稱。…"; a source scan finds no English error literal in `apps/server/src` without a translation |
| 8 | Server `activityLog.test.ts` | The same history in English and Chinese has identical `committed` payloads; replay points are labelled "房間的開始" |
| 9 | Full suites | shared 1,320+ pass; server 652 pass (53 skipped, as before) |

Design changes recorded in design.md: §5 REST errors are translated where the response is written (reverse index of the server catalog, patterns for the few interpolated messages, zod's zh-TW map); §6 sentence builders take a locale with Chinese twins; "Scene 1" stays room data.

## 2026-11-10 — Entry, home and policy pages (task group 5)

| # | Check | Result |
|---|---|---|
| 1 | Web tests for the migrated areas (`siteHeader`, `homePage`, `home*`, `account*`, `joinedRooms`, `sitePolicies`, `searchablePicker`, `deleteAccountDialog`, `appLoading`) | Pass in English, unchanged except `homePage.test.tsx`, which now compares the library strip's names with their translation (still "The Lantern Quay" in English) |
| 2 | `policyLanguage.test.tsx` | The Chinese terms page says the English version governs and links to `/terms?lang=en`; that page renders the English text with `lang="en"` and a way back in Chinese; date "2026年11月10日"; the privacy page now lists the language among what local storage keeps |
| 3 | Home page in 繁體中文, desktop | Every section in Chinese; the product name stays "Session Zero" |
| 3a | **Found:** full-width commas rendered as narrow Latin commas ("地圖,") | Geist maps U+FF0C to its own narrow comma |
| 3b | Fix | A local `@font-face` "CJK Punctuation" limited to U+3000–303F and U+FF00–FFEF, ahead of Geist in `--font-ui`; Latin stays Geist, nothing downloaded (`document.fonts` shows it loaded from the system) |
| 3c | Recheck | "你的戰鬥地圖，" with the full-width comma in the Traditional Chinese face |
| 4 | Home at 375 px in Chinese | No sideways scroll; header and facts row lay out cleanly |
| 5 | Pseudo-locale sweep (visible text and `aria-label`/`title`/`placeholder`/`alt` not bracketed) on `/`, `/join/…`, `/signup`, `/terms` | Only the product name, characters' names (Mara, Pell, Nalani…), format names (PNG, UVTT) and, in pseudo mode, the English policy date. **Found** the condition markers' names (from `ConditionMarker`) still English; fixed with `conditionLabel(id, locale)` |
| 6 | Demos | Creature names come from the catalog when a demo is built; the turn and recover demos are keyed on the language so they rebuild in it; the recover demo's log and Undo labels use the current language |

## 2026-11-10 — Hub pages and editors (task group 6)

| # | Check | Result |
|---|---|---|
| 1 | 6.1 pseudo-locale sweep of `/gm-dashboard` and every library tab | **Found** the grid size line under map cards, the HP/AC facts on creature cards and the built-in animation names still English; fixed (catalog ids read at render, built-in names as getters). Rechecked clean |
| 2 | 6.2 module-level label tables (wall/fog/terrain tools and hints, door/window choices, grid line widths, animation particles and steps, stage slots, map-prep token policy, editor step tabs, colour swatches) | Now hold catalog ids (`TextId`) and call `t()` when they render, so they follow a language change; a scan of every changed file finds no `t()` inside a module-level declaration |
| 3 | Editor guide tours | `editorGuide(step)` builds each tour when opened, in the current language, including the `[aria-label="…"]` selectors (those labels are translated too). In Chinese the Walls tour found 牆 / 工具 / 已選取 — the Detect and Clear cards are skipped in both languages here (no vision service, no walls) |
| 4 | `language.test.tsx` editor cases | Guide selector follows the language; fog regions read "columns 3–6, row 2" / "第 3–6 欄，第 2 列"; map-prep choices read when shown; the grid form's default buttons render 套用網格 / 取消 with 每格距離 |
| 5 | **Found:** the codemod also rewrote quoted words inside doc comments (GridLines, GridForm, EncounterEditBar, FogControls) | Restored the English in the comments; GridLines reverted entirely |
| 6 | **Found:** `SightSetup` named its test-token loop variable `t`, which would hide the translate function in those loops | Renamed to `token` / `hit` |
| 7 | GridForm header actions | Default labels now mean "Discard / Save changes" in the editor header instead of comparing against English text ("Cancel", "Apply grid"); `gridDetectionEditor.test.tsx` updated to pass no labels for the default case. "1 import warnings" is now "1 import warning" (`libraryUvtt.test.tsx` updated) |
| 8 | Pseudo-locale sweep of the library map editor (Grid incl. Advanced, Walls, Fog, Terrain), the animation editor (every section and the stage panel) and the encounter editor bar with its name prompt | **Found** step tabs ("1 · Grid"), sample-size buttons ("1 square"), the colour wheel and the animation preview's Play/Stop; fixed. Left: the board's "Show" filter menu, which is task 7.3 |
| 9 | Library map editor in 繁體中文 at 800×600 | Grid step lays out without overflow; numbers keep Latin digits ("1 px", "21%") |
| 10 | Full web suite, lint, typecheck | 163 files / 1,358 tests pass; lint and typecheck clean |

Sign-in for the browser checks used the project's dev seed account (`apps/server/src/identity/devAccount.ts`) on `127.0.0.1:5473`; the session cookie was dropped once mid-check and re-established.

## 2026-11-10 — The table and the board (task group 7)

| # | Check | Result |
|---|---|---|
| 1 | Room `fae7e7de…` created from the dashboard in 繁體中文, a shipped map applied from the library, token Aria placed, given Prone and Poisoned, then hidden | Every step's UI in Chinese: "已連線 · 序號 7", "3344 × 1882 px · 0 面牆", the placement bar, the token editor (conditions 目盲…專注, 控制與可見性, 進階 "1 格 · 0° · 無圖片") |
| 2 | Tool rail in Chinese: accessible name and tooltip of every control | 隱藏棋盤工具, 選取, 測量, 繪製, 範圍, 橡皮擦, 迷霧, 視線 (tooltip 視線：關閉), 清除我所有的標示 — all Chinese |
| 3 | Pseudo-locale sweep as GM: every sidebar tab with all sections expanded, each board tool's options, More, Show, Share and Participants open | Left: the room's and people's names, "Scene 1" (room data), grid units ("5 ft", room data) and the condition labels, which come from the shared catalog (`conditionLabel(id, locale)`, not bracketed by the pseudo-locale) and read 倒地 / 中毒 in Chinese |
| 4 | Pseudo-locale sweep as a player (GM "View as" the second viewer), every tab | Left: names only |
| 5 | **Found:** during the sweeps — "0 tokens" group counts, "none" in the token editor's section summaries, "GM"/"player" after "You are", tab badges ("new ruling"), many counted phrases built from lowercase template literals ("3 tokens adjusted", "2 of 9 rolls"…) that the lint rule cannot see | Fixed; a scan of every template literal and lowercase multi-word string in `apps/web/src` now finds only CSS, URLs, ids, comments, the developer-only sound notes and the image-AI prompt (kept in English on purpose: it is pasted into an image model) |
| 6 | **Found:** the codemod turned identifier strings into `t()` (`label: "Call" \| "Reassign"` and its comparisons, `e.key === "Home"`) and wrote `t("…")` into one JSX sentence | Restored as identifiers / proper keys; the diff has no `=== t(`, `case t(` or `t()` inside text |
| 7 | **Found:** loops named their item `t`, shadowing the translate function inside (AreaEffectPanel, EncounterPanel, InitiativeTracker, ResolveDeparture, LeaveTable, ToolRail, SightSetup, resolveDraft) | Renamed (`target`, `template`, `entry`, `token`, `tool`) |
| 8 | Language switch mid-session with a second player connected (`viewer.mjs`, joined at seq 6) | Settings › 語言 switched zh-TW → en at 19:35:38 and en → zh-TW at 19:36:12: the GM stayed on "seq 7" / "序號 7"; the viewer logged no message at either time (its only messages: welcome seq=6 on joining, a welcome seq=7 resync when Aria was hidden) |
| 8a | **Found:** the board's token label stayed "Aria（已隱藏）" after switching to English | `drawToken` skips a token whose draw key is unchanged; the key now includes the language, and `BoardView.refreshText()` (called by `Board` on a language change) redraws token labels, condition letters, marks and the overlay. Rechecked: "Aria（已隱藏）" → "Aria (hidden)" with no reload and seq unchanged |
| 9 | Activity log and replay | The open log refetches in the new language (`language.test.tsx`: the server's sentence changes from "Sam moved Aria…" to "Sam 將 Aria…", two requests); the replay bar refetches points and the replay too, keeping the chosen point and step |
| 10 | Leave table in Traditional Chinese (`language.test.tsx`) | Opener 離開遊戲桌; dialog "要離開 The Keep 嗎？" with 留下 focused; lists 你在這裡的座位，以及「Sam」這個名稱。 and 你的 1 個棋子的控制權 with Aria; nothing is sent before confirming |
| 11 | Board text unit test | Ruler "10 / 30 ft · 20 ft remaining" / "40 / 30 ft · 超出 10 ft"; placement square "column 3, row 2" / "第 3 欄，第 2 列"; a damage roll's label "Longsword damage" / "Longsword 傷害", within 40 characters |
| 12 | Glossary check of all Chinese catalogs | Replaced 保存 → 儲存, 圖像 → 圖片, 數據 → 資料, 滾動 → 捲動 (the glossary's "Use / Not" table) |
| 13 | Web suite, lint, typecheck | 163 files / 1,361 tests pass; lint and typecheck clean |

Known minor: the placement bar reads "正在放置Aria" without the half-width space the `cjk` helper adds elsewhere, because the name is a separate bold element.

## 2026-11-10 — Lint everywhere and production enablement (tasks 8.1, 8.2)

| # | Check | Result |
|---|---|---|
| 1 | 8.1 `LOCALIZED_FILES` is now `apps/web/src/**/*.tsx`, plus four selectors for words a child expression renders (`{n === 1 ? "token" : "tokens"}`, `{busy && "Saving"}`, `` {`${n} rolls`} ``) | **Found** 41 more lines: the `/demos/apartments` lighting demo (27, now in the catalog), busy labels ("Deleting…", "Creating…", "Leaving…"…), "GM only" on the token card, "(hidden)" in the target list, "(removed)" in initiative, " · In use" on dice looks. All fixed; `npx eslint apps/web` passes with no `eslint-disable` for `no-restricted-syntax` anywhere |
| 2 | 8.2 `LANGUAGE_CHOICE_ENABLED` is `true` | Settings › Language and the header control appear in every build |
| 3 | Production build (`vite build`, served from `127.0.0.1:5481` by a scratchpad static server; `?as=zh-TW` injects a zh-TW `navigator.languages` into that test copy only) | No pseudo-locale in any chunk (no "⟦"); Chinese text only in its own lazy chunk |
| 4 | zh-TW browser, nothing saved | Opens in 繁體中文: `lang="zh-TW"`, "你的戰鬥地圖，今晚就能開玩。", trigger 繁體中文 |
| 5 | Same zh-TW browser after choosing English in the header | Reload stays English: `vtt.locale = "en"`, "Your battle map, ready to play tonight." |
| 6 | English-first browser (`en-US, en-TW, zh-Hant-TW…`), nothing saved | English; the Chinese chunk is never requested |
| 7 | Cleanup | Test server on 5481 stopped |

## 2026-11-10 — Spec scenarios end to end (task 8.3)

Setup: dev servers (web 127.0.0.1:5473 / API 3301). GM signed in on `127.0.0.1` (project dev seed account); player "Sam" as a guest on `localhost:5473` (separate cookies and storage); a second socket client (`viewer.mjs`) joined as another player and logged every message. First-visit and private-window cases ran on the production build (`vite build`) served from `127.0.0.1:5481` with a test-only shim for `navigator.languages` / blocked storage. Room `fae7e7de…`, invite `6ygv4vvknj`. Screenshots were taken in the browser pane at each step marked 📷.

| Scenario | Language / width | Result |
|---|---|---|
| Languages are named in themselves; Same names in Chinese | en, zh-TW · desktop | Options "English" (`lang="en"`) and "繁體中文" (`lang="zh-TW"`) in both languages 📷 |
| Taiwan browser (`zh-TW, en-US`) | prod · desktop | Opens in 繁體中文 📷 |
| Hong Kong browser (`zh-HK`) | prod | 繁體中文 |
| Unsupported first preference (`ja-JP, zh-TW`) | prod | 繁體中文 |
| Simplified Chinese browser (`zh-CN` only) | prod | English, and the control offers 繁體中文 📷 |
| Choice survives a reload | localhost · desktop | Picked 繁體中文, reloaded: still zh-TW |
| Choice holds across pages | localhost | Home in 繁體中文 → invite link: 加入遊戲桌 |
| Private window (storage throws) | prod | Switch works for the page (`lang="zh-TW"`); the next visit is back to the browser default (English) |
| Join page before joining | English · desktop | Control visible above the name field; choosing 繁體中文 switched the page 📷 |
| Keyboard only | join page | Shift+Tab to the trigger, Enter, Tab ×2 to 繁體中文, Enter: page switched, focus back on the trigger (`language-trigger 繁體中文`) |
| Join and table at phone width | zh-TW · 375px | Join card and the player's table in Chinese, no sideways scroll; 離開遊戲桌 in the sidebar 📷 |
| Language at the table | player · zh-TW · 375px | Settings › 語言 lists English / 繁體中文 (checked) with the "only you" note 📷 |
| Switch during play | player · desktop | Settings stayed open and re-labelled (設定 → Settings, tabs Audio/Graphics/Language), panels and condition markers (倒地/中毒 → Prone/Poisoned) switched, seq 17 unchanged; the second viewer logged nothing at either switch. GM side earlier: board label "Aria（已隱藏）" ↔ "Aria (hidden)" with no reload 📷 |
| Draft kept | GM token editor | Typed "Goblin Archer (edited)" and HP 42, switched language from another tab: labels became 名稱/HP/最大值, the typed values stayed, seq unchanged 📷 |
| Home page | zh-TW · 375px and desktop | Headings, buttons, footer links (隱私權政策, 服務條款) in Chinese; "Session Zero" kept 📷 |
| Accessible names | GM tool rail | Every control's name and tooltip in Chinese (see group 7 #2) |
| Document title | library | 素材庫 · Session Zero → Library · Session Zero → 素材庫 · Session Zero |
| Terms in Chinese | /terms | 服務條款 with "本頁為翻譯版本。如與英文版本有歧異，以英文版本為準。" and 顯示英文版本 → `/terms?lang=en` |
| Lang follows the choice; Language names marked | all of the above | `<html lang>` en ↔ zh-TW on every switch; option names carry their own `lang` |
| Token name unchanged | player · zh-TW | "Goblin Archer" label and roster entry unchanged 📷 |
| Chat unchanged | player · zh-TW | "Ready!" shown as sent 📷 |
| Built-in creature placed in Chinese | GM zh-TW → player en | GM placed 哥布林守衛 from 已存的生物; the English player sees 哥布林守衛 📷 |
| Blocked move in Chinese | player · zh-TW | Dragging Aria across a GM-drawn wall: 「無法進行這次移動。」, seq unchanged |
| Script client | node socket client, no language | `{"type":"rejected","code":"forbidden","message":"You are not allowed to do that","messageId":"reject.forbidden"}` |
| Wrong password in Chinese | sign-in · zh-TW | 「電子郵件或密碼不正確。」 under the password field 📷 |
| Field error in Chinese | sign-up · zh-TW | Email field: 「請輸入像 name@example.com 這樣的電子郵件地址」 📷. (First try with "a@b" was accepted by the server and created a throwaway local account "Tester" on the dev server's memory store) |
| Unsupported language | API | `Accept-Language: fr-FR` → 401 "Email or password is incorrect."; `zh-TW` → 401 「電子郵件或密碼不正確。」, `Content-Language: zh-TW`, `Vary: Accept-Language` |
| Move sentence in Chinese | GM log · zh-TW | 「Sam 將 Aria 從 (1723, 1033) 移到 (1723, 753)」 |
| Switch with the log open | GM log | Switched to English from another tab: the open log showed "Sam moved Aria from (1723, 1033) to (1723, 753)", dialog still open, seq unchanged |
| Chat time in Chinese | player | 「下午2:50」 |
| Relative time | dashboard · zh-TW | 「2 分鐘前活躍」 live; "3 天前" covered by `languageFormat.test.ts` |
| Board label in Chinese | GM board | Token 弓箭手 drawn with all three characters, no missing-glyph boxes (zoomed) 📷 |
| No font download | prod · zh-TW | Only the seven Geist woff2 files requested; "CJK Punctuation" is a local face |
| Condition name everywhere | GM · zh-TW | Token editor checkbox 倒地, marker tooltip 倒地, log 「Test GM 將 Aria 的狀態設為倒地、中毒」 |
| Leave table in Chinese | player · zh-TW | 離開遊戲桌 in the sidebar beside 你是 Sam; dialog behaviour in `language.test.tsx` |
| Missing translation blocks the build | dev | Adding `common.demoMissing` to the English catalog only: `tsc` fails with "Property '"common.demoMissing"' is missing … in zh-TW/common.ts"; reverted |
| Hard-coded label blocks lint | dev | `lintGuard.test.ts` (literal label, attributes, child conditionals/templates) |

**Found during the walk:** "你是 Sam (玩家)" used half-width parentheses; now `room.roleParen` gives 「（玩家）」 in Chinese. **Watch-out:** on a page that had taken dozens of hot-module updates, the player's Settings dialog closed on a switch; after a reload it stays open in both directions (and the GM's stayed open throughout), so this is a dev-server artifact, not app behaviour.

## 2026-11-10 — Native review (task 8.4)

**Reviewer:** Vincent Chen, with an AI-assisted pass. Every catalog (2,287 English/Chinese pairs: ten web areas, shared refusals and validation, server REST errors, and one sample sentence per activity event type) went into a review page, area by area. Vincent flagged 11 strings by hand. ChatGPT (Vincent's account, chat 「翻譯文案優化」) was asked to flag literal, translated-sounding Chinese and offer a clearer, fresher wording that keeps placeholders, glossary terms and full-width punctuation; it returned suggestions for all 13 areas.

**Sign-off:** Vincent accepted every suggestion ("accept to all"); where Vincent's own flag and ChatGPT's covered the same string, Vincent's wording won.

**Applied:**
- 1,065 catalog entries rewritten by script (plain strings, and templates whose placeholders could be placed unambiguously), 35 by hand (placeholders repeated or reordered, list joins, plural branches), and 49 activity sentences in `sentences.zh-TW.ts`
- Normalized while applying: 點擊 → 按一下, 保存 → 儲存 (Taiwan usage, per the glossary)
- Kept ChatGPT's 枚 for tokens and made it the one measure word: the 18 strings still on 個棋子 now say 枚棋子; recorded in the glossary's Token row
- Adjusted for meaning: the activity fallback for an undo with no entry reads 「復原了一項操作」, not 「上一項」 (the log can't know it was the last one); column/row pairs join with 、 (`common.listSep`), so fog regions read 「第 3～6 欄、第 2 列」
- Caught after applying: the preset refusals read 「自由模式模式目前未啟用 AC」 because the preset name already ends in 模式; they now use the name alone (「自由模式目前未啟用 AC。」). A scan of all 2,287 rendered strings for doubled words found no other placeholder doubling
- Tests that assert Chinese text were updated to the new wording (shared `activityLog`, `rejectionCatalog`, `sharedPhrases`; server `localizedRest`; web `language.test.tsx`)
- Re-ran `npm run lint && npm run typecheck && npm test` after the review: lint and typecheck clean; shared 1,345, server 650 (53 skipped), web 1,362, benchmark 2, all pass. One earlier server run under heavy machine load failed 6 unrelated files (accountDeletion, mapNuke, ownership, roomLoadFailure, uvttImport); all 6 passed when rerun alone and in this full run

## 2026-11-10 — Settings tabs: Language label spilled out of its tab

**Reported by Vincent** (screenshot, GM in a room, English): "🌐 Language" ran past its tab's right edge.

**Cause:** the four Settings tabs split the row into equal quarters (`flex: 1 1 0; min-width: 0`). The dialog is 448 px wide, because `dialog.modal`'s 28rem cap is more specific than `.client-settings-modal`'s 34rem, so each tab got 96 px, but the globe plus "Language" needs 123 px. Main had no globe, so the tab only overflowed once this change added it.

**Fix** (`styles.css`): the tab list is a grid with `grid-auto-columns: minmax(max-content, 1fr)`. Tabs stay equal width when they fit; a longer label keeps its natural width and the others share what's left. At 480 px and narrower it switches to two columns, with an odd last tab spanning both. The dialog width rule is the team's and is unchanged.

| Check (127.0.0.1:5473, GM in a room) | Result |
|---|---|
| English, 900 px viewport | Tabs 85.7 / 95.4 / 123.3 / 85.7 px; no tab's content wider than its box; row exactly fills its 414 px |
| 繁體中文, same width | Four equal 97.5 px tabs (音效 畫面 語言 遊戲桌); switched back to English afterwards |
| English, 375 × 812 | Two rows of two 148 px tabs; page width 375, no sideways scroll; screenshot taken |
| Three tabs (no Table), 375 px | Audio and Graphics side by side; Language spans the second row (303 px). Checked on a detached copy of the tab list, removed afterwards |

## 2026-11-11 — Merging main's AI game builder (PR #175)

Main merged the AI game builder and AI player seats while PR #174 was open, and GitHub reported conflicts.

- **Conflicts (5 files):** library tabs, the Share button, dice-look saving, the upload terms and the ADR index. Each kept both sides: main's new AI builds tab, the Share button's new copy handler and the dice-look allowance message, plus this branch's catalog text. The new terms bullet about AI apps is `terms.upload.ai`, translated.
- **ADR number:** main's ADR 0052 is AI player seats and 0053 is build passes, so this change's ADR is now **0054** (`docs/adr/0054-localized-messages.md`). Only this branch's references were renumbered: lines that also exist on main were left alone, so every remaining "ADR 0052" is main's.
- **Translated now:** the builder's server errors (19 entries; `localizedRest.test.ts` scans the source and found them), the Share dialog's "Play with your AI" section, the AI builds tab, New build and the page title. The messages pasted into an AI app stay in English, since they're instructions to the AI, like its tool descriptions.
- **Not translated yet (agreed with Vincent):** the builder's own screens (`apps/web/src/pages/build/`) and the owner messages the shared `checkBuild` writes. `NOT_YET_LOCALIZED` in `eslint.config.js` exempts that one folder from the guard, and `lintGuard.test.ts` pins the list. Translating them is a follow-up, because `checkBuild` would need to return message ids (a change to main's shared contract).

## 2026-11-11 — The AI game builder in Traditional Chinese (task group 9)

The follow-up to the PR #175 merge above: the builder's screens and the shared check's owner messages. Branch `feat/i18n-zh-tw-builder`, worktree `.claude/worktrees/fervent-hodgkin-6da9ef`, based on `feat/i18n-zh-tw` at `7053bd17`.

**English stays byte-identical.** Before touching `packages/shared/src/build.ts`, a scratch script (`baseline.mts` in the session scratchpad) wrote every message the shared build code produces to JSON: `checkBuild` for both audiences over a draft that raises every kind of issue (with and without a profile, with and without AI walls), `creatureProblems` both ways, `buildFieldLabel` for every known field and an unknown one, `describeDraftLine`, every `draftMapBoard` refusal, `mapSetupProblems`, `libraryBoardProblem`, and every `draftEncounterToTemplate` refusal including zod's. The same script after the change, with the new fields dropped: `diff` reports no difference (2,048 lines). The AI's issues also keep the same keys in the same order (`buildMessages.test.ts`), so `check_build`'s JSON is unchanged.

**Browser walk.** Isolated servers from this worktree (cwd checked with `lsof`): `builder-i18n-server` on 127.0.0.1:3401 (memory store, `SEED_DEV_ACCOUNT=1`) and `builder-i18n-web` on 127.0.0.1:5573 (`VTT_SERVER` → 3401). Two temporary entries were added to the worktree's `.claude/launch.json` and restored from a byte copy once both servers were up. Signed in with the seeded dev account; `vtt.locale` set to `zh-TW` on that origin.

| # | Step | Result |
|---|---|---|
| 1 | Library › AI 建置, no builds | Lead, "AI 建置的運作方式" steps, limits ("最多可同時進行 3 個建置。建置若 14 天沒有任何變更，就會關閉。") and empty state in Chinese |
| 2 | 新增建置 | Dialog 新增建置: lead, 建置名稱, AI 負責多少地圖設定 with its three choices, 分別選擇每一項, rights notice, 取消 / 開始建置 |
| 3 | Named it "Hollow Coast", chose 由 AI 設定網格、牆、門和窗, 開始建置 | Pass dialog 交給你的 AI in Chinese; the message in the textarea starts "Please help me set up a tabletop game in Session Zero." (English, for the AI) |
| 4 | **Found:** "請在關閉前複製。 它讓…" had a half-width space after 。, from the `<strong>…</strong> …` join | Fixed with `build.sentenceGap` (a space in English, none in Chinese) in the pass dialog, the files and publish leads and the remove dialog; rechecked after a reload: "…AI 就能看到。請只上傳…" |
| 5 | As the AI, from the page with the pass: a UVTT map (8 × 6 squares of 50 px, two openings, a wall 5 px off a grid line), a plain 700 px map with a proposed grid, a player character with blank HP and AC and a Max HP flag, a goblin, the AI's wall setup (opening 2 left for the user, a door line on the off-grid wall, a mark) and an encounter with an unplaced token | All saved (201/200). The AI's responses stay English ("HP is blank with no flag. Give a value, or flag it and say why.") |
| 6 | Reloaded the tab | Card: 通行碼有效 · 7 項待修正 · AI 設定網格和牆; "2 張地圖、2 個生物和 1 場遭遇尚未發布", "AI 留了 3 則備註", "AI 在 11月12日 上午11:16 前都能新增內容。", "最後變更：11月11日 上午11:17。若沒有任何變更，將於 11月25日關閉。", button 修正 7 項 named 「Hollow Coast」：修正 7 項 📷 |
| 7 | 修正 7 項 | Build page at 需要你處理: 待修正（7）and AI 留給你的備註（3）, every line from the shared check in Chinese (遊戲設定檔, HP／AC 空白, 網格正等你確認, 開口仍維持檔案原本的設定：1, 線段 1 blocked by a wall, Goblin 2 還沒有位置; 最大 HP：…, 開口 2 留給你處理, 第 5 欄、第 1 列留給你處理) 📷 |
| 8 | Rest of the page | Access, choices, files, maps (網格等你確認 / 網格已確認, 方格大小（px）, X 偏移, 確認網格), walls (summary, legend, opening and line selects 門／窗／牆 and 關閉／開啟／上鎖, 清除標記), creatures (玩家角色, HP 空白, 最大 HP 9, 未匯入的內容, 複製備註), encounter (地圖：Chandlery, 第 1 欄、第 0 列, 尚未放置, 玩家看得到這個名稱), publish and 捨棄這個建置: no English left except typed names, the AI's own flag text and field names in the card's flag list (`maxHp：…`, as English shows `maxHp: …`) |
| 9 | Ticked the encounter's 發布, 發布選取的項目（1） | 仍有 AI 的備註，要發布嗎？ with its body, 繼續檢查 / 仍要發布 |
| 10 | 仍要發布 | 422; the error, focused: 「遭遇 ambush：Goblin 2：它還沒有位置。請放置它，或將它移除。」(from `draftEncounterToTemplate`, formatted by the server in `zh-TW`) |
| 11 | Language menu › English, page open | Switched live, `<html lang="en">`, title "AI build · Session Zero"; summary and issue list read exactly as before ("Your AI has saved 2 maps, 2 creatures and 1 encounter. 7 things need fixing, and it left 3 notes for you. …"). The refusal already on screen stays Chinese: it is a REST response, request-scoped (ADR 0054) |
| 12 | Published again in English | "encounter ambush: Goblin 2: It has no square yet. Place it or remove it.", the same format as before |
| 13 | 375 × 812, Chinese, reloaded | `scrollWidth` 375, no sideways scroll; the walls list wraps (only the map preview's SVG pattern extends past the edge, clipped) |
| 14 | Requests while idle | 4 build requests in 11 s: the page's 5-second poll, no extra renders fetching |

**Tests added:** shared `buildMessages.test.ts` (68: refs vs English, every owner message in Chinese, AI unchanged, fields and lines, board problems, template problems, every `buildCheck.*` id in both languages with full-width punctuation); server `buildPublish.test.ts` "in the owner's language" (4: publish refusal in both languages, map grid needed, a publish conflict naming item kinds, the owner's map setup refusal) and `localizedRest.test.ts` (build store errors); web `language.test.tsx` "the AI game builder" (5: build page, live switch without refetching, builds tab and New build, pass dialog, draft editor) and `lintGuard.test.ts` (the build screens are linted). Six existing `toEqual`s on refusal objects in `build.test.ts` became `toMatchObject` for the new fields; the English they assert is unchanged.

**Checks:** `npm run lint && npm run typecheck && npm test` before the browser walk: lint and typecheck clean; shared 1,517, mcp 232, server 896 (53 skipped), web 1,453, benchmark 2, all pass. After the sentence-gap fix, two reruns of the web suite each failed 2 tests by timeout, different ones each time and none in files this change touches (map editor fog, grid detection editor, then UVTT placement and the home page grid). Load average was 23, then 56, from macOS background services (address book sync, storage management, Spotlight); single tests took 35 s to 14 minutes. The two first failures passed when rerun alone. A third full run was stopped as meaningless at that load. Then: `npm run lint` and `npm run typecheck` exit 0, and the test files that cover this change pass: shared `build`, `buildMessages`, `rejectionCatalog`, `i18n` (428); web `language`, `buildPage`, `libraryBuildsTab`, `lintGuard` (106); server `buildPublish`, `build`, `localizedRest`, `buildStore` (190). Once the load fell to about 10, `npm test` on the committed code (`3340bc64`) passed in full: shared 1,517, mcp 232, server 896 (53 skipped), web 1,453, benchmark 2.

**Cleanup:** `launch.json` restored (git clean); both servers stopped; `vtt.locale` removed from 127.0.0.1:5573. The memory store and its test account went with the server.

## 2026-11-10 — Final checks (task 8.6)

`npm run lint && npm run typecheck && npm test` from the worktree root: lint clean, typecheck clean; shared 1,345 tests, server 650 passed (53 skipped, as before), web 163 files / 1,362 tests, latency benchmark 2 — all pass.

## Cleanup

- [x] Removed the `i18n-server` and `i18n-web` entries from the main checkout's `.claude/launch.json` (targeted edit; file is byte-identical to the backup, git clean). The two servers keep running for review
- [x] Stop the two preview servers (`i18n-server` 3301, `i18n-web` 5473) — the app stopped both at 20:29 UTC; nothing listens on either port
- [x] Reset `vtt.theme` on `127.0.0.1:5473` back to `dark` (it was set to `light` for step 9)
