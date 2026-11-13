# board-doors-tool Specification

## Purpose
Gives the GM a visible rail tool for opening, closing, locking and unlocking doors and windows during play, without hidden modifier keys.

## Requirements

### Requirement: The GM changes portals with the Doors tool
The GM's rail SHALL offer a Doors tool. Players SHALL NOT see it. Its options SHALL be two modes, Open/Close and Lock/Unlock, remembered while another tool is active. With the tool active, clicking a door or window SHALL, in Open/Close, open it if closed or locked and close it if open; and, in Lock/Unlock, lock it if open or closed and unlock it to closed if locked. Clicking anywhere else SHALL do nothing. Each change SHALL be one undoable action, as portal state changes already are. The tool SHALL change only a portal's state; it SHALL NOT turn a wall into a portal or a portal into a wall. With the Select tool, clicking and Shift-clicking a portal SHALL keep working as before.

#### Scenario: Lock a door during play
- **WHEN** the GM picks Doors, chooses Lock/Unlock and clicks a closed door
- **THEN** the door is locked for everyone and drawn with its padlock badge

#### Scenario: Unlock and open
- **WHEN** the GM, in Open/Close mode, clicks a locked door
- **THEN** the door opens

#### Scenario: Click a plain wall
- **WHEN** the GM clicks a plain wall with the Doors tool
- **THEN** nothing changes and nothing is sent

### Requirement: Portals stand out while the Doors tool is active
While the Doors tool is active, the GM's board SHALL draw every portal even if Show has Doors and windows unchecked, SHALL dim plain walls, and SHALL highlight the portal under the pointer. Once another tool is picked, the board SHALL go back to what Show says.

#### Scenario: Hover a door
- **WHEN** the GM moves the pointer over a door with the Doors tool active
- **THEN** that door is highlighted, and plain walls are drawn dimmed

#### Scenario: Portals hidden in Show
- **WHEN** the GM has unchecked Doors and windows in Show and picks Doors
- **THEN** portals are drawn while the tool is active, and hidden again once another tool is picked
