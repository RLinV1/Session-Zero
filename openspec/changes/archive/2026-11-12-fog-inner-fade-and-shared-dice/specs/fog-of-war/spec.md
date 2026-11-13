# Spec Delta

## MODIFIED Requirements

### Requirement: Fog looks like mist
In the players' view, and for a GM viewing as a player, fog SHALL look like drifting mist: pale and cloudy, keeping the region's straight edges and corners. It SHALL NOT look like a flat textured rectangle or end in a hard, perfectly straight line. The fog SHALL be fully opaque at and inside the region's border, so it hides everything inside the region up to its border, and SHALL fade out over a narrow band past it, gone a quarter of a grid cell outside, so the area the GM fogged is, give or take that band, the area hidden. Within that band, drifting noise SHALL move the fade in and out along the border, so a straight border wavers rather than following a ruled line. No puff or wisp SHALL be drawn outside the region. The GM's own fog view is unaffected.

#### Scenario: Region border
- **WHEN** a fog region is drawn
- **THEN** its border fades outward over a quarter of a grid cell, with no bright or dark rim and no visible frame

#### Scenario: Border wavers
- **WHEN** a player looks along a straight fog border
- **THEN** the edge of the fog moves slightly in and out along it instead of following a ruled line

#### Scenario: Region interior
- **WHEN** a fog region covers part of the map
- **THEN** the map under it is not visible right up to its border, and the fog reads as cloud rather than a flat grey fill

#### Scenario: Revealed ground stays clear
- **WHEN** the GM reveals part of the map next to a fog region
- **THEN** no mist covers the revealed part more than a quarter of a grid cell from the fog's border

## ADDED Requirements

### Requirement: Line-of-sight darkness has a crisp, smooth edge
With line of sight on, a player's darkness (and a GM's view as that player) SHALL cover exactly the map outside the player's sight, with no fade or shadow on either side of the sight edge: the area inside sight SHALL be shown at full brightness up to the edge, and the area outside it SHALL be fully dark from the edge. The edge SHALL stay sharp and smooth, without visible pixel steps, at any zoom. When a player owns several tokens, their sight SHALL be combined so that overlapping sight shows no seams, slivers or gaps. When the board is fully dark because "Hide map from players without a token" applies, it SHALL stay fully dark. Tokens and other board content outside sight SHALL still be withheld exactly as before.

#### Scenario: Lit ground is not shadowed
- **WHEN** a player's token stands in a room with line of sight on
- **THEN** the floor inside their sight is shown at full brightness right up to the sight edge

#### Scenario: No fade into the dark
- **WHEN** the player looks just past the edge of their sight
- **THEN** the map is fully dark from the edge, with no band where it shows through

#### Scenario: Zoomed in
- **WHEN** the player zooms far in on the edge of their sight
- **THEN** the edge stays a clean line, without stair-steps or blur

#### Scenario: Overlapping sight
- **WHEN** a player owns several tokens whose sight overlaps
- **THEN** the lit area is the combined sight of all of them, with no dark seams where their sight overlaps
