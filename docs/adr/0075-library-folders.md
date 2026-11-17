# ADR 0075 — Library folders and bulk library edits

**Status:** Proposed — awaiting review by the Real-Time Architecture owner. Number checked against `origin/main` `8c4f82a1` and open PRs on 2026-11-17 (0074 is taken by PR #217); recheck collisions before merging.

**Requirements:** FR-GM-08 (token setup prepared in advance), FR-GM-13 (reuse across sessions). **Change:** [library-organize](../../openspec/changes/library-organize/proposal.md). **Extends:** ADR 0004 (asset library), ADR 0012 (library creatures), ADR 0024 (encounter templates), ADR 0038 (library animations).

## Context

A GM who prepares several games keeps every map, piece of token art, creature, template and animation in one flat grid per tab. The library page has no way to group them, to order them other than newest first, or to act on more than one card at a time: deleting twenty creatures takes forty clicks. The user asked for a way to sort the library, folders that keep a game's items together on every tab, and choosing several items to delete or edit at once.

Library items are account data, not room state. They never pass through `decide`/`reduce`, and folders never reach a room. The change touches the REST contract in `packages/shared` (`protocol.ts`, `animation.ts`), which is why it needs this record.

## Decision

1. **A folder is a name on the item.** Library assets (maps and token art), creatures, encounter templates and animations each get a nullable `folder`: a trimmed string of 1 to 60 characters, or null for none. There is no folder table: a folder exists while something is in it, renaming a folder moves what is in it, and removing one sets their folder to null. Each tab's folders are its own: a "Cairnkeepers" folder on Maps and one on Creatures are separate lists that share a name. One nullable `folder` column on each of `library_assets`, `library_creatures`, `encounter_templates` and `library_animations`; existing rows read as no folder.
2. **One endpoint files items of any kind.** `POST /api/library/move-to-folder` `{ kind: "asset" | "creature" | "encounter" | "animation", ids, folder }` files up to 500 of the caller's items of one kind in `folder` (null for none) and answers `{ moved }`. All or nothing: an id that isn't the caller's item of that kind answers 404, exactly as for one missing item, and nothing moves. On Postgres the update runs in one transaction that rolls back when the row count differs. Filing never changes `updatedAt`, so a template's place in "newest first" (by last save) does not move.
3. **Contract changes are additive.** `LibraryAsset.folder`, `LibraryCreature.folder`, `EncounterSummary.folder` and `LibraryAnimation.folder` are optional, so older responses and clients keep working. `CreateCreatureRequest` and `UpdateCreatureRequest` also take an optional `folder`, so the creature form can file a creature as it saves it. `CreatureFields`, which builds and the MCP builder share, is unchanged.
4. **Creatures also change and delete in bulk.**
   - `PATCH /api/library/creatures/bulk` `{ ids, patch }` changes up to 500 creatures together. `patch` may set only `folder`, `size`, `maxHp` and `ac` (strict schema): values a group of creatures shares, not a name, art, attacks, starting HP or conditions. All or nothing, as above, and a Max HP below any one's starting HP answers 400.
   - `POST /api/library/creatures/bulk-delete` `{ ids }` deletes those of the caller's creatures and returns `{ deleted }`. Ids already gone, or another GM's, are skipped and not counted, so the response reveals nothing about other accounts.
   - Both paths sit under `/creatures/…` because `PATCH /api/library/:id` already answers `/api/library/creatures`. The bulk routes are registered before `/:id`.
5. **A published AI build files what it publishes under the build's name** (maps, token art, creatures and templates), cut to the folder limit. A game's items arrive together; the GM can move or unfile them like any other.
6. **Sorting and selection are client-only.** Each library tab sorts its own items in the browser by name (locale-aware, numeric) or date, and the choice is a per-browser preference. Maps, token art, templates and animations are deleted several at a time through the existing per-item endpoints, after one confirmation that, for maps and art, combines their usage warnings.

## Alternatives rejected

- **A `library_folders` table with folder ids.** Empty folders and folder colours would be possible, but every write to four kinds of item, the account merge and the build publisher would have to keep folder ids valid, and rename and delete would need endpoints and cascade rules. Names on items give the same grouping with one column each.
- **One folder list shared by every tab.** A game's maps, art and creatures would sit under one name, but a folder would then mix kinds that each tab shows differently, and an empty-on-this-tab folder would need storing. Separate lists per tab keep each tab's chips honest; the same name used on several tabs still reads as one game.
- **A move endpoint per kind.** Four routes with the same rule; one route with a `kind` keeps the rule in one place.
- **Bulk edit through N single PATCH requests.** A failure halfway would leave half the creatures changed, and the Max HP check could not cover the group.

## Consequences

- One additive migration (`20261117090000_library_folders`) and three store methods (`moveToFolder`, `updateCreatures`, `deleteCreatures`) in both stores.
- No room, event, reducer or visibility change: folders and bulk actions never reach a room, and player clients never see a library item's folder.
- Folder names are case-sensitive on the server. The web client joins a typed name to an existing folder that matches apart from case, so the GM does not make "cairnkeepers" next to "Cairnkeepers" by accident.
- Dice looks and AI builds have no folders: dice looks may live only in a browser, and builds are drafts until published (when their items are filed under the build's name).
