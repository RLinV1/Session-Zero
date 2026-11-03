## ADDED Requirements

### Requirement: Encounter templates retain prepared base terrain
Saving a reusable encounter template SHALL retain base terrain and SHALL omit active temporary terrain effects. Applying or previewing the template SHALL use its saved base. Existing templates without terrain SHALL mean Normal ground. Saving SHALL leave the source room's active effects unchanged.

#### Scenario: Save an encounter during a temporary effect
- **WHEN** the GM saves a room with Difficult base and a temporary Blocked effect as a template
- **THEN** the template retains Difficult base, omits the effect and leaves the source room intact
