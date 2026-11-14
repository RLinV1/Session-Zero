# Spec Delta

## Purpose

Lets the owner see and clear the AI's proposed terrain before publishing, and carries it into the ordinary library map, encounter and room.

## ADDED Requirements

### Requirement: The owner sees the AI's terrain before publishing
The build page SHALL draw a map's proposed terrain over the original image, as the map editor draws it, beside the existing walls, portals and grid, and SHALL count its Difficult and Blocked squares. The encounter board SHALL draw it under the tokens. When the terrain was proposed on another grid, the page SHALL say so.

#### Scenario: Review a map
- **WHEN** the owner opens a map with proposed terrain
- **THEN** the map shows each Difficult and Blocked square, and the stored image is unchanged

### Requirement: The owner can clear the AI's terrain
The build page SHALL offer "Clear all terrain" on a map with proposed terrain. Clearing SHALL keep the map's walls, doors, windows and marks, and SHALL mark the map edited, so the AI can't change it again. The build page SHALL NOT paint terrain. Terrain sent back unchanged or left out SHALL be kept, and the server SHALL keep the grid the terrain was proposed on, whatever the page sends. A clear made on a version the AI has since changed SHALL be refused.

#### Scenario: Clear
- **WHEN** the owner chooses "Clear all terrain"
- **THEN** the map has no terrain, its walls stay, and the AI's later changes to it are refused

### Requirement: Published maps and encounters carry the terrain
Publishing a map with proposed terrain SHALL need its confirmed grid to be the grid the terrain was proposed on. The ordinary library map SHALL hold the terrain as its Base terrain, beside its walls. An encounter on it SHALL hold the same terrain, and a room started from that encounter, or placing that map with its library board, SHALL start with it. A map without proposed terrain SHALL publish as before. Publishing SHALL refuse an encounter with a token on Blocked terrain. Any refusal SHALL publish nothing.

#### Scenario: From draft to room
- **WHEN** the owner publishes an encounter whose map has proposed terrain, then starts a room from it
- **THEN** the library map, the encounter and the room each have that terrain, and the map's walls and doors are unchanged

#### Scenario: Unconfirmed or corrected grid
- **WHEN** the map's grid isn't confirmed, or was corrected after the terrain was proposed
- **THEN** publishing is refused with a reason, and nothing is added to the library

#### Scenario: A token on Blocked terrain
- **WHEN** a published encounter would place a token on a Blocked square
- **THEN** publishing is refused naming the token, and nothing is added to the library
