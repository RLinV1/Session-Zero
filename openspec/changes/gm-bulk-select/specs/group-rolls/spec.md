## MODIFIED Requirements

### Requirement: GM selects several tokens
The GM SHALL be able to build a token selection on the board in two ways:
- **Shift-click** SHALL add a token the GM can see to the selection, or remove it if it is already selected. A plain click SHALL keep its current single-selection behavior.
- **Shift-drag** on empty board with the Select tool SHALL draw a box in board coordinates and add every token whose centre is inside it, edges included and hidden tokens too, to the selection; tokens already selected stay selected (ADR 0074). A plain drag SHALL keep panning, a drag that starts on a token SHALL keep moving it, and a Shift press that doesn't move SHALL act as a click. Escape SHALL drop a box in progress.
- **Checkboxes** on the rows of the turn order and of the Tokens tab SHALL add a token to the selection or take it out.
- **From a template**: the selection controls SHALL offer **From template**, which puts the GM's board into template-picking mode (crosshair cursor; `Esc` or right-click cancels). Clicking a placed area template SHALL replace the selection with every token whose footprint touches the template's area, including tokens that are hidden or under fog, and SHALL leave picking mode. A token touches the area when any part of its footprint (its size in grid cells, centred on its position) overlaps the area. Merely sharing an edge or corner SHALL NOT count.

After either, the GM SHALL be able to add or remove tokens with shift-click and from a list of the selected tokens. Selected tokens SHALL be marked on the GM's board. The selection SHALL be local to the GM: nothing SHALL be sent to other participants until a roll is made. Players SHALL NOT be offered shift-click selection, Shift-drag, the checkboxes or From template; a Shift-drag by a player pans.

#### Scenario: Shift-click builds a selection
- **WHEN** the GM shift-clicks Goblin 1, Goblin 2 and then Goblin 1 again
- **THEN** only Goblin 2 is selected

#### Scenario: Select tokens from a template
- **WHEN** a 20 ft circle covers Goblin 1 and the edge of a Large Ogre's footprint, and Goblin 2 stands just outside it
- **THEN** picking that template with From template selects Goblin 1 and the Ogre, and not Goblin 2

#### Scenario: Edit the template's selection
- **WHEN** the GM picks a template with From template and then shift-clicks one of the selected tokens and one outside the area
- **THEN** the first is removed and the second is added

#### Scenario: Selection is private
- **WHEN** the GM selects three tokens
- **THEN** players' boards show no selection and nothing is sent to them

#### Scenario: Shift-drag a box
- **WHEN** the GM Shift-drags from empty map around Party Oil, the hidden Gloam Moth 3 and Old Wick
- **THEN** all three join the selection and the map doesn't move

#### Scenario: Plain drag still pans
- **WHEN** the GM drags on empty map without Shift
- **THEN** the map pans and the selection doesn't change
