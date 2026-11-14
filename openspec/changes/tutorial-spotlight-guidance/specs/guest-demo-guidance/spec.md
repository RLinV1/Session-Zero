## Purpose

Lets a guest GM find the real control each interactive demo step is about, and teaches map preparation and terrain painting as part of the demo.

## ADDED Requirements

### Requirement: Demo steps spotlight their control
While a demo step is shown and its control is on screen, the room SHALL dim everything except that control, SHALL draw a ring around the control, and SHALL point the step card at the control with an arrow. The control and the rest of the room SHALL stay usable: the dimming SHALL NOT take clicks, keys or focus. When the control is the board itself, or is larger than half the screen, the room SHALL NOT dim and SHALL show the step as it does today. Under reduced motion the ring SHALL NOT pulse. The spotlight SHALL follow the control when it moves, resizes or scrolls, and SHALL go away when the step ends, the demo is skipped, or the control leaves the screen.

#### Scenario: Roll button is spotlit
- **WHEN** guest GM Sam reaches "Roll dice" while the Dice section is on screen
- **THEN** the screen dims except the Roll button, the Roll button has a ring, the step card's arrow points at it, and pressing Roll makes a roll and moves the demo on

#### Scenario: Board step does not dim
- **WHEN** Sam reaches "Move it"
- **THEN** the board is not dimmed and Sam can drag a token

#### Scenario: Reduced motion
- **WHEN** Sam's system asks for reduced motion and a step is spotlit
- **THEN** the ring is drawn without animation

### Requirement: Show me reveals a hidden control
When a step's control is not on screen (its sidebar tab is not selected, its section is folded, the sidebar is hidden, or it is scrolled away), the step card SHALL offer **Show me**. Show me SHALL open the sidebar if hidden, select the tab that holds the control, unfold its section, scroll the control into view, and then spotlight it. Show me SHALL NOT perform the step's action for the GM. When the control is already on screen, Show me SHALL NOT be offered.

#### Scenario: Token control in another tab
- **WHEN** Sam reaches "Place a token" while the Chat tab is selected
- **THEN** the step offers Show me, and pressing it selects the Tokens tab, scrolls the add-token buttons into view and spotlights them, and no token is added

#### Scenario: Control already visible
- **WHEN** Sam reaches "Invite players" and the Share button is on screen
- **THEN** the step spotlights the Share button and offers no Show me

### Requirement: The demo teaches map preparation and terrain
The demo's steps SHALL be, in order: Your table, Invite players, **Prepare the map**, **Paint terrain**, Place a token, Move it, Hide part of the map, Roll dice, Done. **Prepare the map** SHALL point at the Edit map control and SHALL complete when the room's map setup (grid or walls) changes after the step started. **Paint terrain** SHALL point at the Terrain tool and SHALL complete when the room's terrain changes after the step started. Both steps SHALL follow the existing demo rules: they advance on the GM's real action, they are skipped when already done since the demo began, and they offer Skip demo.

#### Scenario: Map step advances on applying an edit
- **WHEN** Sam is on "Prepare the map", presses Show me, opens Edit map, changes the grid size and applies it
- **THEN** the demo moves to "Paint terrain"

#### Scenario: Terrain step advances on painting
- **WHEN** Sam is on "Paint terrain", picks the Terrain tool and paints difficult ground on the board
- **THEN** the demo moves to "Place a token"

#### Scenario: Closing the editor without a change
- **WHEN** Sam opens Edit map on "Prepare the map" and closes it without applying
- **THEN** the demo stays on "Prepare the map"
