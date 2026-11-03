# Private scene preparation

Goal: create and prepare a scene without moving players; Activate explicitly switches the room.

Use the existing saved scene model and board controls. A GM-local connection projects the selected saved board and scopes preparation commands. The server validates these commands against that saved scene and commits a GM-only replacement event. Live players receive only redacted sequence markers. Existing scene creation events remain replay-compatible.

1. Add nonactivating creation and scoped preparation commands, reducer events, authorization and redaction tests.
2. Add a private connection and scene preview context; reuse board/map/token/template controls and show an explicit Activate action.
3. Verify player isolation, reconnect/replay persistence, template application, stale edits, and desktop/mobile UI with Playwright MCP; push to PR #141.

No separate editing room or local-only draft: saved scene edits persist immediately, and existing server validation is reused. Preparation cannot edit the active scene through the private command, and a stale private editor cannot fall through to live edits. Room-wide chat and membership remain on the live connection. Active area effects must finish before activation.
