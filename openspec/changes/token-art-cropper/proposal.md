## Why

Token art upload has no way to arrange the art: the board always draws it centre-cropped into a circle (FR-GM-08). The GM should choose the framing before the image is stored.

## What Changes

- New `TokenArtCropper` modal: image behind the board's circular mask; drag/pinch/wheel/slider/+/- zoom, arrow-key nudge, Reset, Cancel / Use art. Pan is clamped so the circle is always covered.
- It runs after a file is picked in Add Token, the token editor (TokenRoster) and the library "Upload token art" button, and bakes a 512x512 square (PNG/WebP/JPEG as picked) with `canvas.toBlob`. EXIF orientation is applied via `createImageBitmap`.
- The baked File goes through the existing `api.upload` / `api.library.upload` unchanged. No schema, server or event change; tokens still store only `imageUrl` / `assetId`.
- Non-PNG/JPEG/WebP files (e.g. GIF) skip cropping and upload as before; the server's allowlist answers them.
- Map uploads and library-picked art are untouched. Creature forms have no upload of their own (they pick library art), so they are covered through the library button.

## Impact

`apps/web/src/ui/TokenArtCropper.tsx`, `tokenArtCrop.ts` (pure math), `panels/AddToken.tsx`, `panels/TokenRoster.tsx`, `pages/LibraryPage.tsx`, `styles.css` (one block), tests in `apps/web/test`.
