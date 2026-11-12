# encounter-templates Specification

## Purpose
Lets a GM save a room's prepared board (library map, grid, tokens and fog) as a reusable encounter template in their library, manage those templates, and apply one to a new or existing room (FR-GM-13).

## Requirements

### Requirement: Save a room's board as a template
A signed-in GM SHALL be able to save the current board of a room they own as a named encounter template (FR-GM-13). The name SHALL be 1 to 60 characters after trimming. The server MUST build the template from the room's live state, never from client-supplied board data. The template SHALL hold the map (as a reference to the GM's library map), the grid, every token with its look, size, position, hidden flag, stats, conditions and attacks but without its owners or initiative score, and every fog region. Walls and portals SHALL NOT be saved. The template SHALL belong to the GM's account. A GM SHALL NOT hold more than 50 templates. A room with no map, or whose map is not one of the GM's library maps, MUST NOT be saved, and the response SHALL say the map must be in the library first.

#### Scenario: Save a prepared board
- **WHEN** the GM of a room with a library map, a grid, three tokens (one hidden) and one fog region saves it as "Goblin ambush"
- **THEN** the library lists "Goblin ambush", and applying it later restores that map, grid, three tokens (the hidden one still hidden) and the fog region

#### Scenario: Owners and initiative are not saved
- **WHEN** a template is saved from a room where a player owns a token and an encounter is running
- **THEN** the template's tokens have no owners and no initiative scores

#### Scenario: Walls are not saved
- **WHEN** the GM saves a room that has walls as a template and later applies it
- **THEN** the template holds no walls and the applied board has none

#### Scenario: Not the GM of that room
- **WHEN** a signed-in user who does not own the room, or a player, asks to save it as a template
- **THEN** the server responds 404 and stores nothing

#### Scenario: Map not in the library
- **WHEN** the GM saves a room whose map was uploaded directly and is not a library map, or that has no map
- **THEN** the server responds 400 and stores nothing

#### Scenario: Blank name or too many templates
- **WHEN** the GM saves with a blank name, or already holds 50 templates
- **THEN** the server responds 400 and stores nothing

### Requirement: Templates are private to their GM
Every template read and write SHALL be scoped to the signed-in GM's account. A template that belongs to another account MUST get the same 404 response as one that does not exist. Template data SHALL NOT reach any room participant except as part of an applied board filtered for that viewer.

#### Scenario: Another GM's template
- **WHEN** a GM asks to read, rename, delete or apply a template id that belongs to another GM
- **THEN** the server responds 404, the same as for an id that does not exist

#### Scenario: Not signed in
- **WHEN** a request without a signed-in account lists or saves templates
- **THEN** the server rejects it and nothing is read or stored

### Requirement: Manage templates in the library
The GM's library SHALL list the GM's templates, most recently saved first, each with its name, map name, token count and the time it was last saved. The GM SHALL be able to create a template (New encounter), edit it, rename it and delete it there. A template whose map was deleted SHALL show that, and SHALL NOT offer Edit. A template that uses a library map SHALL appear in that map's usage warning, so deleting the map tells the GM which templates would break.

#### Scenario: List, rename, delete
- **WHEN** the GM renames "Goblin ambush" to "Ambush v2" and then deletes it
- **THEN** the list shows the new name, and after the delete the template is gone and applying it answers 404

#### Scenario: Edited templates move to the top
- **WHEN** the GM edits and saves an older template
- **THEN** it is listed first, with the new saved time

#### Scenario: Map usage warning
- **WHEN** the GM asks where a map is used and a template holds that map
- **THEN** the answer includes the template's name

#### Scenario: Map deleted
- **WHEN** the map of a template has been deleted from the library
- **THEN** its card says the map was deleted and offers no Edit

### Requirement: Apply a template to a new room
When creating a room, a signed-in GM SHALL be able to choose one of their templates. The new room SHALL start with that template's board. Tokens SHALL get new ids and no owners. If the template no longer exists or its map is gone, the room SHALL NOT be created and the response SHALL say why.

#### Scenario: Start a room from a template
- **WHEN** the GM creates a room and chooses "Goblin ambush"
- **THEN** the room opens with the saved map, grid, tokens and fog, and the GM seated as usual

#### Scenario: Template or map deleted
- **WHEN** the GM creates a room from a template whose map was deleted
- **THEN** the server responds 409, no room is created, and the message names the problem

### Requirement: Apply a template to an existing room
The GM of a room SHALL be able to apply a template to it. Applying SHALL replace the room's whole board (map, grid, tokens, fog) with the template's, end any running encounter, and clear area templates. It MUST go through the command pipeline as `encounter.apply`, authorised in `decide` as GM only. The event SHALL carry the applied board and the board it replaced, so it can be undone. The room's participants, chat, rolls, checkpoints and name SHALL be untouched. The web client SHALL ask for confirmation before sending the command. Players MUST NOT receive the event; they SHALL receive a fresh filtered snapshot, so hidden tokens and fog-concealed content stay hidden.

#### Scenario: Replace a board
- **WHEN** the GM applies "Goblin ambush" to a room with other tokens and an active initiative order
- **THEN** the room shows the template's board, the initiative order is cleared, and chat and participants are unchanged

#### Scenario: Undo an apply
- **WHEN** the GM undoes the apply
- **THEN** the previous board returns exactly, including its tokens' owners

#### Scenario: Player cannot apply
- **WHEN** a player sends `encounter.apply`
- **THEN** the command is rejected as forbidden and the board is unchanged

#### Scenario: Players see no hidden content
- **WHEN** the GM applies a template that holds a hidden token and a fog region
- **THEN** each player gets a resync with the hidden token absent and concealed content withheld, and no event naming either

#### Scenario: Forged or foreign template
- **WHEN** an `encounter.apply` names a template the sender's account does not own, or one that does not exist
- **THEN** it is rejected with the same message and the board is unchanged

### Requirement: Template data is validated
Template data SHALL be validated with the shared schema when stored and when applied. A stored template SHALL carry a format version. Applying a template whose version the server does not know, or whose data fails validation, MUST be rejected with a clear message and commit nothing.

#### Scenario: Unknown version
- **WHEN** a template with an unknown format version is applied
- **THEN** the apply is rejected and the room is unchanged

### Requirement: Edit a template in a temporary room
Choosing Edit on a template, or New encounter and then one of the GM's library maps, SHALL open a temporary room owned by the GM. For Edit, the room SHALL start from the template exactly as a room created from it does. For New encounter, the room SHALL start with the chosen map and that map's saved grid, and no tokens or fog; a map with no saved grid SHALL get its grid set up first. Built-in example maps and direct uploads SHALL NOT be offered. Editing SHALL use the room's normal commands, so tokens and fog change, and can be undone, exactly as in any room. Nothing SHALL be stored in the template until the GM saves.

#### Scenario: Edit an existing template
- **WHEN** the GM chooses Edit on "Crypt guards"
- **THEN** a temporary room opens with that template's map, grid, tokens and fog, and the template is unchanged until Save

#### Scenario: Build a new template
- **WHEN** the GM chooses New encounter and picks their map "Crypt"
- **THEN** a temporary room opens with "Crypt" and its saved grid, and no tokens or fog

#### Scenario: Map without a grid
- **WHEN** the GM picks a library map that has no saved grid
- **THEN** the grid setup opens first, and the temporary room starts with the grid the GM saves

### Requirement: Template-editing mode shows only map, fog and token tools
A temporary room SHALL open in a template-editing mode that shows the template's name and offers Save, Open in a room, Discard and Close. It SHALL offer only what manages the map, fog and tokens: the board with the Select tool, the Tokens tab (adding tokens, including From creature, and the token roster), and the Manage tab's Edit map with its Grid and Fog steps. It SHALL NOT show the Play and Dice tabs, chat, participants, invite or share, the activity log, replay, checkpoints, the Encounter templates section, the Measure, Draw, AoE or Eraser tools, walls, or a way to choose a different map. Hiding these is a convenience only; the server enforces the rules that matter.

#### Scenario: Only editing tools are shown
- **WHEN** the GM opens a template in the editing mode
- **THEN** they can add a creature token, move, hide and remove tokens, adjust the grid and draw or reveal fog, and no chat, dice, invite, initiative, walls or map choice is shown

#### Scenario: Place a creature
- **WHEN** the GM adds the creature "Goblin" twice from the Tokens tab
- **THEN** the room has tokens "Goblin" and "Goblin 2" with the creature's values, as in any room

### Requirement: Save, discard and close a temporary room
Save SHALL write the temporary room's board to its template by the rules for saving a room's board, keeping the template's id, map and format version and updating its saved time. For a new template, the first Save SHALL ask for a name and create the template, and later saves SHALL update that same template. Saves of a new template that overlap (for example, a double click or a retried request) SHALL create exactly one template: the first to finish creates and names it, and each other save updates that template and succeeds with it. Creating a template and linking the temporary room to it SHALL happen together or not at all. Saving SHALL fail with a clear message, and change nothing, if the room's map is no longer the template's map. Discard SHALL return to the library without saving. Close SHALL return to the library, and when the room has changes since the last save it SHALL first ask whether to save, discard or keep editing. Leaving by Discard or Close SHALL delete the temporary room.

#### Scenario: Save an edit
- **WHEN** the GM moves a token, hides another and adds fog in the editing mode, then saves
- **THEN** the template holds the moved token, the hidden token and the new fog, and is listed first

#### Scenario: First save of a new template
- **WHEN** the GM saves a new encounter for the first time and names it "Crypt guards", then makes another change and saves again
- **THEN** the library holds one "Crypt guards" with both changes

#### Scenario: Overlapping first saves
- **WHEN** two first saves of the same new encounter reach the server at the same time
- **THEN** both succeed with the same template, the library holds one template for that encounter, and the temporary room saves to it

#### Scenario: Double click on Save
- **WHEN** the GM clicks Save twice before the first save finishes
- **THEN** the editor sends one save request

#### Scenario: Close with unsaved changes
- **WHEN** the GM moves a token and chooses Close, then Discard
- **THEN** the template is unchanged, the temporary room is deleted, and the library opens

#### Scenario: Close after saving
- **WHEN** the GM saves and then chooses Close
- **THEN** the library opens without a prompt and the temporary room is deleted

### Requirement: Temporary rooms are private and short-lived
A temporary room SHALL be visible only to the GM who opened it. It MUST NOT appear in the GM dashboard or any room list. Every invite join to it MUST be refused with the same response as an unknown invite. A temporary room left behind (for example, by closing the browser) SHALL be deleted automatically within 24 hours of being opened, with everything a deleted room loses. Template edit requests for a temporary room that is not the caller's SHALL get the same 404 as one that does not exist.

#### Scenario: Hidden from lists
- **WHEN** the GM has a template open for editing and views their dashboard
- **THEN** the temporary room is not listed

#### Scenario: Joins refused
- **WHEN** anyone uses a temporary room's invite code to join
- **THEN** the server responds as for an unknown invite and no seat is created

#### Scenario: Left behind
- **WHEN** a temporary room was opened more than 24 hours ago and is still there
- **THEN** it is deleted, and its template is unchanged

#### Scenario: Another GM's temporary room
- **WHEN** a GM asks to save or read the editing session of another GM's temporary room
- **THEN** the server responds 404 and nothing changes

### Requirement: Open a template in a room
The template-editing mode SHALL offer Open in a room. If the room has unsaved changes, the GM SHALL first choose to save them, discard them, or cancel. A template that has never been saved SHALL NOT offer Open in a room. The GM SHALL then name the room, with the template's name filled in and editable, and give the same other details as when creating a room (their display name and game preset). The room name SHALL follow the rules for creating a room (1 to 80 characters). Cancelling SHALL create no room. Confirming SHALL create a normal room owned by the GM with that name, started from the saved template exactly as choosing the template when creating a room does, delete the temporary room, and open the new room.

#### Scenario: Open a saved template
- **WHEN** the GM opens "Crypt guards" in a room and accepts the suggested name
- **THEN** a new room named "Crypt guards" opens with the template's map, grid, tokens and fog, and the template is unchanged

#### Scenario: Name the room
- **WHEN** the GM opens "Crypt guards" in a room and changes the name to "Session 4 - Crypt"
- **THEN** the new room is named "Session 4 - Crypt" and starts from the template

#### Scenario: Invalid name or cancel
- **WHEN** the GM clears the room name, or cancels the dialog
- **THEN** no room is created; a blank name cannot be confirmed

#### Scenario: Unsaved changes
- **WHEN** the GM has moved a token without saving and chooses Open in a room, then Save
- **THEN** the template is saved first and the new room shows the moved token

### Requirement: Replace a template from a room
In a room the GM owns, the Encounter templates section SHALL offer to save the board as a new template or to replace one of the GM's existing templates, chosen from a list. Replacing SHALL NOT ask for confirmation: choosing Replace on a template SHALL send the request at once, and the section SHALL report the result ("Replaced encounter template …" or the failure message). Replacing SHALL rebuild the chosen template from the room's live state by the rules for saving a room's board, and SHALL keep the template's id and name. The room's map MUST be the chosen template's map; otherwise the server SHALL respond 409, change nothing, and the message SHALL say to save as a new template instead. A template that belongs to another GM, or a room the GM does not own, SHALL get the same 404 as one that does not exist.

#### Scenario: Replace after fine-tuning
- **WHEN** the GM opens "Crypt guards" in a room, gives a token a condition, and replaces "Crypt guards" from that room
- **THEN** the library still has one "Crypt guards", and applying it gives the token that condition

#### Scenario: Replace without a dialog
- **WHEN** the GM chooses Replace on "Crypt guards"
- **THEN** no confirmation dialog opens, the template is replaced, and the section reports that "Crypt guards" was replaced

#### Scenario: Different map
- **WHEN** the GM tries to replace "Crypt guards" from a room whose map is a different library map
- **THEN** the server responds 409, the template is unchanged, and the message says to save as a new template

#### Scenario: Another GM's template
- **WHEN** a GM asks to replace a template id that belongs to another GM
- **THEN** the server responds 404 and nothing changes
