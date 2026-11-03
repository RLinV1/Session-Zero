# ADR 0036: Shipped maps seeded as library rows

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Changes:** `openspec/changes/seed-shipped-maps`
**Owner:** Real-Time Architecture (Raymond)

## Context

Shipped maps were a client-side catalog (`builtin:<slug>`), so a room using one recorded only a URL and could not link an encounter template to it (ADR 0024 needs a library map).

## Decision

Each account gets the shipped maps as real `library_assets` rows, once. `gm_identities.shipped_maps_seeded_at` (nullable timestamptz, migration 0014) records that an owner was seeded; deleting a row does not clear it, so a deleted map is not re-seeded. Seeding happens lazily and atomically in `LibraryStore.seedShippedMaps`, on the first library list by an account and on an encounter save that needs it. Rows use `objectKey = shipped:<slug>` and the shipped `/img/...` URL; library delete skips object deletion for that prefix. No `Command`, `DomainEvent` or `RoomState` schema changes; the catalog moves to `packages/shared/src/shippedMaps.ts`.

## Consequences

Existing rooms keep working: `boardFromRoom` resolves a shipped URL to the owner's row. Token art stays a client catalog. Re-measuring a shipped map does not update already-seeded rows.

## Amendment: seeding per map (`openspec/changes/shipped-maps-line-of-sight`)

A once-per-account flag cannot deliver a map added later: every existing account is already marked seeded. Migration 0017 adds `gm_identities.shipped_maps_seeded text[] not null default '{}'` and backfills the three original slugs (`broken-span`, `hollowfrost-keep`, `temple-green-sun`) for every row whose `shipped_maps_seeded_at` is set. `seedShippedMaps` now inserts rows only for catalog slugs not yet in the list and appends them, in one transaction that holds a row lock on the owner's identity, so concurrent calls never insert a slug twice. Deleting a library row never removes its slug, so a deleted map stays deleted. `shipped_maps_seeded_at` is still set on first seeding. The memory store keeps a per-owner set of slugs. Rollback: old code ignores the new column.


## Amendment: guarded factory calibration corrections

The Broken Span and Hollowfrost Keep have measured catalog calibration corrections (see
`docs/map-grid-audit.md`). Each library seeding transaction may update only the grid of an
existing `kind=map` row whose shipped object key, original URL, dimensions and **complete** old
factory GridSpec match exactly. PostgreSQL uses JSONB equality in the conditional UPDATE;
the memory store compares every field and key count. Any custom calibration or line styling
prevents the update. The per-owner identity lock covers corrections and new-map seeding.
Row IDs, names, saved boards, URLs and deletion history remain intact. This also runs when
no new slugs need inserting. It does not rewrite active rooms or event history: an existing
room must reapply its library grid or be manually calibrated. No schema migration is required.
