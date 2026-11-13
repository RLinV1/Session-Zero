# gm-dashboard Specification

## Purpose
Gives the GM one place to work outside a room: create a room, reopen the rooms this browser owns, and reach the asset library, behind a single entry rule that points toward accounts without requiring one.

## Requirements

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

### Requirement: One entry rule for the dashboard
A browser SHALL be *recognised* when it holds a GM identity or has previously chosen to continue as a guest. Every way into a GM surface, meaning the GM dashboard and the asset library, SHALL apply the same rule: a recognised browser SHALL reach the surface directly, and any other browser SHALL be taken to the sign-in page first, which then leads to the dashboard. This applies to the home page's link, to other links into those surfaces, and to opening `/gm-dashboard` or `/library` directly. The home page SHALL NOT link to the asset library; the GM dashboard is its way in.

#### Scenario: First-time GM from the home page
- **WHEN** a browser with no GM identity and no guest choice follows the home page's "Set up a room" link
- **THEN** the sign-in page opens, and continuing as a guest from it opens the dashboard

#### Scenario: Direct visit behaves the same
- **WHEN** a browser with no GM identity and no guest choice opens `/gm-dashboard` directly
- **THEN** it is taken to the sign-in page, exactly as if it had followed the home page's link

#### Scenario: Recognised browser goes straight in
- **WHEN** a browser that holds a GM identity, or that chose to continue as a guest before, follows the home page's link or opens `/gm-dashboard`
- **THEN** the dashboard opens with no sign-in step

#### Scenario: Back does not loop
- **WHEN** a browser is taken from the dashboard URL to the sign-in page and the user presses Back
- **THEN** they return to the page they came from, not to a redirect that sends them to sign-in again

#### Scenario: Direct visit to the library
- **WHEN** a browser with no GM identity and no guest choice opens `/library` directly
- **THEN** it is taken to the sign-in page, and pressing Back returns it to the page it came from rather than to the library redirect

#### Scenario: Recognised browser opens the library
- **WHEN** a recognised browser opens `/library`, directly or from the dashboard's library link
- **THEN** the library opens with no sign-in step

#### Scenario: No library link on the home page
- **WHEN** a visitor reads the home page
- **THEN** no link or button opens the asset library, and the library section says it is found on the GM dashboard

### Requirement: Continue as guest
Until accounts exist, the sign-in page SHALL offer "Continue as guest" above the sign-in form. It SHALL state that accounts are not available yet and that the GM's rooms and library are saved in this browser. Continuing as a guest SHALL remember the choice in this browser and open the dashboard. It MUST NOT create a GM identity or send any request.

#### Scenario: Guest choice is remembered
- **WHEN** a user continues as a guest and later follows the home page's link again
- **THEN** the dashboard opens with no sign-in step

#### Scenario: Continuing as a guest creates nothing
- **WHEN** a browser with no GM identity continues as a guest
- **THEN** no GM token is stored, no request is sent, and no GM identity exists until the GM creates a room or uploads to the library

#### Scenario: Storage unavailable
- **WHEN** browser storage cannot be written and the user continues as a guest
- **THEN** the dashboard opens, and the choice holds until the page is reloaded instead of sending the user back to sign-in

### Requirement: GM surfaces lead back to the dashboard
Links on GM surfaces that return the GM to their rooms SHALL open the dashboard. The asset library's link back to the GM's rooms SHALL open `/gm-dashboard`.

#### Scenario: From the library to the rooms
- **WHEN** a GM on the asset library follows its link back to their rooms
- **THEN** the dashboard opens without a full page reload

### Requirement: Create-room form starting values
The dashboard's create-room form SHALL NOT show example or placeholder text in its Room name or Your name boxes. Room name SHALL start empty. Your name SHALL start with the signed-in account's display name. The GM SHALL be able to edit or clear that name, and the room SHALL be created with the name in the box when the form is submitted. Editing it there SHALL NOT change the account's display name. The join page's player name box is not covered by this requirement and SHALL stay empty when the page opens, even for a signed-in player.

#### Scenario: Form opens with the account name
- **WHEN** a GM signed in with the display name "Tony" opens the dashboard
- **THEN** the create-room form's Your name box contains "Tony", the Room name box is empty, and neither box shows placeholder text

#### Scenario: GM changes the pre-filled name
- **WHEN** the GM replaces "Tony" with "DM Tony" in Your name, enters a room name and creates the room
- **THEN** the room is created with "DM Tony" as the GM's display name, and the account's display name is still "Tony"

#### Scenario: Cleared name is still required
- **WHEN** the GM clears Your name and tries to create the room
- **THEN** the form does not submit, as before, because the name is required

#### Scenario: Player join form is not pre-filled
- **WHEN** a signed-in player opens a room's invite link and the join form is shown
- **THEN** the player's Your name box is empty
