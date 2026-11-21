## ADDED Requirements

### Requirement: Every uploaded image is checked from its bytes
The server SHALL read the real format of every image uploaded to the library, to a room or to a dice look from the file's own bytes, before the image is stored or recorded. The type the browser declared SHALL only be an early filter. A file whose bytes are not a PNG, JPEG or WebP SHALL be refused with HTTP 415 and a message naming the allowed types, and no copy of it SHALL remain on disk or in object storage.

#### Scenario: Script labelled as an image in the library
- **WHEN** a GM uploads a text file containing a script, declared as `image/png`, to the library
- **THEN** the server responds 415, nothing is added to the library, and no copy of the file remains

#### Scenario: GIF labelled as a PNG in a room
- **WHEN** a GM uploads a GIF declared as `image/png` to their room
- **THEN** the server responds 415 and no room upload is recorded

#### Scenario: SVG labelled as a PNG
- **WHEN** a GM uploads an SVG declared as `image/png`
- **THEN** the server responds 415

#### Scenario: Not a picture on a dice look
- **WHEN** an account uploads a text file as a die's picture
- **THEN** the server responds 415 and that die keeps its current picture

#### Scenario: Map whose bytes are not an image
- **WHEN** a GM uploads a map declared as `image/png` whose bytes are not an image
- **THEN** the server responds 415, no map is stored, and no grid analysis runs

#### Scenario: Allowed format under the wrong label
- **WHEN** a GM uploads a real JPEG declared as `image/png`
- **THEN** the upload is accepted, its object name ends in `.jpg`, and it is served as `image/jpeg`

### Requirement: The recorded size is the image's real size
For library and room uploads, the server SHALL record the pixel width and height read from the image's bytes, whatever size the client declared. The size SHALL account for a JPEG's stored orientation, so it matches how a browser draws the image. A dice-look picture whose real size differs from the declared size SHALL still be refused with HTTP 400. An image more than 16384 pixels on either side SHALL be refused with HTTP 413, whatever size was declared.

#### Scenario: Token art with a false size
- **WHEN** a GM uploads a 64×64 image as token art declaring 256×256
- **THEN** the library records it as 64×64

#### Scenario: Room token upload with no declared size
- **WHEN** a GM uploads a 64×64 token image to a room without declaring a size
- **THEN** the room's upload record stores 64×64

#### Scenario: Wall analysis uses the real size
- **WHEN** a GM uploads a 700×500 map to a room declaring 1400×1000, and wall detection is available
- **THEN** wall detection is queued with 700×500

#### Scenario: Photo taken sideways
- **WHEN** a GM uploads a 4000×3000 JPEG whose stored orientation rotates it a quarter turn
- **THEN** the recorded size is 3000×4000

#### Scenario: Dice picture with a false size
- **WHEN** an account uploads a 512×512 die picture declaring 256×256
- **THEN** the server responds 400 and that die keeps its current picture

#### Scenario: Image too large on one side
- **WHEN** a GM uploads a real PNG that is 20000 pixels wide, declaring 1000 pixels wide
- **THEN** the server responds 413 and no copy of the file remains

#### Scenario: Map too large to analyze is still accepted
- **WHEN** a GM uploads a 5000×4000 map, within the side limit but over the grid analysis ceiling
- **THEN** the map is stored and its grid analysis ends in the terminal oversized error, as before

### Requirement: Each account has an upload allowance
An account SHALL keep at most 1,000 library items and at most 2 GiB of uploaded images. Every account SHALL have the same allowance. The allowance MUST hold when uploads arrive at the same time.

#### Scenario: Library is full
- **WHEN** an account holding 1,000 library items uploads another
- **THEN** the server responds 409 with a message giving the limit, and nothing is added

#### Scenario: A smaller image still fits
- **WHEN** an account with 1 MB of storage left uploads a 500 KB image after a 5 MB image was refused
- **THEN** the smaller image is accepted

#### Scenario: Uploads at the same moment
- **WHEN** an account with room for one more image sends two uploads at the same moment
- **THEN** exactly one is accepted and no copy of the other remains

#### Scenario: Already at the limit
- **WHEN** an account with no storage left uploads to the library or a room
- **THEN** the server refuses before storing the file

### Requirement: The allowance counts everything an account stores
The storage total SHALL cover library art and maps, images uploaded to rooms the account owns, and dice-look pictures. UVTT imports SHALL count as the images they store. Built-in maps SHALL NOT count toward either limit. A room with no owner SHALL have its own 2 GiB storage allowance.

#### Scenario: Storage used up through a room
- **WHEN** an account has used all but 1 MB of its storage and uploads a 5 MB image to a room it owns
- **THEN** the server responds 409 and no room upload is recorded

#### Scenario: Built-in maps are free
- **WHEN** an account's library holds the seeded built-in maps and 999 uploaded items
- **THEN** the account can upload one more item

#### Scenario: Replacing a die's picture
- **WHEN** an account with no storage left replaces a die's picture with one that is the same size or smaller
- **THEN** the replacement is accepted, because the total doesn't grow

#### Scenario: UVTT import over the limit
- **WHEN** an account with no storage left imports a UVTT file to its library
- **THEN** the server responds 409 and no map or image is kept

#### Scenario: Room with no owner
- **WHEN** a room with no owner holds 2 GiB of uploaded images and its GM uploads another
- **THEN** the server responds 409

### Requirement: Refusals say what to do
A refusal for being over the allowance SHALL use HTTP 409 and a message that states the limit and what the person can delete to make room. It SHALL NOT carry `Retry-After`, because waiting does not help. A refused upload SHALL leave nothing behind on disk, in object storage or in the database.

#### Scenario: Storage message
- **WHEN** an upload is refused for exceeding storage
- **THEN** the message names the 2 GB limit and says to delete library art, dice pictures or rooms no longer needed

#### Scenario: Library message
- **WHEN** an upload is refused because the library is full
- **THEN** the message names the 1,000-item limit and says to delete some items

#### Scenario: Nothing left behind
- **WHEN** an upload is refused after its bytes were received
- **THEN** its temporary file and any stored object are removed

### Requirement: Existing accounts keep what they have
Reaching the allowance SHALL only stop new uploads. The server SHALL NOT delete, hide or block anything an account already holds, including when the account is already over a limit. Deleting anything SHALL free its share of the allowance at once. Moving a device identity's items into an account SHALL NOT be refused for exceeding the allowance. An image stored before sizes were recorded SHALL count as zero bytes until its size is filled in, and SHALL still count as a library item.

#### Scenario: Account already over the limit
- **WHEN** an account holding 3 GiB opens its library and places a map in a room
- **THEN** its art loads and the placement succeeds

#### Scenario: Getting back under
- **WHEN** an account over the limit deletes enough to fall below it
- **THEN** its next upload that fits is accepted

#### Scenario: Deleting a room frees its uploads
- **WHEN** an account deletes a room holding 500 MB of direct uploads
- **THEN** the account's storage total falls by 500 MB

#### Scenario: Moving a device library into an account
- **WHEN** moving a device identity's assets would put the account over the allowance
- **THEN** the move completes, and only new uploads are refused until the account is back under

#### Scenario: Image from before sizes were recorded
- **WHEN** an account has older images with no recorded size
- **THEN** they add nothing to its storage total until the backfill records their size, so the release cannot wrongly refuse an upload
