## Why

A token added with blank HP and AC gets no stats at all, so it has no health bar and damage can't be applied to it ("has no HP to change"). GMs skip the fields when placing a quick monster and only find out mid-fight. The Add token form also puts Size and Rotation, which are almost always left at 1 and 0, above the fields that matter.

## What Changes

- **Stat defaults.** In Add token, a blank HP or AC gets a default instead of staying unset:
  - HP and Max HP both blank: 100 / 100.
  - Only Max HP typed: HP starts at Max HP.
  - Only HP typed (positive): Max HP matches it. HP 0 or below: Max HP is 100.
  - AC blank: 0.

  The fields show the default as a placeholder, and a hint under them says "Left blank, HP is 100 and AC is 0."
- **Advanced settings.** Size (cells), Rotation (°) and Hidden from players move into a collapsed **Advanced settings** section of the Add token form. Their defaults are unchanged.

**Unchanged:** the `token.create` command, its schema (stats may still be null), the server, and the token editor for existing tokens. Only the Add token form fills in the defaults.

## Capabilities

### New Capabilities
- `token-creation`: what the Add token form sends for blank stats, and its layout.

## Impact

- **`apps/web`:** `panels/tokenDefaults.ts` (new), `panels/AddToken.tsx`, `styles.css`.
- **Tests:** `apps/web/test/tokenDefaults.test.ts`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
