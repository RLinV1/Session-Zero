## Purpose

Lets everyone at the table place area-of-effect templates (circle, cone, box) that the whole table sees, and lets the GM place ones only the GM sees, with clear rules for who may remove them.

## ADDED Requirements

### Requirement: Placed areas are shared with the table
When a participant places an area with the Area tool, it SHALL be sent to the server and, once accepted, SHALL appear for every connected participant at the same board position, shape, direction and size. It SHALL remain after page reloads and SHALL be present for participants who join later.

#### Scenario: A player's cone reaches everyone
- **WHEN** a player places a 15 ft cone
- **THEN** the GM and every other player see the same cone, and the activity log reads "<player> placed a 15 ft cone"

#### Scenario: A late joiner sees existing areas
- **WHEN** a player joins after a circle was placed
- **THEN** their board shows that circle

### Requirement: The GM can place areas players never see
The GM SHALL be able to mark an area GM only before placing it. A GM-only area SHALL NOT be sent to players in any snapshot, event or response, and players SHALL only learn that something happened at that sequence number. The GM SHALL see GM-only areas drawn in a distinct colour. A player's attempt to place a GM-only area SHALL be refused.

#### Scenario: GM-only box stays hidden
- **WHEN** the GM places a GM-only box
- **THEN** the GM sees it in the GM-only colour and no player receives it

#### Scenario: A player cannot hide an area
- **WHEN** a player sends a place command marked GM only
- **THEN** the server refuses it as forbidden and nothing changes

### Requirement: Owners and the GM remove areas
A placed area SHALL be removable by the participant who placed it and by the GM, and by no one else. Removing SHALL take it off every participant's board. A player's attempt to remove a GM-only area SHALL be answered exactly as for an area that doesn't exist. The removal SHALL record the whole area as it was.

#### Scenario: Erasing your own area
- **WHEN** a player uses the Eraser on a cone they placed
- **THEN** the cone disappears for everyone

#### Scenario: Another player's area is not erasable
- **WHEN** a player uses the Eraser on an area the GM placed
- **THEN** the area remains and no removal is sent

#### Scenario: Clear all removes only your own areas
- **WHEN** the GM activates Clear all while a player's cone and the GM's circle are placed
- **THEN** the GM's circle is removed and the player's cone remains

### Requirement: Rooms hold a bounded number of areas
A room SHALL hold at most 200 placed areas. A placement beyond that SHALL be refused with a message asking to remove some first.

#### Scenario: The cap is reached
- **WHEN** a room already holds 200 areas and a participant places another
- **THEN** the placement is refused and the room is unchanged
