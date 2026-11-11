# Spec Delta

## ADDED Requirements

### Requirement: Publish a template from an approved build
The server SHALL be able to create an encounter template from a draft encounter that its owner chose to publish. The server MUST build the template itself from the draft, using the library map and creature values at that moment, and MUST validate it with the shared template schema. A client MUST NOT be able to send board data for this. Saving from a room is unchanged.

#### Scenario: Publish a draft encounter
- **WHEN** the owner publishes a draft encounter with a confirmed grid and six tokens on squares
- **THEN** the library lists a template with that map, that grid, walls and doors from the map, and six tokens at the board positions of those squares

#### Scenario: Tokens have no owners
- **WHEN** a template is published from a build
- **THEN** its tokens have no owners and no initiative score

#### Scenario: A token across a wall
- **WHEN** a draft token's square would put it across a wall of the map
- **THEN** the page reports this, and the encounter can't be published until the token is moved or removed

#### Scenario: Invalid data
- **WHEN** a draft would give a template that fails the shared schema
- **THEN** nothing is published, and the page names the item
