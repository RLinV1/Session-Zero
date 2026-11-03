/**
 * What a library map upload takes (LibraryPage), named the way the library names them. The home
 * page lists the same, so it never promises a file the library would turn away.
 */
export const MAP_IMAGE_TYPES = [
  { label: "PNG", accept: "image/png" },
  { label: "JPEG", accept: "image/jpeg" },
  { label: "WebP", accept: "image/webp" },
] as const;

/** Exports from other map tools; a UVTT import carries its grid, walls and doors (FR-GM-09). */
export const MAP_IMPORT_TYPES = [
  { label: "UVTT", accept: ".uvtt" },
  { label: "DD2VTT", accept: ".dd2vtt" },
  { label: "DF2VTT", accept: ".df2vtt" },
] as const;

/** The `accept` list for an image upload. */
export const IMAGE_ACCEPT = MAP_IMAGE_TYPES.map((t) => t.accept).join(",");

/** The `accept` list for a library map upload: an image, or a map tool's export. */
export const MAP_ACCEPT = [...MAP_IMAGE_TYPES, ...MAP_IMPORT_TYPES].map((t) => t.accept).join(",");
