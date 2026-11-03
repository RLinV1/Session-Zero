## Purpose

Let GMs prepare and paint optional tactical terrain while movers see a private, visibility-safe estimate and the server enforces straight swept movement.

## ADDED Requirements

### Requirement: Layered bounded cell editing
Only the GM SHALL edit base terrain or named temporary effects using a cell brush or rectangle fill. Normal/Erase SHALL remove the selected layer's override and use a translucent white brush/selection preview without a Difficult symbol. Blocked SHALL win across layers; Difficult SHALL cost twice once. Live completed gestures SHALL be one undoable action; preparation SHALL remain private until Save/Apply. Stale contexts, over 32 effects, over 10,000 total overridden cells or paint payloads reaching 32 KiB SHALL reject atomically and keep the preview.

#### Scenario: Remove an effect
- **WHEN** Difficult from an effect overlaps Blocked base and the GM removes that effect
- **THEN** Blocked base remains and undo restores the exact effect

#### Scenario: Occupied edit
- **WHEN** the GM paints Blocked ground or fog over a token
- **THEN** the token stays put; Blocked ground prevents ordinary movement until resolved, while fog permits authorized owner and GM movement and continues concealing unowned content

### Requirement: Authoritative swept movement
Every token movement input, including explicitly displaced permitted positional token configuration, SHALL validate the straight route from the actual committed origin against full swept-square Blocked overlap and swept walls with existing clearance and starting-wall escape. Blocked terrain SHALL NOT gain a starting escape exception. Closed/locked portals SHALL block and open portals SHALL permit movement. Manual fog SHALL NOT obstruct authorized owner or GM movement, including an owned token starting under fog; physical route and destination restrictions and proportional Difficult cost SHALL still apply under fog. Ownership, hidden-token restrictions and revocation SHALL remain enforced. Clients SHALL NOT automatically set Reposition or supply a new permission flag. GM-only Reposition SHALL bypass route restrictions while requiring a destination clear of walls and Blocked terrain and SHALL be consumed by one move attempt even when refused. Cancellation SHALL clear Reposition without committing movement. GM view-as-player SHALL remain read-only. New clients SHALL fence stale origins and board contexts; all commits SHALL use current ordered state. Moving SHALL NOT change manual fog.

#### Scenario: Clear destination beyond obstruction
- **WHEN** a token crosses a Blocked strip, wall or closed/locked portal to clear ground, including an ordinary GM move through fog
- **THEN** the move is refused with generic text

#### Scenario: Mid-drag update
- **WHEN** a door closes or terrain/fog changes before a drag commits
- **THEN** the commit uses that changed state: fog-only changes do not refuse movement, physical restrictions still apply, and stale origins or board contexts fail

#### Scenario: Ordinary GM movement in fog
- **WHEN** the GM drags, uses movement buttons or arrow keys, or makes a permitted positional edit into, within, across a thin strip between clear endpoints, or out of fog
- **THEN** fog alone does not refuse the move, physical obstacles still do, Difficult cost remains proportional, and concealment remains unchanged

#### Scenario: Player movement in fog
- **WHEN** an authorized owner drags or uses movement buttons or arrow keys into, within, across a thin strip between clear endpoints, or out of fog, including after GM placement or newly added fog covers their token
- **THEN** fog alone does not refuse movement, physical restrictions still apply, fog remains unchanged and other concealed content stays private

#### Scenario: Unauthorized fog movement
- **WHEN** a player attempts to move an unowned, GM-hidden or ownership-revoked token under fog, or a revoked participant submits movement
- **THEN** authorization still refuses the command without disclosing concealed token details

### Requirement: Existing-token resize destinations
Actual size changes through `token.configure` and `token.setAppearance` SHALL require a resulting footprint with no positive-area overlap with effective Blocked terrain across base and temporary layers and no blocking wall or closed/locked door/window intersection using the existing 10% wall inset. Open portals, Difficult terrain and manual fog SHALL permit resizing. Automatic centre shifts SHALL check only the destination. Shrinking from obstruction SHALL succeed only when the resulting footprint is clear. Snapped integer resizes SHALL retain their top-left anchor; off-grid tokens and changes to or from fractional sizes SHALL retain their centre. An explicit position SHALL take precedence; explicit displacement SHALL retain swept-route and destination checks using the resulting size, while an explicit unchanged centre SHALL create no movement route. Commands with unchanged size and position SHALL skip physical validation and permit unrelated edits while obstructed. Refusals SHALL use `invalid`, "That move is unavailable.", append no events and change no submitted fields. Successful resizes SHALL retain existing compensation values and hide-first/reveal-last ordering and SHALL remain non-undoable. Creation/duplication, map/grid adjustments and table restoration SHALL retain their existing behavior.

#### Scenario: Automatic anchored growth
- **WHEN** an integer snapped token grows without an explicit position
- **THEN** only its final anchored footprint is checked, even if sweeping the resulting size from its old centre would intersect Blocked terrain

#### Scenario: Fractional or off-grid growth
- **WHEN** a fractional or off-grid token changes size without shifting its centre, or an explicit position equals the committed centre
- **THEN** its resulting footprint is still checked and an obstructed result is refused atomically

#### Scenario: Shrink from obstruction
- **WHEN** terrain or a blocking wall/portal covers a token and the GM shrinks it
- **THEN** a clear resulting footprint succeeds and a still-obstructed footprint fails; unchanged geometry still permits metadata edits

#### Scenario: Resize with displacement
- **WHEN** the GM submits size and an explicit position different from the committed centre
- **THEN** the straight route and destination are validated using the resulting size against current ordered terrain and portals

#### Scenario: Resize crosses fog
- **WHEN** an accepted resize shifts a token centre into or out of fog
- **THEN** existing hide-first/reveal-last event ordering protects concealed edits in live clients, reconnect and replay

### Requirement: Proportional private ruler
A mover SHALL see distance and separate cost when different, using Chebyshev for snapped and Euclidean for free movement. Cost SHALL equal distance times one plus the union fraction with any positive-area Difficult footprint overlap, including under fog. Boundary contact SHALL not count. Unknown coverage SHALL withhold full cost even when movement is permitted. Route feedback SHALL be visual: red dashed for known collisions, faint dashed while uncertain, and solid for a checked clear route, without obstruction-status text. Fog itself SHALL NOT appear as a local collision; fog-only player routes SHALL be uncertain. Plain walls SHALL remain hidden from players. Rate-limited, unpersisted server feedback SHALL return only a private status to the requesting socket for an authorized token; player routes SHALL be wholly inside current known coverage before private collision checks and concealed player routes SHALL return unknown regardless of concealed obstacles. No hidden cost, geometry, obstacle identity or canonical terrain SHALL be disclosed. GM local and server advisory feedback SHALL report fog-only routes clear and physical collisions blocked. Replies for older requests or committed sequences SHALL be ignored; committed and redacted changes SHALL refresh stationary drags. Every committed move SHALL still be revalidated. Rulers SHALL be mover-only and never create sight origins.

#### Scenario: One-cell crossing
- **WHEN** a one-square token moves 10 ft between Normal cells across one Difficult cell
- **THEN** distance is 10 ft and cost is 20 ft

#### Scenario: Player drags across a wall
- **WHEN** a player drags their token across a wall on currently visible unfogged ground
- **THEN** their line becomes red and dashed without receiving wall geometry or obstruction-status text, and no other socket receives their feedback

#### Scenario: Concealed obstacle cannot be probed
- **WHEN** a player previews a route through concealed coverage
- **THEN** server feedback remains unknown whether a concealed wall exists or not and the preview creates no sight origin or persistent event

### Requirement: Current visibility protects terrain
Players SHALL receive only effective fully visible unfogged cells and permitted temporary markers, without canonical layers, names, edit revisions or prior values. Absent overrides SHALL mean Normal only inside permitted coverage. Unchanged projections SHALL redact terrain edits. The same projection SHALL cover live snapshots/events, history, replay, reconnect and previews. Unfogged movement outside sight SHALL remain legal. Hover and refusal SHALL reveal no additional content.

#### Scenario: Concealed effect
- **WHEN** a concealed layer is renamed or changes without changing the permitted projection
- **THEN** the player receives only a redacted sequence and learns no private content

### Requirement: Atomic preparation and recovery
Library preparation SHALL save grid and board together with owner authorization and stale revision rejection. Libraries and encounter templates SHALL retain base only; live rooms and checkpoints SHALL retain all layers. Map/dimension replacement SHALL reset/install base; spacing/origin changes with terrain SHALL require Cancel or explicit reset-and-apply. Grid styling/units and viewport changes SHALL preserve cells. Undo SHALL restore exact content without overwriting subsequent affected changes. Old records SHALL mean Normal. UVTT SHALL start with Normal terrain.

#### Scenario: Failed save
- **WHEN** a preparation save is stale or fails
- **THEN** neither grid nor board is partially changed

#### Scenario: Room isolation
- **WHEN** a prepared library map is placed and edited in one room
- **THEN** the library and other rooms retain their saved base

### Requirement: Bounded atomic room preparation
The server SHALL validate the complete GM preparation and its map, epoch and terrain revision inside the authoritative room FIFO before appending any events. It SHALL simulate whitelisted edits in order and append all resulting events atomically as one undo action, using existing viewer filters. Nested commands and unrelated operations SHALL be refused. Preparations SHALL be strictly below 768 KiB with at most 1,600 edits and at most 10,000 distinct painted cell positions across chunks; each paint SHALL remain strictly below 32 KiB and canonical cell/effect limits SHALL remain unchanged. Only changed terrain values and selected-layer erasures SHALL be sent. Larger saves SHALL use a preparation-only HTTP body limit with active GM/session authorization before parsing; Socket.IO and general JSON SHALL retain their existing 64-KiB limits. Save SHALL complete only after the client receives the committed sequence through its filtered event stream.

#### Scenario: Concurrent stale save
- **WHEN** live terrain or grid geometry changes after submission and before preparation execution
- **THEN** the complete save is refused without appending fog, wall, sight or terrain events, and its private draft remains available

#### Scenario: Fragmented large base
- **WHEN** one cell changes in a fragmented 1,000-cell base, or a valid 10,000-cell preparation requires multiple paints
- **THEN** only changed values are sent; bounded chunks either all commit under sequential internal revisions or none do, preserving other layers

### Requirement: Bounded route knowledge
Player preview coverage SHALL terminate within a fixed amount of row/column work, including skipped intervals. Unsafe integer bounds or over-budget traversal SHALL conservatively return unknown without adding off-map movement restrictions.

#### Scenario: Extreme committed origin
- **WHEN** an owner moves to a schema-valid extreme finite origin and previews back onto the map
- **THEN** feedback returns unknown promptly on either axis without blocking the server
