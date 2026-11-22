/**
 * What's new (proposed `site-news-and-feedback`): the launch posts, written as press releases.
 * Content, not UI strings, so it lives here rather than in the i18n catalogs, but every post carries
 * both languages. Newest first. Terms follow docs/GLOSSARY-zh-TW.md. Every claim is checked against
 * the code or an ADR; change the post when the product changes.
 *
 * Media: one real screenshot of the app per post, `apps/web/public/news/news-*.webp`, staged on a
 * private local server with art made for that post alone (its own map and token portraits, drawn
 * in code), never the app's shipped maps or library art, except the guest post, which shows the
 * real Start page with its built-in maps. Old trailer and marketing stills sit in
 * `public/news/examples/`, which is local-only and never committed.
 */

export type NewsKind = "feature" | "fix" | "notice";
export type NewsLocale = "en" | "zh-TW";
export type Localized = Record<NewsLocale, string>;
/** A paragraph, a section heading inside the post, or a bulleted list. */
export type NewsBlock = { p: string } | { h: string } | { ul: string[] };

/**
 * The picture or clip at the top of a post, served from `apps/web/public/news/`. `alt` describes
 * what it shows for a screen reader; `caption` is printed under it and says what the reader sees.
 * A video always has a poster, never autoplays, and shows the browser's own controls.
 */
export type NewsMedia =
  | { type: "image"; src: string; width: number; height: number; alt: Localized; caption?: Localized }
  | { type: "video"; src: string; poster: string; width: number; height: number; captionsSrc?: string; alt: Localized; caption?: Localized };

export interface NewsEntry {
  /** Stable and unique; also what "last seen" remembers. */
  id: string;
  /** ISO date the change reached the live site. */
  date: string;
  kind: NewsKind;
  title: Localized;
  media?: NewsMedia;
  body: Record<NewsLocale, NewsBlock[]>;
  link?: { href: string; label: Localized };
}

const shot = (file: string, alt: Localized, caption: Localized): NewsMedia => ({ type: "image", src: `/news/${file}.webp`, width: 1600, height: 900, alt, caption });

export const NEWS: readonly NewsEntry[] = [
  {
    id: "2026-11-18-launch",
    date: "2026-11-18",
    kind: "notice",
    title: {
      en: "Session Zero opens to the public as a free virtual tabletop that runs in the browser",
      "zh-TW": "Session Zero 正式開放：在瀏覽器中執行的免費線上遊戲桌",
    },
    media: shot(
      "news-launch",
      {
        en: "Screenshot of a live encounter in The Lantern Crossroads, a lamplit roadside inn, seen by the game master: the heroes Aria and Tamsin at the door, three bandits among the tables, and the initiative order on the right with Tamsin's turn active.",
        "zh-TW": "遊戲桌「The Lantern Crossroads」中進行中的遭遇截圖，從 GM 的畫面看：燈火通明的路邊旅店裡，英雄 Aria 與 Tamsin 站在門口，三名盜賊散在桌椅之間；右側是先攻順序，目前輪到 Tamsin。",
      },
      {
        en: "A live encounter at a roadside inn, as the game master sees it: initiative rolled, Tamsin's turn.",
        "zh-TW": "路邊旅店中進行中的遭遇（GM 畫面）：先攻已擲出，輪到 Tamsin。",
      },
    ),
    body: {
      en: [
        { p: "November 18, 2026 — Session Zero, a virtual tabletop for tabletop role-playing games, is now open to the public at sessionzero.codes. A game master creates a room and shares one invite link; players join from a laptop, tablet or phone. Nothing is installed, and players do not need an account." },
        { h: "Built for running an encounter" },
        { ul: [
          "Line of sight and fog of war. Walls and doors block vision square by square, and each player sees only what their own character can see.",
          "Initiative and turns. The game master rolls initiative for every token at once; the turn order, the active token and the round are shared with the whole table, and players can end their own turn.",
          "Attacks with rulings. A player rolls to hit and for damage from their token's own attacks, with range checked on the board, and the game master rules on every hit, including half or no damage.",
          "Area effects. Circles, cones, boxes and lines are placed on the board and stay hidden under fog where players cannot see.",
          "Dice in front of everyone. Every roll is thrown onto the board and lands on every screen at the same moment.",
        ] },
        { h: "Nothing gets lost" },
        { p: "Every change at the table is recorded as it happens. The game master can undo a mistake, save a checkpoint before a big fight and return to it, or replay a session step by step. A player whose connection drops rejoins in the same seat, with the board exactly as it is." },
        { h: "Availability" },
        { p: "Session Zero is free, with no paid tier, and runs in current desktop and mobile browsers. Up to 32 players can join a room. The app is available in English and Traditional Chinese, and its source code is published under the MIT license." },
        { h: "About Session Zero" },
        { p: "Session Zero is a browser-based virtual tabletop for tabletop role-playing games. It runs no analytics, advertising or tracking, and it does not sell or share what people create in it. Questions and bug reports go to the project's GitHub issue tracker." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 18 日——專為桌上角色扮演遊戲打造的線上遊戲桌 Session Zero，今天在 sessionzero.codes 正式對外開放。GM 建立房間、分享一個邀請連結，玩家就能用筆電、平板或手機加入。不需要安裝任何東西，玩家也不需要帳號。" },
        { h: "為跑遭遇而設計" },
        { ul: [
          "視線與戰爭迷霧：牆和門會一格一格地擋住視野，每位玩家只看得到自己角色看得到的地方。",
          "先攻與回合：GM 可以一次替所有棋子擲先攻；先攻順序、目前行動的棋子和輪數會同步給整張遊戲桌，玩家也能自己結束回合。",
          "攻擊與裁定：玩家直接用自己棋子的攻擊擲命中和傷害，射程會在棋盤上檢查；每次命中都由 GM 裁定，也可以判定只受一半傷害或不受傷害。",
          "範圍效果：圓形、錐形、方形和直線範圍可以放在棋盤上，玩家看不到的地方會藏在迷霧下。",
          "大家都看得到的骰子：每次擲骰都會擲到棋盤上，同一時間出現在每個人的畫面。",
        ] },
        { h: "不會遺失任何進度" },
        { p: "遊戲桌上的每個變更都會即時記錄下來。GM 可以復原操作失誤、在大戰前建立存檔點並隨時回到那裡，或一步一步重播整場遊戲。斷線的玩家重新連上後會回到原本的座位，棋盤也維持原狀。" },
        { h: "推出方式" },
        { p: "Session Zero 完全免費，沒有付費方案，可以在目前的桌機與行動瀏覽器上使用。每個房間最多可容納 32 位玩家。介面提供英文與繁體中文，原始碼以 MIT 授權條款公開。" },
        { h: "關於 Session Zero" },
        { p: "Session Zero 是在瀏覽器中執行的桌上角色扮演線上遊戲桌。我們不做使用行為分析、不投放廣告、不追蹤使用者，也不會出售或分享使用者在上面建立的內容。如有問題或要回報錯誤，請到專案的 GitHub issue 追蹤頁面。" },
      ],
    },
    link: { href: "/start", label: { en: "Start a game", "zh-TW": "開始一場遊戲" } },
  },
  {
    id: "2026-11-18-studio",
    date: "2026-11-18",
    kind: "feature",
    title: {
      en: "Session Zero Studio lets game masters build a game with their own AI app, and review every item before it is published",
      "zh-TW": "Session Zero 工作室上線：GM 可以用自己的 AI 應用程式建置遊戲，每個項目都經過審閱才發布",
    },
    media: shot(
      "news-studio",
      {
        en: "Screenshot of a Claude chat with Session Zero Studio open in a side panel. The panel shows the build The Sunken Observatory: its map with the grid, walls and openings, and base terrain drawn over it, the display layer checkboxes, and a note that the grid is awaiting confirmation.",
        "zh-TW": "Claude 對話的截圖，Session Zero 工作室開在側邊面板中。面板顯示建置「The Sunken Observatory」：地圖上疊著網格、牆與開口和基礎地形，上方有顯示圖層核取方塊，下方註明網格尚待確認。",
      },
      {
        en: "Session Zero Studio beside a Claude chat. The game master sees the grid, walls and terrain the AI has saved, on the map itself, while they talk.",
        "zh-TW": "Session Zero 工作室開在 Claude 對話旁邊。GM 一邊對話，一邊就能直接在地圖上看到 AI 已儲存的網格、牆和地形。",
      },
    ),
    body: {
      en: [
        { p: "November 18, 2026 — Session Zero today introduced Session Zero Studio, which lets a game master prepare a game with the AI app they already use. The AI does the data entry, drafting maps, creatures and encounters from the rules, stat blocks and art the game master provides. Nothing reaches the game master's library until they have reviewed it and published it themselves." },
        { h: "How it works" },
        { ul: [
          "The game master starts an AI build from the library and connects their AI app to it, either by approving the app on Session Zero's own connection page or with a build pass that works for 24 hours.",
          "The AI adds the map and token art, proposes each map's grid, traces walls, doors and terrain, and writes creatures with their hit points, armor class and attacks.",
          "In AI apps that show interactive views, including Claude and ChatGPT, Studio opens next to the conversation and shows the saved map with its grid, walls and terrain, updating as the AI saves its work.",
          "Everything goes into a private draft. Artwork in a draft is never served from a public address; it becomes public only when it is published.",
          "On the build's review page, the game master checks each item, fixes anything flagged, confirms each map's grid and then publishes.",
        ] },
        { h: "What a connected AI cannot do" },
        { p: "A connected AI app works only on the builds the game master chooses. It cannot publish, change the game master's choices, open their library or rooms, or see their other builds, and the game master can disconnect it at any time. Session Zero sends nothing to an AI company on its own: an AI app sees build data only after the game master connects it." },
        { h: "Availability" },
        { p: "Session Zero Studio is available now to every signed-in game master, at no cost. Published items are filed in the library under the build's name, so a whole game arrives in one folder." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 18 日——Session Zero 今天推出 Session Zero 工作室，讓 GM 用自己已經在用的 AI 應用程式準備遊戲。打字的工作交給 AI：它會依照 GM 提供的規則、生物資料和圖片，起草地圖、生物與遭遇。所有內容都要經過 GM 親自審閱並發布，才會進入 GM 的素材庫。" },
        { h: "運作方式" },
        { ul: [
          "GM 從素材庫開始一個 AI 建置，再把自己的 AI 應用程式連接上去：可以在 Session Zero 自己的連接頁面上允許該應用程式，也可以使用效期 24 小時的建置通行碼。",
          "AI 會加入地圖和棋子圖片、為每張地圖建議網格、描出牆、門和地形，並建立帶有生命值、護甲等級和攻擊的生物。",
          "在能顯示互動畫面的 AI 應用程式中（包括 Claude 和 ChatGPT），工作室會開在對話旁邊，顯示已儲存的地圖及其網格、牆和地形，並在 AI 儲存成果時隨之更新。",
          "所有內容都存放在私人草稿中。草稿裡的圖片不會透過任何公開網址提供，只有發布時才會公開。",
          "在建置的審閱頁面上，GM 逐項檢查、修正被標記的問題、確認每張地圖的網格，最後再發布。",
        ] },
        { h: "已連接的 AI 不能做的事" },
        { p: "已連接的 AI 應用程式只能處理 GM 選定的建置。它不能發布、不能更改 GM 的選擇、不能開啟 GM 的素材庫或房間，也看不到其他建置；GM 隨時都可以中斷連線。Session Zero 不會主動把任何資料傳給 AI 公司：只有在 GM 連接 AI 應用程式之後，該應用程式才會看到建置資料。" },
        { h: "推出方式" },
        { p: "Session Zero 工作室即日起開放所有已登入的 GM 免費使用。發布的項目會以建置名稱歸入素材庫的資料夾，整個遊戲的內容會放在同一個資料夾裡。" },
      ],
    },
    link: { href: "/library", label: { en: "Open the library", "zh-TW": "開啟素材庫" } },
  },
  {
    id: "2026-11-17-library-folders",
    date: "2026-11-17",
    kind: "feature",
    title: {
      en: "Library folders and bulk editing let game masters run several campaigns from one account",
      "zh-TW": "素材庫資料夾與批次編輯上線，一個帳號就能管理多個戰役",
    },
    media: shot(
      "news-library",
      {
        en: "Screenshot of the library's Creatures tab with folder chips for Ashfall Keep, Brinewater Docks and Greenhollow. The three Ashfall Keep creatures, Lava Hound, Cinder Imp and Ember Drake, are checked, and a bar at the bottom reads 3 selected, with Move to folder, Edit and Delete.",
        "zh-TW": "素材庫「生物」分頁截圖，上方有 Ashfall Keep、Brinewater Docks、Greenhollow 三個資料夾標籤。Ashfall Keep 的三個生物 Lava Hound、Cinder Imp 和 Ember Drake 已勾選，底部列顯示已選取 3 項，並有「移到資料夾」「編輯」「刪除」。",
      },
      {
        en: "Creatures filed by game. Three are selected, ready to move, edit or delete together.",
        "zh-TW": "依遊戲歸檔的生物。已選取三個，可以一起移動、編輯或刪除。",
      },
    ),
    body: {
      en: [
        { p: "November 17, 2026 — Session Zero has added folders, sorting and bulk editing to its asset library. A game master who runs more than one campaign can now keep each game's material together and change many items at once, at the table as well as in the library." },
        { h: "Folders and sorting" },
        { ul: [
          "Maps, token art, creatures, encounters and animations can each be filed into named folders. A folder exists as long as something is in it, and renaming it moves everything inside.",
          "Every library tab can be sorted by name or by date, and the choice is remembered in the browser.",
          "When an AI build is published, its maps, token art, creatures and encounters are filed under the build's name automatically.",
        ] },
        { h: "Many items at once" },
        { ul: [
          "Select mode puts a checkbox on every card. Up to 500 selected items can be moved to a folder in one step, or deleted together.",
          "Selected creatures can have their size, maximum hit points or armor class changed together. The change applies to every one of them or to none.",
          "At the table, the game master can Shift-drag across the board to select up to 100 tokens, then remove them from the turn order or delete them in one action. Deleting tokens, one or many, can now be undone.",
        ] },
        { h: "Availability" },
        { p: "Folders, sorting and bulk editing are available now in every signed-in game master's library and in every room." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 17 日——Session Zero 的素材庫新增資料夾、排序與批次編輯功能。同時帶多個戰役的 GM，現在可以把每個遊戲的素材集中在一起，並一次修改多個項目；不只在素材庫，在遊戲桌上也可以。" },
        { h: "資料夾與排序" },
        { ul: [
          "地圖、棋子圖片、生物、遭遇和動畫都能歸入有名稱的資料夾。資料夾只要裡面還有項目就會存在，重新命名資料夾時，裡面的所有項目會一起移動。",
          "素材庫的每個分頁都可以依名稱或日期排序，瀏覽器會記住你的選擇。",
          "AI 建置發布時，其中的地圖、棋子圖片、生物和遭遇會自動歸入以建置名稱命名的資料夾。",
        ] },
        { h: "一次處理多個項目" },
        { ul: [
          "選取模式會在每張卡片上加上核取方塊。一次最多可把 500 個已選取的項目移到同一個資料夾，或一起刪除。",
          "可以一次修改已選取生物的體型、最大生命值或護甲等級；變更會套用到全部，否則就全部不套用。",
          "在遊戲桌上，GM 可以按住 Shift 在棋盤上拖曳，一次選取最多 100 枚棋子，再一鍵把它們移出先攻順序或刪除。刪除棋子（無論一枚或多枚）現在都可以復原。",
        ] },
        { h: "推出方式" },
        { p: "資料夾、排序與批次編輯即日起在所有已登入 GM 的素材庫與每個房間中提供。" },
      ],
    },
    link: { href: "/library", label: { en: "Organize your library", "zh-TW": "整理素材庫" } },
  },
  {
    id: "2026-11-16-playtest-fixes",
    date: "2026-11-16",
    kind: "fix",
    title: {
      en: "Session Zero resolves all 24 requests and bug reports from its first in-person playtest",
      "zh-TW": "Session Zero 完成首次實體試玩的全部 24 項需求與錯誤修正",
    },
    media: shot(
      "news-fixes",
      {
        en: "Screenshot from a player's screen at Mossbank Ford: two orange six-sided dice, showing 3 and 5, have landed on the bridge, and a result card in the corner reads 8, Mira, 2d6 (3, 5).",
        "zh-TW": "Mossbank Ford 中玩家畫面的截圖：兩顆橘色六面骰停在橋上，點數是 3 和 5；角落的結果卡顯示「8，Mira，2d6（3, 5）」。",
      },
      {
        en: "A player's screen as the game master's 2d6 lands on the bridge. Rolls now animate for everyone at the table.",
        "zh-TW": "GM 擲出的 2d6 落在玩家畫面的橋上。現在桌上每個人都看得到擲骰動畫。",
      },
    ),
    body: {
      en: [
        { p: "November 16, 2026 — Session Zero has resolved every item raised at its first in-person playtest: 17 feature requests and 7 bug reports, 24 in all. Each change reached the live site between November 11 and November 16." },
        { h: "Requested by players and game masters" },
        { ul: [
          "Players can end their own turn, and the whole table sees a clear notice when a new turn begins.",
          "The game master can roll initiative for every token at once.",
          "Attacks show their range on the board and warn when a target is out of reach, and a hit can be ruled as half damage or no damage.",
          "Area templates hide under fog and outside a player's sight, and a placed template can be moved and resized.",
          "Attack animations can be previewed before one is chosen.",
          "Terrain is painted straight onto the board, like the other board tools.",
          "Player tokens can be carried from one scene or encounter to the next.",
          "Map editing is split into Change map, which replaces the image, and Edit map, which prepares the map already on the table.",
        ] },
        { h: "Bugs fixed" },
        { ul: [
          "Attack and damage dice now animate on every player's screen, not only the roller's.",
          "Drawings are shared with the whole table.",
          "Moving a token costs the path it actually takes rather than a straight line, and blocked terrain no longer stops movement into the squares around it.",
          "A wall that only grazes a square no longer refuses a token there.",
          "A saved creature's attacks now come with it when it is placed on the board.",
          "Fog and sight edges no longer fade outward past where they end.",
        ] },
        { h: "Availability" },
        { p: "All of these changes are live in every room now. The full list, with how and when each item was resolved, is kept in the project's design documentation." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 16 日——Session Zero 已處理完首次實體試玩中提出的所有項目：17 項功能需求與 7 則錯誤回報，共 24 項。每項變更都在 11 月 11 日到 11 月 16 日之間上線到正式網站。" },
        { h: "玩家與 GM 提出的需求" },
        { ul: [
          "玩家可以自己結束回合，新回合開始時整張遊戲桌都會看到清楚的提示。",
          "GM 可以一次替所有棋子擲先攻。",
          "攻擊會在棋盤上顯示射程，目標超出射程時會提出警告；命中後也能判定只受一半傷害或不受傷害。",
          "範圍範本在迷霧下和玩家視線外會隱藏起來，已放置的範本也可以移動和調整大小。",
          "選擇攻擊動畫前可以先預覽。",
          "地形直接畫在棋盤上，用法和其他棋盤工具一致。",
          "玩家的棋子可以從一個場景或遭遇帶到下一個。",
          "地圖編輯拆成「更換地圖」（替換圖片）和「編輯地圖」（準備遊戲桌上現有的地圖）兩項。",
        ] },
        { h: "已修正的錯誤" },
        { ul: [
          "攻擊與傷害骰現在會在每位玩家的畫面上播放動畫，不再只有擲骰的人看得到。",
          "繪圖會分享給整張遊戲桌。",
          "移動棋子時，消耗依實際走的路徑計算，而不是直線距離；阻擋地形也不會再擋住進入旁邊格子的移動。",
          "只擦過格子邊緣的牆，不會再讓棋子無法放進該格。",
          "已儲存生物的攻擊，現在放到棋盤上時會一起帶過來。",
          "迷霧和視野的邊緣不會再向外淡出到超過應有的範圍。",
        ] },
        { h: "推出方式" },
        { p: "以上所有變更即日起在每個房間生效。完整清單，以及每一項的處理方式與上線日期，都記錄在專案的設計文件中。" },
      ],
    },
  },
  {
    id: "2026-11-14-guest-hosting",
    date: "2026-11-14",
    kind: "feature",
    title: {
      en: "Game masters can now host a table on Session Zero without creating an account",
      "zh-TW": "不需要帳號，也能在 Session Zero 上主持遊戲",
    },
    media: shot(
      "news-guest",
      {
        en: "Screenshot of the Start a room page: six built-in maps to choose from, with Hollowfrost Keep selected, a room name, the game master's name and a Start the room button. Sign in and Create account sit in the header.",
        "zh-TW": "「開始一個房間」頁面截圖：六張內建地圖可供選擇，目前選取 Hollowfrost Keep，下方是房間名稱、GM 名稱和「開始房間」按鈕；頁首有「登入」和「建立帳號」。",
      },
      {
        en: "The Start a room page: pick one of six built-in maps, name the table and start. No sign-in.",
        "zh-TW": "「開始一個房間」頁面：從六張內建地圖中挑一張、替遊戲桌命名，就能開始。不需要登入。",
      },
    ),
    body: {
      en: [
        { p: "November 14, 2026 — Game masters can now host a game on Session Zero without creating an account. A new game master picks one of the built-in maps, names the table and shares the invite link, and the room is ready to play." },
        { h: "What a guest game master gets" },
        { ul: [
          "Six built-in maps with their grid and walls already set: The Broken Span, Hollowfrost Keep, Temple of the Green Sun, Sunken Crypt, Emberwatch Archive and Moonwater Baths.",
          "Every table feature, including line of sight, initiative, attacks, area effects, checkpoints and AI player seats.",
          "The built-in token art and creatures. Uploading new maps or art needs an account.",
          "Up to three rooms per browser.",
        ] },
        { h: "Keeping a room" },
        { p: "A guest room is kept in the browser that created it, and a room nobody plays in for 30 days is deleted. The game master can save their rooms to a free account at any time, which also opens uploads and the full library." },
        { h: "Availability" },
        { p: "Guest hosting is available now from the Start a room page." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 14 日——GM 現在不需要建立帳號，也能在 Session Zero 上主持遊戲。新 GM 只要挑一張內建地圖、替遊戲桌命名，再分享邀請連結，房間就可以開始玩了。" },
        { h: "訪客 GM 可以使用的功能" },
        { ul: [
          "六張已設定好網格和牆的內建地圖：The Broken Span、Hollowfrost Keep、Temple of the Green Sun、Sunken Crypt、Emberwatch Archive 和 Moonwater Baths。",
          "遊戲桌的所有功能，包括視線、先攻、攻擊、範圍效果、存檔點和 AI 玩家座位。",
          "內建的棋子圖片和生物。上傳新的地圖或圖片需要帳號。",
          "每個瀏覽器最多可建立三個房間。",
        ] },
        { h: "保留房間" },
        { p: "訪客房間會保存在建立它的瀏覽器中，30 天沒有人使用的房間會被刪除。GM 隨時可以把房間儲存到免費帳號，同時也能開始上傳素材並使用完整的素材庫。" },
        { h: "推出方式" },
        { p: "訪客主持功能即日起可從「開始一個房間」頁面使用。" },
      ],
    },
    link: { href: "/start", label: { en: "Host a game", "zh-TW": "主持遊戲" } },
  },
  {
    id: "2026-11-11-ai-players",
    date: "2026-11-11",
    kind: "feature",
    title: {
      en: "Session Zero opens player seats to AI apps, so a small group can still field a full party",
      "zh-TW": "Session Zero 開放 AI 應用程式入座當玩家，人少也能湊滿一整隊",
    },
    media: shot(
      "news-ai-players",
      {
        en: "Screenshot of the game master's view of The Frostbound Archive, a library inside a glacier. The table chat shows a message from Wren (AI): My turn? Wren's Frost Mage casts Ray of Frost at the Ice Wraith by the east shelves. @Mira, does a 17 hit AC 13? Wren appears beside the game master in the header.",
        "zh-TW": "GM 視角的「The Frostbound Archive」截圖，這是一座藏在冰川裡的圖書館。聊天室裡有一則來自 Wren (AI) 的訊息：「輪到我了嗎？Wren 的冰霜法師對東側書架旁的 Ice Wraith 施放冰凍射線。@Mira，17 能命中 AC 13 嗎？」頁首顯示 Wren 和 GM 並列。",
      },
      {
        en: "Wren (AI) plays the frost mage and asks the game master for a ruling in the table chat.",
        "zh-TW": "Wren (AI) 操控冰霜法師，在遊戲桌聊天室請 GM 裁定。",
      },
    ),
    body: {
      en: [
        { p: "November 11, 2026 — Session Zero now lets a player's own AI app take a seat at the table. A group that is one player short, or two friends who want a full party, can add AI players in a few steps, with no extra account and no AI cost on Session Zero's side." },
        { h: "How it works" },
        { ul: [
          "The player adds Session Zero to their AI app as a connector, a remote MCP server, at sessionzero.codes/mcp.",
          "In the room, the game master opens Share ▸ Play with your AI and copies a ready-made message: for one character, for a whole party, or for an AI that stays at the table and takes its own turns.",
          "Pasted into the AI app, the message joins the room. The game master then gives the AI a token, as for any other player.",
          "The player tells the AI what to do in plain language, or the AI takes orders in the table chat from the one person its user named, by @mention.",
        ] },
        { h: "Fair play by design" },
        { ul: [
          "An AI only ever holds a player seat, never the game master's.",
          "It sees exactly what its character can see. Fog and line of sight apply to the map image it receives, too.",
          "Its name always carries “(AI)” wherever a name appears.",
          "The game master still rules on every attack, applies damage and runs the turn order.",
        ] },
        { p: "Session Zero never calls an AI model itself. The AI app's usage goes on the player's own plan with that app." },
        { h: "Availability" },
        { p: "AI player seats are available now in every room, guest rooms included." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 11 日——Session Zero 現在讓玩家自己的 AI 應用程式坐上遊戲桌。少一位玩家的團，或想湊滿一整隊的兩個朋友，只要幾個步驟就能加入 AI 玩家；不需要額外的帳號，Session Zero 這邊也不收任何 AI 費用。" },
        { h: "運作方式" },
        { ul: [
          "玩家把 Session Zero 加進自己的 AI 應用程式，作為連接器（遠端 MCP 伺服器），網址是 sessionzero.codes/mcp。",
          "在房間裡，GM 打開「分享 ▸ 和你的 AI 一起玩」，複製一則現成的訊息：可以是操控單一角色、整個隊伍，或是留在遊戲桌上自己輪流行動的 AI。",
          "把訊息貼進 AI 應用程式，它就會加入房間。接著 GM 就像對待其他玩家一樣，分配一枚棋子給它。",
          "玩家可以用一般的話告訴 AI 要做什麼，或讓 AI 在遊戲桌聊天室中，接受使用者指定的那一位成員以 @提及 下達的指令。",
        ] },
        { h: "從設計上確保公平" },
        { ul: [
          "AI 只能坐玩家座位，永遠不能當 GM。",
          "它只看得到自己角色看得到的東西；它收到的地圖圖片也會套用迷霧和視線。",
          "它的名字在任何地方都會標示「(AI)」。",
          "每次攻擊仍由 GM 裁定、套用傷害，並掌控先攻順序。",
        ] },
        { p: "Session Zero 本身從不呼叫任何 AI 模型。AI 應用程式的用量算在玩家自己的方案中。" },
        { h: "推出方式" },
        { p: "AI 玩家座位即日起在每個房間提供，包括訪客房間。" },
      ],
    },
  },
  {
    id: "2026-11-11-zh-tw",
    date: "2026-11-11",
    kind: "feature",
    title: {
      en: "Session Zero is now available in Traditional Chinese",
      "zh-TW": "Session Zero 推出繁體中文版",
    },
    media: shot(
      "news-zh-tw",
      {
        en: "Screenshot of an encounter in The Jade Lantern Garden with the interface in Traditional Chinese: the board toolbar, the initiative order with Fox Spirit's turn, the attack panel and the hints along the bottom are all in Chinese.",
        "zh-TW": "「The Jade Lantern Garden」中一場遭遇的截圖，介面為繁體中文：棋盤工具列、輪到 Fox Spirit 的先攻順序、攻擊面板和底部的操作提示都是中文。",
      },
      {
        en: "An encounter in a lantern-lit garden, with the whole interface in Traditional Chinese.",
        "zh-TW": "燈籠庭園中的一場遭遇，整個介面都是繁體中文。",
      },
    ),
    body: {
      en: [
        { p: "November 11, 2026 — Session Zero is now available in Traditional Chinese. Every screen of the app has been translated, from the home page and sign-in to the board tools, combat panels, library and settings." },
        { h: "Details" },
        { ul: [
          "The language can be changed at any time from the globe in the header or in Settings. On a first visit, Session Zero follows the browser's language.",
          "Game terms follow the Chinese translation of the fifth-edition rules, so hit points, armor class, conditions and initiative match the books players already own.",
          "Messages from the server, such as errors and activity log entries, are translated as well.",
          "The Privacy and Terms pages are translated. Where a translation differs from the English, the English version governs, and each translated page links to it.",
        ] },
        { h: "Availability" },
        { p: "Traditional Chinese is available now to everyone, with or without an account." },
      ],
      "zh-TW": [
        { p: "2026 年 11 月 11 日——Session Zero 推出繁體中文版。從首頁、登入，到棋盤工具、戰鬥面板、素材庫和設定，應用程式的每個畫面都已完成翻譯。" },
        { h: "細節" },
        { ul: [
          "隨時可以從頁首的地球圖示或「設定」切換語言。第一次造訪時，Session Zero 會依照瀏覽器的語言顯示。",
          "遊戲用語依照第五版規則的中文譯本，生命值、護甲等級、狀態和先攻都和玩家手上的規則書一致。",
          "伺服器傳來的訊息，例如錯誤訊息和活動紀錄，也都已翻譯。",
          "「隱私權政策」和「服務條款」頁面也已翻譯。若譯文與英文版本有出入，以英文版本為準，每個翻譯頁面都附有英文版的連結。",
        ] },
        { h: "推出方式" },
        { p: "繁體中文版即日起開放所有人使用，不論是否有帳號。" },
      ],
    },
  },
];
