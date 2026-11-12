# Spec Delta

## MODIFIED Requirements

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
