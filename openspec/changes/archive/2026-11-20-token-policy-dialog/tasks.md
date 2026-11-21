Implementation note: implement with a Sonnet 5.5 subagent.

## 1. Dialog

- [x] 1.1 Replace both inline "Tokens already on the table" fieldsets in `GmPanel.tsx` with a dialog opened by Apply map when `askPolicy` is true; Apply map in the dialog sends the existing `scene.setMap` with `tokenPolicy`; Cancel/Escape keep the draft; verify with web tests: dialog appears only with a map and tokens, Recenter is sent, Cancel sends nothing, no inline choice in the Grid step
- [x] 1.2 Verify with Playwright: replace a map in a room with tokens, see the dialog, choose Keep positions, apply; screenshot

## 2. Done check

- [x] 2.1 Run `npm run lint && npm run typecheck && npm test --workspace=@vtt/web`
