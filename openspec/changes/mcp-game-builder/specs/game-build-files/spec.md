# Spec Delta

## Purpose

Gets maps and token art into a private draft by paths that work for each kind of AI app, with the same or stronger checks than a browser upload.

## ADDED Requirements

### Requirement: Files can be sent with a command
An AI app that can run commands SHALL be able to upload a file to its build with one HTTP multipart request authorized by the pass. File contents MUST NOT be accepted in a tool call.

#### Scenario: Upload from a shell
- **WHEN** Claude Code runs the upload command from the tool's instructions for a local PNG
- **THEN** the file is stored in the draft and appears in the build's file list under its own name

#### Scenario: File bytes in a tool call
- **WHEN** an AI tries to pass image data as a tool argument
- **THEN** no tool has such an argument, and the request limit of 64 KB refuses an oversized call

### Requirement: Files can be dropped in the browser
The build page SHALL accept dragged or chosen files, authorized by the owner's signed-in session. This path SHALL work with any AI app and need nothing from it.

#### Scenario: Chat app with no way to send files
- **WHEN** a user of a chat app drops ten images on the build page
- **THEN** the AI, on its next look at the build, sees the ten files by name

### Requirement: Only images and UVTT files are accepted
A build SHALL accept only PNG, JPEG and WebP images and `.uvtt`, `.dd2vtt` and `.df2vtt` files. The server MUST check what a file really is from its contents, not from its name or declared type, and MUST read an image's real size from the file. PDF and every other type MUST be refused.

#### Scenario: A rulebook is uploaded
- **WHEN** a PDF is sent to a build
- **THEN** the server responds 415, stores nothing, and the message says the rules stay in the AI app

#### Scenario: A disguised file
- **WHEN** an HTML or SVG file is sent named `goblin.png` with type `image/png`
- **THEN** the server responds 415 and stores nothing

#### Scenario: A false size
- **WHEN** a request declares a size other than the image's real size
- **THEN** the real size is recorded

### Requirement: Upload limits match the browser
Each image SHALL be at most 25 MiB and at most 16,384 pixels on an edge. Each UVTT file SHALL be at most 40 MiB and SHALL pass the existing UVTT validation. Uploads through either path SHALL count against the account's existing shared upload budget.

#### Scenario: Too large
- **WHEN** a 30 MiB image is sent
- **THEN** the server responds 413 and stores nothing

#### Scenario: Budget used up
- **WHEN** an account has used its upload budget and a build upload arrives
- **THEN** the server responds 429 with a retry time and stores nothing

#### Scenario: Broken UVTT
- **WHEN** a malformed UVTT file is sent
- **THEN** the upload is refused with the same diagnostics the library import gives

### Requirement: Each build has storage limits
A build SHALL hold at most 100 files, of which at most 20 maps, and at most 500 MiB in total.

#### Scenario: File limit reached
- **WHEN** a build with 100 files receives another
- **THEN** the server responds 409 and stores nothing

#### Scenario: Storage limit reached
- **WHEN** a file would take a build past 500 MiB
- **THEN** the server responds 409 and stores nothing

### Requirement: Pass requests are rate limited
The server SHALL limit each pass to 120 requests per minute, and SHALL limit failed pass attempts per client address.

#### Scenario: Runaway AI
- **WHEN** a pass sends its 121st request within a minute
- **THEN** the server responds 429 with a retry time, and the tool tells the AI to wait

#### Scenario: Guessing passes
- **WHEN** one address sends many requests with invalid passes
- **THEN** the server begins answering 429 for that address

### Requirement: The AI can see a file it needs to identify
A tool SHALL return a reduced picture of one of its own build's files, at most 1500 pixels on the long edge, so the AI can tell which art is which.

#### Scenario: Matching art to a character
- **WHEN** an AI asks to see a dropped file named `IMG_2231.jpg`
- **THEN** it receives a small version of that picture

#### Scenario: A file from elsewhere
- **WHEN** an AI asks to see a file id that isn't in its build
- **THEN** the tool reports that no such file exists

### Requirement: The server never fetches a file from an address it is given
Build tools MUST NOT accept a web address to fetch. Files SHALL arrive only by the two upload paths.

#### Scenario: A link in a tool call
- **WHEN** an AI asks to add a map from a web address
- **THEN** no tool accepts it, and the server makes no outgoing request
