Implementation note: implement with Sonnet 5.5 subagents. Group 1 first; then groups 2 and 3 in parallel.

## 1. Shared

- [x] 1.1 Add `Scene.sightRange`, `scene.setSightRange` and `SightRangeSet` (decide with GM-only and limits, reduce, undo, activity log, resync in `filterEventForViewer`); verify unit tests for each, including old scenes parsing as unlimited
- [x] 1.2 Cap `sightPolygon` at `maxDistance` with arc rays and pass it from `viewerSight`; verify tests: an open hall gives a disc of the right radius, walls still block inside the range, a token beyond the range is withheld by `filterStateForViewer`, the hidden-endpoint differential tests still pass with a range, and the timing test with a range stays under its limit
- [x] 1.3 Amend ADR 0044 with the sight range

## 2. Server

- [x] 2.1 Add an integration test (FR-GM-19): with a 30 ft range, a goblin 40 ft away in the open never reaches the player socket; setting Unlimited delivers it

## 3. Web

- [x] 3.1 Add `lineOfSight` and `sightRange` to the editor draft and `planDraftSave`; verify with mapDraft tests
- [x] 3.2 Add the "5 · Sight" step to the room editor (switch, Unlimited or a distance field with the unit label, slider in whole squares with the orange `range range-filled` style, player picker, preview mask), needing an applied map; verify web tests for the step and for Save and Discard
- [x] 3.3 Verify with Playwright: set 30 ft on Sunken Crypt, save, and the player board shows a lit disc; screenshot

- [x] 3.4 Replace the five Battle map step buttons with one Edit map button that opens the editor on its first step; update the guide text and web tests
- [x] 3.5 Add an editor-only test token to the Sight preview (drag or arrow keys, sight updates on drop); verify with a web test and a Playwright screenshot
- [x] 3.6 Replace the room's tokens and Preview as with test tokens only: a left panel to add and remove them, drag-only moves, and a bottom-right notice of how many others the clicked token sees; verify with web tests (the user checks it in the browser)
- [x] 3.7 Choose which test tokens' sight to show (per-token checkboxes, Select all, press a token to focus it, empty-map click leaves it), a different colour for windows, a smaller Add token button and less text; verify with web tests

## 4. Done check

- [ ] 4.1 Run `npm run lint && npm run typecheck && npm test`
