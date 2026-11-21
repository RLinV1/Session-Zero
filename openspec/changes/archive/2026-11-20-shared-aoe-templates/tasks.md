## 1. Contract (packages/shared)

- [x] 1.1 Add `AreaShape`, `AreaTemplate`, `MAX_AREA_TEMPLATES` and `RoomState.templates`; verify `emptyRoomState` initializes it and typecheck passes
- [x] 1.2 Add `template.place` / `template.remove` commands and `TemplatePlaced` / `TemplateRemoved` events; handle them in `decide` (authorization first) and `reduce`; verify with `test/areaTemplates.test.ts`
- [x] 1.3 Extend `filterStateForViewer` and `filterEventForViewer` for GM-only templates; verify with visibility cases in `test/areaTemplates.test.ts`
- [x] 1.4 Add activity log sentences; verify the formatter test covers both new events
- [x] 1.5 Write ADR 0007 and ask the Real-Time Architecture owner to review it

## 2. Server

- [x] 2.1 Add `apps/server/test/areaTemplates.test.ts`: a shared placement converges on all clients, a stranger can't remove it, the owner can, and a GM-only template never appears in a player's raw traffic

## 3. Web

- [x] 3.1 Draw `state.templates` in the marks layer (GM-only in purple), with pending placements shown until the server answers; verify in Playwright with a GM and a player
- [x] 3.2 Send `template.place` from the Area tool and `template.remove` from the Eraser and Clear all (own templates; any for the GM); verify in Playwright that a player can't erase the GM's area and Clear all leaves others' areas
- [x] 3.3 Add the GM-only option to the Area flyout for the GM only; verify players don't get the option

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and confirm all pass
