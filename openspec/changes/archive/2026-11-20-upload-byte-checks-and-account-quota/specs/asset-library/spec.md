## MODIFIED Requirements

### Requirement: Upload to library
A GM SHALL be able to upload a PNG, JPEG or WebP image of up to 25 MB as either a map or a token, with a display name. The server SHALL determine the image's format and its pixel width and height from the file's bytes, and SHALL record that size rather than the size the browser declared. Stored object names MUST be random identifiers that do not contain the display name or original filename.

#### Scenario: Upload a map
- **WHEN** a GM uploads a 2048x1536 PNG named "Goblin Cave" as a map
- **THEN** the library lists a map "Goblin Cave" with size 2048x1536 and no saved grid, and opens grid setup

#### Scenario: Unsupported file
- **WHEN** a GM uploads a GIF or a file over 25 MB
- **THEN** the upload is rejected with a clear message and nothing is added to the library

#### Scenario: Renamed file
- **WHEN** a GM uploads a GIF renamed to `cave.png`
- **THEN** the upload is rejected with a clear message and nothing is added to the library

#### Scenario: Declared size differs from the file
- **WHEN** a GM uploads a 64x64 image as a token and the request declares 256x256
- **THEN** the library lists the token with size 64x64

#### Scenario: Object name reveals nothing
- **WHEN** a GM uploads "beholder.png" as a token named "Beholder"
- **THEN** the image URL contains neither "beholder" nor "Beholder"
