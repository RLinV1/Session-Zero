# Spec Delta

## Purpose

Keeps each viewer's board framed sensibly when the canvas changes size, such as rotating a phone or resizing a window, without overriding a camera the viewer positioned deliberately.

## ADDED Requirements

### Requirement: Board refits on canvas resize while the camera is automatic
When the board's canvas changes size and the viewer has not manually panned or zoomed since the board last fitted (or since they last pressed Fit), the board SHALL refit the whole map into the new canvas size without the viewer pressing Fit. This applies to device rotation, browser window resizes and layout changes that resize the canvas.

#### Scenario: Rotate the phone with an untouched camera
- **WHEN** a viewer who has not panned or zoomed rotates their device from portrait to landscape
- **THEN** the map is refit to the new canvas size with no letterboxed dead space beyond the normal fit margin

#### Scenario: Resize the desktop window with an untouched camera
- **WHEN** a viewer who has not panned or zoomed resizes the browser window
- **THEN** the map is refit to the new canvas size

#### Scenario: Tapping the map does not count as moving the camera
- **WHEN** a viewer taps or clicks the map without dragging and then the canvas is resized
- **THEN** the map is refit to the new canvas size

### Requirement: Manual pan or zoom is preserved across resize
When the viewer has manually panned or zoomed, a canvas resize SHALL NOT refit the board or change its zoom. The board SHALL keep the same map point at the centre of the canvas. Dragging the map beyond a small movement threshold, a two-finger gesture whose midpoint moves beyond that threshold, or a wheel or pinch action that changes the zoom level, SHALL count as manual. Centring the view on a token SHALL also count as manual.

#### Scenario: Rotate after zooming
- **WHEN** a viewer has zoomed the board and then rotates their device
- **THEN** the zoom level is unchanged and the map point that was at the centre of the canvas is still at the centre

#### Scenario: Rotate after panning
- **WHEN** a viewer has dragged the map past the threshold and then resizes the canvas
- **THEN** the board is not refit

#### Scenario: Zoom that changes nothing
- **WHEN** a viewer scrolls the wheel at the zoom limit so the zoom level does not change
- **THEN** the camera is still automatic and a later resize refits the board

### Requirement: Fit resumes automatic fitting
Pressing Fit SHALL fit the whole map in view and make the camera automatic again, so later canvas resizes refit the board. Loading a different map SHALL also make the camera automatic.

#### Scenario: Fit after manual zoom
- **WHEN** a viewer zooms, presses Fit, and then rotates their device
- **THEN** the board refits to the new canvas size after the rotation

### Requirement: Resizes do not flash or jump
The board SHALL coalesce a burst of size changes into one canvas resize and redraw once the size has settled. The viewer SHALL NOT see an empty or stretched canvas, or an intermediate framing, during a desktop window resize.

#### Scenario: Drag-resize the desktop window
- **WHEN** a viewer drags the window edge through many intermediate sizes
- **THEN** the board redraws at the settled size and no intermediate blank or stretched frame is shown

### Requirement: Camera stays private to the viewer
Refitting and manual camera changes SHALL affect only that viewer's board. They SHALL NOT change room state, send a command, event or ephemeral message, or be stored, so other participants' viewports (FR-TAC-01) are unaffected.

#### Scenario: One player rotates their phone
- **WHEN** one player's device is rotated and their board refits
- **THEN** no message is sent to the server and every other participant's board is unchanged

### Requirement: Resize handling stops when the board is removed
When the board is removed from the page, it SHALL stop observing size changes and SHALL NOT act on any late resize notification.

#### Scenario: Leave the room during a resize
- **WHEN** the board is removed while a resize is pending
- **THEN** no further resize, refit or render occurs and no error is raised
