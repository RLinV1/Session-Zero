# Traditional Chinese glossary (zh-TW)

**Status:** Approved · **Change:** `openspec/changes/language-setting-zh-tw` · **Capability:** `localization`

**Approved by:** Vincent Chen, 2026-11-10, as drafted (棋子 for token, 恐慌 and 擒抱 for Frightened and Grappled, 你 for "you")

Every Traditional Chinese string in the app, the board, server messages and the activity log uses these terms, so a word reads the same everywhere (localization: "Game terms are consistent"). Settle a term here first, then use it in the catalogs: `packages/shared/src/i18n/zh-TW.ts`, `apps/server/src/i18n/zh-TW.ts` and `apps/web/src/i18n/zh-TW/`.

## Voice and typography

- **Taiwan Mandarin**, not Mainland usage (see "Taiwan vocabulary" below).
- **Address the reader as 你**, matching the English "you". Not 您: the product is a game table, not a bank.
- **Full-width punctuation** in Chinese sentences: ，。、：；！？（）. Use **「」** for quotations and names in sentences (`重新命名場景「地窖」`), and 『』 inside them.
- **A half-width space between Chinese and Latin letters or digits**: `3 天前`, `GM 已移除你`, `擲出 1d20+5`. No space next to full-width punctuation. In catalog code, write values with the `cjk` tagged template (`cjk`${name}已不存在``), which adds this space at each value's edges only where a Han character meets a Latin letter or digit.
- **Arabic digits** for every number. Dice notation (`1d20+5`), board coordinates and the room's distance unit (`ft`, set by the GM) are written as they are.
- **"…" (one character)** for work in progress: `載入中…`, `儲存中…`.
- **Buttons are verbs** of two to four characters where possible (`儲存`, `套用`, `離開遊戲桌`), like the English.
- **Keep "Session Zero"** in Latin letters; it is the product's name.
- **Don't translate content**: names people typed stay as typed, inside 「」 when a sentence quotes them.

## Product terms

| English | 繁體中文 | Notes |
|---|---|---|
| GM | GM | Taiwanese TRPG players say GM. On first explanation: GM（遊戲主持人）. |
| Player | 玩家 | |
| Room | 房間 | The thing you create and share. |
| Table (the live session) | 遊戲桌 | "Leave table" → 離開遊戲桌. |
| Board | 棋盤 | The map surface at the table. |
| Token | 棋子 | Alternative to confirm: 標記. 棋子 reads as a tabletop piece; 標記 collides with "mark"/"marker". Measure word 枚: 一枚棋子, 3 枚棋子, 這枚棋子 (settled in the task 8.4 review). |
| Map | 地圖 | |
| Change map / Edit map | 更換地圖／編輯地圖 | Change map replaces the image; Edit map prepares the one on the table. |
| Save to library | 存入素材庫 | Saves the room's map, grid, walls, fog and terrain to the library. |
| Grid / cell | 網格／格 | "5 ft per cell" → 每格 5 ft. |
| Grid calibration | 網格校準 | |
| Scene | 場景 | |
| Encounter | 遭遇 | Encounter template → 遭遇範本. |
| Library | 素材庫 | Maps, creatures, encounters, animations. |
| Creature | 生物 | Built-in creatures → 內建生物. |
| Map preparation | 地圖準備 | |
| Wall / door / window | 牆／門／窗 | |
| Open / closed / locked (door) | 開啟／關閉／上鎖 | |
| Fog of war | 戰爭迷霧 | Reveal / hide fog → 揭開迷霧／覆蓋迷霧. |
| Line of sight | 視線 | |
| Vision, sight range | 視野、視野範圍 | |
| Terrain: blocked / difficult | 阻擋地形／困難地形 | |
| Ruler | 量尺 | |
| Ping | 提示點 | Verb: 在棋盤上標出提示點. |
| Area effect | 範圍效果 | |
| Circle / cone / box / line | 圓形／錐形／方形／直線 | Area shapes. |
| Checkpoint | 存檔點 | |
| Restore (a checkpoint) | 還原 | |
| Undo / redo | 復原／重做 | |
| Replay | 重播 | |
| Activity log | 活動紀錄 | |
| Invite link | 邀請連結 | |
| Seat | 座位 | |
| Join / leave | 加入／離開 | |
| Remove (a player) | 移除 | |
| Lock joining | 鎖定加入 | |
| Chat / mention | 聊天／提及 | |
| Turn / round | 回合／輪 | "Round 3, Aria's turn" → 第 3 輪，輪到 Aria. |
| Dice look | 骰子外觀 | |
| Animation | 動畫 | |

## Game terms

Terms follow the Chinese translation of the 5e rules where one exists, so players who own the books recognise them.

| English | 繁體中文 | Notes |
|---|---|---|
| Hit points (HP) | 生命值（HP） | Short labels may use HP alone. |
| Armor class (AC) | 護甲等級（AC） | Short labels may use AC alone. |
| Initiative | 先攻 | |
| Attack roll / to hit | 攻擊檢定／命中 | |
| Damage | 傷害 | |
| Hit / miss | 命中／未命中 | Verdicts. |
| Critical hit | 重擊 | |
| Advantage / disadvantage | 優勢／劣勢 | |
| Defeated | 被擊敗 | |
| Roll (verb) | 擲骰 | "Roll 1d20" → 擲 1d20. |
| GM-only roll | 僅 GM 可見的擲骰 | |

## Conditions

The board marker shows one character (`abbr`) where English shows two letters. Each character is distinct.

| English | 繁體中文 | Marker |
|---|---|---|
| Blinded | 目盲 | 盲 |
| Charmed | 魅惑 | 魅 |
| Frightened | 恐慌 | 慌 |
| Grappled | 擒抱 | 擒 |
| Invisible | 隱形 | 隱 |
| Paralyzed | 麻痺 | 痺 |
| Poisoned | 中毒 | 毒 |
| Prone | 倒地 | 倒 |
| Restrained | 束縛 | 縛 |
| Stunned | 震懾 | 懾 |
| Unconscious | 昏迷 | 昏 |
| Concentrating | 專注 | 專 |

## Interface verbs and nouns

| English | 繁體中文 | | English | 繁體中文 |
|---|---|---|---|---|
| Settings | 設定 | | Save | 儲存 |
| Language | 語言 | | Cancel | 取消 |
| Theme (light / dark / system) | 主題（淺色／深色／跟隨系統） | | Done | 完成 |
| Audio / graphics | 音效／畫面 | | Apply | 套用 |
| Sign in / sign up / sign out | 登入／註冊／登出 | | Delete | 刪除 |
| Account | 帳號 | | Rename | 重新命名 |
| Email | 電子郵件 | | Duplicate | 複製 |
| Password | 密碼 | | Upload | 上傳 |
| Display name | 顯示名稱 | | Import / export | 匯入／匯出 |
| Home | 首頁 | | Close | 關閉 |
| Dashboard ("Your rooms") | 你的房間 | | Edit | 編輯 |
| Privacy / terms | 隱私權政策／服務條款 | | Search | 搜尋 |
| Loading… | 載入中… | | Refresh | 重新整理 |

## Taiwan vocabulary

Use the left column. The right column is Mainland usage that reads as foreign in Taiwan.

| Use | Not | | Use | Not |
|---|---|---|---|---|
| 設定 | 設置 | | 帳號 | 賬號 |
| 儲存 | 保存 | | 預設 | 默認 |
| 檔案 | 文件 | | 使用者 | 用戶 |
| 連結 | 鏈接 | | 網路 | 網絡 |
| 伺服器 | 服務器 | | 資料 | 數據 |
| 訊息 | 信息、消息 | | 螢幕 | 屏幕 |
| 視窗 | 窗口 | | 選單 | 菜單 |
| 支援 | 支持 | | 載入 | 加載 |
| 滑鼠 | 鼠標 | | 拖曳 | 拖拽 |
| 捲動 | 滾動 | | 清單 | 列表 |
| 影像、圖片 | 圖像 | | 按一下 | 單擊 |
