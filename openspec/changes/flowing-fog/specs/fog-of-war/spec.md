## MODIFIED Requirements

### Requirement: Fog takes its colours from the map
The board SHALL draw fog mostly grey, keeping only a hint of the current map image's hue, at about the map's own brightness: banks only slightly darker than the map colour and mist only slightly lighter, so the fog blends into the map. When the map colour cannot be read, the board SHALL use a default blue-grey. The colour SHALL be the same over every part of the map, so fog reveals nothing about what lies under it.

#### Scenario: Fog on a coloured map
- **WHEN** a map with stone, moss and rock is shown with a fog region
- **THEN** the fog reads as grey haze with a hint of that map's tones, not as a coloured tint and not as a flat grey fill

#### Scenario: Map colour unreadable
- **WHEN** the browser will not let the map image be read
- **THEN** the fog uses the default blue-grey

### Requirement: Fog looks like mist
In the players' view, and for a GM viewing as a player, fog SHALL look like flowing mist: pale and cloudy clouds that slowly change shape, with puffs and wisps of mist that drift and fade in and out over it, and borders that fade outward into the map over about two grid cells while keeping the region's straight edges and corners. The border's fade SHALL move slowly, reaching out and pulling back. It SHALL NOT look like a flat textured rectangle, a sliding texture, or end in a hard line. The fade SHALL lie outside the region, so fog hides everything inside the region up to its border. With reduced motion, the fog SHALL be drawn still.

#### Scenario: Region border
- **WHEN** a fog region is drawn
- **THEN** its border fades outward over about two grid cells, evenly, with no bright or dark rim, no ring and no visible frame

#### Scenario: Region interior
- **WHEN** a fog region covers part of the map
- **THEN** the map under it is not visible, and the fog reads as cloud rather than a flat grey fill

#### Scenario: Fog flows
- **WHEN** a player watches a fog region for a few seconds
- **THEN** the clouds change shape, puffs fade in and out, and the border's mist reaches out and pulls back

#### Scenario: Reduced motion
- **WHEN** the viewer has asked for reduced motion
- **THEN** the fog is drawn still, with the same look
