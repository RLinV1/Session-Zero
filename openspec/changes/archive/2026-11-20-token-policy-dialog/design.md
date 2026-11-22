## Context

`GmPanel.tsx` renders the token-policy fieldset (`askPolicy`, `policy`, `TOKEN_POLICY_CHOICES`) at the top of the Grid step in two places (preparing a new map, and editing the current one), and `applyPrep` sends `scene.setMap` with `tokenPolicy` when `askPolicy` is true.

## Goals / Non-Goals

**Goals:** ask at the moment of Apply; keep the command, policy values and defaults unchanged.
**Non-Goals:** changing the policies, the post-apply confirmation and Undo (kan-67), or the server.

## Decisions

1. **Intercept Apply.** `RoomGridEditor`'s `onApply` calls a new `requestApply()`: if `askPolicy`, open the dialog; otherwise call `applyPrep()` as now. The dialog's Apply map sets the policy then calls `applyPrep()`. Both fieldsets are deleted.
2. **Reuse the app's dialog pattern.** Use the existing confirmation dialog component (the one used for "Leaving a step with unsaved changes asks"), or a native `<dialog>` with the same styling if that component cannot hold radio choices. Focus trap, Escape and backdrop close come with it.
3. **Policy resets per open.** Each opening starts at "Scale to fit", matching the current default for each new map.

## Risks / Trade-offs

- [One more click for GMs who always keep the default] → Enter confirms the dialog with the default selected.
