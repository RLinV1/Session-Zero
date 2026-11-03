## ADDED Requirements

### Requirement: Atomic terrain preparation
Owner-authorized library preparation SHALL read and save grid and board together using a revision token. Stale saves SHALL change neither. Library maps SHALL store base terrain only; placing a map SHALL copy it into the room through one reversible scene action. Live edits SHALL leave the saved map and other rooms unchanged. Legacy writes SHALL preserve omitted terrain and SHALL refuse geometry changes requiring an unconfirmed terrain reset.

#### Scenario: Conflicting editors
- **WHEN** two preparation editors save from the same revision
- **THEN** only the first save succeeds and the second retains its draft without partial writes

#### Scenario: Prepare and place
- **WHEN** the GM saves base terrain on a library map and places it in two rooms
- **THEN** each room receives an independent copy and live painting in either room leaves the library unchanged

#### Scenario: Override prepared placement geometry
- **WHEN** a placement overrides saved spacing or origin while library base terrain exists
- **THEN** the server refuses the complete placement unless the GM explicitly selects terrain reset; reset clears only the room copy in the reversible placement, while matching/cosmetic geometry copies the exact prepared base without remapping
