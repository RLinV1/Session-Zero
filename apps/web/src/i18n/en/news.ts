import type { CatalogSource } from "@vtt/shared";

/**
 * The What's new page (site-news-and-feedback). Only the page's own words live here; the posts
 * themselves are content in `src/news/entries.ts`, each carrying both languages.
 */
export const news = {
  "news.title": "What's new",
  "news.lead": "What changed in Session Zero, newest first. Each post is dated the day it reached the live site.",
  "news.allUpdates": "All updates",
  "news.kind.feature": "Feature",
  "news.kind.fix": "Fix",
  "news.kind.notice": "Notice",
  "news.captions": "English captions",
} as const satisfies CatalogSource;
