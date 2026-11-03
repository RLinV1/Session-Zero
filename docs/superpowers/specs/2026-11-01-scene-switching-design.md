# Scene switching

Proposed branch: `feat/scene-switching`. Commit messages use `feat:` / `test:` / `docs:` as appropriate.

## Intent

Let the GM leave an encounter, run another location in the same room, and return to the first location with its exact board progress. Existing encounter templates remain reusable starting setups.

## Approaches

Recommended: keep inactive scene snapshots in room state, using the existing append-only command/event pipeline. This retains token identities and ownership and fits reconnect, persistence and replay.

Alternative: automatically create and restore checkpoints. This overloads the bounded recovery list and does not model named locations independently. Separate rooms would require players to rejoin and would split chat and participants.

## Proposed behavior

- Add a GM-only Scenes section in Manage. List named scenes, identify the active one, and offer Create, Rename, Switch, and Delete for inactive scenes. Confirm deletion.
- The current room board becomes the initial scene without losing any existing state. Old event logs remain readable.
- Creating a scene saves the outgoing board and activates a blank board. The GM can then load a map or apply an existing encounter template using the current controls.
- Switching atomically saves the outgoing scene and loads the destination. Preserve map and grid, line of sight and range, token IDs and owners, positions, HP and other stats, conditions, attacks, walls and portal states, fog, AoE templates, initiative, token groups and membership.
- Tokens belong to their scene. No automatic party-token transfer or HP propagation between different scenes in this implementation.
- Room participants, credentials, chat, dice history, checkpoints and activity history remain room-wide.
- Applying a template or restoring a checkpoint changes only the active board; it does not replace the scene list or other scenes.
- Inactive boards and their names are GM-only. A switch sends players a fresh filtered snapshot, never the raw saved board. Existing player-safe filtering still determines visible tokens and portals.
- Switching clears local selections, drawing/measurement marks and pending previews, and fits the destination map. Local drawings remain personal and are not stored as scene data.
- Undo history cannot apply old board actions across a switch. Return to another scene using Switch; deletion and switching are recorded in the activity log rather than being ordinary board undo actions.
- Cap the room at 20 scenes, with names of 1–60 trimmed characters. Reject invalid IDs, player-issued management commands, duplicate names and deletion of the active scene.
- A revoked or departed participant remains unable to control tokens after returning to a saved scene, even if historical ownership references remain.
- Scene management is unavailable in temporary encounter-template editing rooms.

## Implementation constraints

Extend the shared contracts with backward-compatible scene state, validated commands and events. Store snapshots as the existing TableState plus GM-only group data; keep the active board in its current fields to avoid rewriting every board consumer. Only snapshot the active board when switching; do not duplicate every token mutation across two records. Add ADR 0045 and update filters, reducer, activity log, replay and undo boundaries. Event replay supplies persistence without a new database table. Both feature branches start from the same existing commit and build independently.

## Verification

Test A → B → A with changed HP, position, ownership, fog, portals, initiative and groups; reconnect and reload the stored event log; old-room compatibility; template/checkpoint operations inside a scene; player authorization and inactive-state secrecy; deletion and validation; GM UI and player updates across a switch. Run lint, typecheck, the full test suite and build before completion.

## Approval

Approved by the user in chat. The user further confirmed that checkpoints and encounter templates should remain, with routine switching and returning handled seamlessly from the room header.
