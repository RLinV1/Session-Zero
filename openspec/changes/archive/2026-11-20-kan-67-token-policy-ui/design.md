## Context

- PR #86 (KAN-66, ADR 0042) defines `scene.setMap { map, grid?, tokenPolicy? }` with policies `scale | keep | recenter`, a `MapSet` that carries `tokenChanges` (`tokenId`, `from`, `to`), and makes a new map action undoable. It has no web changes.
- Every map placement goes through the "Prepare map" sheet and `onSetMap` in `GmPanel.tsx` (KAN-59), so one place covers uploads and library maps. The board already refits when the map URL changes.

## Goals / Non-Goals

**Goals:**
- Show the choice only when it matters, send it, and report the result with Undo.
- Add no contract: use only what #86 defines.

**Non-Goals:**
- Changing the policies, their rules or the server behavior (PR #86).
- Remembering the GM's last choice, or a preview of where tokens will land.

## Decisions

1. **Count from the committed event, not a client-side plan.** #86's adjustment can reject oversized footprints and re-snap tokens; recomputing it in the browser would duplicate that logic. The latest undo entry's `MapSet.tokenChanges.length` is exactly what the server did. Alternative rejected: export and call `adjustMapTokens` from the web.
2. **Find Undo from `state.undo`.** After Apply, the newest undo entry is the map action. The message appears only while that entry's first event is a `MapSet` for the map just applied and `undoableAction` still accepts it; it then goes away on its own after any later action.
3. **Radio inside the prepare sheet, above the grid form.** It sits with the other pre-Apply choices, and needs no new dialog. Radios reuse the existing `checkbox` label class and one added CSS rule.
4. **Policy sent only when asked.** The command omits `tokenPolicy` when no choice is shown, so first-map placements are unchanged.

## Risks / Trade-offs

- [The undo entry is only visible to the GM's client state] -> the choice and message are GM-only by construction; the server still authorizes the command and the undo.
- [Depends on PR #86's exact names] -> the change is stacked on that branch and typechecks against it; rebase once #86 merges.
- [Scale is selected by default, and an oversized footprint is refused] -> the refusal message from the server is shown in the sheet.
