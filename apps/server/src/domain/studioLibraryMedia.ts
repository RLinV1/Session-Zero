import type { LibraryAssetRecord, LibraryStore } from "../store/libraryStore";
import type { StudioMediaStore } from "../store/studioMediaStore";

const PREFIX = "studio-original-";
const ALIAS = /^studio-original-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(png|jpg|webp)$/;

export function studioAlias(assetId: string, contentType: string) {
  const extension = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp";
  return `${PREFIX}${assetId}.${extension}`;
}
export const isStudioAlias = (part: string) => part.toLowerCase().startsWith(PREFIX);

export async function readStudioAlias(store: LibraryStore, media: StudioMediaStore | null, key: string, maxBytes: number) {
  const id = ALIAS.exec(key)?.[1];
  if (!id || !media) return null;
  const original = await store.findStudioOriginal(id);
  if (!original || !isStudioOriginal(original) || studioAlias(id, original.contentType) !== key) return null;
  const bytes = await media.read(original.key, maxBytes);
  if (!bytes) return null;
  const current = await store.findStudioOriginal(id);
  if (current?.key !== original.key || current.contentType !== original.contentType) return null;
  return { bytes, contentType: original.contentType };
}

function isStudioOriginal(original: NonNullable<LibraryAssetRecord["studioOriginal"]>) {
  return /^studio-private\/v1\/[0-9a-f-]{36}\/original\.(png|jpg|webp)$/.test(original.key)
    && ["image/png", "image/jpeg", "image/webp"].includes(original.contentType);
}
