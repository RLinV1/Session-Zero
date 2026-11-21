## ADDED Requirements

### Requirement: Detected walls are reviewed in a modal preview
When automatic wall detection finishes with at least one wall, the Walls step SHALL open a modal named "Detected walls" showing the map image with the detected walls drawn over it, the number found, and Apply and Discard buttons. The review features of `wall-confidence-review` (wall-review) SHALL live in this modal: clicking a detected wall (or activating it from the keyboard) SHALL erase it, drawn faded and struck, and again brings it back; walls the detector was unsure about SHALL carry a pink dashed halo with a legend, and the modal SHALL show how many doubtful walls are not erased; a "Review doubtful walls" control SHALL step through them with Back, Erase or Bring back, and Keep or Finish, highlighting the current wall; Apply SHALL apply every wall not erased, sending the erased indices as `exclude`; and "Apply confident walls only" SHALL leave out doubtful and erased walls and be disabled when none remain. The detected walls SHALL NOT be drawn on the editing canvas, and the side panel SHALL NOT show a preview of the result. Apply SHALL add the walls to the editor draft, sending nothing until Save changes. Discard, Close, Escape and a click on the backdrop SHALL drop the result and add nothing. Focus SHALL move into the modal when it opens and return to Detect walls when it closes.

#### Scenario: Detection finishes
- **WHEN** detection finishes with 7 walls
- **THEN** the "Detected walls" modal opens showing the map with 7 walls and "7 walls found."

#### Scenario: Apply
- **WHEN** the GM presses Apply 7 walls in the modal
- **THEN** the walls are added to the editor draft, the modal closes, and nothing is sent to the room until Save changes

#### Scenario: Discard
- **WHEN** the GM presses Discard or Escape in the modal
- **THEN** the modal closes, no walls are added, and focus is on Detect walls

#### Scenario: Doubtful walls
- **WHEN** some detected walls are doubtful and the GM presses Apply confident walls only
- **THEN** only the confident walls are added

#### Scenario: Erase a wall
- **WHEN** the GM clicks a detected wall in the modal and presses Apply
- **THEN** that wall's index is sent as excluded and the Apply count is one lower

#### Scenario: Review doubtful walls
- **WHEN** the GM presses Review doubtful walls and Erase on the current wall
- **THEN** the wall is erased, the doubtful count drops by one, and the next doubtful wall is current

#### Scenario: Doors and windows
- **WHEN** a result holds a plain wall, a locked door, an open window and a doubtful closed door
- **THEN** the modal says "4 walls found: 1 wall, 2 doors, 1 window.", draws walls orange (as on the Walls canvas), doors gold and windows light blue (as in the Sight step), open ones dashed, closed ones solid and locked ones thicker with a dot at the midpoint, gives every doubtful wall, including the door, a pink dashed halo, labels each wall with its kind and state (such as "Detected wall 2, door, locked"), and lists only the kinds, states, Doubtful and Erased entries that occur in a legend

#### Scenario: Modal fits its content
- **WHEN** the modal is open
- **THEN** the map preview is sized by the map's aspect ratio up to 65% of the viewport height, and the dialog is only as tall as its content with no empty space below it
