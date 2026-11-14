# Spec Delta

## MODIFIED Requirements

### Requirement: Apply a template to an existing room
The GM of a room SHALL be able to apply a template to it. Applying SHALL replace the room's board (map, grid, tokens, fog) with the template's, end any running encounter, and clear area templates, except for tokens the GM chooses to carry: those SHALL move to the applied board as staged tokens, as the `carried-tokens` capability defines. It MUST go through the command pipeline as `encounter.apply`, authorised in `decide` as GM only. The event SHALL carry the applied board and the board it replaced, so it can be undone. The room's participants, chat, rolls, checkpoints and name SHALL be untouched. The web client SHALL ask for confirmation before sending the command, and the confirmation SHALL offer the carry checklist. Players MUST NOT receive the event; they SHALL receive a fresh filtered snapshot, so hidden tokens and fog-concealed content stay hidden.

#### Scenario: Replace a board
- **WHEN** the GM applies "Goblin ambush" to a room with other tokens and an active initiative order, carrying nothing
- **THEN** the room shows the template's board, the initiative order is cleared, and chat and participants are unchanged

#### Scenario: Carry the party into a template
- **WHEN** the GM applies "Goblin ambush" with the two player-owned tokens ticked in the carry checklist
- **THEN** the applied board holds the template's tokens and the two player tokens as staged tokens, with the same ids, owners and HP as before

#### Scenario: Undo an apply
- **WHEN** the GM undoes the apply, whether or not it carried tokens
- **THEN** the previous board returns exactly, including its tokens' owners and the carried tokens' old positions

#### Scenario: Player cannot apply
- **WHEN** a player sends `encounter.apply`
- **THEN** the command is rejected as forbidden and the board is unchanged

#### Scenario: Players see no hidden content
- **WHEN** the GM applies a template that holds a hidden token and a fog region
- **THEN** each player gets a resync with the hidden token absent and concealed content withheld, and no event naming either

#### Scenario: Forged or foreign template
- **WHEN** an `encounter.apply` names a template the sender's account does not own, or one that does not exist
- **THEN** it is rejected with the same message and the board is unchanged
