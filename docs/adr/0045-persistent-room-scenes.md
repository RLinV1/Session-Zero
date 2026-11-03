# ADR 0045 — Persistent room scenes

Status: Proposed for Real-Time Architecture review; implementation authorized by Raymond.

Scene switching is a convenience over the existing checkpoint board model: the outgoing board is saved automatically and a named destination is restored atomically. Checkpoints remain explicit recovery points and encounter templates remain reusable setups. The GM can switch directly from the room header or the Scenes section in Manage.

RoomState keeps the active board in its existing fields. Optional activeSceneId, sceneNames and savedScenes let historical rooms replay unchanged. savedScenes holds only inactive TableState snapshots plus group data; it is not recursively nested RoomState. The first scene management command registers the legacy board as initial / Scene 1. Max 20 scenes, names 1–60 trimmed characters, case-insensitive uniqueness.

SceneCreated and SceneSwitched include the outgoing and incoming snapshots; SceneRenamed and SceneDeleted carry their prior values. All use the ordinary command → decide → append → reduce → filtered broadcast pipeline. No new storage table or schema migration is needed. Inactive maps and token images participate in the room asset reference index.

Scene lists and inactive boards are GM-only. Scene transitions cause player-safe full snapshots, never raw events carrying hidden boards. Active scene IDs are public opaque identifiers so clients can reset local board state even when both scenes use the same map. Temporary encounter editing rooms cannot manage scenes. Scene changes invalidate board undo history; roll rulings remain room-wide. Checkpoint restores and template applications affect only the active board.

Tokens stay in their own scene with their IDs, ownership, HP, conditions and positions. There is no automatic party transfer or cross-scene stat propagation. Revocation and departure remain room-wide and the command pipeline checks active membership before allowing control. Personal drawings and measurements are discarded on switching; shared areas stay in their scene. The GM's header switcher avoids opening a panel for routine scene changes.

Map-editor commands carry an optional expectedSceneId so stale draft batches and asynchronous UVTT applies cannot overwrite another scene, even when two locations share a map. `token.move` and `portal.setState` also carry an optional expectedSceneId (a schema addition), checked in `decide` for any actor so a player move sent for one board cannot land on another after a switch. Scene switches remount local board and panel state. Grid-save acknowledgement guards compare captured scene identity without invalidating a successful save merely because its grid event arrived first.

## Private preparation (2026-11-02)

The UI creates scenes with `activate: false`. `SceneDraftCreated` persists a blank inactive board without changing the room's active board. The GM's local viewing selection projects an inactive scene into the existing editor and suppresses outgoing ephemeral previews. Every preparation edit is sent as `scene.prepare`, validated against the current saved board, and committed as `ScenePrepared`. These events and all saved scene content are redacted for players, including reconnect and replay.

Only board preparation commands are accepted. Scene management, live combat, chat and membership cannot run inside a preparation. Applying an owned encounter or library map uses the existing server enrichment with the nested command. Saving a reusable encounter from a private scene is hidden until activation because that REST endpoint saves the active board. Private edits persist automatically but do not enter the active board's undo history. A stale private edit is rejected if its scene is activated or deleted. Existing `SceneCreated` events retain their historical activation behavior.

Selecting a scene previews it for the GM. Activate explicitly switches the room; Selecting the Live scene leaves preparation without switching players. Activation is offered in a nonmodal board popup explaining that the viewed scene is not active. Private view selection is local and resets to the live scene on reload; prepared content persists.

New scenes open a setup modal offering an encounter template, a map, or a checkpoint from the current room. Maps use the existing library/upload picker. Template application and checkpoint restoration use the private scene connection, so players remain on the live board until activation. Checkpoint save/delete controls remain hidden from Manage.

The Current map setup option uses GM-only scene.copyCurrent to copy the authoritative live board and groups into an existing inactive scene through ScenePrepared. It captures the live map, tokens, HP, fog, walls, portals, initiative and groups at command processing time. It never switches the room or overwrites its active board; subsequent edits to either board are independent. Requests naming missing or active destinations, requests from players and temporary encounter-editing rooms are rejected.

## PR 141 review follow-ups (2026-11-03)

### Terrain integration with PR 134

Each saved scene retains the base and temporary terrain already carried by `TableState`. Selecting or activating a scene explicitly clears terrain when the saved board has none. Scene activation advances the live board epoch and terrain revision so earlier gestures cannot apply across a switch, including scenes sharing the same image.

`SavedScene` has optional `boardEpoch` and `terrainRevision` counters for private preparation; legacy scenes read both as zero. Private edits validate against and advance that scene's counters without changing live counters. Copying the current board advances the destination counters to invalidate older private drafts. These counters and inactive terrain remain GM-only.

The private preparation whitelist includes atomic `scene.savePreparation`, map style, terrain paint and temporary effect commands. Both direct and scene-wrapped atomic saves use the authenticated preparation HTTP endpoint, with the same total body limit and ordered, filtered event delivery. Large private terrain preparations do not increase the ordinary JSON or Socket.IO limits.

`DiceRoll` gains an optional `sceneId`, set by `decide` to the active scene when a roll is made (a schema addition; older rolls have none and are unrestricted). `roll.applyDamage` is rejected when the roll's scene is not the active one, because copied scenes share token IDs. Roll history stays room-wide. Scene IDs are read from `savedScenes` and `sceneNames` with own-property checks, so IDs such as `__proto__` or `constructor` are not found. The UVTT preparation endpoint takes an optional `sceneId` query parameter and captures that scene's board as the baseline, so an import into a private scene compares against the scene it will be applied to.
