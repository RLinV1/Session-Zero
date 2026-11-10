# UI design audit of the AI features — 2026-11-10

A design review of the interfaces for AI players and AI game builds, judged against [`FRONTEND-CONTRACT.md`](../FRONTEND-CONTRACT.md) §13 (which wins on conflict), [`INTERFACE.md`](../INTERFACE.md) §11 and the principles the [2026-10-29 audit](ui-design-audit-2026-10-29.md) numbers. The questions were the ones design thinking asks: what does each person come to the screen to do, what do they see first, and where do they get stuck. Findings were fixed in the same change, on `feat/mcp-game-builder`.

## Scope

| Surface | Who uses it | What they came to do |
| --- | --- | --- |
| Share dialog, "Play with your AI" (`ui/ShareButton.tsx`) | A GM | Bring their AI to the table as a player |
| Library, AI builds tab (`pages/build/LibraryBuilds.tsx`) | A GM | Start a build, or get back to one |
| The pass dialog (`pages/build/PassPanel.tsx`) | A GM | Hand the pass to their AI |
| The build page (`pages/build/BuildPage.tsx`) | A GM | Check what their AI made, fix it and publish |
| The MCP tools and guide (`apps/mcp/src/buildTools.ts`, `buildGuide.ts`, `tools.ts`) | The GM's AI | Know what to do and what went wrong |

AI players at the table are ordinary players whose name ends in " (AI)" (ADR 0052), so they have no surface of their own.

**Method.**
- This branch ran on an in-memory store at `127.0.0.1:5493`, with the seeded test account, a sample build and a test room. The user's dev database was not touched.
- Each screen was checked at 1024 and 375 pixels wide, with the touch-pointer rule on at 375.
- The page's text, focus, sizes and overflow were read with scripts, as well as on screen.

The evidence came from this live run. The user's own run earlier the same day had already shown two of the problems: a pass ended unnoticed, and maps were locked by a grid confirmation.

## Findings and fixes

| # | Principle | Surface | Finding | Fix |
|---|---|---|---|---|
| 1 | Speak the user's language | Build page | The issue list was written for the AI and shown to the owner. It used internal keys ("creature maren", "map chandlery"), field codes ("hp:"), and instructions only an AI can follow ("Save one so the GM knows…", "Propose one with save_map", "left for the user") | `checkBuild` takes an audience. The owner reads each item's name, plain field names, and what to do on the page. The AI's wording is unchanged |
| 2 | P22 Colour never sole signal | Build page | Problems and notes differed only by a red or yellow bar | Two headed groups, "To fix (n)" and "Notes from your AI (n)" |
| 3 | Recognition over recall | Build page | An issue gave no way to reach its item on a long page | Every issue and every "changed by your AI" entry links to its card |
| 4 | Orientation | Build page | Nothing said what the draft held or what came next. The first thing after the title was the pass's expiry | A summary line, "Your AI has saved 1 map, 2 creatures and 1 encounter. 2 things need fixing, and it left 3 notes for you…", linking to Publish. The access controls get a heading |
| 5 | Error prevention | Build page, map card | A UVTT map's exact grid still offered fields and Confirm grid. Confirming marks the map edited, which locks the AI out. That is how two maps were locked during the real run | A file's grid is shown as text, with nothing to confirm. Other confirmed grids offer "Save grid" only once the numbers change. A note says any change stops the AI changing the map |
| 6 | P18 Destructive confirmations name the target | Build page | New pass silently ended the pass the AI was using. Remove deleted a draft item at once. Discard's dialog said "this build" | New pass asks first when a pass is live, and the new pass dialog says the old one stopped. Remove asks, naming the item. Discard names the build |
| 7 | P17 Button states | Build page | No pending states: publishing could be sent twice | Actions show their own pending label ("Publishing…", "Making a pass…") and the page's actions wait for it |
| 8 | P16 Data states, errors near the action | Build page | An error from a button at the bottom appeared at the top, out of view | The error scrolls into view and takes focus, as the contract's error summary does |
| 9 | Visibility of system status | Build page | "Publish selected (n)" sat only at the very bottom, so ticking items higher up gave no feedback | A bar stays at the bottom of the window while anything is selected: "n selected · Review and publish" |
| 10 | P3 Touch targets (44 px) | Build page | At 375 px with a touch pointer, these were under 44 px: opening and line selects (33), the Publish tick boxes (22) and the walls summary (38) | All at least 44 px; checked live |
| 11 | Wording | Build page, walls | "Done" on a mark actually deleted it | "Clear mark" |
| 12 | P9 Tabs at narrow widths | Library | At 375 px the library's seven tabs scrolled with no cue. AI builds, the last, was entirely off-screen | The list fades at an edge with tabs past it, and keeps the selected tab in view |
| 13 | Navigation, user control | Library, build page | The build page's way back opened the library on Maps, and a reload of AI builds did the same | `/library?tab=builds` opens AI builds and is kept in the address. The build page's link reads "AI builds" and goes there |
| 14 | Recognition over recall | Share dialog | Three identical-looking copy buttons with no way to tell them apart. The one explanation came after them, for the third only | Each way of playing has a one-line description, tied to its button by `aria-describedby` |
| 15 | Match the task's order | Share dialog | Connector, message and token are steps in order, laid out as loose paragraphs | Numbered steps: add the connector, choose how it plays, give it a token |
| 16 | Feedback, P16 | Share dialog | A failed copy was announced only to screen readers. On plain http, where the clipboard refuses, nobody could get a message | A visible result beside the button. On failure, the message appears in a box to select. It stays, rather than flashing for 1.5 seconds, which was found and fixed during the live check |
| 17 | Consistency | Share dialog | The copy buttons reused the QR button's class, and the steps' titles had two type styles | Their own class, and one title style |
| 18 | Clarity | Pass dialog | "Shown only once" didn't say what to do about it | "…so copy it before you close this" |

**MCP tools.** The tools are named verb-first and their titles say what they do. They have no finding beyond #1, which also affected what the AI is told: its words stay as they were.

## Not done

- **Content-shaped skeletons for initial loading (P16).** The build page still says "Loading…", as other hub pages do, and it exposes `aria-busy`.
- **Arrow-key navigation and `aria-controls` on the library's tabs (P20).** This is library-wide, and an open item of the 2026-10-29 audit.
- **Draft walls in the build page.** Owners change and remove the AI's walls there, but drawing and moving them stays in the map editor, as designed.

## Verification

- **Component tests:**
  - the summary, grouping, names and links;
  - the owner's wording, with no AI-only phrases;
  - Remove asking first, naming the item;
  - publishing pending, and sent once;
  - errors focused, and the publish bar;
  - no grid confirmation on a UVTT map;
  - New pass asking first, and its replaced notice;
  - Discard naming the build, and the breadcrumb;
  - the Share dialog's steps, descriptions, copy result and fallback, including that the fallback stays;
  - the library's `?tab=builds`, both ways.
- **Unit test:** the check's owner wording.
- **Browser, at 1024 and 375 pixels:**
  - no sideways overflow;
  - no control under 44 px on the build page;
  - issue links scroll to their cards;
  - the publish bar stays in view;
  - the tab list fades, and keeps AI builds in view;
  - the Share dialog's numbered steps and its copy fallback, on plain http in the built-in browser.
