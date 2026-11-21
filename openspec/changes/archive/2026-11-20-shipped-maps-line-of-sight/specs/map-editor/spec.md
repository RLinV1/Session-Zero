## MODIFIED Requirements

### Requirement: The app runs without wall detection
The server SHALL report whether it can detect walls for the room's current map: it can when a queue is configured and at least one vision worker is connected, or when the current map is a built-in map with stored walls for that exact map. When it cannot, Detect walls and Detect like this SHALL be shown disabled with the reason. Drawing and erasing walls, and everything else, SHALL work.

#### Scenario: No Redis or no worker
- **WHEN** the app runs without Redis, or with no wall worker connected, and the room's map is an uploaded map
- **THEN** the Walls step shows detection as unavailable, its detect controls are disabled, and Draw and Erase still work

#### Scenario: Built-in map without the vision service
- **WHEN** the app runs without the vision service and the room's map is a built-in map with stored walls
- **THEN** Detect walls is enabled

## ADDED Requirements

### Requirement: Detect walls uses stored walls for a built-in map
When the GM presses Detect walls and the room's current map is a built-in map with stored walls, matched by its image URL and size, detection SHALL return those stored walls, including their doors and windows, without running the vision service, and SHALL finish immediately. The walls SHALL appear in the usual detection preview, where the GM can erase false ones, and SHALL reach the room only when the GM presses Apply walls. For any other map, Detect walls SHALL run the vision service as before. Detect like this SHALL keep using the vision service.

#### Scenario: Stored walls for a built-in map
- **WHEN** the GM opens the Walls step on Hollowfrost Keep and presses Detect walls
- **THEN** the preview shows Hollowfrost Keep's stored walls at once, and the room's walls change only after Apply walls

#### Scenario: Uploaded map uses the vision service
- **WHEN** the GM presses Detect walls on an uploaded map
- **THEN** detection runs on the vision service, as before

#### Scenario: Same image at another size
- **WHEN** a room's map has a built-in map's URL but a different width or height
- **THEN** the stored walls are not used
