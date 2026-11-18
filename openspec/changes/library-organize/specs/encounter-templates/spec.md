# Spec Delta

## ADDED Requirements

### Requirement: Organize templates
The Encounters tab SHALL sort, have folders and let the GM choose several templates, as described in asset-library ("Sort each library list", "Library folders", "Choose several library items"). Templates sort as newest by when they were last saved, and filing one in a folder MUST NOT change that.

#### Scenario: File templates by game
- **WHEN** the GM moves the template "Bridge ambush" into the folder "Hollow Coast"
- **THEN** it is shown under "Hollow Coast" and keeps its place in Newest first

### Requirement: Delete several templates
While encounter templates are chosen in the library (asset-library: "Choose several library items"), Delete SHALL confirm once, naming them, and then delete each. Rooms already made from them SHALL be unchanged. When some cannot be deleted, the page SHALL say how many were and were not, and those not deleted SHALL stay chosen.

#### Scenario: Clear out old templates
- **WHEN** the GM chooses the templates "Bridge ambush" and "Crypt guards", chooses Delete and confirms
- **THEN** both are gone from the Encounters tab and rooms made from them are unchanged
