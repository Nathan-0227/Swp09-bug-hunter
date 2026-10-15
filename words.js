// =============================================================
//  題庫：資管 / 網頁知識英文
//  mode: "read"   = 看字念（顯示英文 + 中文）
//        "listen" = 聽音念（只播放發音、顯示中文提示，英文在作答後揭曉）
//  題目刻意不放縮寫（HTML、SQL…）與縮寫字（I'll、don't…），
//  因為語音辨識對這兩類的回傳結果非常不穩定。
// =============================================================

const LEVELS = [
  {
    id: "lv1",
    title: "第 1 關：網頁基礎單字",
    monster: "🐛",
    monsterName: "Bug 蟲",
    mode: "read",
    timeLimit: 10,
    items: [
      { en: "browser", zh: "瀏覽器" },
      { en: "server", zh: "伺服器" },
      { en: "database", zh: "資料庫" },
      { en: "algorithm", zh: "演算法" },
      { en: "variable", zh: "變數" },
      { en: "function", zh: "函式" },
      { en: "software", zh: "軟體" },
      { en: "network", zh: "網路" },
      { en: "password", zh: "密碼" },
      { en: "website", zh: "網站" }
    ]
  },
  {
    id: "lv2",
    title: "第 2 關：資管專業片語",
    monster: "🦠",
    monsterName: "病毒怪",
    mode: "listen",
    timeLimit: 10,
    items: [
      { en: "user interface", zh: "使用者介面" },
      { en: "primary key", zh: "主鍵" },
      { en: "cloud computing", zh: "雲端運算" },
      { en: "network security", zh: "網路安全" },
      { en: "search engine", zh: "搜尋引擎" },
      { en: "operating system", zh: "作業系統" },
      { en: "source code", zh: "原始碼" },
      { en: "data analysis", zh: "資料分析" },
      { en: "artificial intelligence", zh: "人工智慧" },
      { en: "information management", zh: "資訊管理" }
    ]
  },
  {
    id: "lv3",
    title: "第 3 關：工程師日常短句",
    monster: "👾",
    monsterName: "當機魔王",
    mode: "read",
    timeLimit: 8,
    items: [
      { en: "Please refresh the page.", zh: "請重新整理頁面。" },
      { en: "The server is down.", zh: "伺服器掛了。" },
      { en: "Let me check the database.", zh: "我來檢查一下資料庫。" },
      { en: "I will fix this bug today.", zh: "我今天會修好這個 bug。" },
      { en: "Can you send me the file?", zh: "你可以把檔案傳給我嗎？" },
      { en: "The website is loading slowly.", zh: "網站載入得很慢。" },
      { en: "Please save your work.", zh: "請儲存你的作業。" },
      { en: "We need a stronger password.", zh: "我們需要更強的密碼。" }
    ]
  }
];

// 同音 / 常被辨識器混淆的字：同一組內任一個都算對
const HOMOPHONES = [
  ["to", "too", "two"],
  ["for", "four"],
  ["right", "write"],
  ["no", "know"],
  ["there", "their"],
  ["by", "buy", "bye"],
  ["see", "sea"],
  ["one", "won"],
  ["sever", "server"],
  ["key", "keys", "ki"],
  ["the", "a"]
];

// 辨識器常把縮寫字回傳出來，比對前先展開
const CONTRACTIONS = {
  "i'll": "i will",
  "let's": "let us",
  "it's": "it is",
  "can't": "cannot",
  "don't": "do not",
  "we'll": "we will",
  "you'll": "you will",
  "server's": "server is",
  "website's": "website is"
};
