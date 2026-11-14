## Purpose

Lets a GM try Session Zero without an account: start a room on a built-in map, invite players and run a real table, using only the maps and art that ship with the app, while storage, abuse and data lifetime stay bounded until the GM saves the room into a free account.

## ADDED Requirements

### Requirement: Start a guest room
The sign-in and sign-up pages SHALL offer **Continue as guest GM**, which opens the guest start page. Home's "Start a room" keeps leading to sign-in, as it does today. The app SHALL provide a guest start page at `/start` for a signed-out visitor. It SHALL let the visitor choose one of the shipped maps, enter their display name, and optionally a room name, which SHALL default to the chosen map's name. Submitting it SHALL create a room owned by this browser's guest GM identity (see `gm-home`, "Guest GM device identity"), with the chosen map and its grid already set, and SHALL take the GM into the room. A room owned by a guest GM identity is a *guest room*. The page SHALL also offer sign-in and sign-up links that lead to the GM dashboard. A signed-in visitor who opens `/start` SHALL be sent to the GM dashboard. When this browser's guest identity already holds guest rooms, the page SHALL list them with name, last activity, Open and Delete. Delete SHALL ask for confirmation and SHALL delete the room fully, as the dashboard's delete does.

A browser that holds a GM token from before accounts SHALL NOT start a guest room with it. The start page SHALL say that this browser has rooms from before accounts and SHALL offer sign-in and sign-up, after which the dashboard offers to bring those rooms into the account. The server SHALL refuse a guest room creation that carries such a token with HTTP 409 and the code `legacy_identity`, and SHALL create nothing.

#### Scenario: Continue as guest GM from sign-in
- **WHEN** a signed-out visitor clicks "Start a room" on the home page and then "Continue as guest GM" on the sign-in page
- **THEN** the guest start page opens

#### Scenario: First visit starts a room
- **WHEN** a signed-out browser with no GM token opens `/start`, picks "Sunken Crypt", enters "Sam" and submits
- **THEN** a guest room named "Sunken Crypt" is created, Sam is its GM, the board shows the Sunken Crypt map on its shipped grid, and the browser now holds a guest GM token

#### Scenario: Server rejects a map that does not ship
- **WHEN** a guest room creation request names a map slug that is not one of the shipped maps
- **THEN** the server responds 400 and no room is created

#### Scenario: Signed-in visitor is sent to the dashboard
- **WHEN** a signed-in browser opens `/start`
- **THEN** it is taken to the GM dashboard

#### Scenario: Returning guest finds their rooms
- **WHEN** a signed-out browser that started a guest room yesterday opens `/start`
- **THEN** that room is listed with its name and last activity, and Open takes the GM back into it

#### Scenario: Guest deletes a room
- **WHEN** a guest GM confirms Delete on one of the listed guest rooms
- **THEN** the room is deleted fully, every connected participant gets the room-deleted screen, and the list no longer shows it

#### Scenario: Pre-account GM is not made a guest
- **WHEN** a signed-out browser holding a GM token from before accounts opens `/start`
- **THEN** the page offers no guest room, says this browser has rooms from before accounts, and offers sign-in and sign-up

#### Scenario: Server refuses a pre-account token
- **WHEN** a request to create a room carries no session and a GM token from before accounts
- **THEN** the server responds 409 with code `legacy_identity`, no room is created, and that identity is unchanged

### Requirement: Guest GMs run a full table
A guest GM SHALL be able to try the whole table, not a demo of it. A guest room SHALL have an invite link like any room, and the guest GM SHALL be able to copy and share it, show its QR code, reset it, lock the room, and revoke players. Players, signed in or not, and AI player seats SHALL join a guest room by its invite exactly as they join any room, and the player cap SHALL be the same. Every table feature SHALL work in a guest room, including scenes, fog, walls and doors, line of sight, terrain, tokens, initiative, attacks, dice, chat, checkpoints and the activity log. The only differences SHALL be those that store files or save to an account: uploads (see "Guest rooms use only built-in art"), saving to the library, encounter templates, and saved room defaults. Each of those SHALL show a short note that a free account allows it, with a link to sign up, instead of an error.

#### Scenario: Guest invites players
- **WHEN** guest GM Sam copies the room's invite link and two friends open it in their own browsers
- **THEN** each enters a name and joins the table with no account, and Sam sees them in the room

#### Scenario: AI player joins a guest room
- **WHEN** a player's AI app joins the guest room through the invite as an AI seat
- **THEN** the seat joins and plays exactly as it would in an account-owned room

#### Scenario: Guest manages access
- **WHEN** guest GM Sam resets the invite link and revokes one player
- **THEN** the old link stops admitting new players and the revoked player is removed, as in any room

#### Scenario: Table features work
- **WHEN** guest GM Sam reveals fog, places a built-in creature, starts initiative and rolls an attack
- **THEN** each works as it does in an account-owned room

#### Scenario: Account-only actions explain themselves
- **WHEN** guest GM Sam opens Save as template or Room settings
- **THEN** a note says a free account allows it and links to sign up, and no request that would fail is sent

### Requirement: A guest room offers an interactive demo
The first time a guest GM opens a guest room in this browser, the room SHALL ask the GM whether they want to try the interactive demo, with Yes and No. No, or Escape, SHALL dismiss the question, and it SHALL not be asked again for that room. Yes SHALL start the demo. The demo SHALL show one step at a time, beside the real control it is about, and SHALL move to the next step when the GM actually does what the step asks, not when they press Next. The steps SHALL be, in order:
1. **Your table**: the board shows the chosen built-in map. A Start button moves on.
2. **Invite players**: copy or share the invite link.
3. **Place a token**: add a built-in token or creature to the board.
4. **Move it**: move a token on the board.
5. **Hide part of the map**: add fog.
6. **Roll dice**: make any roll.
7. **Done**: the room is kept in this browser for 30 days without play, and "Save to a free account" keeps it and allows uploads.

A step whose action is already done when it would start SHALL be skipped. Every step SHALL offer Skip demo, which ends it. The GM SHALL be able to start the demo again from the room's menu. The answer and the progress SHALL be kept in this browser per room, so a reload resumes at the same step, and a declined, finished or skipped demo does not start again. Players SHALL never see the question or the demo, and it SHALL send nothing to the server beyond the GM's own ordinary commands. It SHALL work by keyboard and SHALL fit a 390px-wide screen. It SHALL move focus to the question, and to a step's text when the GM moved on from the demo itself (Yes, Start, starting again). A step reached because the GM did something elsewhere SHALL be announced to screen readers without taking focus, so a key the GM presses for that control (such as Escape to end placing tokens) never skips the demo. Account-owned rooms SHALL NOT ask.

#### Scenario: Guest GM is asked first
- **WHEN** guest GM Sam opens a new guest room for the first time
- **THEN** the room asks whether Sam wants to try the interactive demo

#### Scenario: Guest GM is guided through the table
- **WHEN** Sam answers Yes
- **THEN** the "Your table" step appears, and after Start the "Invite players" step points at the invite control

#### Scenario: Declining is remembered
- **WHEN** Sam answers No and later reloads the room
- **THEN** no demo runs and the question is not asked again, and the room menu can still start the demo

#### Scenario: Steps advance on real actions
- **WHEN** Sam is on "Place a token" and adds a built-in goblin to the board
- **THEN** the tutorial moves to "Move it" without Sam pressing anything in the tutorial

#### Scenario: Done steps are skipped
- **WHEN** Sam already added fog before reaching "Hide part of the map"
- **THEN** that step is skipped and "Roll dice" appears

#### Scenario: Reload resumes
- **WHEN** Sam reloads the page while on "Move it"
- **THEN** the tutorial resumes at "Move it"

#### Scenario: Skip and restart
- **WHEN** Sam chooses Skip demo, reloads, and later starts the demo from the room menu
- **THEN** it does not reappear after the reload, and starting it again begins at "Your table"

#### Scenario: Players never see it
- **WHEN** a player joins Sam's guest room while Sam is on a demo step
- **THEN** the player sees no question, no demo step and no sign of the demo

#### Scenario: Account rooms do not ask
- **WHEN** a signed-in GM opens an account-owned room for the first time
- **THEN** no demo question is asked

### Requirement: Guest rooms use only built-in art
A guest room SHALL show only art that ships with the app: the shipped maps, the built-in token art and the built-in creature art. The server SHALL enforce this, whatever the client shows.

- The server SHALL refuse every request that would store a new file for a guest room: room image uploads of any purpose (map, token art) and UVTT imports. The refusal SHALL be HTTP 403 with the code `guest_upload` and a message that a free account allows uploads. It SHALL be decided before the file is read, and nothing SHALL be stored.
- The server SHALL refuse any room command that would make a guest room's map or a token's image anything other than built-in art. Only the GM can set these today; the check SHALL hold for any participant anyway. The refusal SHALL be the room's ordinary command rejection with the code `guest_asset`, and no event SHALL be stored. This holds however the image is named: by URL, by a library item, by a prepared scene or by an encounter.
- Library uploads, creatures, encounter templates, animations, dice-look pictures and AI builds SHALL keep requiring a signed-in account.
- Dice looks are not board art and SHALL be unaffected.

In a guest room, the GM's map and token pickers SHALL offer only built-in art, and every upload control SHALL be replaced by a note that a free account allows uploads, with a link to sign up.

#### Scenario: Map upload refused
- **WHEN** the GM of a guest room uploads a map image with the room's GM credential
- **THEN** the server responds 403 with code `guest_upload`, and no object, room upload record or allowance use is stored

#### Scenario: Token art upload refused
- **WHEN** the GM of a guest room uploads token art with the room's GM credential
- **THEN** the server responds 403 with code `guest_upload`, and nothing is stored

#### Scenario: UVTT import refused
- **WHEN** the GM of a guest room imports a UVTT file into the room
- **THEN** the server responds 403 with code `guest_upload`, and no draft, image or allowance use is stored

#### Scenario: Another room's image is refused
- **WHEN** a script sends a map change for a guest room naming `/uploads/<key>`, an image uploaded in someone else's room
- **THEN** the command is rejected with code `guest_asset`, and the room's map is unchanged

#### Scenario: A signed-in GM's account art is refused in a room not yet saved
- **WHEN** a guest GM signs in but has not yet moved the guest room into the account, and sets a token's image to a picture from their account library
- **THEN** the command is rejected with code `guest_asset` until the room is moved, and the token's image is unchanged

#### Scenario: Built-ins still work
- **WHEN** the GM of a guest room switches to another shipped map, or places built-in token art or a built-in creature
- **THEN** the change is applied as in any room

#### Scenario: Library needs an account
- **WHEN** a request with a guest GM token and no session tries to upload to the library or create a creature
- **THEN** the server responds 401 and nothing is created

#### Scenario: The room UI offers only built-ins
- **WHEN** the GM of a guest room opens the map picker, the token art picker or an upload control
- **THEN** the pickers list only built-in art, and the upload control is replaced by a note that a free account allows uploads, with a link to sign up

### Requirement: Guest room creation is limited
The server SHALL refuse guest room creation beyond 20 per hour from one client address, counting IPv6 addresses by their /64 prefix, with HTTP 429 and `Retry-After`. Every attempt SHALL count, accepted or not. The server SHALL also refuse with HTTP 409 and the code `guest_room_limit` when the requesting guest identity already holds 3 guest rooms. The message SHALL say to delete a guest room or create a free account. A signed-in account's room creation SHALL NOT be counted against either limit.

#### Scenario: Address limit
- **WHEN** one address sends its 21st guest room creation within an hour
- **THEN** the server responds 429 with `Retry-After`, and no room or identity is created

#### Scenario: Browser limit
- **WHEN** a guest identity that holds 3 guest rooms asks for a 4th
- **THEN** the server responds 409 with code `guest_room_limit`, and the start page says to delete a guest room or create a free account

#### Scenario: Deleting frees a slot
- **WHEN** that guest deletes one of its 3 guest rooms and starts another
- **THEN** the new room is created

#### Scenario: Accounts are not counted
- **WHEN** a signed-in account creates rooms from the same address
- **THEN** neither guest limit applies to them

### Requirement: Idle guest rooms are deleted
A guest room with no room activity for 30 days SHALL be deleted fully, by the same deletion that a GM's delete performs: connected participants are ended with the room-deleted reason, and its log, credentials, snapshots, checkpoints and usage links are removed. Room activity SHALL be the time of the room's latest event, or its creation when it has none. The server SHALL check at least hourly. A guest GM identity that then owns no rooms, and was registered more than a day earlier, SHALL be deleted. Rooms that are not guest rooms, including rooms owned by a GM identity from before accounts, SHALL NOT be deleted by this rule.

#### Scenario: Unused room expires
- **WHEN** a guest room's latest event is 30 days and one hour old and the sweep runs
- **THEN** the room is deleted, and its invite link and credentials no longer work

#### Scenario: A weekly game is kept
- **WHEN** a guest room had a move 8 days ago and the sweep runs
- **THEN** the room is kept

#### Scenario: Pre-account rooms are not swept
- **WHEN** a room owned by a GM identity from before accounts has had no activity for 60 days
- **THEN** the sweep does not delete it

#### Scenario: Empty guest identity removed
- **WHEN** the sweep deletes a guest identity's last room, and the identity was registered 40 days ago
- **THEN** the identity is deleted, and the browser's token is no longer recognised

### Requirement: Save guest rooms to an account
A guest GM SHALL be able to keep their guest rooms with one choice and the sign-up or sign-in form. The guest room's GM view SHALL offer "Save to a free account" in its notice, in the room's menu at all times, and on the demo's last step. It SHALL open sign-up with a destination that marks the save; sign-up SHALL link to sign-in with the same destination, and a browser already signed in SHALL go straight to it. Arriving there signed in, the dashboard SHALL bring this browser's rooms into the account at once, with no further choice, because choosing Save was that choice (see `gm-dashboard`, "Bring this browser's rooms into the account"). A GM who signs in or signs up without choosing Save SHALL get the dashboard's offer instead, and nothing SHALL move until they accept it.

The move SHALL be the existing all-or-nothing move of everything the device identity owns, proven by the session and the device token. It SHALL never happen on sign-in by itself. Once moved, a room is owned by the account and SHALL no longer be a guest room: it SHALL no longer expire under the idle rule, and it SHALL accept uploads and any art under the account's allowance. The GM's existing seat credential SHALL keep working.

#### Scenario: Guest saves their room
- **WHEN** guest GM Sam chooses "Save to a free account" in a guest room and creates an account
- **THEN** with no further click Sam's account owns the room, the dashboard says it was saved and lists it under Hosting, uploading a map in it succeeds, and the idle sweep no longer applies to it

#### Scenario: Save is always within reach
- **WHEN** Sam dismisses the guest notice with "Not now"
- **THEN** "Save to a free account" is still in the room's menu

#### Scenario: Signed-in guest saves
- **WHEN** Sam is already signed in, opens a guest room this browser started, and chooses "Save to a free account"
- **THEN** no sign-up form appears, and the room is moved into Sam's account and listed under Hosting

#### Scenario: Signing up alone moves nothing
- **WHEN** a guest GM creates an account without choosing Save, and does not accept the dashboard's offer
- **THEN** the guest room is still a guest room owned by the browser's guest identity

#### Scenario: Seat survives the move
- **WHEN** the move completes while the GM is connected to the room
- **THEN** the GM stays connected with the same participant and credential

### Requirement: The guest GM is told what is kept
The start page and a guest room's GM view SHALL state that a guest room is kept in this browser only, that clearing site data or using another device loses access to it, and that it is deleted after 30 days without play. They SHALL offer saving to a free account. Neither SHALL describe a guest room as saved, backed up or available on other devices. The notice in the room SHALL be visible to the GM only, and SHALL be dismissible for the current visit. The room's GM SHALL be able to ask the server whether the room is a guest room and how many idle days delete it; any other caller SHALL be refused with 403.

#### Scenario: Notice in the room
- **WHEN** the GM of a guest room opens it
- **THEN** a notice says the room is kept in this browser only and is deleted after 30 days without play, with a link to save it to a free account

#### Scenario: Players do not see the notice
- **WHEN** a player is in a guest room
- **THEN** no guest notice is shown to the player

#### Scenario: Status is GM only
- **WHEN** a player's credential asks the server for the room's guest status
- **THEN** the server responds 403

#### Scenario: Account rooms show no notice
- **WHEN** the GM of an account-owned room opens it
- **THEN** no guest notice is shown
