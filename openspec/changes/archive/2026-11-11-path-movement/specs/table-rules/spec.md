# Spec Delta

## MODIFIED Requirements

### Requirement: Table tab
The Settings dialog's Table tab SHALL be shown only to the GM, and only outside a preview. It SHALL hold exactly these controls, with these labels and no hint text: "Remove tokens at 0 HP" with the choices All, Only NPC tokens and Off; a switch "Hide map from players without a token"; a switch "Hide HP from Players"; a switch "Hide AC from Players"; "Diagonals" with the choices Equal cost, Alternating (1, 2) and Euclidean; "Difficult terrain applies" with the choices On entry, On exit and Both. Every rule SHALL belong to the room: it applies on every scene, survives reloads and reconnects, and is the same for every participant. Only the GM SHALL be able to change a rule. The server SHALL refuse a player's change as forbidden and a change to the value a rule already has as invalid. Every participant SHALL be able to read the rules. A change SHALL reach every connected participant without a reload, and the GM's activity log SHALL record who changed which rule to what.

#### Scenario: GM sees the rules
- **WHEN** the GM opens Settings and chooses the Table tab
- **THEN** it shows "Remove tokens at 0 HP" (All, Only NPC tokens, Off), "Hide map from players without a token", "Hide HP from Players", "Hide AC from Players", "Diagonals" (Equal cost, Alternating (1, 2), Euclidean) and "Difficult terrain applies" (On entry, On exit, Both), and nothing else

#### Scenario: Players cannot change a rule
- **WHEN** a player opens Settings, and then sends a change to "Hide HP from Players" or "Diagonals" anyway
- **THEN** there is no Table tab, and the change is refused as forbidden

#### Scenario: Unchanged value refused
- **WHEN** the GM sets "Hide AC from Players" on while it is already on, or sets "Difficult terrain applies" to On entry while it is already On entry
- **THEN** the server refuses it as invalid and nothing is recorded

#### Scenario: Defaults in a new room
- **WHEN** the GM creates a room
- **THEN** "Remove tokens at 0 HP" is All, the three switches are off, "Diagonals" is Equal cost and "Difficult terrain applies" is On entry

#### Scenario: Older room
- **WHEN** a room saved before "Diagonals" and "Difficult terrain applies" existed is loaded
- **THEN** they read Equal cost and On entry
