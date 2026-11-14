# Interactive Scene Studio — Spec Delta

## Purpose

Let an owner use their own AI to prepare an image-based scene, see saved results inside a compatible chat, make precise visual corrections, and publish a reviewed candidate through Session Zero while unpublished artwork remains protected.

## ADDED Requirements

### Requirement: A Studio opens an authorized saved build

The Studio SHALL open the same saved build through the website and an MCP Apps interface. It SHALL identify the build, its owner and the active map and encounter. Identifiers and links MUST NOT themselves authorize access. Room credentials MUST NOT authorize Studio access, and another owner's build SHALL be indistinguishable from an unknown build to an unauthorized requester.

#### Scenario: Open in two surfaces
- **WHEN** an authorized owner opens the same build on the website and in the embedded Studio
- **THEN** both surfaces identify the same build and can retrieve its saved working version

#### Scenario: A foreign build identifier
- **WHEN** a caller requests a build outside their granted access
- **THEN** no build data or artwork is returned, and the response reveals no more than a request for an unknown build

### Requirement: Hosted access is scoped and revocable

The hosted Studio SHALL authenticate through delegated access linked to the owner's Session Zero identity and explicitly authorized builds. Delegation MUST NOT grant library enumeration, account changes, room access, owner-choice changes or publication. The server SHALL enforce expiry, revocation and build choices when committing a write. An embedded view MUST NOT depend on the website's session cookie being available inside the host.

#### Scenario: Revoke during a proposal
- **WHEN** the owner revokes a grant while a proposal is being prepared and it has not committed
- **THEN** the later commit is refused and the previously saved working version remains

#### Scenario: AI enables terrain for itself
- **WHEN** a delegated client attempts to enable the owner's terrain choice
- **THEN** the request is refused and the choice remains unchanged

### Requirement: Unpublished Studio artwork requires authorized delivery

New unpublished Studio originals, working images, thumbnails and crops SHALL require authorized access to their build. They MUST NOT be readable from public upload paths, storage endpoints or static fallbacks. Private responses SHALL prevent shared caching. Derived media SHALL inherit source access and expiry. Previously public artwork SHALL retain an explicit disclosure of that provenance; making a private copy MUST NOT be described as revoking earlier disclosure.

#### Scenario: Guess a private object path
- **WHEN** a requester without valid build access requests an original or derived Studio image through an application path or storage endpoint
- **THEN** no image bytes or private metadata are returned

#### Scenario: Expired access to a crop
- **WHEN** access expires and the view requests another crop
- **THEN** the request is refused, the saved draft remains, and the view offers recovery without a public-image fallback

#### Scenario: A legacy public source
- **WHEN** an owner selects artwork that already had a public URL
- **THEN** the Studio explains that prior disclosure persists and does not label the artwork as newly private without that qualification

### Requirement: Artwork can enter a build from the embedded Studio

The user SHALL be able to supply original map images and token art through the embedded Studio without visiting the website for each file. Supported chat-attachment import SHALL be explicit. The Studio SHALL report each file's outcome and retain earlier successful files after a later failure. Intake SHALL enforce existing type, decoded-image and build quotas, and SHALL identify the original and canonical working image used for coordinates. Chat attachment presence alone MUST NOT imply successful Session Zero intake.

#### Scenario: Add map and token art
- **WHEN** a user supplies a map and two pieces of token art in the embedded Studio
- **THEN** validated originals are stored in the authorized build, the map is displayed, and each item reports a saved outcome

#### Scenario: Expired attachment descriptor
- **WHEN** an imported attachment can no longer be retrieved
- **THEN** the Studio asks for another selection, keeps the existing draft, and does not silently substitute a thumbnail

#### Scenario: Invalid file among valid files
- **WHEN** one supplied file fails validation after another has been saved
- **THEN** the invalid file is refused with a reason and the earlier saved file remains available

### Requirement: The user's AI authors through deterministic build tools

Scene authoring SHALL use the user's chosen AI and Session Zero's deterministic tools. The Studio MUST NOT invoke a backend inference model to author the scene, issue an AI GM credential or mutate a live room. Existing grid suggestions, builder fields, validation and owner choices SHALL remain authoritative. Unknown source values SHALL remain unknown and be flagged.

#### Scenario: Prepare a chapel
- **WHEN** the user's AI prepares walls, Base terrain and skeleton placements for an authorized chapel map
- **THEN** the results are stored as private build data under the permitted choices, with no room or library changes

#### Scenario: Unsupported creature values
- **WHEN** the supplied material does not give a creature's armor class
- **THEN** the value remains blank with an uncertainty flag instead of being invented

### Requirement: Initial preparation is visible as saved work arrives

The embedded Studio SHALL display saved source imagery, grid, walls, doors/windows, permanent terrain and encounter placements during initial preparation. It SHALL refresh other tool writes without requiring website navigation, within one configured active refresh interval. It SHALL distinguish unfinished work, saved results, blocking problems and interpretation questions. Progress MUST NOT claim knowledge of internal model reasoning or invented completion percentages.

#### Scenario: Geometry arrives after opening the view
- **WHEN** the Studio is open and the AI saves a batch of walls through another tool call
- **THEN** the same working view retrieves and displays that saved batch without a manual page reload

#### Scenario: Waiting for the model
- **WHEN** no further tool result has been saved while the AI analyzes the image
- **THEN** the view accurately shows that it is awaiting further work and does not fabricate new geometry or a percentage

#### Scenario: Save fails
- **WHEN** a terrain save is refused
- **THEN** the view retains the last saved terrain and displays the failure instead of presenting the refused terrain as committed

### Requirement: Selection and inspection use saved map coordinates

The Studio SHALL support rectangular region selection and picking supported objects. Saved selections SHALL bind the map source, grid, active encounter where relevant, and inspected revision. Bounds SHALL be independent of screen coordinates and camera transforms. The AI SHALL be able to retrieve a detailed view and structured information for that selection using native grid conventions, including cropped-edge terrain cells.

#### Scenario: Select after zooming
- **WHEN** the user zooms and pans before selecting the east doorway
- **THEN** the saved request identifies that doorway in canonical map coordinates and retrieves a crop of the same location

#### Scenario: Another view changes its selection
- **WHEN** a second view selects a different room
- **THEN** the first saved correction continues to identify its own room and base revision

### Requirement: A correction has an enforced edit scope

A correction SHALL distinguish inspection context from permitted edits. The server SHALL enforce the selected layers, terrain cells, objects and authorized destination region. A whole crossing object SHALL be visibly identified before it is included. Unauthorized direct or dependent edits SHALL refuse the complete correction without a partial write. A correction MUST NOT expand its own permissions.

#### Scenario: Terrain-only correction
- **WHEN** the user authorizes courtyard terrain changes and the AI also tries to remove a wall
- **THEN** the correction is refused, naming the scope problem, and neither change is committed

#### Scenario: Wall crosses the rectangle
- **WHEN** a wall extends outside the selected rectangle
- **THEN** the Studio shows its full extent before including it as an editable object and never silently clips it at the rectangle edge

#### Scenario: Out-of-scope destination
- **WHEN** a token move would put its footprint outside the authorized destination region
- **THEN** the correction is refused and the original placement remains

### Requirement: User actions explicitly submit correction instructions

The user SHALL be able to enter correction instructions for a saved selection and submit them into the AI conversation. The view SHALL distinguish a prepared request, a host handoff, observed AI activity and a saved result. Host acknowledgement alone MUST NOT be shown as completed AI work. Selecting, rendering or hovering MUST NOT automatically submit a prompt. Where no chat bridge is available, the website SHALL supply a saved request and copyable instruction.

#### Scenario: Correct rubble
- **WHEN** the user selects the courtyard and submits "Keep the path clear; only rubble is difficult"
- **THEN** the request retains that instruction and exact selection, and the AI can retrieve it through authorized tools

#### Scenario: Host requires the user to send
- **WHEN** the host prepares the message in its composer or requires consent
- **THEN** the Studio shows a pending handoff until further activity is observed and does not report a completed correction

### Requirement: Saved candidates have immutable revision identities

Saved authoring batches and correction candidates SHALL have immutable identities, ancestry, source/grid bindings and relevant dependency versions. Lines, marks, openings and placements SHALL have stable authoring identities sufficient for supported corrections. Choosing or restoring a private working candidate MUST NOT imply approval for publication. Image bytes MUST NOT be duplicated per revision.

#### Scenario: Correct the same sentry twice
- **WHEN** a user refines the same sentry's position through two correction rounds
- **THEN** both candidates remain distinguishable, the placement retains its identity, and the later instruction can refer to it unambiguously

#### Scenario: Restore a prior candidate
- **WHEN** the owner restores an earlier authoring state
- **THEN** a new current revision records that state and earlier history remains unchanged

### Requirement: Proposals name the version inspected by the AI

A correction SHALL name its base revision. Advancing the working version SHALL require the same current revision and applicable source/dependency bindings at commit. A stale proposal SHALL be retained for inspection but MUST NOT replace the working version automatically. Concurrent changes SHALL produce an explicit conflict instead of silent last-write-wins behavior. Identical retried operations SHALL not create duplicate effects.

#### Scenario: Two AI requests overlap
- **WHEN** two requests use the same base and the first advances the working version
- **THEN** the second cannot advance it without a fresh base, and its work remains available as stale

#### Scenario: Retry after a lost reply
- **WHEN** a client retries the same successful operation after losing its response
- **THEN** it receives the retained outcome without another revision or duplicated placement

### Requirement: Owner edits remain protected across authoring paths

Owner changes SHALL advance the relevant Studio version and remain protected from in-place AI overwrite. Legacy replacement tools MUST NOT bypass revision protection for an enrolled target. Ordinary non-Studio builds SHALL retain their current behavior. The AI SHALL be able to propose a separate correction against an owner-edited snapshot without acquiring authority to modify the protected materialized item directly.

#### Scenario: Owner changes a door while AI works
- **WHEN** the owner changes a door after the AI inspected an earlier revision
- **THEN** the owner's edit remains and the AI's earlier proposal cannot replace it automatically

#### Scenario: Old save tool on an enrolled map
- **WHEN** an old client attempts a whole-list replacement without the required Studio revision
- **THEN** the target remains unchanged and the client receives instructions for a supported authoring path

### Requirement: Corrections preserve native geometry and terrain rules

Candidates SHALL preserve native map coverage, grid, portal and token-footprint rules and existing payload limits. Terrain SHALL remain permanent Base terrain with Normal implicit. A source or grid change SHALL invalidate dependent regional requests until revalidated. Publication SHALL require confirmed grids where the current builder requires them, and SHALL reject stale terrain and blocked placements. Unsupported imported source-geometry edits SHALL be identified without silently changing or dropping source content.

#### Scenario: Grid changes under a request
- **WHEN** the map's grid changes after a terrain request was saved
- **THEN** the earlier request cannot be promoted or published without revalidation on the new grid

#### Scenario: Token on Blocked terrain
- **WHEN** a candidate places a token footprint on Blocked terrain
- **THEN** the problem names the placement and prevents publication; Difficult terrain alone does not reject placement

### Requirement: Revisions can be compared visually

The Studio SHALL compare the reference or earlier candidate with the selected candidate at a shared camera position. It SHALL identify additions, removals, movements, portal-state changes and visibility changes using text or shapes as well as color. The user SHALL be able to focus a change and request a refinement without a compulsory website approval between rounds. Partial acceptance of a dependent correction SHALL NOT be offered in the first release.

#### Scenario: Before and proposed
- **WHEN** the user compares a doorway correction
- **THEN** the camera remains fixed while the earlier and proposed geometry can be inspected and the change is described

#### Scenario: Continue another correction
- **WHEN** the user asks for a second private correction in ChatGPT
- **THEN** it can use the current working candidate without first publishing or accepting it on the website

### Requirement: Final owner review binds an exact candidate and dependencies

Review on the website SHALL identify the exact selected candidate and the map, grid/profile, encounter, creature and artwork values publication will use. The page MUST NOT silently replace that candidate with a newer one. The server SHALL recheck relevant versions at commit. A changed dependency or working version SHALL require fresh owner review, with no partial publication.

#### Scenario: A new candidate arrives during review
- **WHEN** the AI saves a newer candidate after the owner opens review
- **THEN** the page identifies that change, and publishing the stale review is refused until the owner reviews the current selection

#### Scenario: A reused library creature changes
- **WHEN** a publication dependency changes after the owner inspected it
- **THEN** publication cannot silently use the changed value and requires a fresh review

### Requirement: Only the owner publishes and failed publication preserves privacy

Publication SHALL require the owner's signed-in website session and existing origin protections. A pass, delegated AI token or embedded-view capability MUST NOT authorize it. Publication SHALL remain add-only, atomic for the chosen dependency set and idempotent. Unpublished media MUST NOT become publicly readable before the library/publication state commits. A failed publication SHALL leave its artwork protected. The review SHALL explain the resulting library image-delivery behavior.

#### Scenario: AI requests publication
- **WHEN** a delegated AI or pass calls publication directly
- **THEN** it is refused and no library item or public media access is created

#### Scenario: Failure on the last dependency
- **WHEN** publication fails after preparing its last dependency
- **THEN** no chosen library item is added and no previously private artwork becomes publicly readable

#### Scenario: Repeat a successful publish
- **WHEN** the owner retries the same successful publication
- **THEN** the existing result is returned or reused without duplicate library items

### Requirement: Published scenes use existing native room behavior

Published maps and encounters SHALL retain the reviewed grid, geometry, permanent terrain, creature values, placements and hidden states. Starting a room SHALL use the existing owner-controlled path and viewer filtering. Unpublished Studio data and authoring history MUST NOT reach players, and no GM credential SHALL be supplied to the AI.

#### Scenario: Start the reviewed encounter
- **WHEN** the owner starts a room from the published chapel encounter
- **THEN** the room has its reviewed setup and a joining player does not receive hidden skeletons or Studio history

### Requirement: Reopening and cleanup preserve the saved-state contract

Closing or unmounting a view SHALL not discard saved candidates. Reopening after reauthorization SHALL recover the saved working version, subject to build retention. Superseded views SHALL not bypass current write checks. Discard, abandoned-build cleanup and account deletion SHALL include Studio requests, revisions, grants and private media according to existing build retention, without deleting published assets still in use. Ordinary view refreshes SHALL not extend retention as if an edit occurred.

#### Scenario: Reopen after authentication expires
- **WHEN** access expires and the owner reconnects before build expiry
- **THEN** the Studio reloads the saved candidate instead of starting another build or losing prior corrections

#### Scenario: Discard after partial publication
- **WHEN** the owner discards a build that published some items
- **THEN** unpublished Studio content and access are removed while the published items and their required media remain

### Requirement: Host support and qualification are stated accurately

ChatGPT web SHALL be the first fully qualified embedded journey. Hosts without the required capabilities SHALL retain useful text/image tool results and website access. Optional panels and host file helpers MUST NOT be assumed available everywhere. Verification SHALL distinguish automated tests, local browser behavior, actual host behavior and production deployment. An edge browser challenge MUST NOT be treated as proof of origin service availability or unavailability.

#### Scenario: Text-only client
- **WHEN** a client does not render MCP Apps
- **THEN** authorized tools remain useful and provide a website review path without claiming an embedded workspace was shown

#### Scenario: Proxy browser challenge
- **WHEN** a public probe receives a browser challenge before reaching the MCP service
- **THEN** the result records an edge barrier and leaves origin and complete client qualification unverified

### Requirement: The workspace supports accessible and localized review

New Studio controls and user-facing messages SHALL follow the repository's English and zh-TW localization conventions. Selection, comparison, change navigation and cancellation SHALL have keyboard-accessible controls. Saved updates SHALL not steal focus or reset the camera. Narrow layouts and error/expired-access states SHALL retain the core review and recovery actions.

#### Scenario: Saved work during keyboard review
- **WHEN** a keyboard user is inspecting a change and another saved batch arrives
- **THEN** focus and camera remain stable, and the new version is announced without replacing the selection silently
