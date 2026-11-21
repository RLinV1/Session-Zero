import type { Catalog } from "@vtt/shared";
import type { news } from "../en/news";

/** Traditional Chinese for `en/news.ts`. */
export const newsZhTW = {
  "news.title": "最新消息",
  "news.lead": "Session Zero 的最新變更，由新到舊排列。每篇文章的日期，是功能上線到正式網站的那一天。",
  "news.allUpdates": "所有消息",
  "news.kind.feature": "新功能",
  "news.kind.fix": "修正",
  "news.kind.notice": "公告",
  "news.captions": "英文字幕",
} satisfies Catalog<typeof news>;
