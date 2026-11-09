# Spec Delta

## Purpose

Keeps the user in charge: they see what the AI made, fix it, choose what becomes real, start a room from it, and can remove all of it afterwards.

## ADDED Requirements

### Requirement: The owner can review a build
The build page SHALL be open only to the owner's signed-in session, and SHALL list every file, creature, map and encounter with its flags, its "not carried over" text and what players will see. Anyone else MUST get a 404.

#### Scenario: Review
- **WHEN** the owner opens a build with flags
- **THEN** flagged items are shown first, each with its reason

#### Scenario: Someone else's build
- **WHEN** another signed-in user opens the build's address
- **THEN** they get a 404

#### Scenario: Names players will see
- **WHEN** the owner reviews a visible token
- **THEN** the page marks its name as visible to players

### Requirement: The owner can fix drafts in the browser
The owner SHALL be able to change any field of a draft item, or remove it, under the same limits as the AI. A changed item SHALL be marked as edited, so the AI can't overwrite it.

#### Scenario: Fill in a missing value
- **WHEN** the owner types HP 18 on a flagged creature
- **THEN** the value is saved and the flag is cleared

### Requirement: The owner confirms each plain map's grid
The page SHALL show each plain map with its proposed grid drawn over it, with fields to change it and a control to confirm it. An encounter's map SHALL have a confirmed grid before that encounter can be published.

#### Scenario: Confirm a grid
- **WHEN** the owner corrects the cell size and confirms
- **THEN** the map counts as confirmed, and its tokens' squares are worked out from the corrected grid at publish

#### Scenario: No grid yet
- **WHEN** an encounter's map has no confirmed grid
- **THEN** that encounter can't be published, and the page says why

### Requirement: Only the owner's browser can publish
Publishing SHALL need the owner's signed-in session from the app itself. It MUST NOT be possible with a pass.

#### Scenario: Publish refused for a pass
- **WHEN** a request carrying only a pass asks to publish
- **THEN** the server responds 401 and publishes nothing

### Requirement: The owner chooses what to publish
The owner SHALL be able to publish all or some items, more than once from the same build. Publishing an encounter SHALL also publish the map, creatures and art it needs. Each publish SHALL either fully succeed or change nothing.

#### Scenario: Publish part of a build
- **WHEN** the owner publishes three creatures and leaves the rest
- **THEN** the library gains those three, and the others stay in the draft

#### Scenario: Failure part-way
- **WHEN** a publish fails on its last item
- **THEN** the library is unchanged, and the page reports the failure

#### Scenario: Open flags
- **WHEN** the owner publishes an item that still has flags
- **THEN** the page asks them to confirm first, and blank values stay blank

### Requirement: Published items are ordinary library items
Published maps, art, creatures and encounters SHALL be normal library items with the same access rules, editors and limits as any other. An encounter template SHALL be limited to the same 50 per account.

#### Scenario: Edit after publishing
- **WHEN** the owner opens a published map
- **THEN** it opens in the usual map editor, where wall detection is available

#### Scenario: Template limit
- **WHEN** a publish would take the account past 50 templates
- **THEN** the publish changes nothing and says so

### Requirement: Publishing never overwrites or deletes what the user has
Publishing MUST only add. An encounter whose name is already used in the library SHALL be published under a name with a number added, and the page SHALL show the new name.

#### Scenario: Same name
- **WHEN** an encounter named "Crypt guards" is published and the library already has one
- **THEN** the old one is unchanged, and the new one is "Crypt guards (2)"

### Requirement: A room starts from a published encounter
The page SHALL offer to start a room from a published encounter, using the existing room-creation path and a preset already in the app, as the signed-in owner. The GM seat SHALL be the owner's browser, and no credential for it SHALL go to the AI.

#### Scenario: Start a room
- **WHEN** the owner starts a room from "Bridge ambush"
- **THEN** a normal room opens with that board, and the owner is its GM

#### Scenario: Hidden tokens
- **WHEN** a player joins that room
- **THEN** tokens saved as hidden are withheld from them by the existing filters

### Requirement: Characters are handed out with the existing controls
A published encounter's tokens SHALL have no owners. The build page SHALL explain how to give a character to a player, and SHALL let the owner copy a character's "not carried over" text to pass on.

#### Scenario: Giving a character to a player
- **WHEN** a player has joined and the GM sets them as the token's controller
- **THEN** that player can move the token, as for any other token

#### Scenario: Character notes
- **WHEN** the owner copies Oswin's notes
- **THEN** the clipboard holds that character's "not carried over" text

### Requirement: Everything a build published can be removed
The server SHALL record what each publish created. The owner SHALL be able to remove all or some of it. Before removing, the page SHALL list where each item is in use, as a library delete does. Rooms MUST NOT be deleted by this, and only items the build created SHALL be removed.

#### Scenario: Remove a build's items
- **WHEN** the owner removes what a build published
- **THEN** those library items are gone, and everything else in the library is unchanged

#### Scenario: A map in use
- **WHEN** a published map is used by a room
- **THEN** the page lists that room before asking for confirmation, and the room stays, showing the usual stand-in

#### Scenario: Already deleted
- **WHEN** one of the items was already deleted by hand
- **THEN** it is skipped and the rest are removed

### Requirement: A build can be discarded
The owner SHALL be able to discard a build. This MUST delete its draft items, its stored files that weren't published, and its pass, and MUST NOT touch anything already published.

#### Scenario: Discard
- **WHEN** the owner discards a build that published two creatures
- **THEN** the draft and its other files are gone, and the two creatures remain

#### Scenario: Removing after a discard
- **WHEN** the owner returns later to a discarded build that published items
- **THEN** the build still lists those items and still offers to remove them

### Requirement: Abandoned builds are cleaned up
A build not changed for 14 days SHALL be closed as if discarded. The page SHALL show when this will happen.

#### Scenario: Expiry
- **WHEN** a build has not changed for 14 days
- **THEN** the sweep deletes its drafts, unpublished files and pass, and keeps only the list of what it published

### Requirement: Account deletion removes builds
Deleting an account MUST remove its builds, passes and stored draft files.

#### Scenario: Delete account
- **WHEN** a user with an open build deletes their account
- **THEN** the build, pass and draft files are gone

### Requirement: The user is told about rights
Starting a build and publishing SHALL show a short notice that the user must have the right to use what they upload, as the terms already say.

#### Scenario: Notice
- **WHEN** a user starts a build
- **THEN** the notice is visible before the pass is shown
