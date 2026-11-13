## ADDED Requirements

### Requirement: GM detonates a map-wide nuke
The GM SHALL be able to detonate a nuke from the board, choosing a damage amount (a whole number from 1 to 999) with the blast rendered at the centre of each viewer's visible board (the event retains a valid map origin). The server SHALL accept the command from the GM only. Accepting it SHALL reduce the HP of every token in the room that has HP by the amount, never below the HP floor, and SHALL leave tokens without HP unchanged. Hidden tokens SHALL take the damage too. Each HP change SHALL be a `TokenStatsSet` carrying the stats it replaced, followed by one `MapNuked` event carrying the amount, the epicenter and the optional blast animation. The command SHALL be refused while the room's presets turn attacks off.

#### Scenario: Everyone takes damage
- **WHEN** the GM detonates a nuke of 12 damage in a room with Aria (HP 30), Goblin (HP 5), a hidden Ogre (HP 40) and a signpost token with no HP
- **THEN** Aria is at 18, Goblin is at the HP floor, Ogre is at 28, and the signpost is unchanged

#### Scenario: A player cannot nuke
- **WHEN** a player sends `nuke.detonate`, or a forged payload with a negative or non-integer amount
- **THEN** the server rejects it and no event is appended

#### Scenario: Nothing to damage
- **WHEN** the GM detonates a nuke in a room where no token has HP
- **THEN** only `MapNuked` is appended and the blast still plays

### Requirement: The blast plays for every viewer
When a `MapNuked` event arrives live, every connected viewer's board SHALL play a visible bomb falling into the centre of the viewport, followed by a brief flash, expanding rings, a textured orange mushroom cloud with ground fire, and a screen shake. The cloud SHALL fit within the viewport independently of map dimensions, zoom or pan. The shake and floating damage numbers SHALL begin at impact. The board SHALL show a damage number on every token that viewer can see and that took damage. Events the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT replay. Only one blast SHALL play at a time on a board; a second one that arrives mid-blast SHALL still apply its damage and SHALL show its numbers while replacing and releasing the previous visual blast.

#### Scenario: Everyone sees it
- **WHEN** the GM detonates a nuke while two players are connected
- **THEN** all three boards play the blast and each shows damage numbers on the tokens that board can see

#### Scenario: Reload does not replay
- **WHEN** a viewer reloads after a nuke
- **THEN** no blast plays, and the tokens show their reduced HP

### Requirement: The nuke never reveals hidden tokens
`MapNuked` SHALL name no token. A player SHALL receive the `TokenStatsSet` for a hidden token under the same rules as any other stats change, which is not at all. A damage number SHALL NOT be drawn for a token the viewer cannot see, and nothing in the blast SHALL depend on a hidden token's position.

#### Scenario: Hidden token takes damage
- **WHEN** the GM detonates a nuke and a hidden Ogre takes damage
- **THEN** players see the blast and numbers on visible tokens only, and nothing appears where Ogre stands

### Requirement: Undoing a nuke
The GM SHALL be able to undo a nuke as one action. Undo SHALL append `MapNukeUndone`, followed by compensating `TokenStatsSet` events that restore every token's earlier stats. Undo SHALL be refused when any damaged token's stats have changed since, as with other stats undo. Undo SHALL NOT replay the blast.

#### Scenario: Undo restores HP
- **WHEN** the GM nukes for 12 and then undoes it with no other change in between
- **THEN** every damaged token has its earlier HP and no blast plays

#### Scenario: Stale undo is refused
- **WHEN** the GM nukes, then heals Aria by hand, then tries to undo the nuke
- **THEN** the undo is refused with a message that a token has changed since

### Requirement: Blast respects reduced motion
When the viewer prefers reduced motion, the blast SHALL NOT shake the board, expand a shockwave or flash. It SHALL show a brief static centre marker and the damage numbers.

#### Scenario: Reduced motion
- **WHEN** a viewer with reduced motion enabled sees a nuke
- **THEN** the board shows a short static marker with damage numbers and no moving shockwave or shake

### Requirement: The blast never interferes with play
The blast SHALL NOT block or delay input, SHALL NOT change any token's recorded position, and its filters SHALL be removed from the board when it ends. Looping or lingering glow SHALL NOT remain.

#### Scenario: Board is normal afterwards
- **WHEN** a blast ends
- **THEN** the board has no shockwave, bloom or tint, and panning, zooming and dragging behave as before

### Requirement: Bounded animation work
Nuke fire SHALL use at most 52 central billow sprites, 24 expanding fire/dust sprites and one fireball, sharing two cached textures and SHALL NOT apply a filter to the map. Heavy effects SHALL update at most 30 times per second. One nuke SHALL play at a time. Attack particles SHALL be bounded and condition particles SHALL use at most 12 visible token canvases, one particle condition per token. Particle emitters SHALL stop while the page is hidden. Completed, replaced or hidden blasts SHALL release their display objects. Screen shake SHALL NOT create horizontal overflow. Reduced animations SHALL appear below Detonate in Table effects.

#### Scenario: Repeated blasts finish cleanly
- **WHEN** several nukes are triggered in succession and the last one ends
- **THEN** no blast objects, screen filters, persistent tint or horizontal overflow remain and the board still accepts input


#### Scenario: The blast spreads across the visible board
- **WHEN** the bomb reaches the middle of the viewer's screen
- **THEN** a fast-growing fireball and thick shock rings precede a broad mushroom cloud, overlapping banks of ground fire, and rolling fire/dust clouds that spread toward every edge
- **AND** the central cap stays inside the viewport while the outer surge can travel beyond its edges
- **AND** the broad cap rises visibly above its thick stem, retaining the fire and rolling dust surge

#### Scenario: Confirming the blast
- **WHEN** the GM opens the nuke confirmation
- **THEN** Detonate and Cancel are aligned to the right in that order
