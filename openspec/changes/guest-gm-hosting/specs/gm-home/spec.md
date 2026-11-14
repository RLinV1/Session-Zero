## RENAMED Requirements

- FROM: `### Requirement: Legacy GM device identity`
- TO: `### Requirement: Guest GM device identity`

## MODIFIED Requirements

### Requirement: Guest GM device identity
A GM without an account SHALL be identified by a GM device identity: a GM token that the browser generates and keeps in local storage. The server SHALL store only a one-way hash of the token. There are two kinds. A *guest* identity is one the server registered through guest room creation (see `guest-hosting`). A *pre-account* identity is one that existed before accounts. The server SHALL record which kind each identity is, and SHALL register new identities only as guest identities, only through guest room creation. The browser SHALL generate a token only when it starts a guest room and holds none, and SHALL reuse a guest token it already holds. Opening a GM surface, signing in or signing up SHALL NOT create an identity.

A guest identity SHALL be able to create guest rooms within the guest limits, and list, open and delete them. A pre-account identity MUST NOT create a room of any kind. It SHALL keep listing, reading, editing and deleting the rooms, library assets and creatures it already owns. No device identity SHALL upload a library asset, create a creature or save an encounter template. Either kind SHALL move into an account only through the explicit move defined in the `user-accounts` capability.

#### Scenario: Starting a guest room creates the identity
- **WHEN** a browser with no GM token starts a guest room
- **THEN** a GM token is generated and stored in the browser, the server registers its hash as a guest identity, and the new guest room is owned by that identity

#### Scenario: A guest token is reused
- **WHEN** a browser that already holds a guest token starts another guest room
- **THEN** no new token is generated, and the room is owned by the same guest identity

#### Scenario: A pre-account identity stays pre-account
- **WHEN** a browser holding a pre-account token tries to start a guest room
- **THEN** the server refuses with 409 `legacy_identity`, creates nothing, and the identity keeps its rooms exactly as they were

#### Scenario: Other GM surfaces create no identity
- **WHEN** a browser with no GM token opens the GM dashboard, the asset library or the sign-in page, or signs up
- **THEN** no GM token is stored and no device identity is created on the server

#### Scenario: Pre-account identity keeps what it has
- **WHEN** a browser holding a known pre-account token lists its rooms, renames one of its assets, or deletes one of its creatures
- **THEN** the request succeeds as before

#### Scenario: Device identity cannot upload or create library items
- **WHEN** a request carries a known GM token and no session, and tries to upload a library asset, create a creature or save an encounter template
- **THEN** the server responds 401 and nothing is created

#### Scenario: Server never holds the raw token
- **WHEN** the server holds a device identity
- **THEN** only a hash of the token is persisted, and the raw token appears in no stored record

#### Scenario: Missing or unknown token
- **WHEN** a request to a GM-only endpoint other than guest room creation carries no session and either no GM token or a token the server does not recognise
- **THEN** the server responds 401 and returns no GM data

### Requirement: The home page does not overstate what is saved
The home page SHALL describe saving rooms and library art as part of a free account. Wherever it mentions the library or saved rooms, it SHALL state that what is saved follows the account to any device. Wherever it offers starting a room without an account, it SHALL NOT call that room saved, and SHALL state that a free account keeps rooms and allows uploading your own maps. It SHALL state that players join without an account.

#### Scenario: The library is presented honestly
- **WHEN** the asset library is promoted on the home page
- **THEN** the page states that the library is kept in the GM's free account and is available from any device they sign in on

#### Scenario: Starting without an account is presented honestly
- **WHEN** the home page offers to start a room without an account
- **THEN** it does not say the room is saved, and it says a free account keeps rooms on any device and allows uploading your own maps

#### Scenario: Players are not asked for an account
- **WHEN** a visitor reads the home page's join path
- **THEN** nothing in it asks for or promotes an account

### Requirement: Both paths in the first screen
The home page SHALL present a path for joining an existing game and a path for running one, both visible without scrolling, with the join path placed before the run path. Each path SHALL be labelled with the reader it is for. The join path SHALL be a form. The run path SHALL be a link that enters the GM dashboard under its entry rule, not a room creation form. A signed-out visitor therefore reaches the sign-in page, which offers "Continue as guest GM" (see `guest-hosting`). Beside the run path, the page SHALL carry the line "No account needed to start. A free account keeps your rooms on any device and lets you upload your own maps." The page SHALL NOT offer a second join form elsewhere.

#### Scenario: Laptop viewport
- **WHEN** a visitor opens `/` in a 1366×768 viewport
- **THEN** the invite link field and its Join button are fully visible without scrolling, above the link for running a game

#### Scenario: Phone viewport
- **WHEN** a visitor opens `/` in a 390×844 viewport
- **THEN** the invite link field, its Join button and the link for running a game are fully visible without scrolling, and appear before the hero map

#### Scenario: Owned rooms do not push join down
- **WHEN** a signed-in GM who owns rooms opens `/`
- **THEN** the join path stays exactly where it is for a first-time visitor, since the home page lists no rooms

#### Scenario: Each path names its reader
- **WHEN** a visitor reads the hero
- **THEN** the join path is labelled for someone joining a game their GM invited them to, and the run path is labelled for someone running a game

#### Scenario: The run path enters the GM flow
- **WHEN** a visitor follows the link for running a game
- **THEN** a signed-in visitor reaches the GM dashboard, and a signed-out visitor reaches the sign-in page, which offers sign-in, sign-up and "Continue as guest GM"

#### Scenario: The hosting rule is stated where it applies
- **WHEN** a visitor reads the run path
- **THEN** the line "No account needed to start. A free account keeps your rooms on any device and lets you upload your own maps." appears beside it

#### Scenario: Join still accepts a link or a code
- **WHEN** a visitor submits a full invite link or a bare invite code in the hero's join field
- **THEN** they are taken to that invite's join page, and input that is neither shows an error beside the field
