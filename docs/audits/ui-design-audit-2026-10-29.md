# UI design-conformance audit — 2026-10-29

Read-only audit of `apps/web` against `docs/FRONTEND-CONTRACT.md` §13 (wins on conflict) and `docs/INTERFACE.md` §11, plus CLAUDE.md invariants 3, 7, 8 and the Pixi boundary. Plan and method: `openspec/changes/archive/2026-10-29-audit-ui-design-conformance/` (design.md Decisions 1–9). No source file was modified.

## 1. Scope and environment

| Item | Value |
| --- | --- |
| Commit | `f3dd049ae892bebf4acebce6e454919a8bef6c32` on `feat/animation-preview-art` |
| Working tree | Six modified files outside `apps/web` (`.claude/launch.json`, `CLAUDE.md`, `README.md`, `docker-compose.yml`, `eslint.config.js`, `package.json`) and untracked `scripts/`; `apps/web` is as committed |
| Servers | `server-isolated` (:3101, in-memory store, seeded dev account) and `web-isolated` (:5273); the user's :3001/:5173 untouched |
| Participants | GM (seeded dev account) at `http://localhost:5273`; player "Auditor-P" at `http://127.0.0.1:5273` (separate origin storage); scripted player "Script-P" over socket.io |
| Browser | Claude desktop built-in browser (Chromium); viewports 375×812, 667×375, 800×600, 1024×768, 1280×800; mobile preset for coarse pointer |
| Static pass | Five read-only subagents (A, B+C, D, E, F); 203 candidates, every cited line re-read; 187 accepted and merged into the findings below, 8 dropped as unfounded, 8 moved to another principle, Not built or Doc conflicts |
| Result | **63 findings: 7 Blocker, 22 Major, 34 Minor.** 2 principles pass, 19 partial, 9 fail |

Severity (design.md Decision 3): **Blocker** = fails a WCAG 2.2 AA criterion in non-canvas UI, or breaches authority; **Major** = a CONTRACT/INTERFACE rule broken in a way users notice; **Minor** = token/style drift. Within a severity, findings are ordered by principle, then file.

### Status update — blockers fixed (2026-10-29, uncommitted)

All seven Blockers were fixed after the audit, in the working tree on `feat/animation-preview-art`. The summary and findings below still describe commit `f3dd049` as audited.

| ID | Fix | Verified by |
| --- | --- | --- |
| UI-001 | New `ui/MoveControl.tsx`: four one-square step buttons (board coordinates, one `cellSize` per step, off-map steps refused). Shown on the board's token card for anyone who may move the token, and in the owner's token editor (the keyboard path from the roster's Edit button). Uses `aria-disabled` so focus stays put between steps. The token card also has a "Move with arrow keys" switch (remembered in `vtt.ui.arrowKeyMove`, off by default): while it is on, the arrow keys move the selected token one square, except in fields, tab lists and other arrow-using widgets, open dialogs, and token placement | `test/moveControl.test.tsx`, `test/tokenEditor.test.tsx`; live: GM click and keyboard steps (seq 3→6), player keyboard step from the editor (seq 8→9), focus kept; arrow switch off → no move, on → right + down (seq 3→5), a focused tab and the search field keep their arrows, placement cursor unaffected |
| UI-002 | Share button named by its visible word, with the explanation as `aria-describedby`; replay "Back one step" / "Forward one step"; the attack roll button's name now starts with its visible text ("Roll to hit: Slash against Goblin") | Updated replay and attack tests; live: Share has no `aria-label` and has the description |
| UI-003 | HUD separator keeps the global focus ring; colour-wheel hex field draws a 2 px `--focus` ring via `:has(input:focus-visible)`; keyboard-active picker option gets an inset `--focus` ring | Live CSSOM shows the three rules as written; not exercised on screen (each needs a map or a second token in the test room) |
| UI-004 | Collapsed-sidebar selected tab adds weight 700 and a 3 px inset underline; an invalid hex colour shows "Enter a hex colour like #b3552d." tied by `aria-describedby` | `test/colorWheel.test.tsx`; live: computed weight 700 and inset shadow on the selected tab only |
| UI-005 | `--danger-strong #b5463d` for `danger-fill` (5.11:1); `--accent-text #e08a62` for the active badge (6.6:1); the grid warning uses `--warn`; avatar initials and DOM condition markers pick white or dark ink with `inkOn()` (every fill ≥4.55:1) | `test/color.test.ts`; live: Leave table button 5.11:1, avatar "F" dark ink on blue |
| UI-006 | Base `input, select` and `.picker-button` / `.sidebar-handle` borders use `--border-strong` (3.56:1 on panel) | Live: input border `rgb(106,114,128)` |
| UI-007 | `--accent` darkened `#b9582f` → `#b3552d` (accent-ink 4.70:1); base button hover darkens (`brightness(0.92)`, 5.37:1) instead of brightening (4.12:1); the hovered selected top-bar tab keeps accent-ink | Live: selected tab, hovered, `rgb(255,248,243)` on `rgb(179,85,45)` |

`docs/INTERFACE.md` §11.9 and `docs/FRONTEND-CONTRACT.md` §13.8 token notes were updated to match. `npm run lint`, `npm run typecheck` and `npm test` pass (720 shared, 488 server + 41 skipped, 934 web, 2 bench). Majors and Minors are unchanged.

### Status update — design language (2026-11-01, uncommitted, not yet merged)

The OpenSpec change `product-design-language` addresses the items below in the working tree on `main`. Its four PRs are not open yet, so none of this is merged. Each row names the change's task that did the work; `openspec/changes/product-design-language/verification-log.md` has the evidence.

| Item | What the change did | Task |
| --- | --- | --- |
| P2 Single rust accent, UI-009 | Buttons are neutral by default and `button.primary` is rust, one per page section, dialog or panel. Selected tabs, tools and segments are a raised neutral surface with a 2 px rust underline. The GM's avatar is no longer rust. UI-031 (the board's yellow active-turn ring, rust on banners and mentions) is **not** addressed. | 2.6, 2.7, 6.1 |
| P3 Spacing/radius/size scale, UI-032 | `--radius-control` (6px) and `--radius-surface` (12px) replace `--radius` and every literal radius, with circles for tokens and swatches. **Only the radius half:** the off-scale paddings and gaps remain. UI-033 (control heights) is **not** addressed. | 1.1, 2.5 |
| P4 Geist + tabular numerals, UI-034 | `--font-mono` is on `:root`. Every numeric readout is Geist Mono with tabular figures, board labels are Geist, and Alegreya is gone. | 2.2, 2.3, 2.4 |
| C5 | Geist on every surface, including the table and the board, with no Google Fonts request. INTERFACE §11.9 records it. | 2.2, 2.3, 2.9 |
| C12 | Light and dark on the home, entry and hub pages from `:root[data-theme="light"]`, set by route before paint. The table stays dark. INTERFACE §11.9 and FRONTEND-CONTRACT §13.8 record it. | 1.1, 1.2, 1.5, 4.8, 4.9 |

Verify each row against its merged PR before calling the item closed.

## 2. Summary

| # | Principle | Status | Findings | Note |
| --- | --- | --- | --- | --- |
| 1 | Colours via tokens | Partial | 2 | Room chrome is almost all tokens; a few chrome literals and two undefined tokens |
| 2 | Single rust accent | Fail | 2 | Base `button` is rust, so the accent marks most buttons and every selected state |
| 3 | Spacing/radius/size scale | Fail | 2 | Controls 32–36 px; coarse-pointer 44 px applies only below 720 wide; radii 4 px |
| 4 | Geist + tabular numerals | Partial | 1 | tabular-nums widely used; no Geist Mono in the room; room font is Alegreya (doc conflict) |
| 5 | Hairlines over cards | Partial | 1 | Panels flat with hairlines; black shadows and per-row cards remain |
| 6 | One icon family, no emoji | Partial | 1 | Phosphor is the only icon library and no emoji; glyph/hand-drawn icons and mixed weights |
| 7 | Motion and reduced motion | Partial | 3 | All keyframes transform/opacity and OS-gated; condition loops always on; some layout transitions |
| 8 | Breakpoints 720/1024 | Fail | 3 | No 1024 breakpoint; landscape-phone rule ignores height; 720 boundary off by one |
| 9 | dvh, safe area, no overflow, tabs, collapsed panel | Partial | 3 | No horizontal overflow and tabs never wrap (runtime); no safe area; collapsed panel loses status |
| 10 | Larger-screen message <720×480 | Fail | 1 | No larger-screen gate; editor opens squeezed at 667×375 |
| 11 | Refit only if camera untouched | Partial | 1 | Runtime pass (zoom kept across resize); auto-focus on others' attacks disables refit |
| 12 | Non-drag alternatives | Fail | 1 | Players cannot move a token without dragging (WCAG 2.5.7); initiative reorder not built |
| 13 | Escape and input-safe shortcuts | Partial | 3 | Board Escape guarded by `isTyping`; backdrop dismissal on; some listeners lack guards |
| 14 | Player sees player tools | Partial | 1 | Runtime: tools and DOM are role-correct, server refuses forbidden commands; Ping is not an explicit tool |
| 15 | Preview rate and expiry | Partial | 2 | 18.6 Hz measured (pass); ping 1.2 s and drag ghost 0.6 s expiries; previews not cleared on commit/disconnect |
| 16 | Four data states | Fail | 9 | No skeletons; several silent rejections; stuck 'Connecting…'; network failure reads as signed out |
| 17 | Button states | Partial | 6 | Base hover/pressed/disabled exist; pending states missing or label-swapping; double-sends possible |
| 18 | Destructive confirmations name target | Partial | 1 | Most destructive dialogs name their target (runtime Leave table pass); Reset link, discard and in-use delete do not |
| 19 | Native elements and labels | Fail | 2 | ~130 fields labelled; three label-in-name failures (WCAG 2.5.3) |
| 20 | Tabs and modal semantics | Partial | 3 | Modal (native dialog) and room tabs are complete; editor/library tabs, focus fallback and guide inert are not |
| 21 | Focus ring | Partial | 2 | Global 2 px `--focus` ring passes on accent fills (runtime); four controls suppress it |
| 22 | Colour never sole signal | Partial | 1 | Conditions, turn and HP carry text/shape; collapsed selected tab and hex error rely on colour alone |
| 23 | Keyboard token roster | Partial | 1 | Roster rows are buttons and Edit is reachable; roster selection doesn't open the inspector |
| 24 | Live regions | Fail | 3 | Connection region announces seq; no scene announcement; turn announcement only on the Play tab |
| 25 | Contrast | Fail | 4 | Accent-ink 4.44:1, text-on-accent 3.73:1, danger 3.17:1, inputs 1.23:1 (runtime) |
| 26 | Pixi stays in board/ | Pass | 0 | No pixi.js import outside board/; React talks to BoardView only |
| 27 | Commands only, can.* hints | Partial | 1 | All room writes go through commands and the server re-checks; one read-modify-write HP button |
| 28 | No local wire types | Partial | 1 | Many types derive from shared; ~15 local copies remain |
| 29 | No React render per pointer move | Partial | 2 | Board pointermove stays in Pixi; sidebar resize and colour wheel re-render Room per move |
| 30 | Board coordinates persisted | Pass | 0 | Every position passes through toBoard/toMap/getScreenCTM before a command |

Totals: 2 Pass, 19 Partial, 9 Fail, 0 Not built; findings sum to 63.

## 3. Findings

### Blocker

#### UI-001 · P12 Non-drag alternatives

- **Where:** apps/web/src/panels/TokenRoster.tsx:550-555; board/TokenCard.tsx; panels/TokenRoster.tsx:286
- **Doc:** §13.5 "A Move control supports grid-step directional buttons and numeric position fields as a non-drag alternative"; WCAG 2.2 SC 2.5.7
- **Observed:** Numeric Board X/Y fields exist only for the GM, inside the Advanced section; token owners have no non-drag way to move a token and there are no grid-step buttons. Runtime (rows 23–24): as player, Enter on the roster row opens nothing; the token card (opened by a canvas click) has HP/AC/Status/Edit only; the player editor has no position fields; clicking the token then an empty square only deselects (seq unchanged); only a drag moved it (seq 9→10)
- **Fix:** Add a Move control (direction buttons + numeric fields) to the token inspector for anyone who may move the token

#### UI-002 · P19 Native elements and labels

- **Where:** apps/web/src/ui/ShareButton.tsx:150-151; ui/ReplayBar.tsx:132,139; panels/AttackPanel.tsx:509
- **Doc:** SC 2.5.3 Label in Name (Level A)
- **Observed:** Visible "Share" button is named "Copy invite link. Anyone with it can join as a player."; visible "Back"/"Forward" are named "Previous step"/"Next step"; the attack roll button's aria-label replaces the visible "Rolling…/Roll damage 2d6+3"
- **Fix:** Start each accessible name with the visible text (e.g. "Share — copy invite link")

#### UI-003 · P21 Focus ring

- **Where:** apps/web/src/styles.css:2435, :478-483, :967
- **Doc:** SC 2.4.7 Focus Visible; §13.8 "2px `--focus` outline"
- **Observed:** Map-editor HUD separator replaces the ring with a 14%-alpha tint (`outline: none`); the colour-wheel hex input removes its outline and only shifts a 1 px border to rust (~1.04:1 luminance change); the keyboard-active picker option is shown by a 14% tint only
- **Fix:** Keep the global `:focus-visible` ring on these controls

#### UI-004 · P22 Colour never sole signal

- **Where:** apps/web/src/styles.css:184; styles.css:484 + ui/ColorWheel.tsx:145
- **Doc:** SC 1.4.1 Use of Color; SC 3.3.1; §11.9 "Status colours are never the only signal"
- **Observed:** With the sidebar collapsed, the selected top-bar tab differs from the others only by border hue (~1.04:1 luminance against `--border-strong`); an invalid hex colour is signalled only by a red border with no message
- **Fix:** Add a fill/underline/weight to the selected tab; show an error message for the hex field

#### UI-005 · P25 Contrast

- **Where:** apps/web/src/styles.css:1175, :540, :501; panels/ConditionMarker.tsx:31; ui/ParticipantsButton.tsx:209 + styles.css:191
- **Doc:** SC 1.4.3
- **Observed:** `button.danger-fill` (Leave table, Reset link, Remove, Delete) accent-ink on `--danger` = 3.17:1; "active turn"/"your turn" badges (rust text, 12 px) on panel = 3.70:1; `.grid-suggestion-warning` #b65c16 on panel = 3.73:1; white avatar initials at 11 px on `#c9892b`… ≈2.96–4.06:1 (static); 9 px white condition abbreviations on yellow/grey fills (static)
- **Fix:** Pick danger/badge/warn/avatar colours that clear 4.5:1 with their text

#### UI-006 · P25 Contrast

- **Where:** apps/web/src/styles.css:87 (base `input, select` border `--border`); also :946, :2384, :323, :1143
- **Doc:** SC 1.4.11 Non-text Contrast (3:1); §13.8 "control boundary uses `--border-strong`"
- **Observed:** Measured: room text fields and selects (e.g. attack Modifier, Label) have a #272c33 border = 1.23:1 against the panel, and their #0e1013 fill is 1.10:1 against it, so nothing identifies the field at 3:1 until hover
- **Fix:** Use `--border-strong` (3.56:1 on panel) for input/select boundaries

#### UI-007 · P25 Contrast

- **Where:** apps/web/src/styles.css:95,183,2292,2387,2456,899,992,606,610 (`--accent-ink` #fff8f3 on `--accent` #b9582f); styles.css:183 (`--text` on accent)
- **Doc:** README §6 WCAG 2.2 AA; SC 1.4.3 (4.5:1); §13.8 notes the 4.4:1 gap as a follow-up
- **Observed:** Measured in the room: every primary button and pressed rail label is 4.44:1 (New Token, Start encounter, To hit, rail "Select" at 12 px); the selected top-bar tab ("Play"/"Tokens", `--text` on rust, 13.6 px bold) is 3.73:1. The `:root` comment claiming 4.9:1 is wrong
- **Fix:** Darken `--accent` (≈ #a94f29 clears 4.5:1 for accent-ink) and use accent-ink on the selected tab

### Major

#### UI-008 · P1 Colours via tokens

- **Where:** apps/web/src/styles.css:1894,1880,1901 (tokens defined only at :1405-1406 under `.home-page`)
- **Doc:** §13.8 "control boundary uses `--border-strong`"
- **Observed:** `.icon-button` borders use `var(--control-border)` and hover uses `var(--hover)`, which exist only inside `.home-page`; in the room the declaration is invalid. Runtime: Create group / Edit Goblin icon buttons compute `border: 0px none` (row 15)
- **Fix:** Define these tokens on `:root` (or use `--border-strong`/`--raised`)

#### UI-009 · P2 Single rust accent

- **Where:** apps/web/src/styles.css:95; panels/AddToken.tsx:61,65; panels/RulingButtons.tsx:33; panels/ActivityLog.tsx:149; styles.css:183,2292,1880,2479
- **Doc:** §11.9 "a single warm accent that marks the one thing to act on"
- **Observed:** The base `button` rule fills every unclassed button with rust (104 of 288 `<button>` tags have no class), so e.g. "New Token" and "Saved Creatures" sit side by side both rust (runtime row 7), and "Load older" and every ruling "Hit" are rust; rust is also the generic pressed/selected and hover state (rail tools, top-bar tabs, editor steps, icon-button hover, zoom hover)
- **Fix:** Make the neutral style the default and opt the one primary action per view into `.primary`; mark selection with `--raised` + border/glyph

#### UI-010 · P7 Motion and reduced motion

- **Where:** apps/web/src/styles.css:693-695; board/EffectsOverlay.tsx:185-229; board/boardView.ts:1824
- **Doc:** §13.8 "Continuous decorative pulsing is removed"; §11.9 "Two things earn continuous motion"
- **Observed:** Conditions loop forever by default (pulse 1.6 s, float 2.4 s, glow 2 s; Pixi "tremble" loops too). Reduced motion (OS or in-app) does stop them: the glow only mounts with particles, which require `!reduced` (EffectsOverlay.tsx:150), confirmed at runtime (row 34)
- **Fix:** Make condition visuals static by default and animate only on request

#### UI-011 · P8 Breakpoints 720/1024

- **Where:** apps/web/src/styles.css:1063-1067
- **Doc:** §13.3 "Landscape phone: 240px side panel only with ≥360px board width and ≥320px usable height; otherwise collapsed panel opens as a sheet"
- **Observed:** At 667×375 the landscape rule gives a 280 px side panel and a 387×290 board (runtime row 10): height check missing, no sheet fallback, and the panel cannot be collapsed there (RoomPage.tsx:485, :612)
- **Fix:** Add the height condition and the sheet fallback

#### UI-012 · P9 dvh, safe area, no overflow, tabs, collapsed panel

- **Where:** apps/web/src/pages/RoomPage.tsx:629,635
- **Doc:** §13.3 "A collapsed panel retains an accessible opener and the connection indicator on the board"
- **Observed:** The only connection indicator lives in `.panel-body`, which is `hidden={collapsed}`; nothing on the board shows status when the sidebar is collapsed. Runtime (row 31): after "Hide sidebar" no "Connected" text is visible anywhere; the "Show sidebar" opener exists (aria-expanded=false) but is 18×56 px
- **Fix:** Render a compact status chip on the board while collapsed

#### UI-013 · P10 Larger-screen message <720×480

- **Where:** apps/web/src/pages/GmPanel.tsx:600; pages/mapEditor/LibraryMapEditor.tsx:110; styles.css:2468-2489; panels/CheckpointsPanel.tsx:155
- **Doc:** §13.3 "Detailed map upload/alignment, wall editing, fog drawing, scene replacement and checkpoint restore require at least a 720×480 CSS-pixel viewport. Show a clear larger-screen explanation"
- **Observed:** No viewport gate exists; the map editor is deliberately re-laid-out for phones and opened squeezed at 667×375 (runtime row 11); checkpoint restore and map replacement are offered at any size
- **Fix:** Gate these entry points below 720×480 with an explanation, keeping drafts

#### UI-014 · P13 Escape and input-safe shortcuts

- **Where:** apps/web/src/ui/Modal.tsx:76
- **Doc:** §13.3 "backdrop dismissal is disabled to avoid accidental closure"
- **Observed:** Every modal closes on a backdrop click (`if (e.target === e.currentTarget) onClose()`); during setup a stray click closed "Choose a map" silently (runtime row 7)
- **Fix:** Remove backdrop dismissal; keep Escape and Close

#### UI-015 · P14 Player sees player tools

- **Where:** apps/web/src/ui/ToolRail.tsx:23-31; board/boardView.ts:2438-2498
- **Doc:** §13.5 "Ping is an explicit tool with one click/tap, not a touch long-press dependency"
- **Observed:** Ping is not on the tool rail; it only fires on double-click/double-tap, discoverable only through the board hint
- **Fix:** Add Ping to the rail as a one-tap tool for both roles

#### UI-016 · P16 Four data states

- **Where:** apps/web/src/account/accountStore.ts:44-47
- **Doc:** §13.8 "offline keeps accepted content with a stale indicator"
- **Observed:** `loadAccount` treats any failure (including network) as signed out, so RequireAccount sends Dashboard/Library users to sign-in when the server is merely unreachable
- **Fix:** Distinguish 401 from network failure and show an offline state with retry

#### UI-017 · P16 Four data states

- **Where:** apps/web/src/board/Board.tsx:268-285; panels/MyTokens.tsx:103-112; ui/ParticipantsButton.tsx:81; net/roomConnection.ts:287
- **Doc:** §11.10 "A rejected command surfaces the server's reason"
- **Observed:** Area place/remove and fog add/remove rejections go to `console.warn` only; the player's HP quick-buttons and GM "Reset dice" discard the command result; non-auth server `error` messages are console-only
- **Fix:** Route these results to the existing inline error slots (Board.tsx:612 board message, token row)

#### UI-018 · P16 Four data states

- **Where:** apps/web/src/net/roomConnection.ts:123-131
- **Doc:** §11.10 Error/Offline; §13.8 "errors show a specific retry"
- **Observed:** `connect_error` only handles unauthorized/not_found/left/revoked/signed_out; any network error leaves status `connecting`, so RoomPage shows bare "Connecting…" (RoomPage.tsx:480) indefinitely with no error, retry or offline wording
- **Fix:** Map other connect errors to an `offline`/`retrying` status with a Retry action

#### UI-019 · P16 Four data states

- **Where:** apps/web/src/pages/GmDashboardPage.tsx:207-211 (also CheckpointsPanel.tsx:144, EncounterPanel.tsx:204, EncounterPreviewModal.tsx:70)
- **Doc:** §13.8 "errors show a specific retry when safe"
- **Observed:** "Your rooms could not be loaded…" has no Retry although the read is safe and a refresh counter exists (:33); preview read errors likewise have no retry
- **Fix:** Add a Retry button wired to the existing refresh

#### UI-020 · P16 Four data states

- **Where:** apps/web/src/pages/LibraryAnimations.tsx:80
- **Doc:** §11.10 Loading/Error
- **Observed:** `{!animations && "Loading…"}` has no failure branch, so a failed load shows "Loading…" forever (error only in the page banner)
- **Fix:** Track a failed state and show the error with Retry in place of the list

#### UI-021 · P16 Four data states

- **Where:** apps/web/src/pages/LibraryPage.tsx:170 (also :214, :115; LibraryAnimations.tsx:140,152)
- **Doc:** §11.10 "Error — inline and specific, next to the thing that failed"
- **Observed:** One page-level `role="alert"` banner carries three list-load failures, uploads, New encounter, and per-card rename/delete errors; none sits next to its item, none has a retry, and a network failure can show raw "Failed to fetch"
- **Fix:** Render errors on the card/list that failed, with Retry for loads

#### UI-022 · P17 Button states

- **Where:** apps/web/src/panels/InitiativeTracker.tsx:217, :224, :166
- **Doc:** §13.8 "Shared states: … pending"
- **Observed:** Next turn / End encounter / Start encounter have no pending or disabled state, so a double-click sends two `initiative.advance` commands
- **Fix:** Disable while the command is in flight and show "Advancing…" at fixed width

#### UI-023 · P20 Tabs and modal semantics

- **Where:** apps/web/src/pages/GmPanel.tsx:607-637; pages/mapEditor/LibraryMapEditor.tsx:111-121; pages/LibraryPage.tsx:173-189,238,259,280; pages/animationEditor/AnimationEditor.tsx:118-119
- **Doc:** §13.8 "Tabs support arrow navigation and associated tabpanels"
- **Observed:** Map-editor and library tabs have only `aria-selected`: no ids/`aria-controls`, no roving tabindex or arrow keys, unlabelled tabpanels, and the tablists contain non-tab buttons/alerts; library tabpanels are `<ul role="tabpanel">` (list semantics lost); the animation editor's `aria-controls` points at an unrendered id while Stage is open. The room panel tabs are the one complete implementation (RoomPanel.tsx:95-135)
- **Fix:** Reuse the room `PanelTabs` pattern

#### UI-024 · P20 Tabs and modal semantics

- **Where:** apps/web/src/ui/GuideTour.tsx:87-91,113-121
- **Doc:** §13.8 "Modal sheets have … inert background"
- **Observed:** The guide traps Tab in its card but nothing sets `inert`/`aria-hidden` on the page (grep finds "inert" only in a comment), so a screen-reader cursor reaches the background
- **Fix:** Set `inert` on the app root while the guide is open

#### UI-025 · P20 Tabs and modal semantics

- **Where:** apps/web/src/ui/Modal.tsx:40,62; panels/InitiativeTracker.tsx:96; pages/RoomPage.tsx:578; account/AccountPages.tsx:248; board/Board.tsx:621; ui/ParticipantsButton.tsx:166; pages/LibraryPage.tsx:493 (+4 similar inline alertdialogs)
- **Doc:** §13.8 "focus return; if the opener no longer exists, focus the closest stable heading/control"
- **Observed:** Modal returns focus only to the recorded opener with no fallback; openers that unmount (menu items, Start encounter, TokenCard Edit, removed participant row, deleted token row) drop focus to `<body>`; library inline `role="alertdialog"` confirms take no focus and have no Escape
- **Fix:** Add a fallback target (panel heading) and move focus into inline confirms

#### UI-026 · P23 Keyboard token roster

- **Where:** apps/web/src/panels/TokenRoster.tsx:286; board/Board.tsx:288,613
- **Doc:** §13.5 "Roster selection opens the same inspector"; FR-GM-24
- **Observed:** Activating a roster row only centres/highlights the token on the board; the token inspector (TokenCard) opens only from a canvas click, and the row exposes no selected state (`aria-pressed`/`aria-current`)
- **Fix:** Open the inspector from the roster and expose selection

#### UI-027 · P24 Live regions

- **Where:** apps/web/src/pages/RoomPage.tsx:258; panels/InitiativeTracker.tsx:210; panels/RoomPanel.tsx:257; ui/PanelSection.tsx:88; ui/TurnNotice.tsx:13
- **Doc:** §13.8 "Announce … active-turn changes and scene replacement"
- **Observed:** No live region announces a new map / applied template / restored checkpoint to anyone but the acting GM; the turn-change region exists only while the Play tab is shown and Initiative is expanded (and not with the sidebar collapsed)
- **Fix:** Add one always-mounted room announcer for turn and scene changes

#### UI-028 · P24 Live regions

- **Where:** apps/web/src/pages/RoomPage.tsx:635-636
- **Doc:** §13.8 "Do not announce seq increments"
- **Observed:** The connection line is `role="status"` and its text is `{STATUS_LABEL[status]} · seq {seq}`, so every committed event in the room is announced to screen-reader users
- **Fix:** Move `seq` out of the live region (or drop it from the visible label) and announce only status changes

#### UI-029 · P29 No React render per pointer move

- **Where:** apps/web/src/ui/PanelResizeHandle.tsx:35 → pages/RoomPage.tsx:321; ui/ColorWheel.tsx:111 → GridForm.tsx:236 → GmPanel.tsx:95 → RoomPage.tsx:272-278
- **Doc:** §13.6 "Do not send pointer updates through a whole-app React render loop"
- **Observed:** Every pointermove of a sidebar-resize drag calls Room's `setPanelWidth` (a `usePersistentState`, so it also writes localStorage synchronously) and re-renders the whole room tree; every move on the grid colour wheel sets Room's grid draft and preview, re-rendering Room and rebuilding the Pixi grid preview
- **Fix:** Keep drag values in a ref/CSS variable and commit on pointerup (or rAF-throttle locally)

### Minor

#### UI-030 · P1 Colours via tokens

- **Where:** apps/web/src/styles.css:501,498,207,223,179,2280,2297,2696; ui/ParticipantsButton.tsx:209 + styles.css:191; board/boardView.ts:2137,1718,223; Board.tsx:323; pages/mapEditor/WallCanvas.tsx:142; FogCanvas.tsx:302; MapGridPreview.tsx:492; panels/ConditionMarker.tsx:31-32,56; InitiativeTracker.tsx:201
- **Doc:** §11.9 "`styles.css :root` is the source of truth"
- **Observed:** UI-state colours as literals: `#b65c16` warning text (should be `--warn`), a non-existent `--line` token, `#14171b`/`rgba(18,20,23,.85)` grounds, off-palette avatar colours with `#fff` text, animation-editor `#3b82f6/#ef4444` on DOM buttons, board HP bar `0x22c55e/0xeab308/0xdc2626` diverging from `--ok/--warn/--danger`, selection `#ffd166` in the wall/fog editors (art colours exempt per design.md Decision 2)
- **Fix:** Replace chrome/state literals with tokens; add tokens where a new role is needed

#### UI-031 · P2 Single rust accent

- **Where:** apps/web/src/board/boardView.ts:2126; styles.css:630,927,988,599,606-619,2339,2546
- **Doc:** §11.9 accent = active turn; status colours "never decoration"
- **Observed:** The board's active-turn ring is hardcoded yellow `0xf1c40f`, not rust; `--warn` marks GM-only visibility (private rolls, private attack); `--accent` marks a warning note and decorates banners, mentions and own-message edges
- **Fix:** Use `--accent` for the active ring, a neutral/glyph for GM-only, `--warn` for warnings

#### UI-032 · P3 Spacing/radius/size scale

- **Where:** apps/web/src/styles.css (var(--radius) = 4px ×57; literal radii 2px ×14, 8px ×4, 10px ×3, 3px, 0.4rem, 24px); spacing 0.3rem ×32, 0.35rem ×29, 0.4rem ×22, 0.6rem ×18 …
- **Doc:** §13.8 radius 6 control / 12 overlay; spacing 4/8/12/16/24/32/48/64
- **Observed:** Overlays (popover, dialog, token card, chat popup, banners) and controls all use 4 px; dozens of off-scale paddings/gaps
- **Fix:** Set `--radius-control: 6px`, `--radius-overlay: 12px`; snap spacing to the scale

#### UI-033 · P3 Spacing/radius/size scale

- **Where:** apps/web/src/styles.css:90,178,222,1321,1870,1890,2285,1149; :1077-1080; :1053-1054
- **Doc:** §13.8 "Control height 40px regular; coarse-pointer hit area at least 44×44px"
- **Observed:** Base controls are 33.6 px (2.1rem); tool/tab/modal-close 32 px; the only `pointer: coarse` rule sets 40 px on three row classes and skips buttons, icon/tool buttons, chips and swatches; 44 px applies only below 720 wide, and there chips, `button.small` and `.tool-button` stay 36 px (sizes measured in 4.2)
- **Fix:** Raise the base to 40 px and add a coarse-pointer 44 px rule for all controls

#### UI-034 · P4 Geist + tabular numerals

- **Where:** apps/web/src/styles.css:1411 (`--font-mono` only in `.home-page`); :636,:845,:857,:2216,:1002,:679; board/TokenCard.tsx:40,65; panels/ActivityLog.tsx:145; board/boardView.ts:164
- **Doc:** §11.9 / §13.8 "Geist Mono … numeric values also set tabular figures"
- **Observed:** In the room `--font-mono` is undefined, so numbers (roll totals, HP, initiative, ruling totals) are Alegreya Sans with tabular-nums at best (runtime: `.hp` = Alegreya Sans + tabular-nums); TokenCard HP/initiative and ActivityLog `#seq` have no tabular-nums; board labels use Helvetica
- **Fix:** Define `--font-mono` on `:root` and apply mono + tabular to every numeric readout

#### UI-035 · P5 Hairlines over cards

- **Where:** apps/web/src/styles.css:575,585,2339,2546,2562,2477,520; :627,:596; pages/GmDashboardPage.tsx:105,200,269; styles.css:2402,2397,2415
- **Doc:** §11.9 "Group by hairline … A card is justified only when elevation means something … Shadows … tinted to the ground rather than black"
- **Observed:** Black shadows (`rgb(0 0 0 / .55)`, `rgba(0,0,0,.5)`) on chat, banners, replay bar, filters menu; every roll-log entry and chat line is a raised card; dashboard sections and the map-editor HUD are boxed cards without elevation meaning
- **Fix:** Use `--shadow`; separate rows with hairlines

#### UI-036 · P6 One icon family, no emoji

- **Where:** apps/web/src/ui/Modal.tsx:87; pages/RoomPage.tsx:712; ui/GuideTour.tsx:167; board/TokenCard.tsx:36; panels/InitiativeTracker.tsx:199; styles.css:367,1348,386-391; panels/GroupHeading.tsx:156; pages/mapEditor/MapCanvas.tsx:216-217; panels/ChatPanel.tsx:339
- **Doc:** §13.8 "Use one Phosphor outline icon family with a consistent optical stroke"
- **Observed:** Hand-drawn SVG close/chevron/guide icons, Unicode glyph icons (× close, ▶ active turn, ● status, ▸/▾ carets, "+"/"−" zoom), a CSS border-drawn chevron, and mixed Phosphor weights (20 bold, 5 duotone, 1 fill). No emoji found (pass)
- **Fix:** Use Phosphor regular for all icons

#### UI-037 · P7 Motion and reduced motion

- **Where:** apps/web/src/styles.css:1239-1240,883,96,1561,1863
- **Doc:** §11.9 "Animate transform and opacity only"
- **Observed:** Guide spotlight/card transition `left/top/width/height`; skip link transitions `top`; the global button transition animates filter and colours with no reduced-motion override
- **Fix:** Move to `transform`; drop colour transitions or gate them

#### UI-038 · P7 Motion and reduced motion

- **Where:** apps/web/src/styles.css:2220-2231 (roll-card), :820-826 (roll-total-in), :782-787 (die-card-in), :813 (dice-ghost spin)
- **Doc:** §13.8 "Reduce motion across … transitions"; app setting "Reduced animations"
- **Observed:** The in-app Reduced animations switch stops the 3D die tumble but not CSS entrance animations, which check only the OS media query; runtime row 35: `roll-card`/`roll-total-in` ran with the switch on
- **Fix:** Mirror the switch onto a root class (e.g. `.reduced-motion`) and gate these keyframes on it too

#### UI-039 · P8 Breakpoints 720/1024

- **Where:** apps/web/src/styles.css:1030; pages/RoomPage.tsx:58,70; styles.css:159,2312,2445,2485,2677
- **Doc:** §13.3 / §11.11 breakpoints 720 and 1024
- **Observed:** `max-width: 720px` puts exactly 720 px into the phone layout (tablet starts at 720); room/editor chrome also switches at 640, 760, 960 and 1100
- **Fix:** Use `max-width: 719.98px` and consolidate on 720/1024

#### UI-040 · P8 Breakpoints 720/1024

- **Where:** apps/web/src/styles.css:33; ui/PanelResizeHandle.tsx:8-9; RoomPage.tsx:509
- **Doc:** §13.3 "Desktop ≥1024: 320px right panel … Tablet 720–1023: 280px side panel only when board retains ≥440px width"
- **Observed:** No 1024 breakpoint: `--panel-width: clamp(17rem, 24vw, 22rem)` measured 272 px at 1024, 307 at 1280, 272 at 800; a dragged panel may take 60% of the window (board 320 px at 800 wide) and is re-clamped only on render
- **Fix:** Use 320/280 at the contract breakpoints and keep the board ≥440/640

#### UI-041 · P9 dvh, safe area, no overflow, tabs, collapsed panel

- **Where:** apps/web/index.html:5; apps/web/src/styles.css (no `env(safe-area-inset-*)`); styles.css:118
- **Doc:** §13.3 "Use 100dvh, safe-area padding"
- **Observed:** No safe-area padding anywhere and no `viewport-fit=cover` (so iOS insets the page instead of letting it fill); `.centered` loading/sign-in screens use `100vh` only
- **Fix:** Add `viewport-fit=cover` with safe-area padding on top bar, chat and banners; use `dvh`

#### UI-042 · P9 dvh, safe area, no overflow, tabs, collapsed panel

- **Where:** apps/web/src/styles.css:2382
- **Doc:** §13.3 "Tabs never wrap into ambiguous rows"
- **Observed:** `.map-editor-steps` is a `role="tablist"` (GmPanel.tsx:607, LibraryMapEditor.tsx:111, AnimationEditor.tsx:116) with `flex-wrap: wrap`
- **Fix:** Use nowrap with horizontal scroll or shorter labels

#### UI-043 · P11 Refit only if camera untouched

- **Where:** apps/web/src/board/boardView.ts:2016; ui/clientSettings.ts:15
- **Doc:** §11.11 "The board refits … only if the viewer has not positioned their own camera"
- **Observed:** Auto-focus on attacks (on by default) moves this viewer's camera to someone else's attack and sets `autoFit = false`, so later resizes stop refitting although the viewer never moved the camera
- **Fix:** Restore autoFit after the focus tween when the viewer had not moved the camera

#### UI-044 · P13 Escape and input-safe shortcuts

- **Where:** apps/web/src/board/Board.tsx:465; board/boardView.ts:480-484
- **Doc:** §13.5 "Escape cancels the current gesture … Pointer cancel … discards the gesture"
- **Observed:** With the Select tool there is no Escape listener, so Escape mid-drag doesn't cancel a token drag or pan; the stage has no `pointercancel` handling (static only; not reproducible without touch hardware)
- **Fix:** Handle Escape and pointercancel in the select gesture

#### UI-045 · P13 Escape and input-safe shortcuts

- **Where:** apps/web/src/ui/GuideTour.tsx:53-56; board/BoardFilters.tsx:25; pages/MapGridPreview.tsx:149-163; ui/Modal.tsx:66
- **Doc:** §13.5 "Escape cancels the current gesture before closing a containing sheet"; §13.8 "No global shortcut fires while typing"
- **Observed:** GuideTour, BoardFilters and MapGridPreview attach document-level key listeners without a typing guard; Modal closes on any Escape without checking `defaultPrevented`, so Escape mid grid-anchor drag closes the editor
- **Fix:** Add the `isTyping` guard (Board.tsx:137) and respect `defaultPrevented`

#### UI-046 · P15 Preview rate and expiry

- **Where:** apps/web/src/board/Board.tsx:262; net/roomConnection.ts:118-121; board/boardView.ts:669
- **Doc:** §13.5 "Clear a preview on commit/cancel/disconnect/scene change"
- **Observed:** On commit or pinch-cancel the sender sends one more position instead of a clear; disconnect, snapshot and scene change don't clear remote ghosts/aims (they rely on the timeouts)
- **Fix:** Send an explicit clear and drop remote previews on disconnect/scene change

#### UI-047 · P15 Preview rate and expiry

- **Where:** apps/web/src/board/ping.ts:2; board/boardView.ts:926
- **Doc:** §13.5 "Token/ruler/AoE previews expire after one second … pings expire after 1.5 seconds"
- **Observed:** `PING_MS = 1200` (comment reads 1.5 s as a ceiling); remote drag ghosts expire after 600 ms (`ghost.expires = now + 600`)
- **Fix:** Set 1500 and 1000

#### UI-048 · P16 Four data states

- **Where:** apps/web/src/pages/GmDashboardPage.tsx:190-191; pages/DiceLooks.tsx:87; pages/JoinPage.tsx:34-37
- **Doc:** §11.10 Error
- **Observed:** Room delete discards the server's reason ("could not be deleted. Try again." with no retry button); dice-look delete is optimistic and silently reappears on failure; the join-page seat lookup fails silently and swaps the form later
- **Fix:** Show the server message; keep failures visible

#### UI-049 · P16 Four data states

- **Where:** apps/web/src/pages/GmDashboardPage.tsx:202-206; RoomPage.tsx:123,480; LibraryPage.tsx:230,251,272; EncounterPanel.tsx:135; DiceLooks.tsx:39; account/RequireAccount.tsx:24
- **Doc:** §11.10 "Loading — skeletons shaped like the content … No spinners"; §13.8 container exposes busy
- **Observed:** No surface has a content-shaped skeleton: loading is a "Loading…/Connecting…" text line with `aria-busy` on the text itself, or a blank page while the account loads (RequireAccount returns null). No spinners (pass)
- **Fix:** Add row/panel-shaped skeletons and put `aria-busy` on the list container

#### UI-050 · P16 Four data states

- **Where:** apps/web/src/panels/TokenRoster.tsx:205,216; EncounterPanel.tsx:37,137; CheckpointsPanel.tsx:120; ui/diceSkinStore.ts:52; board (no map)
- **Doc:** §11.10 "Empty — says what to do next … The empty table and empty roster are the first thing a new GM sees"
- **Observed:** "No tokens yet.", "No templates yet.", "No checkpoints yet." name no next action; the board with no map shows only the pan/zoom hint; a failed template or dice-look load falls through to the empty state
- **Fix:** Name the next action ("Add one with New Token below"); keep failures out of empty states

#### UI-051 · P17 Button states

- **Where:** apps/web/src/pages/LibraryPage.tsx:528
- **Doc:** §13.8 pending visible
- **Observed:** Library delete's pending state ("Checking…/Deleting…") exists only in the icon button's tooltip/aria-label; nothing visible changes and the confirm Delete is never disabled
- **Fix:** Show visible pending text and disable confirm

#### UI-052 · P17 Button states

- **Where:** apps/web/src/panels/TokenRoster.tsx:591,603-605; GroupHeading.tsx:91,103,112,144; CheckpointsPanel.tsx:113,155,170; EncounterPanel.tsx:128,166,185
- **Doc:** §13.8 pending state
- **Observed:** Delete token and group actions have no pending/disabled state (double-send possible); checkpoint/template buttons disable but show no text while pending
- **Fix:** Disable during the request and show the pending text

#### UI-053 · P17 Button states

- **Where:** apps/web/src/panels/TokenRoster.tsx:631; GroupHeading.tsx:52,56; ChatPanel.tsx:313; LibraryCreatures.tsx:170; GmPanel.tsx:670
- **Doc:** §13.8 "Disabled actions explain why when it is not self-evident"
- **Observed:** Save, Add tokens, Hide all, Send (offline after typing), Add attack at limit and Export without a map are disabled with no reason
- **Fix:** Add `title`/adjacent text with the reason

#### UI-054 · P17 Button states

- **Where:** apps/web/src/styles.css:1880,1885,1365,1901-1902; styles.css:1147-1153
- **Doc:** §13.8 shared states
- **Observed:** `.icon-button:hover`/`:active` lack `:not(:disabled)`, so disabled icon buttons still highlight; `.upload-button` has no hover/pressed/disabled styles and keeps a pointer cursor when disabled
- **Fix:** Scope hover/active to `:not(:disabled)`; add upload-button states

#### UI-055 · P17 Button states

- **Where:** apps/web/src/ui/ShareButton.tsx:142; GmDashboardPage.tsx:162; JoinPage.tsx:62 (+12 similar)
- **Doc:** §13.8 "Pending buttons retain label/width and show a textual action state"
- **Observed:** Pending/result states replace the label with different-width text ("Open"→"Opening…", "Share"→"Copy failed"), and JoinPage drops the person's name
- **Fix:** Keep the label and add the state beside it, or fix the width

#### UI-056 · P18 Destructive confirmations name target

- **Where:** apps/web/src/ui/ShareButton.tsx:186-193; pages/LibraryPage.tsx:494-511; encounterEdit/EncounterEditBar.tsx:175-177,207-209; animationEditor/AnimationEditor.tsx:225
- **Doc:** §13.8 "Destructive confirmations identify the affected room/person/scene"
- **Observed:** "Reset the invite link?" never names the room; the in-use asset delete names the users but not the asset; "Discard changes?" dialogs don't name the template/animation
- **Fix:** Put the target's name in the title/body

#### UI-057 · P19 Native elements and labels

- **Where:** apps/web/src/panels/CheckpointsPanel.tsx:106-108; panels/EncounterPanel.tsx:120; pages/mapEditor/MapCanvas.tsx:216-217; pages/mapEditor/FogSetup.tsx:67; WallSetup.tsx:252,257,414,421; board/BoardFilters.tsx:41; ui/ToolRail.tsx:112
- **Doc:** §13.8 "Label every field and icon-only control"; native semantics
- **Observed:** Checkpoint/template name fields show only a placeholder (sr-only label); editor zoom buttons are named "+"/"−"; custom radiogroups lack arrow keys; filters button claims `aria-haspopup` menu for a checkbox group; the vertical toolbar has no arrow keys and at ≤640 px names tools by `title` only
- **Fix:** Visible labels, "Zoom in/out" names, native radios, correct popup role

#### UI-058 · P21 Focus ring

- **Where:** apps/web/src/styles.css:312, :2070, :1281
- **Doc:** §13.8 focus ring
- **Observed:** Panel-resize separator fades the ring with `opacity: .6`; home segmented control uses an inset ring on rust (~1.8:1); a focused grid anchor looks identical to a selected one
- **Fix:** Keep the outer `--focus` ring

#### UI-059 · P24 Live regions

- **Where:** apps/web/src/ui/RollCard.tsx:16; panels/DicePanel.tsx:185,339
- **Doc:** §13.8 "restrained live regions"
- **Observed:** Every roll is announced by a `role="status"` board popup and again by the Dice tab's `aria-live` log, plus a roll-count status
- **Fix:** Announce each roll once

#### UI-060 · P25 Contrast

- **Where:** apps/web/src/styles.css:236, :2460
- **Doc:** SC 1.4.3
- **Observed:** `.board-hint` 12 px muted text sits directly on map art with no backing; `.map-editor-unavailable` fades the explanation text itself to 60%
- **Fix:** Give the hint a backing surface; fade only the control

#### UI-061 · P27 Commands only, can.* hints

- **Where:** apps/web/src/panels/MyTokens.tsx:103-111
- **Doc:** CLAUDE.md invariant 1; §13.6 "Keep pending commands … separate from accepted state"
- **Observed:** HP quick buttons send an absolute HP computed from the rendered token, so two quick clicks send the same value and one delta is lost (and rejections are discarded, see the D finding)
- **Fix:** Disable until acked, or send a delta command

#### UI-062 · P28 No local wire types

- **Where:** apps/web/src/panels/attackRoll.ts:10-14,92,126; board/boardView.ts:64,82; board/diceDrops.ts:7; panels/RulingsPanel.tsx:79; board/effects.ts:17; ui/guide.ts:9; board/previewStage.ts:35; ui/diceGeometry.ts:17; ui/diceSkin.ts:15,24; pages/mapEditor/WallProperties.tsx:44,48; pages/mapEditor/FogSetup.tsx:37; net/roomConnection.ts:38-42
- **Doc:** CLAUDE.md "Wire/domain schemas remain in packages/shared; do not create parallel local definitions" (§13.6)
- **Observed:** Local copies of shared types and limits: `AttackDice`, `DIE_SIDES`, `MAX_ATTACK_DICE/MODIFIER`, `MAX_PRESETS` (shared `attackPresets.ts:6-14`), `AimPreview` and `placeTemplate` args (protocol.ts:39-48, commands.ts:254), `DiceDrop` (protocol.ts:31), `"hit" | "miss"` (`Verdict`, dice.ts:51), `"public" | "gm"` (`DiceVisibility`, dice.ts:28), `Role` (state.ts:13), `Point` (geometry.ts:7), die names (`DieName`, diceLooks.ts:9), portal kind/state casts (`PortalKind/PortalState`, state.ts:187-191), fog command variants (commands.ts:309-331), `CommandResult` widening `RejectionCode` to `string`
- **Fix:** Import or derive (`z.infer`, `Extract<Command,…>`) from `packages/shared`

#### UI-063 · P29 No React render per pointer move

- **Where:** apps/web/src/ui/ReplayBar.tsx:153; panels/ChatPanel.tsx:233; pages/mapEditor/WallCanvas.tsx:72; MapCanvas.tsx:157; HudLayout.tsx:43
- **Doc:** §13.6
- **Observed:** Replay slider steps re-render Room with a new state; chat-bubble drag re-renders ChatPanel and writes localStorage per move; wall editor hover/pan re-render all walls as SVG per move without memo; HUD resize writes localStorage per move
- **Fix:** rAF-throttle and memoise; persist on pointerup

## 4. Not built

These surfaces don't exist, so the rules that govern them were not scored as violations (design.md Decision 4).

| Contract item | Source | What exists instead |
| --- | --- | --- |
| Routed sheets `/r/:roomId/prepare`, `/log`, `/settings` with a room session provider above them; Back closes a sheet | CONTRACT §13.3 "Sheets and routes" | `router.ts` matches only `/r/:roomId`; preparation, log and settings are modals/panels inside the room |
| Initiative reordering (drag plus Move up / Move down) | CONTRACT §13.5 | No reorder at all: `packages/shared` has only `initiative.start/advance/end`; rows are focus buttons (P12) |
| Preview scene ID, per-sender generation and counter; discard stale/out-of-order previews | CONTRACT §13.5 | `EphemeralPayload` (`protocol.ts:22-60`) carries none of these (P15) |
| Shared ruler preview | CONTRACT §13.5 "Token/ruler/AoE previews expire after one second" | Measurement is local only (`board/tools.ts:8-9`) |
| AoE preview → Place / Cancel step with numeric size/angle | CONTRACT §13.5 | AoE commits on pointer-up (`boardView.ts:1120-1123`) |
| Layer administration separate from tool selection | CONTRACT §13.5 | Not present; fog/walls live in the GM map editor |
| Hub navigation: 224 px side nav, labelled menu sheet below 720 | CONTRACT §13.3 "Hub" | `/gm-dashboard` uses a wrapping `.home-nav` (`GmDashboardPage.tsx:52`) |
| Bottom panel 40 % of height, expandable to 70 % | CONTRACT §13.3 | Deliberate page scroll on phones; see Doc conflicts |

## 5. Doc conflicts

Places where the docs contradict each other, or where the code deliberately differs from the docs. FRONTEND-CONTRACT wins between documents; the audit doesn't decide code-versus-doc conflicts, only lists them.

| # | Conflict | References |
| --- | --- | --- |
| C1 | Route names: the docs use `/login`, `/rooms`, `/r/:id/prepare`, `/r/:id/log`; the app serves `/signin`, `/signup`, `/gm-dashboard`, `/library`, `/encounters/edit/:id`, `/r/:roomId` | INTERFACE §11.2–§11.3, CONTRACT §13.1/§13.3 vs `apps/web/src/router.ts:14-28` |
| C2 | `/library` and its "Asset library" navigation are built and linked from the dashboard, although §13.1 says saved assets and `/library` are deferred and their navigation omitted | CONTRACT §13.1, INTERFACE §11.2 ("Deferred — do not build") vs `router.ts:17`, `GmDashboardPage.tsx:53` |
| C3 | INTERFACE §11.2's inventory is stale: it lists sign-in/sign-up and the room hub as "Missing" and Home as "a bare create form only"; all three exist | INTERFACE §11.2 vs `AccountPages.tsx`, `GmDashboardPage.tsx`, `HomePage.tsx` |
| C4 | Sub-surfaces "open as overlays rather than page navigations" vs "Opening a sheet pushes a route" | INTERFACE §11.3 vs CONTRACT §13.3 |
| C5 | Typography: the docs name `--font-ui: "Geist"` and `--font-mono` for the whole UI; `:root` defines `--font-ui: "Geist Sans"` for home/GM pages only, "the room keeps Alegreya" (`--font-body: "Alegreya Sans"`, labels "Alegreya Sans SC"), and no `--font-mono` outside `.home-page` | INTERFACE §11.9, CONTRACT §13.8 vs `styles.css:1-46,1411` |
| C6 | Icons: "Phosphor or Radix, stroke 1.5" vs "one Phosphor outline family" | INTERFACE §11.9 vs CONTRACT §13.8 (contract wins) |
| C7 | Motion: "spring physics for anything the user drags or drops" vs "do not spring an authoritative token through misleading intermediate positions" | INTERFACE §11.9 vs CONTRACT §13.8 |
| C8 | Accent-ink contrast: docs say 4.4:1, the `:root` comment says "white text 4.9:1"; measured 4.44:1 | INTERFACE §11.9, CONTRACT §13.8 vs `styles.css:14` |
| C9 | Phone layout: the code deliberately lets the whole page scroll ("The page scrolls on a phone, not a nested panel") instead of a 40 % bottom panel, expandable to 70 %, that scrolls on its own | CONTRACT §13.3 vs `styles.css:1030-1045` |
| C10 | Freehand drawing ships (brush is the default Draw shape) although §13.5 says "Freehand remains out of scope" | CONTRACT §13.5 vs `ui/ToolRail.tsx:15` |
| C11 | Ping duration: `PING_MS = 1200` with the comment "Within the spec's 1.5 s" reads 1.5 s as a ceiling; §13.5 says pings "expire after 1.5 seconds" | CONTRACT §13.5 vs `board/ping.ts:1-2` |
| C12 | Light theme exists only for the home page (`:root[data-theme="light"] .home-page`); the token table in §11.9 is dark-only and the room has no light theme | INTERFACE §11.9 vs `styles.css:1417` |
| C13 | `openspec/config.yaml` project context still says "Account sign-in is planned, not yet implemented"; accounts and sign-in are built | `openspec/config.yaml:25` vs `apps/web/src/account/*` |

## 6. Limitations

- **Reduced motion.** The built-in browser can't emulate `prefers-reduced-motion`, so CSS `@media (prefers-reduced-motion)` rules were checked statically only. JS paths were exercised through the in-app setting and a page-context `matchMedia` override; paths that read the query at load and then rely on a `change` listener (`board/boardView.ts:419`, `board/EffectsOverlay.tsx:62`) were **not runtime-verified**. Ping, attack and nuke animations draw on the Pixi canvas and can't be observed through `document.getAnimations()`; they rest on the static reduced paths (`fx.ts:165-171`, `nukeFx.ts:76`, `ping.ts:12`).
- **Timing.** Preview and ping expiry (P15) come from code constants, not runtime measurement. The 20 Hz rate was measured (18.6 Hz).
- **Loading and pending states.** No network throttling, and local requests finish almost instantly, so loading screens other than the first "Loading…" and every pending button state were checked statically.
- **Touch.** `pointercancel`, pinch and two-finger gestures weren't testable with mouse automation. Coarse-pointer sizes used the mobile preset.
- **Contrast.** The walker skips text over images or canvas (token labels on map art, the board hint) and disabled controls. Avatar-initial and condition-marker ratios are static calculations.
- **Assistive technology.** No real screen reader was used. Live-region conclusions come from the DOM and code.
- **Browsers.** Chromium only; Firefox, Safari and iOS weren't covered.
- **State loss.** Restarting the in-memory server for the offline check destroyed the test room, so reconnect into a surviving room wasn't observed.
- **Dirty tree.** The six modified files are outside `apps/web`, so they don't affect what was audited.

## 7. Verification log

Copied from `openspec/changes/archive/2026-10-29-audit-ui-design-conformance/verification-log.md`.

### Baseline (task 1.1)

| Item | Value |
| --- | --- |
| Date | 2026-10-29 |
| Commit | `f3dd049ae892bebf4acebce6e454919a8bef6c32` |
| Branch | `feat/animation-preview-art` |
| `git diff \| shasum` | `070c600df6eab3bb9a883855911204da6d92846a` |

`git status --porcelain` before any audit step (pre-existing, not ours):

```
 M .claude/launch.json
 M CLAUDE.md
 M README.md
 M docker-compose.yml
 M eslint.config.js
 M package.json
?? openspec/changes/archive/2026-10-29-audit-ui-design-conformance/
?? scripts/
```

Allowed after the audit: the same list plus `docs/audits/` (new), with the diff hash unchanged.

### Steps

| # | Task | Action | Observation |
| --- | --- | --- | --- |
| 1 | 1.1 | `git rev-parse HEAD`, `git status --porcelain`, `git diff \| shasum` | Baseline recorded above; six modified tracked files plus untracked `scripts/` and this change |
| 2 | 1.2 | Created `docs/audits/ui-design-audit-2026-10-29.md` skeleton | 30 summary rows "pending", 7 `##` sections |
| 3 | 1.3 | Re-read CONTRACT §13.3/§13.5/§13.6/§13.8, INTERFACE §11.3/§11.9–§11.11, CLAUDE.md invariants 3/7/8, `styles.css :root` | Wording differences vs the design.md principle text, carried to Doc conflicts: (a) §11.9 names `--font-ui: "Geist"` + `--font-mono`; `:root` defines `--font-ui: "Geist Sans"`, no `--font-mono`, and body/room font `--font-body: "Alegreya Sans"`. (b) §11.9 allows "Phosphor or Radix", stroke 1.5; §13.8 requires one Phosphor outline family (contract wins). (c) §11.9 "spring physics for anything dragged" vs §13.8 "do not spring an authoritative token through misleading intermediate positions". (d) §11.3 "sub-surfaces open as overlays rather than page navigations" vs §13.3 "opening a sheet pushes a route". (e) `:root` comment says accent ink on rust is 4.9:1; §11.9/§13.8 say 4.4:1 — measured in 4.2. (f) `--radius: 4px` vs §13.8 6px control / 12px overlay. (g) Light theme tokens exist only under `.home-page` |
| 4 | 2.1 | Dispatched five read-only Explore subagents: A (1–7), B+C (8–15), D (16–18), E (19–25), F (26–30) | Candidate counts logged when each returns (rows below) |
| 5 | 2.7 | Static reduced-motion inventory: `grep prefers-reduced-motion\|reducedAnimations` over `apps/web/src` | **CSS:** 17 media blocks in `styles.css`; 13 `@keyframes`, all transform/opacity only. Infinite animations: `.condition-pulse/-float/-glow` (styles.css:693–695, stopped only by the OS query at :699) and `.dice-ghost .die3d` spin while a die is held (:813, OS query only). **JS read per call (covered by a runtime `matchMedia` override):** `ui/Die3D.tsx:177`, `board/animationPreview.ts:368` (nuke shake), `pages/mapEditor/FogCanvas.tsx:70`, `pages/RoomPage.tsx:495`, `board/effects.ts:157` default arg. **JS read at load and updated only by a `change` listener (NOT covered by an override; carried to Limitations):** `board/boardView.ts:419` `osReduced`, `board/EffectsOverlay.tsx:62` `useState(prefersReducedMotion)`. **In-app `reducedAnimations` setting** is read per call by boardView.ts:422, effects.ts:157, EffectsOverlay.tsx:64, Die3D.tsx:177, but CSS-only rules (`.condition-glow` applied unconditionally at EffectsOverlay.tsx:229, dice-ghost spin) ignore it |
| 6 | 3.1 | `preview_start server-isolated`, `preview_start web-isolated` | Server log: "DATABASE_URL unset — using in-memory store", "seeded dev account", "server on http://localhost:3101". Vite ready on :5273 (strictPort). User's :3001/:5173 not started or touched. Built-in browser tabs: `tab-1` = GM at `http://localhost:5273`; server-root tab closed |
| 7 | 3.2 | GM tab `localhost:5273/signin` → seeded dev account (loopback, value not recorded) → `/gm-dashboard` → "Create room" "Audit Room" | Dashboard empty state read: "No rooms yet. Create your first one and send your players the link." Room `0e2f769e-b02e-4598-b798-93a80b8a4fa9` created (seq 2). Manage → From library → "Choose a map" modal → The Broken Span placed (3344×1882). Tokens → New Token "Goblin" → Choose a square → three clicks → Goblin, Goblin 2, Goblin 3 (seq 6). Invite code `dqa5pxf89m` read from the room's saved credentials. Note: the first From-library click opened the modal; a follow-up click landed on the backdrop and closed it silently (backdrop dismissal, see Modal.tsx) |
| 8 | 3.3 | Player tab `127.0.0.1:5273/join/dqa5pxf89m` → name "Auditor-P" → Join; GM edits Goblin → Controlled by Auditor-P → Save → confirmation "Save changes to Goblin? Everyone in the room sees the update." → Confirm | Player lands on `/r/0e2f…` as "Auditor-P (player)", seq 8, has "Edit Goblin" only. GM tab after join still "You are Test GM (GM)", "Participants, 2" → origins keep separate storage. Player tool rail: Select, Measure, Draw, AoE, Eraser, Clear (no Fog); tabs Play/Tokens/Dice (no Manage) |
| 9 | 3.4 | Wrote scratchpad `audit/player.mjs` (socket.io-client from `apps/web` deps; joins via `POST /api/invites/:code/join`, connects with `auth: { roomId, guestToken }`, timestamps every server message to `events.jsonl`, sends lines appended to `cmd.jsonl`); ran `node player.mjs dqa5pxf89m Script-P` in background | `join` 200 → `connect` → `welcome` as player "Script-P", seq 9, 3 tokens |
| 10 | 4.1 | GM `tab-1` and player `tab-2`: `resize_window` 1024×768 (default), 1280×800, 800×600, 667×375, 375×812; page-context probe of `documentElement.scrollWidth/scrollHeight`, canvas and `aside.panel` rects, `[role=tab]` tops, connection label rect, sidebar opener | **No horizontal overflow at any size, tabs never wrap (both roles).** Panel width: 272 px at 1024, 307 at 1280 (§13.3: 320), 272 at 800 (§13.3 tablet: 280), 280 side panel at 667×375 with board 387×290 (§13.3 landscape: 240 px side panel only if board ≥360 wide and ≥320 tall, else a sheet → height 290 fails the condition). 375×812: board 375×374 on top, panel below; page `scrollHeight` 969 (GM) / 861 (player) > 812, so the whole page scrolls (`styles.css:1037` "The page scrolls on a phone, not a nested panel"); no collapse control below 720 (opener `null`). Connection label visible at every size. No `env(safe-area-inset-*)` anywhere in `styles.css` (grep). Top bar wraps to 2 rows at ≤800. GM chat button: a dragged spot saved in `vtt.ui.chatSpot` `{right:615,bottom:537}` from an earlier session lands over the Home link at 667×375 and over the tool rail at 375×812 (elementsFromPoint confirmed the chat button on top). Player (default spot) chat button at 375×812 sits over the token rows |
| 11 | 4.1 (10) | GM at 667×375 → Manage → Manage Walls | Full-screen "Edit map" editor opens squeezed (board strip ~290 px tall, tools below); no larger-screen message; grep for "larger screen"/720×480 thresholds finds none. Escape closed it, focus returned to "Manage Walls" |
| 12 | 4.1 (11) | Player at 1280×800: wheel-zoom ×5 on the board, then resize to 1024×700 | Zoomed camera kept after the resize (no refit). Untouched cameras refit on every earlier resize → pass |
| 13 | 2.4 | Group D subagent returned 39 candidates plus a surface×state table; re-read every cited line range (two `sed -n` batches over 30 files) | 37 accepted, merged into 17 findings; 0 dropped; 2 moved: "connection indicator inside collapsible panel" (RoomPage.tsx:629) → principle 9, re-checked at runtime in 4.6; "seq in role=status" → principle 24. Confirmed passes: no spinners anywhere; ActivityLog has container aria-busy, Refresh and stale notice; rejections show server text in TokenRoster, Initiative, Chat, Dice, Checkpoints; offline never modal; destructive confirmations name targets for delete room, remove participant, delete token, leave table, delete checkpoint, library items |
| 14 | 2.3 | Group B+C subagent returned 40 candidates, 11 not-built items; re-read cited lines (ping.ts, boardView.ts, Board.tsx, GuideTour, BoardFilters, MapGridPreview, ToolRail, TokenRoster, InitiativeTracker, shared commands.ts, styles.css, PanelResizeHandle, RoomPage, index.html) | 34 accepted, merged into 15 findings (1 held for runtime: player non-drag move); dropped 2: Eraser for players (it removes only the player's own marks, which §13.5 allows), top-bar wrapping at ≤960 (tab list itself doesn't wrap, confirmed at runtime); moved 4: initiative reorder (no shared command, no drag either) and preview scene-ID/generation/counter → Not built; freehand Draw default and phone page-scroll (styles.css:1037 comment, deliberate) → Doc conflicts. Confirmed passes: PREVIEW_INTERVAL_MS = 50 (20 Hz) at roomConnection.ts:52; AIM_TTL_MS = 1000 at aims.ts:2; Fog gmOnly at ToolRail.tsx:30; `isTyping` guard at Board.tsx:137 used at :435/:467; WallCanvas/FogCanvas cancel gestures before the modal |
| 15 | 2.2 | Group A subagent returned 45 candidates; re-read styles.css:88-96, 479-501, 585, 630, 988, 1077-1080, 1239, 1405-1411, 1887-1895, 2495-2501, boardView.ts:164/1824/2126/2137, TokenCard.tsx:36, InitiativeTracker.tsx:197-201, MapCanvas.tsx:214-218, Modal.tsx:85-88; runtime probe of room `.icon-button` and `.hp` computed styles in the GM tab | 44 accepted, merged into 11 findings; 1 dropped (dice-ghost spin: motion is bound to the user's own drag, not ambient); runtime confirmed `.icon-button` border `0px none` in the room and `.hp` font Alegreya Sans + tabular-nums; `--font-mono`/`--control-border` unset on `:root`. Room typeface Alegreya (not Geist) is commented as deliberate in `:root` → Doc conflicts. Confirmed passes: Phosphor is the only icon dependency; no emoji in TSX/TS; every `@keyframes` is transform/opacity and gated by `no-preference` except the condition loops; active turn in the tracker uses rust + ▶ + position |
| 16 | 2.6 | Group F subagent returned 29 candidates plus a mutating-REST inventory; re-read PanelResizeHandle.tsx:30-37, RoomPage.tsx:272-278/321, ColorWheel.tsx:109-112, AttackPanel.tsx:281-286, attackRoll.ts:10-20/86-94, server liveRoom.ts:415-422, shared attackPresets.ts:6-14, guide.ts:9, FogSetup.tsx:37, roomConnection.ts:38-42, diceDrops.ts:7, boardView.ts:62-64 | 25 accepted, merged into 4 findings. Dropped 4: attack-ping guard (the GM may ping any point; not an authority breach), invite reset over REST (invite code is not RoomState), room DELETE over REST (ADR 0009 lifecycle), `pendingMoves` stale-entry theory (not reproduced; speculative). Each principle-28 finding names its shared export. Confirmed passes: no `pixi.js` import outside `board/` (26); every room write goes through `RoomConnection.command`, server re-checks `can.*` (27); all command/ephemeral positions pass through `toBoard`/`toMap`/`getScreenCTM().inverse()` (30) |
| 17 | 2.5 | Group E subagent returned 50 candidates plus tab/modal/live-region inventories; re-read styles.css:184/478-483/540/1175/2435, Modal.tsx:38-42, InitiativeTracker.tsx:208-212, RollCard.tsx:16, DicePanel.tsx:185, ShareButton.tsx:150-152, ReplayBar.tsx:131-140, GmPanel.tsx:607-614, LibraryPage.tsx:176-180, GuideTour.tsx:113-116 (+ grep `inert`), RoomPage.tsx:256-262, CheckpointsPanel.tsx:105-109, TokenRoster.tsx:284-288; runtime contrast probe of room inputs and token pairs | 47 accepted, merged into 15 findings; 1 dropped: 12 px muted text (passes at 5.2–5.8:1 per runtime); 2 merged into existing findings: seq in live region (→ D finding P24), MyTokens silent rejection (→ D finding P16). Runtime: room input border 1.23:1 vs panel, field fill 1.10:1; danger-fill 3.17:1; active badge 3.70:1; `#b65c16` 3.73:1 |
| 18 | 4.2 | Page-context contrast walker (WCAG luminance, alpha composited over ancestors, opacity multiplied, disabled controls skipped) on GM room Tokens and Play tabs; home page in light (pane default) and dark (`resize_window colorScheme: dark`) | Room fails: accent-ink on rust 4.44:1 (New Token, Start encounter, To hit, rail "Select" 12 px); `--text` on rust (selected tab) 3.73:1. All other room text ≥5.78:1 (`--muted` on panel). Home light: only reveal-animation artefacts (opacity 0 before scroll) and a token label over hero art (not measurable) → no real failures; home dark CTA 4.67:1, body copy 6.29:1 |
| 19 | 4.2 | One real `Tab` keypress, then `:focus-visible` probe of 7 controls incl. rust-filled Start encounter / Play tab / Select / Chat | All `:focus-visible`, `outline: 2px solid rgb(224,138,98)` (`--focus`), offset 2px — pass on accent fills |
| 20 | 4.2 | Player tab `resize_window preset: mobile` (375×812, touch → `pointer: coarse` true), reload, measure every visible interactive element | 17 of 23 under 44×44: top-bar tool buttons 36 px tall, rail buttons 40×40, "Hide board tools" 40×24, roster rows 40 px, Edit icon 34×34, skip link 40 px. Under 24 px: "Leave table" inline link 60×19 (sentence-inline, WCAG 2.5.8 exempt). Pixi's off-screen "select to enable accessibility" button is focusable |
| 21 | 4.2 | Room `.icon-button` and `.hp` computed styles; room input/select border and fill vs panel | Icon buttons `border: 0px none` (invalid `var(--control-border)`); `.hp` Alegreya Sans + tabular-nums; inputs border 1.23:1, fill 1.10:1 |
| 22 | 4.3 | Player tab: focus the selected room tab, real ArrowRight / ArrowLeft keypresses | Room panel tabs: roving tabindex (selected 0, others −1), `aria-controls="room-tabpanel"` on the selected tab, ArrowRight moved focus and selection Tokens→Dice, ArrowLeft back → pass |
| 23 | 4.3 / 4.4 (12, 23) | Player: focus roster row "Goblin", Enter; ArrowRight; open "Edit Goblin", read fields, Escape | Enter centres the token only: no `.token-card`, no `aria-pressed`/`aria-current`, no Move controls; ArrowRight does nothing. Player editor fields: HP, Max, AC, conditions, attacks — no position. Escape closed the editor and returned focus to "Edit Goblin" |
| 24 | 4.4 (12) | Player: click Goblin on the canvas (token card opens: HP, AC, Status, Edit — no Move); click an empty square; then `left_click_drag` Goblin | Click-then-click deselected the token, seq stayed 9 (no single-pointer move). The drag moved it (seq 10; scripted player received 2 `tokenDragPreview` then `TokenMoved`) → WCAG 2.5.7 failure confirmed |
| 25 | 4.4 (15) | Player tab: synthetic 2 s token drag via page-context PointerEvents at 100 Hz (200 moves); scripted player timestamps received `tokenDragPreview` | 38 previews over 1.99 s = 18.6 Hz, median gap 52 ms (min 7 ms: network bunching), then one `TokenMoved` → ≤20 Hz pass. Preview/ping expiry not measurable to the ms through screenshots; static constants used (ping 1200 ms, drag ghost 600 ms, aim 1000 ms) |
| 26 | 4.4 (13) | Escape/typing guards | Runtime: every modal opened (Choose a map, Edit Goblin ×2, Edit map) closed on Escape with focus returned. Gesture-before-sheet and pointercancel paths rest on static evidence (B+C findings); not reproducible with mouse automation |
| 27 | 4.5 (14) | Diffed GM vs player tool rail, panel tabs, menus (read_page / page text) | GM extra: Fog rail tool, Manage tab, Home link, Share/Invite options, Edit on every token, Duplicate. Player: Select, Measure, Draw, AoE, Eraser, Clear; Play/Tokens/Dice; Edit only on the owned Goblin; Leave table. No player-visible control issues a GM-only command |
| 28 | 4.5 (27) | Scripted player sent `fog.add`, `token.setHidden` (own token), `initiative.advance`, and a `templatePreview` with `gmOnly: true` | All three commands `rejected` with `code: "forbidden"`, "You are not allowed to do that"; the GM-only aim was not relayed (no echo) → server authority holds |
| 29 | 4.5 (14) | GM: Edit Goblin 3 → Hidden from players → Save → Confirm (seq 12); player tab probe of `innerText`, `outerHTML`, all `aria-label`/`title`, localStorage | Player: "Goblin 3" absent from text, HTML, accessible names and storage; GM still sees it |
| 30 | 4.6 (16) | Empty states seen during setup; new tab `127.0.0.1:5273/join/not-a-code` → name "Probe" → Join | Dashboard empty names the next action; roster "No tokens yet.", checkpoints "No checkpoints yet.", templates "No templates yet." do not; empty board showed only the pan/zoom hint. Invalid invite: the normal form renders, then on submit "Invite not found" in `role="alert"`, input `aria-invalid="true"` + `aria-describedby="join-error"`, typed name kept → pass |
| 31 | 4.6 (9, 16) | GM: Hide sidebar; probe for any visible "Connected/Reconnecting" text and the opener | No connection status visible anywhere; `.status` exists only in the hidden panel body; opener "Show sidebar" `aria-expanded="false"`, 18×56 px. Sidebar re-expanded |
| 32 | 4.6 (18) | Player: Leave table → read → Escape; GM: Invite link options → Reset link → read → Escape (neither confirmed) | Leave: "Leave Audit Room?" names room, "Auditor-P" and token "Goblin", initial focus "Stay", focus returned → pass. Reset: no room name in title or body; initial focus "Cancel"; focus returned to the Share button |
| 33 | 4.6 (16) | Player tab `location.reload()` then immediate page read | `<main class="centered"><p role="status">Loading…</p></main>`, 0 skeleton elements; network throttling unavailable, so later stages ("Connecting…") flash too fast to capture |
| 34 | 4.7 (7) | GM gave Goblin "Poisoned" (seq 13); player with in-app Reduced animations ON: `document.getAnimations()` on both tabs | No DOM condition animation on either tab; the condition glow is only mounted with particles, which require `!reduced` (EffectsOverlay.tsx:150) → reduced setting respected; the A finding's claim that the glow ignores it was corrected. Pixi "tremble" loops are canvas-only, not observable |
| 35 | 4.7 (7) | Player rolls 1d20 three times with a 2.5 s `getAnimations()` sampler: (a) in-app Reduced animations ON, (b) setting OFF + page-context `matchMedia` override reporting `prefers-reduced-motion: reduce`, (c) setting OFF, no override (baseline) | (c) baseline: Die3D WAAPI tumble (`die3d`, `die3d-flight`, `die3d-shadow`). (a) no die tumble, but CSS `roll-card` and `roll-total-in` keyframes still ran (gated only by the OS media query). (b) no die tumble; CSS keyframes ran (CSS media queries cannot be emulated here, expected). Ping and attack/nuke animations are Pixi canvas, so not observable via `getAnimations()`; they rest on the static reduced paths (fx.ts:165-171, nukeFx.ts:76, ping.ts:12) → Limitations |
| 36 | 4.8 (16) | `preview_stop server-isolated` mid-session; read GM and player tabs after 3 s; GM drags a token while offline | Both tabs: board and roster stay mounted, no modal, status line "Reconnecting… · seq 15" (`status-reconnecting`) inside the panel only, nothing on the board; presence avatars unchanged (no stale marker). Offline drag: token did not move and no message appeared (matches D finding: offline moves snap back silently) |
| 37 | 4.8 | `preview_start server-isolated` again (fresh in-memory store); wait 6 s | Both clients reconnected and got the room-not-found refusal: "No access to this room — Your invite may have been revoked, or the room may have been deleted. Ask the GM for a new link." (shown to the GM too). Expected for the dev in-memory store; not a finding. Scripted player stopped (`pkill`) |
| 38 | 5.1 | Merged the five verified finding sets, sorted severity → principle → file, assigned UI-001…UI-063; filled the 30-row summary | 63 findings (7 Blocker, 22 Major, 34 Minor); statuses 2 Pass, 19 Partial, 9 Fail; per-principle counts sum to 63; no "pending" rows |
| 39 | 5.2 | Wrote Not built (8 items), Doc conflicts (C1–C13) and Limitations; checked line references in the conflicts table (`styles.css:14`, `GmDashboardPage.tsx:53`, `openspec/config.yaml:25`) | All references resolve. No summary row uses "Not built"; unbuilt surfaces sit in §4 and Partial/Fail rows say what is missing |
| 40 | 5.3 | `preview_stop` both isolated servers; closed the GM and player tabs; `preview_list` | No isolated server running (only the empty browser-pane entry remains); scripted player already stopped (row 37). Cleanup left: none (in-memory store, no DB, no accounts created beyond the seeded dev account, which lived in the stopped server's memory) |
| 41 | 5.4 | `git status --porcelain`; `git diff \| shasum` | Same six modified files and `scripts/`; new paths only `docs/audits/ui-design-audit-2026-10-29.md` and this change's files; diff hash `070c600df6eab3bb9a883855911204da6d92846a`, identical to the baseline → no source file modified |
| 42 | 5.5 | Top 10 findings = UI-001…UI-010 in report §3 | Reported in chat |
