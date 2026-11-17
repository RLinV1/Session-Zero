# Spec Delta

## ADDED Requirements

### Requirement: Organize animations
The Animations tab SHALL sort, have folders and let the GM choose several animations, as described in asset-library ("Sort each library list", "Library folders", "Choose several library items"). While animations are chosen, Delete SHALL confirm once, naming them, and then delete each. Attacks that already use them SHALL keep their copy. When some cannot be deleted, the page SHALL say how many were and were not, and those not deleted SHALL stay chosen. A new animation, including one started from a built-in, SHALL go in the folder shown; a duplicate SHALL go in its original's folder.

#### Scenario: File and clear out animations
- **WHEN** the GM chooses "Fire Slash" and "Frost Slash", moves them to a new folder "Spells", then chooses both again and deletes them
- **THEN** the "Spells" folder held both, and after confirming neither is in the library
