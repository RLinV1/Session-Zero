## Why
The room top bar's scene selector is a native `<select>`: cramped next to the Home button and room name, and its open list ignores the app theme.

## What Changes
- Replace the native select in `SceneSwitcher` with a themed listbox popover built on `PopoverButton` (Live pill, check mark on the viewed scene, scrolling list, ellipsis for long names).
- Keyboard: Arrow keys, Home/End, Enter/Space select, Esc closes and refocuses the trigger.
- More spacing in the top bar start group and inside the trigger.
- Behaviour unchanged: picking a scene calls `preparation.preview(id)`. No shared/server changes.
