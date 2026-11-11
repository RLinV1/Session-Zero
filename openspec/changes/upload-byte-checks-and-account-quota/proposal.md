# Proposal

## Why

Browser uploads are checked less than they look. `imageUploader` accepts a file because of the type the browser declared, so on library and room uploads a script labelled `image/png` is stored and served as an image. Only dice pictures are refused for having the wrong bytes. Maps get their real size read but are kept even when unreadable, and token art keeps whatever size the client claimed.

Nothing limits what an account keeps. The budget of 300 uploads per 15 minutes allows about 7.5 GB per window, every window, and the default deployment has one 30 GB disk that holds each image twice. One account can fill it in an hour.

## What Changes

- **Every image is checked from its bytes.** Library, room and dice-look uploads all go through one check that reads the real format and pixel size. A file that isn't really a PNG, JPEG or WebP is refused with 415, and nothing is kept.
- **The real size replaces the claimed size** on library and room uploads, token art included. Dice looks keep refusing a mismatch, as they do today.
- **A correctly formed image with the wrong label is accepted and stored under its real type.** A WebP saved as `.png` works today, and it keeps working.
- **BREAKING for one case:** a map whose bytes aren't an image used to be stored and sent to manual grid setup. It is now refused, because the board could never have drawn it.
- **Each account gets an upload allowance:** 1,000 library items and 2 GB of images, counted across library art, uploads in rooms it owns, and dice pictures. UVTT imports count too, since they store the same kind of file. Built-in maps don't count. Every account gets the same allowance.
- **Going over gets a clear 409** that says what to delete, and leaves nothing behind.
- **Existing accounts lose nothing.** An account already over the limit keeps everything and can still use and delete it. It just can't add more until it's back under.

## Capabilities

### New Capabilities

- `upload-limits`: what a file must really be to be accepted, and how much one account may keep.

### Modified Capabilities

- `asset-library`: an upload's format and pixel size come from its bytes, not from what the browser declared.

## Impact

- `apps/server`: `http/imageUpload.ts`, `domain/uploadAnalysis.ts`, `http/library.ts`, `http/routes.ts`, `http/uvttRoutes.ts`, `uvtt/uploads.ts`, `ownership/diceLooks.ts`, both room stores, `store/assetStore.ts`, and a new backfill script.
- Database: a nullable `byte_size` column on `library_assets` and `room_uploads`. Dice pictures record their size inside the existing `faces` JSON.
- `image-size` is removed, since `sharp` does its job and nothing else uses it.
- `apps/web`: no change expected. Every upload screen already shows the server's message.
- `packages/shared`: no change to any schema, so no ADR is needed.
- Deployment: one backfill script, safe to re-run, to record the size of images already stored. It is run once after release and documented in `docs/DEPLOYMENT.md`.
