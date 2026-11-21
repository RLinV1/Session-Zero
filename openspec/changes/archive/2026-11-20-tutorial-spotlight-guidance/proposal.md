## Why

The guest room's interactive demo (guest-gm-hosting, D8a) only puts a thin outline on the control a step is about, and falls back to a bottom sheet when that control sits in a closed tab or a folded section. New guest GMs read "press Roll in the Dice section" and still cannot find it. The demo also never teaches the two setup jobs a GM does before play: preparing the map (grid, walls) and painting terrain. Separately, the guest start page's "Pick a map" grid shows each thumbnail as a tall, cropped portrait that fills the screen, so the visitor sees one and a half maps at a time.

## What Changes

- Each demo step spotlights its real control: the rest of the screen dims, the control gets a ring, and the step card points at it with an arrow. The control stays clickable; the demo stays non-modal.
- Each step whose control is not on screen offers **Show me**, which opens the sidebar tab or folded section that holds it, scrolls it into view and then spotlights it.
- Two new steps: **Prepare the map** (open Edit map and apply a change, such as the grid or walls) and **Paint terrain** (pick the Terrain tool and paint difficult or blocked ground). The steps run after Invite players.
- The guest start page's map thumbnails keep their real shape (16:9, as shipped), and the grid shows more, smaller cards.

## Capabilities

### New Capabilities
- `guest-demo-guidance`: how the guest demo shows the GM where each control is (spotlight, pointer, Show me) and the map and terrain steps it adds to the step list.
- `guest-start-map-picker`: how the guest start page shows the shipped maps to pick from.

### Modified Capabilities
- None in `openspec/specs/`. The demo's step list is defined by the in-flight `guest-gm-hosting` change (`guest-hosting`, "A guest room offers an interactive demo"); this change updates that list in place (see design.md D5).

## Impact

- `apps/web/src/ui/GuestTutorial.tsx`, `apps/web/src/ui/tutorialSteps.ts` (+ its unit test), `apps/web/src/pages/RoomPage.tsx` (reveal callback), `apps/web/src/pages/GmPanel.tsx` and `apps/web/src/ui/ToolRail.tsx` (new `data-tutorial` anchors), `apps/web/src/styles.css`, en and zh-TW `panels.ts` catalogs.
- `apps/web/src/pages/StartPage.tsx` and `styles.css` for the picker.
- Client only. No command, event, schema, server or visibility change.
