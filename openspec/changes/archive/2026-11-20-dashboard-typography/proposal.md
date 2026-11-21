## Why

The GM dashboard (`/gm-dashboard`, where the GM creates a room) is the next page after the home page's "Set up a room", but it looks like a different product. The home page is set in Geist Sans. The dashboard falls back to the room's Alegreya Sans, and its card headings ("Create a room", "Your rooms") are in Alegreya small caps. The `--font-ui` variable that holds Geist is defined only inside `.home-page`, so the dashboard has no way to use it.

## What Changes

- `--font-ui` moves to `:root`, so any page can use it. The home page keeps the same value, so nothing changes there.
- The GM dashboard uses `--font-ui` for all its text, including fields and buttons, which inherit it.
- The dashboard's headings follow the home page's heading treatment: Geist, tight tracking, sentence case, and no small caps.
- Colours, layout, and the dark theme stay as they are. Only the typeface changes.

## Non-goals

- The sign-in page, the asset library and the room page keep their current fonts. The room page is meant to keep Alegreya (DESIGN.md: the table's own type). The library and sign-in can follow in a separate change if wanted.
- Light theme or the home page's backgrounds on the dashboard.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gm-dashboard`: adds a requirement that the dashboard uses the home page's typeface and heading style.

## Impact

- `apps/web/src/styles.css` only. No component, contract, or server change.
