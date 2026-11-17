## Why

The asset library is a flat grid per tab. A GM preparing several games (Cairnkeepers, Lanternfall) has every map, image, creature, template and animation in one list per tab, newest first, and every action is per card: deleting twenty creatures is forty clicks, and there is no way to keep a game's items together (FR-GM-08, FR-GM-13). The user asked for a way to sort the library, folders on every tab, and choosing several items to delete or edit at once.

## What Changes

- **Sort on every library list.** Maps, Token Art, Creatures, Encounters and Animations get a "Sort by" control: Newest first, Oldest first, Name A–Z, Name Z–A. Names compare as people read them (case and accents aside, "Goblin 2" before "Goblin 10"). The choice is remembered per tab in the browser. Included-with-the-app sections, Dice and AI builds keep their own order.
- **Folders on every tab.** Maps, Token Art, Creatures, Encounters and Animations each have folders (a name of up to 60 characters), shown the same way through one shared component: a chip per folder with its count, plus All, No folder and New folder. All shows the items in sections by folder. A folder's own view has Rename folder and Remove folder (what is in it stays, with no folder). Each tab's folders are its own. Something made inside a folder goes in it: an uploaded map or image, a new creature (the creature form also gets a Folder field), a new or built-in-started animation; a duplicated animation goes in its original's folder. A published AI build files its maps, art, creatures and templates under the build's name.
- **Choose several items.** Each card in Maps, Token Art, Creatures, Encounters and Animations has a box (shown on hover or focus, and always while selecting). A Select button starts selecting on touch screens. Shift-click chooses a run. A bar follows the selection with its count, Select all, Move to folder and the tab's own actions; Escape or Done stops.
  - Creatures: Edit (size, Max HP, AC for all of them; blank keeps each one's own) and Delete.
  - Maps and Token Art: Delete, after one confirmation naming the rooms, creatures and templates that use any of them.
  - Encounters and Animations: Delete.
- **Contract (ADR 0075):** an optional `folder` on `LibraryAsset`, `LibraryCreature`, `EncounterSummary` and `LibraryAnimation`; `folder` on creature create/update; `POST /api/library/move-to-folder` for any kind; `PATCH /api/library/creatures/bulk` and `POST /api/library/creatures/bulk-delete`. One nullable column on each of the four tables.

## Non-goals

- One folder list shared across tabs (each tab has its own; the same name reads as one game).
- Folders for dice looks and AI builds.
- Empty folders, folder colours or nesting.
- Bulk rename, bulk art or bulk attacks.

## Impact

- `packages/shared/src/protocol.ts` and `animation.ts` (schemas), `apps/server` (`http/library.ts`, `http/creatures.ts`, `http/encounters.ts`, `http/animations.ts`, both stores, Prisma schema and migration, `domain/buildPublish.ts`, server catalogs).
- `apps/web/src/pages/` (`LibraryPage`, `LibraryCreatures`, `LibraryEncounters`, `LibraryAnimations`, new `LibraryFolderedList`, `LibraryCreaturesTab`, `LibraryFolders`, `LibraryListTools`, `LibraryBulkDelete`, `librarySort`), `ui/selection.ts`, `ui/usePersistentState.ts`, `styles.css`, i18n catalogs (en, zh-TW), `docs/GLOSSARY-zh-TW.md`.
- No room state, event, reducer or visibility change.
