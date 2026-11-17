# Spec Delta

## ADDED Requirements

### Requirement: Sort each library list
The Maps, Token Art, Creatures, Encounters and Animations tabs SHALL each have a "Sort by" control with Newest first, Oldest first, Name A–Z and Name Z–A, defaulting to Newest first. Names SHALL compare in the page's language, ignoring case and accents and reading numbers by value. Ties SHALL fall back to the name, so the order is stable. For encounter templates and animations, newest SHALL mean last saved. The choice SHALL be remembered per tab in this browser and MUST NOT be sent to the server. Included-with-the-app sections, Dice and AI builds SHALL keep their own order.

#### Scenario: Numbers in names
- **WHEN** the GM sorts creatures "Goblin 10", "goblin 2" and "Ogre" by Name A–Z
- **THEN** they are shown as "goblin 2", "Goblin 10", "Ogre"

#### Scenario: Remembered per tab
- **WHEN** the GM sorts Creatures by Name A–Z and reloads the page
- **THEN** Creatures is still by name and Maps is still newest first

### Requirement: Choose several library items
Each card in the GM's own Maps, Token Art, Creatures, Encounters and Animations SHALL have a box to choose it, labelled with the item's name. The box SHALL show on hover or keyboard focus, and on every card while choosing; a Select button SHALL start choosing on any device. While choosing, a click on a card outside its own controls SHALL choose or unchoose it, Shift-click SHALL choose every card from the last one clicked, in the order shown, and the card's own actions SHALL be hidden. A bar SHALL show how many are chosen, Select all (or Clear when all are), Move to folder, the tab's own actions and a way to stop. Escape or Done SHALL stop choosing and unchoose everything, unless a dialog is open. A card that stops being shown (by search, another folder or deletion) SHALL stop being chosen. Switching tabs SHALL stop choosing.

#### Scenario: Choose a run
- **WHEN** the GM chooses Select, clicks "Ice-crawler Swarm" and Shift-clicks "Tor Breck" three cards later
- **THEN** all four cards from "Ice-crawler Swarm" to "Tor Breck" are chosen and the bar says "4 selected"

#### Scenario: Search narrows the choice
- **WHEN** the GM has chosen "Goblin" and "Ogre" and then searches "gob"
- **THEN** only "Goblin" is still chosen

### Requirement: Delete several maps or token images
While maps or token images are chosen, Delete SHALL first ask the server which rooms, creatures and encounter templates use any of them, then confirm once, naming the chosen items and each room, creature and template once, with the same consequences as deleting one. Confirming SHALL delete each of them. Creatures that used deleted art SHALL show as colour discs. When some cannot be deleted, the page SHALL say how many were and were not, and those not deleted SHALL stay chosen.

#### Scenario: Art in use
- **WHEN** the GM chooses two token images, one used by the creature "Storm Clock", and chooses Delete
- **THEN** the confirmation names both images and says "Storm Clock" will lose its image, and confirming deletes both

### Requirement: Library folders
Maps, Token Art, Creatures, Encounters and Animations SHALL each have folders: an item MAY be filed in one folder, named by 1 to 60 characters after trimming, and an item with no folder SHALL read back with none, including every item saved before folders existed. A folder SHALL exist while at least one of the GM's items of that tab is in it. Each tab's folders SHALL be its own; maps and token art SHALL NOT share folders. Folders MUST NOT reach a room or any player. Filing an item MUST NOT change when it was last saved.

Each of those tabs SHALL show a chip for All, one per folder with the number of items in it, No folder (when there are folders and items outside them) and New folder. All SHALL show the items in a section per folder, by folder name, with the items in no folder last. Choosing a folder's chip SHALL show only its items, with Rename folder and Remove folder. Renaming SHALL move every item in the folder to the new name; a name that matches another folder apart from case SHALL join that folder. Removing a folder SHALL leave its items in the library with no folder. When the folder being shown no longer exists, the tab SHALL show All. Included-with-the-app items are in no folder and SHALL be shown only under All.

New folder SHALL ask for a name. With items chosen, it SHALL move them into the new folder and show it. With none chosen, it SHALL show every item, start choosing, say which folder the choice is for, and offer Move to that folder once at least one item is chosen. Leaving without moving anything SHALL create no folder. While items are chosen, Move to folder SHALL move them all to an existing folder, a new folder or no folder.

Something made while a folder is shown SHALL go in that folder: an uploaded map or image, a new creature and a new animation. A duplicated animation SHALL go in its original's folder. Maps, token art, creatures and templates published from an AI build SHALL go in a folder named after the build, cut to 60 characters.

The server SHALL file up to 500 of the GM's items of one kind in one request, all of them or none: when any id is not the GM's item of that kind it MUST answer 404 and move nothing. It MUST reject a blank or longer folder name with 400.

#### Scenario: Maps by game
- **WHEN** the GM chooses New folder on the Maps tab, names it "Frost Peaks", chooses "Ice Cave" and "Frozen Pass" and chooses Move to "Frost Peaks"
- **THEN** the "Frost Peaks" folder is shown with those 2 maps, the Maps chips read All 3, Frost Peaks 2, No folder 1, and the Token Art tab has no "Frost Peaks" folder

#### Scenario: Rename onto an existing folder
- **WHEN** the GM renames the creature folder "Lanternfall" to "frost peaks" while a creature folder "Frost Peaks" exists
- **THEN** the creatures of both are in "Frost Peaks" and "Lanternfall" is gone

#### Scenario: Remove a folder
- **WHEN** the GM removes the map folder "Cairnkeepers" holding 1 map and confirms
- **THEN** the map is still in the library, with no folder

#### Scenario: Upload into a folder
- **WHEN** the GM opens the token art folder "Cairnkeepers" and uploads "Goblin chief"
- **THEN** "Goblin chief" is in "Cairnkeepers"

#### Scenario: Another GM's item in the request
- **WHEN** GM A asks to file one of their maps and one of GM B's maps in "Stolen"
- **THEN** the server responds 404 and neither map moves

#### Scenario: Publish a build
- **WHEN** the GM publishes the build "Hollow Coast" with the map "Cave", the creature "Goblin" with its art, and the template "Bridge ambush"
- **THEN** the map, the art, the creature and the template are each in a folder "Hollow Coast" on their tabs
