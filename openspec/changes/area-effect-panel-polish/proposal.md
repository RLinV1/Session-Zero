## Why

The GM's Area Effect panel reads as cluttered next to the other sidebar sections:
- The optional effect name comes first and weighs as much as the required roll.
- The token selection is a stack of large pills with two full-width buttons and a long hint.
- With only the GM present, "Reassign" shows an empty dropdown and a disabled button.
- Roll, Reassign and Skip compete as equal buttons.

## What Changes

- **Start.** The roll row (formula and Start) comes first; the optional name follows it.
- **Selection.** A header line with the count and quiet From template / Clear actions, small token chips with an x, and a small muted hint.
- **Called.** Targets show name left, save and HP right. Roll is the one primary action. One roll for all / per target is a segmented control over the same radios. Reassign is secondary and hidden when nobody else can take the call. Skip is a quiet text button.
- `.dice-row select` fills the row like `.dice-row input`.

**Unchanged:** commands, events, schemas, server rules, visibility, button labels and aria labels.

## Capabilities

### Modified Capabilities
- `area-effect`: layout of the Area Effect section.

## Impact

- **`apps/web`:** `panels/AreaEffectPanel.tsx`, `panels/GroupSelection.tsx`, `styles.css`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
