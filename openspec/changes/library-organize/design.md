## Context

Library items are account data behind REST (ADR 0004, 0012, 0024, 0038); nothing here touches a room. The library page (`LibraryPage.tsx`) rendered five hand-built grids of cards with per-card actions. The contract decision is recorded in [ADR 0075](../../../docs/adr/0075-library-folders.md).

## Decisions

### D1. A folder is a name on its items, per tab
`folder: string | null` on asset, creature, template and animation rows. A folder exists while something holds it; New folder asks for a name and then for what to put in it (or moves the chosen items at once). Renaming moves everything in the folder in one request; renaming onto another folder's name merges them. A typed name that matches an existing folder apart from case joins it. Maps and token art are both assets but separate lists, so their folders are separate. One endpoint, `POST /api/library/move-to-folder` with a `kind`, files any of them. Alternatives (a folder table, one list across tabs, a route per kind) rejected in the ADR.

### D1b. One folder list component for every tab
`LibraryFolderedList.tsx` (`FolderedList`) owns a tab's organizing: sort preference, folder chips, sections under All, a folder's own view, selection, Move to folder and the New/Rename/Remove folder dialogs. A tab passes its items, how to draw a card, when an item counts as made, and its own bulk actions (Creatures: Edit and Delete; the rest: Delete). The page keeps one folder view per tab and passes it down, so something made inside a folder (an upload, a new creature, a new animation) goes in it. Maps and token art use `key={kind}` so switching between them starts a fresh list.

### D2. One reusable selection model
`ui/selection.ts` holds the pure rules (`clickSelection`, `keepShown`) and a `useSelection(order)` hook. `order` is the ids as shown; anything that stops being shown (search, another folder, deleted) drops out, so an action never touches a hidden item. `LibraryListTools.tsx` holds the shared pieces: `ListBar` (left: a tab's filters; right: Sort and Select), `SelectableCard` (the `<li>` with its box), `SelectionBar` and `BulkDeleteDialog`. Each tab chooses its actions. The Shift-click anchor is read before the state update, since React may run the updater after the anchor moves.

### D3. Selecting changes what a card click means
While selecting, a click on a card (outside its own controls) chooses it, and the card's own actions are hidden with `visibility` so the grid does not move. The box is the keyboard path; the card click is a larger pointer target. On touch screens (`hover: none`) the box appears only after Select.

### D4. Sorting is local and per tab
`sortItems(items, key, date)` uses `Intl.Collator(locale, { numeric: true, sensitivity: "base" })`, falling back to the name and then the id for ties. "Newest" is `createdAt` for maps, art and creatures and `updatedAt` for templates and animations (their lists already ran by last save). The choice is stored in `localStorage` under `vtt.ui.librarySort` as one record per tab; several tabs' lists can be mounted, so a write re-reads the record and replaces only its own key.

### D5. Bulk delete for maps, art and templates reuses the per-item endpoints
Usage is read for each chosen asset (four requests at a time) and combined, each room, creature and template named once, so the warning is never stale (asset-library). Deletes run four at a time; any that fail stay chosen and the page says how many. Creatures use the new all-at-once endpoint because Edit must be all or nothing.

### D6. Build publish files its items under the build name
`buildFolder(name)` trims and cuts the build's name to 60 characters; maps, art, creatures and templates published from the build get it. Items published earlier are untouched.

## Risks

- A folder with more than 500 items can't be renamed in one request (the bulk limit). Not expected for a GM's library; the request fails with 400 and changes nothing.
- Folder names are case-sensitive on the server; the client's case-insensitive join keeps the GM from making near-duplicates by typing.
