# Spec Delta

## MODIFIED Requirements

### Requirement: GM dashboard
The app SHALL provide a GM dashboard at `/gm-dashboard`. It SHALL offer a form to create a room (room name and the GM's display name), list the rooms this browser's GM identity owns with each room's name, when it was last active and an Open action, link to the asset library, offer **Room settings** (see `gm-room-defaults`), and show the account menu. It SHALL state that the rooms it lists are saved in this browser. Room settings SHALL be available to a signed-in GM. Without a signed-in account, it SHALL say that signing in is needed to save room defaults, and SHALL send no request.

#### Scenario: Returning GM finds their rooms
- **WHEN** a browser whose GM identity owns rooms opens the dashboard
- **THEN** each room is listed with its name and last activity, newest activity first, and Open takes the GM into that room

#### Scenario: No rooms yet
- **WHEN** a recognised browser with no GM identity, or whose identity owns no rooms, opens the dashboard
- **THEN** an empty state invites the GM to create their first room, and no request for rooms is made when there is no GM identity

#### Scenario: Creating a room from the dashboard
- **WHEN** a GM submits a room name and their display name on the dashboard
- **THEN** the room is created, owned by this browser's GM identity (created now if there was none), and the GM is taken into it

#### Scenario: Room list cannot be loaded
- **WHEN** the rooms request fails
- **THEN** the dashboard still offers room creation and the library link, and shows that the room list could not be loaded

#### Scenario: Opening Room settings
- **WHEN** a signed-in GM chooses Room settings on the dashboard
- **THEN** Room settings opens with their saved defaults, and closing it returns focus to the Room settings control

#### Scenario: Room settings without an account
- **WHEN** a guest who is not signed in chooses Room settings
- **THEN** it says signing in is needed to save room defaults, and no request is sent
