# Design

## Context

See `proposal.md` for why. What the code does today, on `origin/main` at `9185cf7`:

| Path | Route | Real format checked | Real size used | Counted against 300/15 min |
|---|---|---|---|---|
| Library | `POST /api/library` | No | Maps only; a map that can't be read is still stored | Yes |
| Room | `POST /api/uploads` | No | Maps only; wall detection still gets the declared size | Yes |
| Dice look | `PUT /api/library/dice/:id/faces/:die` | Yes, with `image-size` | Must match declared | **No** |
| UVTT, library or room | `/uvtt/imports` | Yes, in its own validator | Yes | Yes |

No table records an image's size in bytes. All three image routes go through `imageUploader`, and all writes end in one of three store methods: `createAsset`, `recordRoomUpload` or `setDiceLookFace`.

Seeded built-in maps are ordinary `library_assets` rows whose object key starts with `shipped:`, with no stored object behind them. A room upload stays until its room is deleted, because old log entries and checkpoints may still name it.

The default deployment is one VM with a 30 GB disk. `upload-storage` keeps each image on local disk and in SeaweedFS, so one stored byte costs two.

## Goals / Non-Goals

**Goals:**

- One place checks every browser image, so a new route can't forget it.
- A cap that concurrent uploads can't pass, and that can't drift from what's stored.
- A release that can't wrongly refuse anyone or remove anything.

**Non-Goals:**

- **Re-encoding images.** The existing rule is no resaving of artwork. A valid image followed by extra bytes is still accepted. It is served as an image with `nosniff`, so it doesn't run.
- **Decoding every pixel.** The check reads headers. A file with a good header and a damaged body gets through, as it does today, and shows as a broken image.
- **A pixel-count limit.** A small file can still describe a very large image within the side limit. This is an existing gap, and a limit would need its own decision about large battle maps.
- **The size in `scene.setMap`.** The command still carries the client's size. Changing that means changing a shared schema.
- **A usage meter in the UI.** People learn the limit from the refusal.
- **Adding dice pictures to the 300/15 min budget, or cleaning up unused room uploads.** Both are real gaps, listed under Risks, and separate from this change.

## Decisions

### D1. The check lives inside `imageUploader` and uses `sharp`

`imageUploader` is the one function all three image routes already call. Once multer has written the file, it reads the metadata, refuses anything that fails and removes the file. On success it returns the real content type, width, height, byte count and object key. A route can't reach storage without passing through it.

`sharp` is already used on maps. A throwaway test with sharp 0.35.5 gave:

| Input | `metadata()` result |
|---|---|
| Real PNG, JPEG, WebP | Correct format and size, under 1 ms |
| GIF, SVG | Reports `gif` / `svg`, so refused by the allow-list |
| Script text, the word "invalid", empty file | Throws, so refused |
| JPEG with orientation 6 | Reports stored size plus `orientation`, so the swap is ours to do |
| 56-byte PNG claiming 20000×20000 | Reports `png` 20000×20000, so it needs the side limit |

The side limit is `MAX_ASSET_EDGE` (16384), the bound already applied to declared sizes.

*Alternatives:* a check in each route is how the dice path ended up different from the others. `file-type` would add a dependency and still not give dimensions. `image-size` reports orientation but doesn't apply it, and it duplicates what `sharp` already does here, so `sharp` replaces it and `image-size` is removed.

### D2. A correct image under the wrong label is accepted under its real type

People often save a WebP from a website as `.png` or `.jpg`, and the browser declares the type from the extension. Those uploads work today. Refusing them would break working behaviour and gain nothing, because the aim is that the stored bytes and served type agree. The temporary file is renamed to the real extension, and the content type passed to storage comes from the bytes.

### D3. The real size replaces the declared size, except on dice looks

Maps already work this way, and the declared fields stay required so no shared schema changes. Dice looks keep their 400 because the existing behaviour and tests require it, and the browser sends the size it just re-encoded to, so a mismatch there means something is wrong.

The room route also passes the real size to wall detection, which fixes the declared-size gap in the table above.

### D4. A map that isn't an image is refused

Today it is stored with `detectionError: "invalid_image"` so the GM can set the grid by hand, but the board can't draw a file that isn't an image, so that fallback leads nowhere. `gridDetection.test.ts` asserts the old behaviour and will change.

The `classical-lsd-grid-detection` contract still holds: a file that passes the header check and then fails in analysis gets a terminal error. Old rows and the `invalid_image` value are untouched.

### D5. Sizes are summed from the rows, not kept in a counter

`library_assets` and `room_uploads` gain a nullable `byte_size INT`. One image is at most 25 MB, so `INT` is enough. Dice pictures record `bytes` inside the existing `faces` JSON.

Usage is computed when needed: the library sum (excluding `shipped:` keys), plus room uploads joined through `rooms.owner_gm_id`, plus `jsonb_each` over dice faces. The owner and room columns involved are already indexed, and uploads are not frequent.

*Alternative:* a running total on `gm_identities`. Every delete path would have to adjust it: library delete, room delete, dice replace, account deletion, legacy claim, failed UVTT drafts. One missed path means a wrong total forever. Summing can't drift, and it makes "deleting frees space at once" automatic.

### D6. The limit is enforced in the store, in one step per owner

This follows `createAnimation`. `createAsset`, `recordRoomUpload` and `setDiceLookFace` take the limits as a required argument and, inside one transaction, take `pg_advisory_xact_lock` on the owner, compute usage, and insert or throw `UploadAllowanceError`. Making the argument required means the compiler points at every caller, including any future one.

The sequence on a route is:

1. Rate limit, as today.
2. **Early check:** already at the limit? Refuse before reading the body, so a full account can't make the server take in 25 MB. Dice pictures skip this, because a replacement may not grow the total.
3. Receive and check the file (D1).
4. Put the object in storage, as today.
5. Record it in the store, which makes the final decision. If that throws, delete the object.

Step 4 occasionally stores an object that step 5 refuses. The alternative, reserving a row before storing, changes every route's order to avoid a rare extra write.

For a replaced die picture the new total is `used - old + new`. A replacement that doesn't grow the total is always allowed.

Ownerless rooms are locked and counted per room, the same fallback the upload rate limit uses. No new ones can be created, since hosting needs an account.

### D7. 1,000 items and 2 GiB, the same for everyone

| Limit | Value | Why |
|---|---|---|
| Library items | 1,000 | Only bounds the unpaginated `GET /api/library` list, so it can be generous |
| Storage | 2 GiB | 80 images at the 25 MB maximum, or about 400 at a typical 5 MB. A heavy campaign of 30 maps and 100 tokens is under 300 MB |

These are constants passed to the store, like `MAX_LIBRARY_ANIMATIONS`. An environment setting isn't warranted while a change is one line and one `up -d --build`. Nothing about the limits varies by account, since no feature ships tiered.

Production data wasn't examined for this plan. The backfill reports the real numbers (D8), so the values can be checked before anyone is likely to be affected.

### D8. Existing accounts: nothing removed, unknown sizes count as zero

A missing size counts as zero, so the release can only under-count. Forgetting the backfill can't refuse anyone.

The backfill script (`npm run uploads:backfill-sizes`) reads each row with a null `byte_size`, skips `shipped:` rows, asks the asset store for the size through a new `AssetStore.sizeOf`, and writes it. It can be re-run safely. It finishes by printing how many accounts are over each limit and the largest totals, by owner id only.

Older dice pictures are not backfilled. They are re-encoded by the browser so they are small, there can be only a few hundred per account at most, and each one gains a size when it is replaced.

### D9. HTTP 409, and no client change

Dice looks already answer 409 for "You can keep up to N". 413 stays reserved for one file that is too big. Every upload screen shows the server's `error` through `errorFrom`, so no UI work is expected; task 5.2 confirms it on each screen.

### D10. No ADR

`CLAUDE.md` requires an ADR for changes to existing `packages/shared` schemas. There are none here: `LibraryUploadFields`, `DirectUploadFields`, `UploadResponse` and `LibraryAsset` stay as they are. Byte sizes are server-side only and never leave through `toWire` or `toView`.

## Risks / Trade-offs

- **Room uploads can't be deleted one at a time.** A GM who uploads directly into one long-running room can only free that space by deleting the room. → The refusal says so, and 2 GiB leaves plenty of room. Safe cleanup of unused room uploads would be its own change, because checkpoints may still name them.
- **The cap protects against one account, not many.** With two copies of each image, seven full accounts fill the default 30 GB disk. → Disk monitoring is a deployment concern and is outside this change.
- **Production usage is unknown.** → Over-limit accounts lose nothing (D8), the backfill reports actual numbers, and the constants are easy to raise.
- **Dice pictures are outside the 300/15 min budget.** They replace in place, so storage doesn't grow, but each one is still a write. → Noted as a follow-up.
- **`sharp` now parses token and dice uploads as well as maps.** → It only reads metadata and already handles untrusted map uploads. Dependency audits already cover it.
- **The game builder plan overlaps.** `mcp-game-builder` proposes its own `sharp` check. → Whichever lands second should call the check from D1. Its publish step would hit the required store argument and so count toward this allowance.

## Migration Plan

1. Deploy as usual. The `migrate` service adds two nullable columns with no table rewrite.
2. The allowance applies from the first request. Older images count as zero bytes, and nothing is removed.
3. An owner runs the backfill once on production. The exact command goes in `docs/DEPLOYMENT.md`. It isn't part of implementing this change.
4. Read the report. If real accounts are over a limit, raise the constant and redeploy.

**Rollback:** revert the code. The columns and the `bytes` field are ignored by the old code, and no data was changed.
