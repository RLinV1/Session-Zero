import { cjk, type Catalog } from "@vtt/shared";
import type { studio } from "../en/studio";

/** Traditional Chinese for `en/studio.ts`. Terms follow docs/GLOSSARY-zh-TW.md (建置 for build, 連線 for connection). */
export const studioZhTW = {
  "title.studioConnect": "連接 AI 應用程式",

  "studio.connect.title": "將 AI 應用程式連接到你的建置",
  "studio.connect.claims": ({ name }) => `一個自稱「${name}」的應用程式要求處理你的建置。`,
  "studio.connect.returnsTo": ({ host }) => cjk`你的回覆會傳回${host}。只有在那是你正在使用的 AI 應用程式時才繼續。`,
  "studio.connect.signedInAs": ({ name }) => `已登入為「${name}」。`,
  "studio.connect.chooseBuilds": "它可以處理的建置",
  "studio.connect.noBuilds": "你沒有開啟中的建置。請先在素材庫中新增一個，再從你的 AI 應用程式重新連線。",
  "studio.connect.can": "它可以讀取這些草稿與其圖片的縮小版本，並在你為每個建置設定的範圍內，儲存生物、地圖、牆、地形與遭遇。",
  "studio.connect.cannot": "它無法發布、變更你的設定、新增檔案、存取你的素材庫或房間，也看不到你的其他建置。檢視與發布都在這個網站上由你進行。",
  "studio.connect.lasts": "連線最長持續 30 天。你隨時可以在建置頁面中斷連線。",
  "studio.connect.allow": "允許",
  "studio.connect.deny": "取消",
  "studio.connect.chooseOne": "請至少選擇一個建置。",
  "studio.connect.returning": "正在返回你的 AI 應用程式…",
  "studio.connect.invalidTitle": "無法使用這個連線要求",
  "studio.connect.failed": "無法傳送你的回覆，請再試一次。",

  "studio.grants.title": "AI 應用程式連線",
  "studio.grants.intro": "在你中斷連線或連線結束之前，這些 AI 應用程式可以處理這個建置。",
  "studio.grants.app": ({ name, host }) => cjk`${name}，回覆傳回${host}`,
  "studio.grants.covers": ({ names }) => `建置：${names}`,
  "studio.grants.dates": ({ since, until }) => cjk`連線於${since} · 結束於${until}`,
  "studio.grants.lastUsed": ({ date }) => cjk`上次使用：${date}`,
  "studio.grants.notUsed": "尚未使用",
  "studio.grants.disconnect": "中斷連線",
  "studio.grants.disconnectNamed": ({ name }) => `中斷「${name}」的連線`,
  "studio.grants.disconnecting": "中斷連線中…",
  "studio.grants.disconnectAll": "中斷連線後，這個應用程式將無法再存取一起列出的所有建置。",
  "studio.grants.failed": "無法中斷連線，請再試一次。",
  "studio.grants.loadFailed": "無法載入 AI 應用程式連線。",
} satisfies Catalog<typeof studio>;
