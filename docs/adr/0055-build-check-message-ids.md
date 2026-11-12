# ADR 0055 — The build check's owner messages as message ids

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Extends:** [ADR 0053](0053-build-pass-and-approved-templates.md), [ADR 0054](0054-localized-messages.md)
**Change:** `openspec/changes/language-setting-zh-tw` (follow-up for the AI game builder) · **Requirements:** FR-GM-26, FR-GM-27 · **Capability:** `localization`

## Context

The AI game builder (ADR 0053) merged while the site was being translated (ADR 0054). Its screens hard-coded English, and so does the shared code the build page relies on:

| Shared function | Who reads it | How it reaches them |
|---|---|---|
| `checkBuild({ audience: "owner" })`, `creatureProblems(…, "owner")`, `buildFieldLabel` | the build's owner | the web runs the check itself, over the draft it fetched |
| `checkBuild()` for the AI, `creatureProblems()` | the AI | `check_build` and the save tools, as JSON |
| `draftMapBoard` problems | both | the AI's tools; the owner's map setup refusal and publish refusal (REST) |
| `draftEncounterToTemplate` problems | the owner | the publish refusal (REST) |

All of them return English strings, and `checkBuild` must stay pure: no locale, no I/O. The owner should read the page in their language; the AI's words are instructions to a program and stay English, like its tool descriptions and the message pasted into its app.

## Decision

**The owner's words are refs; the AI's stay strings.** The owner's messages move into the shared catalog (`packages/shared/src/i18n/messages/{en,zh-TW}/build.ts`, ids `buildCheck.*` and `libraryBoard.fogOffMap`). Each English entry is the text the page showed before, so `message` fields keep their exact English.

- `BuildCheckIssue` gains two optional fields, set only when `audience` is `"owner"`:
  ```ts
  /** `message` as a catalog ref, so the page can show it in the reader's language. */
  text?: MessageRef;
  /** `label` as a catalog ref when it is the app's own words ("Game profile"), not an item's name. */
  labelText?: MessageRef;
  ```
  For the AI nothing changes: the same keys in the same order, so `check_build`'s JSON is byte-identical.
- `DraftMapBoardResult`'s failure gains `ownerProblems: MessageRef[]`, the same problems in the same order in the owner's words. `problems` keeps the AI's English, which names its tools ("Propose one with save_map.").
- `DraftEncounterProblem` gains `text: MessageRef`: the whole problem as `token: problem`. A zod message that is ours maps back to its id (`validationRef`); zod's own wording has no id and stays English inside the Chinese sentence.
- New helpers return refs beside the English ones, which are now `englishText` of them: `buildFieldLabelRef`, `creatureProblemRefs`, `draftLineRef` (beside `describeDraftLine`) and `libraryBoardIssue` (beside `libraryBoardProblem`).

**The web formats; the server formats per request.** The build page renders `formatMessage(issue.text, issue.message)` in the current language. The publish refusal and the owner's map setup refusal are REST responses, so the server formats their refs with `sharedText(req.locale, …)` as ADR 0054 does for other shared messages. In English their bodies are unchanged; in another language `error` is the localized lines and `problems` keeps its English `{ item, message }`, like `field` and error codes.

The builder's screens move into a `build` area of the web catalogs, and `NOT_YET_LOCALIZED` leaves `eslint.config.js`, so the no-literal-text guard covers every web component again.

## Alternatives rejected

- **A `locale` parameter on `checkBuild`.** The web would re-run the check per language, and shared code would need every catalog loaded; refs are how ADR 0054 already carries text across the boundary.
- **Translating the English on the client by lookup.** Most of these messages carry values (names, numbers, squares), so a lookup would need a pattern per message, and an English edit would silently stop it matching.
- **Ids for the AI's messages too.** They would need translations nobody reads, and the AI's tools would gain fields it doesn't use.

## Consequences

- Existing English assertions in `packages/shared/test/build.test.ts`, `apps/web/test/buildPage.test.tsx` and `apps/web/test/libraryBuildsTab.test.tsx` still pass unchanged (six `toEqual`s on refusal objects became `toMatchObject` to allow the new fields). A script compared every message the shared build code writes, for both audiences, before and after the change: identical.
- The owner's English in the map setup refusal still says "Propose one with save_map." for a line drawn with no grid, as before; the localized version uses the owner's words. The AI can only draw a line once its map has a grid, so the page can't reach it.
- A publish refusal now names a map's setup problems in the owner's words in English too. The two that differ (lines or marks with no grid) can't reach a publish: drawn lines need a confirmed grid first, and marks are dropped before publishing.
- Editing an owner message means editing its catalog entry; `buildMessages.test.ts` checks every `buildCheck.*` id in both languages.
