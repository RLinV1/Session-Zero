# Spec Delta

## ADDED Requirements

### Requirement: Creature folders
Creatures SHALL have folders as described in asset-library ("Library folders"). A creature with no folder SHALL read back with none, including every creature saved before folders existed, and SHALL place as before. Included creatures are in no folder and SHALL be shown only under All.

#### Scenario: Creature saved before folders
- **WHEN** the GM opens a creature saved before this change
- **THEN** it is in no folder and places as before

### Requirement: Folder in the creature form
The creature form SHALL have a Folder field after the image and before Advanced settings, suggesting the GM's folders. A blank field SHALL mean no folder. A typed name that matches a folder apart from case SHALL save as that folder. New creature opened while a folder is shown SHALL start with that folder.

#### Scenario: New creature inside a folder
- **WHEN** the GM opens the "Bosses" folder and chooses New creature
- **THEN** the form's Folder field reads "Bosses"

### Requirement: Edit several creatures at once
While creatures are chosen, the GM SHALL be able to move them all to an existing folder, a new folder or no folder, and to set Size, Max HP or AC on all of them. Fields left blank SHALL keep each creature's own value, and each field's placeholder SHALL show the value they share or "Mixed". The server SHALL change all of them or none: when any id is not one of the GM's creatures it MUST answer 404, and when the new Max HP is below any one's starting HP it MUST answer 400, changing nothing either way. A bulk edit MUST NOT change a name, image, attacks, starting HP or conditions, and SHALL take between 1 and 500 creatures.

#### Scenario: Same AC for a group
- **WHEN** the GM chooses 4 creatures with AC 8, 10, 10 and 9 and saves Edit with AC 12
- **THEN** all 4 have AC 12 and keep their own size and Max HP

#### Scenario: Another GM's creature in the request
- **WHEN** a bulk edit names one of GM A's creatures and one of GM B's, sent by GM A
- **THEN** the server responds 404 and neither creature changes

#### Scenario: Max HP below a starting HP
- **WHEN** the GM sets Max HP 20 on "Ogre" and "Wounded Ogre" (starting HP 30)
- **THEN** the form names "Wounded Ogre" and does not save; a request sent anyway gets 400 and changes nothing

### Requirement: Delete several creatures at once
While creatures are chosen, Delete SHALL confirm with their names and then delete them. The server SHALL delete only the GM's own creatures among the ids, skip ids that are gone or another GM's without saying which, and return how many it deleted. Tokens already placed SHALL be unchanged.

#### Scenario: Delete two goblins
- **WHEN** the GM chooses "Goblin 2" and "Goblin 10", chooses Delete and confirms
- **THEN** both are gone from the library and goblin tokens on boards stay as they are
