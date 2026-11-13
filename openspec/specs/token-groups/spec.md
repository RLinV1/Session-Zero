# token-groups Specification

## Purpose
Lets the GM organise the tokens of one live room into named groups, such as the enemies of one fight, and start an encounter from them, without players learning anything about the groups.

## Requirements

### Requirement: GM manages groups
The GM SHALL be able to create a group with a name of 1 to 40 characters, rename it, and delete it. A room SHALL hold at most 30 groups. Group names SHALL be unique within the room, compared after trimming and ignoring case. Deleting a group MUST NOT delete or change its tokens; they become ungrouped. Players MUST NOT be able to create, rename or delete groups.

#### Scenario: Create and rename
- **WHEN** the GM creates a group "Gate guards" and renames it "Gate guards (north)"
- **THEN** the GM's roster shows a group named "Gate guards (north)"

#### Scenario: Delete keeps tokens
- **WHEN** the GM deletes a group holding two goblins
- **THEN** both goblins are still on the board, now ungrouped

#### Scenario: Duplicate name
- **WHEN** the GM creates a group named "gate guards" while "Gate guards" exists
- **THEN** the server rejects it and no group is added

#### Scenario: Player tries to create a group
- **WHEN** a player sends a create-group command
- **THEN** the server rejects it as forbidden and nothing changes

### Requirement: Group membership
The GM SHALL be able to put one or more tokens into a group, or take them out of any group, in one action. A token SHALL belong to at most one group: putting it into a group SHALL take it out of the one it was in. A group MAY be empty. A token that is deleted SHALL disappear from its group, and SHALL be back in that group if the deletion is undone or a checkpoint restores it. Players MUST NOT be able to change membership.

#### Scenario: Move a token between groups
- **WHEN** "Goblin 2" is in "Gate guards" and the GM puts it into "Patrol"
- **THEN** "Goblin 2" is in "Patrol" and no longer in "Gate guards"

#### Scenario: Empty group
- **WHEN** the GM creates "Reinforcements" and assigns nothing to it
- **THEN** the roster shows "Reinforcements" with no tokens

### Requirement: Groups in the GM's roster
The GM's token roster SHALL list tokens under their group's heading, groups in creation order, followed by an "Ungrouped" section. Each group heading SHALL be collapsible and SHALL offer Hide all, Show all, Rename and Delete. Hide all and Show all SHALL change only the group's tokens, using token visibility. Selecting all of a group's tokens on the board is out of scope until the board supports selecting several tokens.

#### Scenario: Hide a group
- **WHEN** the GM chooses Hide all on "Back room cultists"
- **THEN** every token in that group becomes hidden and players' boards no longer show them

### Requirement: Start an encounter from groups
The Start encounter dialog SHALL show a checkbox for each group and a separate **Players' tokens** checkbox. Ticking a group SHALL include that group's tokens only. Ticking Players' tokens SHALL include every token owned by an active player. With any of these checkboxes ticked, the dialog SHALL include exactly the tokens of the ticked groups, plus the players' tokens when Players' tokens is ticked, and leave all other tokens out. With none ticked, every token SHALL be included. The dialog SHALL open with no group and Players' tokens unticked. Ticking a group SHALL NOT tick Players' tokens, and ticking Players' tokens SHALL NOT tick any group. The checkboxes SHALL be shown when the room has at least one group or at least one token owned by an active player. The GM SHALL be able to include or leave out any single token before starting, and that choice SHALL win over the checkboxes. Only included tokens with a score SHALL enter the turn order.

#### Scenario: Start from one group
- **WHEN** the GM ticks "Gate guards" (two goblins) in a room with two player tokens and a third, ungrouped goblin
- **THEN** Players' tokens stays unticked, and the dialog includes only the two goblins

#### Scenario: Group with the players
- **WHEN** the GM ticks "Gate guards" and Players' tokens
- **THEN** the dialog includes the two goblins and the two player tokens, and leaves out the third goblin

#### Scenario: Combine groups
- **WHEN** the GM ticks "Gate guards" and "Patrol"
- **THEN** the dialog includes the tokens of both groups and not the player tokens

#### Scenario: Players only
- **WHEN** the GM opens the Start encounter dialog without choosing groups and ticks only Players' tokens
- **THEN** the dialog includes the two player tokens and leaves out every goblin

#### Scenario: A hand-picked token wins
- **WHEN** the dialog has "Gate guards" ticked and the GM also checks the third, ungrouped goblin by hand
- **THEN** the third goblin is included along with the ticked group's tokens

### Requirement: Group changes and encounter starts can be undone
Creating, renaming and deleting a group, and changing membership, SHALL each be one undoable action in the GM's activity log, restoring exactly the names and memberships they replaced. Starting initiative SHALL be one undoable action that restores the turn order and the saved initiative scores it replaced. An undo MUST be refused when the value it would restore has since been changed by a newer action.

#### Scenario: Undo a group deletion
- **WHEN** the GM deletes "Gate guards" (two goblins) and then undoes that
- **THEN** "Gate guards" is back with both goblins in it

#### Scenario: Undo starting an encounter
- **WHEN** no encounter was running, the GM starts one from "Gate guards", and then undoes the start before advancing
- **THEN** no encounter is running and each token's saved initiative score is what it was before

#### Scenario: Undo a start after advancing
- **WHEN** the GM starts an encounter, advances the turn, and then tries to undo the start
- **THEN** the undo is refused with a message that the turn order has changed

### Requirement: Players never see groups
Players MUST NOT receive group names, ids or membership in any snapshot, event or REST response. A group change SHALL reach a player only as an advance of the room's sequence number. Undoing an encounter start SHALL reach a player as their filtered turn order and nothing else about the GM's groups.

#### Scenario: Player's state
- **WHEN** the GM has groups "Gate guards" and "Patrol" with tokens in them, including a hidden token
- **THEN** no player's state or event stream contains either group's name or id, or any membership

#### Scenario: Player rejoins
- **WHEN** a player reconnects after the GM changed groups
- **THEN** the player's snapshot has no group data

### Requirement: GM changes a token's group from the roster
When the room has at least one group, each row of the GM's token roster SHALL have a grip handle. Clicking the handle, or pressing Enter or Space on it, SHALL open a Move to menu listing every group in creation order, then Ungrouped. The token's current group SHALL be marked and SHALL NOT be selectable. Choosing another entry SHALL put the token into that group, or take it out of any group for Ungrouped, as one action, and close the menu. Dragging the handle onto a group's section, either its heading or its token list, SHALL do the same for that group. This SHALL include a collapsed group, an empty group and the Ungrouped section. The section under the pointer SHALL be highlighted while dragging. Dropping a token on the group it is already in, or outside any section, SHALL change nothing. Each move SHALL be one undoable action, as any other membership change. Players SHALL NOT see the handle, and their roster SHALL stay a flat list. When the room has no groups, the handle SHALL NOT be shown.

#### Scenario: Move by menu
- **WHEN** "Goblin 2" is in "Gate guards" and the GM opens its Move to menu and chooses "Patrol"
- **THEN** "Goblin 2" is listed under "Patrol" and no longer under "Gate guards", and the menu is closed

#### Scenario: Current group marked
- **WHEN** the GM opens the Move to menu for "Goblin 2" in "Gate guards"
- **THEN** the menu lists the room's groups in creation order, then Ungrouped, with "Gate guards" marked and not selectable

#### Scenario: Ungroup by menu
- **WHEN** the GM chooses Ungrouped in the Move to menu of a token in "Patrol"
- **THEN** the token is listed under Ungrouped

#### Scenario: Move by drag
- **WHEN** the GM drags the handle of "Cultist" (Ungrouped) onto the heading of "Back room"
- **THEN** "Cultist" is listed under "Back room"

#### Scenario: Drop on a collapsed or empty group
- **WHEN** the GM drags a token's handle onto the collapsed "Patrol" heading, or onto the empty "Reinforcements" section
- **THEN** the token is put into that group

#### Scenario: Drop on its own group
- **WHEN** the GM drags "Goblin" from "Gate guards" and drops it on "Gate guards"
- **THEN** nothing is sent and nothing changes

#### Scenario: Undo a move
- **WHEN** the GM moves "Goblin 2" from "Gate guards" to "Patrol" with the handle and then undoes that action
- **THEN** "Goblin 2" is back in "Gate guards"

#### Scenario: Keyboard only
- **WHEN** the GM tabs to a token's handle, presses Enter, moves to "Patrol" and presses Enter
- **THEN** the token is put into "Patrol" and focus returns to the handle

#### Scenario: No groups
- **WHEN** the room has no groups
- **THEN** no roster row shows a handle

#### Scenario: Players
- **WHEN** a player views the token roster
- **THEN** no row shows a handle and no group names appear
