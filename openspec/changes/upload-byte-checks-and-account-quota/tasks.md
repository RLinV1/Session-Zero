# Tasks

Run tests only against in-memory stores or a throwaway Postgres on a free port. Don't use the dev database, production, or the servers on ports 3001, 5173 and 3002.

## 1. Check every image from its bytes (FR-GM-02, FR-GM-08, FR-GM-15)

- [ ] 1.1 Add the check to `apps/server/src/http/imageUpload.ts`: read `sharp` metadata, allow only `png`/`jpeg`/`webp`, swap width and height for orientation 5 and above, and refuse sides over `MAX_ASSET_EDGE` with 413. Verify with a new `apps/server/test/imageUpload.test.ts` covering real PNG, JPEG and WebP, GIF, SVG, text, an empty file, orientation 6, and `pngOfSize(20000, 1)`.
- [ ] 1.2 Make `imageUploader` run that check after multer, remove a refused file, rename a mislabelled file to its real extension, and return the real content type, width, height, byte count and key. Verify in the same test file that a JPEG declared as PNG gets a `.jpg` key and no refused file stays in the upload folder.
- [ ] 1.3 Change `inspectMapUpload` in `domain/uploadAnalysis.ts` to take the real size instead of reading metadata itself, keeping the hash and the oversized result. Verify the oversized case in `gridDetection.test.ts` still passes.
- [ ] 1.4 Use the real values in `http/library.ts` for token art as well as maps. Verify in `library.test.ts` that a 1×1 token declared as 256×256 lists as 1×1, updating the assertion near line 138.
- [ ] 1.5 Use the real values in `http/routes.ts`, including the size recorded for tokens and the size passed to `walls.start`. Verify in `wallDetection.test.ts` that detection receives the real size.
- [ ] 1.6 Use the shared check in `ownership/diceLooks.ts`, keep the 400 on mismatch, and remove `image-size` from `apps/server/package.json` and the lockfile. Verify `diceLooks.test.ts` still passes, including its 415 and mismatch cases.
- [ ] 1.7 Change `gridDetection.test.ts` near line 127 to expect 415 for non-image bytes on a map, and correct the comment in `uploadLimit.test.ts` that says bytes only need to exist. Verify `npm test --workspace=@vtt/server` passes.

## 2. Record sizes and enforce the allowance in the stores

- [ ] 2.1 Add a Prisma migration with a nullable `byte_size Int` on `library_assets` and `room_uploads`. Verify `prisma migrate deploy` succeeds on a throwaway database.
- [ ] 2.2 In `store/libraryStore.ts`, add `byteSize` to `LibraryAssetRecord`, `bytes` to `DiceFaceRecord`, `UploadAllowance`, the `UPLOAD_ALLOWANCE` constant (1,000 items, 2 GiB) and `UploadAllowanceError`. Verify by test that neither size field appears in `toWire` or `toView` output.
- [ ] 2.3 Add `uploadUsage` for an owner or an ownerless room to both stores, excluding `shipped:` keys from both the count and the total, counting null sizes as zero and including dice faces. Verify with contract tests in `libraryStore.test.ts` using `storeCases`.
- [ ] 2.4 Make `createAsset`, `recordRoomUpload` and `setDiceLookFace` take the limits as a required argument and enforce them in one step per owner, in both stores, with `used - old + new` for a replaced die. Update the existing test callers. Verify `npm run typecheck` passes.
- [ ] 2.5 Add store contract tests: the item limit, the byte limit, an upload that would cross it, a same-size die replacement at the limit, and two concurrent inserts where exactly one succeeds. Verify on both memory and a throwaway Postgres.

## 3. Refuse on every route

- [ ] 3.1 Library route: early check after the rate limit, then pass the size and limits to the store, delete the object and answer 409 on `UploadAllowanceError`.
- [ ] 3.2 Room route: the same, charged to the room's owner, or to the room when it has none.
- [ ] 3.3 Dice route: pass the size and limits, with no early check, deleting the new object when refused.
- [ ] 3.4 UVTT: count both library imports and room imports in `http/uvttRoutes.ts` and `uvtt/uploads.ts`, map the error to 409 in `failure`, and record the image length as its size.
- [ ] 3.5 Add `apps/server/test/uploadAllowance.test.ts` with `describe("upload allowance (FR-GM-02)")`, seeding usage just under each limit through the store. Cover each route, both messages, no `Retry-After`, built-in maps not counting, and that a refused upload leaves no temporary file or stored object. Verify the suite passes.

## 4. Existing accounts

- [ ] 4.1 Add `AssetStore.sizeOf` for local disk (`stat`) and S3 (`HeadObject`), returning null for a missing object. Verify in `assetStore.test.ts`.
- [ ] 4.2 Add `apps/server/src/scripts/backfillUploadSizes.ts` and the `uploads:backfill-sizes` npm script. It must skip `shipped:` keys, be safe to re-run, leave rows with missing objects null, and print the number of accounts over each limit and the largest totals by owner id only. Verify with a test that a second run changes nothing.
- [ ] 4.3 Test that an account over the limit can still list, place, rename and delete, that deleting brings uploads back, that deleting a room frees its share, and that `claimDeviceOwner` still completes over the limit. Verify the tests pass on `storeCases`.

## 5. Docs and verification

- [ ] 5.1 Update `docs/DESIGN.md` (the limits table and the upload route line) and add the backfill step to `docs/DEPLOYMENT.md`. Verify by checking the backfill command works against a throwaway compose project, using `-p` with a unique name.
- [ ] 5.2 Confirm each upload screen shows the 409 message: library map and token art, room map, room token, and dice look. Add a small display fix only where a screen doesn't. Record each in `verification-log.md`.
- [ ] 5.3 Run `npm run lint && npm run typecheck && npm test`, then the Postgres contract tests with `DATABASE_URL` pointed at a throwaway database. Record the results in `verification-log.md`.
- [ ] 5.4 Browser check from this worktree on free ports, using `127.0.0.1` for sign-in: upload a renamed WebP, a script renamed `.png`, and an upload over the limit using a seeded in-memory store. Record each step in `verification-log.md`.
- [ ] 5.5 Run the `visibility-auditor` agent on the diff to confirm byte sizes and object keys don't reach clients. Fix anything found and record the outcome in `verification-log.md`.

## Workflow follow-up

- An owner runs the backfill on production after release and reads its report.
- Archive this change once it has shipped.
- Possible separate changes: dice pictures joining the 300/15 min budget, and cleaning up unused room uploads.
