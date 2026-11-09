# Spec Delta

## Purpose

Lets a signed-in user give their own AI app narrow, short-lived access to one private draft, without ever handing over their password or session.

## ADDED Requirements

### Requirement: Only a signed-in user starts a build
A signed-in user SHALL be able to start a named AI build from the app. A build SHALL belong to that user's account. An account SHALL have at most 3 open builds at once.

#### Scenario: Start a build
- **WHEN** a signed-in user starts a build named "Hollow Coast"
- **THEN** a private draft exists on their account, and the app shows its build pass and a message to copy to their AI

#### Scenario: Signed out
- **WHEN** a signed-out visitor tries to start a build
- **THEN** the server responds 401 and creates nothing

#### Scenario: Too many open builds
- **WHEN** a user with 3 open builds starts another
- **THEN** the server responds 409 and says to finish or discard one

### Requirement: A build pass is limited, secret and short-lived
Each build SHALL have at most one live pass. A pass SHALL be a random value of at least 256 bits, shown once. The server MUST store only its hash. A pass SHALL end 24 hours after it is made, and making a new pass SHALL end the old one.

#### Scenario: Shown once
- **WHEN** the user leaves the page where a pass was shown and comes back
- **THEN** the pass is not shown again, and the user can make a new one

#### Scenario: Stored as a hash
- **WHEN** the server's stored data is inspected after a pass is made
- **THEN** only a hash of the pass is present

#### Scenario: Expired
- **WHEN** an AI uses a pass more than 24 hours after it was made
- **THEN** the call is refused with a message telling the user to make a new pass in the app

#### Scenario: A new pass ends the old one
- **WHEN** the user makes a new pass and the AI uses the old one
- **THEN** the call is refused

### Requirement: A pass works only on its own build
A build pass SHALL be accepted only by the build routes for its own build. Every other route, and the room socket, MUST treat a pass as no credential at all.

#### Scenario: Library route
- **WHEN** a request carries a build pass to any existing library, room or account route
- **THEN** it is answered exactly as a request with no credential

#### Scenario: Room socket
- **WHEN** a client offers a build pass in the socket handshake
- **THEN** the connection is refused

#### Scenario: Another build
- **WHEN** a request carrying a pass names another build, even one on the same account
- **THEN** it is refused, and the response reveals nothing about that build

### Requirement: What a pass may do
A pass SHALL allow only: reading its own build, adding files to it, viewing those files, and adding, changing or removing draft items in it.

#### Scenario: Allowed work
- **WHEN** an AI with a live pass adds a creature to its build
- **THEN** the draft holds the creature

### Requirement: What a pass may not do
A pass MUST NOT allow reading or changing the library, reading other builds, listing or entering rooms, holding a seat, publishing, deleting anything outside its draft, changing the account, making another pass or extending its own life. No tool SHALL exist for any of these.

#### Scenario: No way to publish
- **WHEN** an AI, however instructed, tries to publish a build with its pass
- **THEN** no such tool exists, and the publish route refuses anything but the owner's signed-in browser session

#### Scenario: Script calling routes directly
- **WHEN** a script holding a pass calls the server directly, without the MCP server
- **THEN** the same limits on what the pass may do apply

### Requirement: The user can end a pass at any time
The build page SHALL offer a way to cancel the pass at once. Changing the account password, discarding the build and deleting the account MUST also end it.

#### Scenario: Cancel
- **WHEN** the user cancels the pass and the AI then calls a tool
- **THEN** the call is refused

#### Scenario: Password changed
- **WHEN** the user changes their password
- **THEN** every pass on the account stops working

### Requirement: The AI app's user can see whose build it is
The first build tool result SHALL name the build and the display name of the account it belongs to, so a person given someone else's pass can notice before sending files.

#### Scenario: Pass from someone else
- **WHEN** an AI is given a pass that belongs to another person's account and reads the build
- **THEN** the result shows that person's display name, and the tool description says to tell the user before uploading anything

### Requirement: Building tools are kept apart from playing tools
Build tools SHALL be served at their own address, `/mcp/build`, and the player address `/mcp` MUST NOT offer them. Build tools MUST NOT accept a seat, and player tools MUST NOT accept a pass.

#### Scenario: Player connector
- **WHEN** an AI connected only to `/mcp` lists its tools
- **THEN** no build tool is listed

#### Scenario: A seat given to a build tool
- **WHEN** a seat value is passed as the pass to a build tool
- **THEN** the call is refused
