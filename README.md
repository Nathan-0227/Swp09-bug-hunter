# 🐞 Bug Hunter｜英文聽讀闖關（SWP09）

一個運用 **Web Speech API** 的資管英文跟讀闖關遊戲：聽正確發音 → 對著麥克風跟讀 → 系統自動判定念對或念錯，念對才能攻擊怪物、打倒魔王。

🔗 線上試玩：`https://<你的帳號>.github.io/<repo 名稱>/`
（請用 **電腦版 Chrome 或 Edge** 開啟，並允許麥克風權限）

---

## 一、作業需求對照

| 作業要求 | 實作方式 | 在哪裡看 |
|---|---|---|
| 1. 單字片語清單，可點擊播放發音 | 首頁三個關卡卡片直接列出全部 28 題，每題有 🔊 按鈕，使用 `SpeechSynthesis` 朗讀；可切換美式／英式口音與正常／慢速 | 首頁 |
| 2. 錄音跟讀，語音轉文字 | 關卡中按 🎤 或空白鍵，使用 `SpeechRecognition` 辨識，即時顯示「聽到：…」 | 關卡畫面 |
| 3. 比對結果、顯示對錯、統計正確率 | 自動比對並顯示 ⭕／❌，句子逐字標色；首頁顯示總正確率、每題「念對次數／練習次數」，並標出「常錯」字 | 關卡畫面、首頁 |
| 4. 部署成 GitHub Pages | 純靜態網頁，無需 build | 見第五節 |

**特別的想法：遊戲化闖關**——把跟讀練習包裝成打怪遊戲，加入限時、生命值、連擊加成，讓練習有挑戰感。

---

## 二、遊戲玩法

| 關卡 | 內容 | 出題方式 | 每題時限 |
|---|---|---|---|
| 第 1 關 🐛 Bug 蟲 | 網頁基礎單字（browser、database…） | 👀 看字念 | 10 秒 |
| 第 2 關 🦠 病毒怪 | 資管專業片語（primary key、cloud computing…） | 🎧 聽音念（只播放發音，英文作答後才揭曉） | 10 秒 |
| 第 3 關 👾 當機魔王 | 工程師日常短句（The server is down.…） | 👀 看字念 | 8 秒 |

- **念對**：怪物扣 1 滴血，得分 = 100 × 連擊倍率 + 剩餘時間獎勵
- **念錯或超時**：玩家扣 1 顆心（共 3 顆），自動播放正確發音，該題稍後再出一次
- **連擊**：連續念對 3 次傷害 ×2、6 次 ×3，念錯歸零
- **計時公平性**：按下錄音後計時暫停，辨識延遲不算玩家的時間；聽音模式在題目播完後才開始計時
- **系統錯誤不扣心**：沒偵測到聲音、網路錯誤、麥克風權限問題都只會提示重試

---

## 三、使用的 Web Speech API

### SpeechSynthesis（文字轉語音）
```js
const u = new SpeechSynthesisUtterance("database");
u.lang = "en-US";      // 或 en-GB
u.rate = 0.7;          // 慢速
u.voice = 挑選的英文語音;
speechSynthesis.speak(u);
```

### SpeechRecognition（語音轉文字）
```js
const rec = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
rec.lang = "en-US";
rec.interimResults = true;   // 即時顯示辨識中的文字
rec.maxAlternatives = 5;     // 取得多個候選結果，提高判定容錯
rec.onresult = (e) => { /* 取最終結果的所有候選，交給 judge() 比對 */ };
rec.onerror  = (e) => { /* no-speech / network / not-allowed 分別處理 */ };
rec.start();
```

---

## 四、念對／念錯的判定方法

語音辨識對**單一單字**特別不準（例如念 "server" 常被辨識成 "sever"），所以單字與句子採用不同策略：

1. **前處理**：轉小寫、去除標點、展開縮寫（`I'll` → `I will`）
2. **單字**：檢查辨識器回傳的 **5 個候選結果**，任一個符合就算對；另外容許：
   - 同音／易混淆字表（`server` ↔ `sever`、`to` ↔ `two`）
   - 單複數（`browser` ↔ `browsers`）
   - 被拆開的字（`data base` ↔ `database`）
3. **片語／句子**：用 **LCS（最長共同子序列）逐字對齊**，計算相符比例，**≥ 80% 算通過**，並把每個字標成綠色（念到）或紅色（沒念到）

範例：

| 正確答案 | 辨識結果 | 相符 | 判定 |
|---|---|---|---|
| database | data base | 100% | ⭕ |
| I will fix this bug today. | I'll fix this bug today | 100% | ⭕ |
| Can you send me the file? | can you send me the fire | 83% | ⭕（file 標紅） |
| The server is down. | the server is done | 75% | ❌ |

在瀏覽器 Console 也可以直接測試：`SWP09.judge("primary key", ["primary keys"])`

---

## 五、部署到 GitHub Pages

1. 在 GitHub 建立新的 repo（例如 `swp09-listen-speak`），設為 **Public**
2. 把 `index.html`、`style.css`、`app.js`、`words.js`、`README.md` 上傳到 repo 根目錄
   （網頁介面：**Add file → Upload files**，拖進去後 Commit）
3. 進入 repo 的 **Settings → Pages**
4. **Source** 選 `Deploy from a branch`，Branch 選 `main`、資料夾選 `/ (root)`，按 **Save**
5. 等 1～2 分鐘，頁面上方會出現網址 `https://<帳號>.github.io/<repo>/`
6. 把網址填回本 README 最上方

> ⚠️ 麥克風只能在 **HTTPS** 或 `localhost` 使用。直接雙擊 `index.html` 用 `file://` 開啟時，語音辨識可能會被拒絕；本機測試請用 VS Code Live Server，或直接看 GitHub Pages 版本。

---

## 六、檔案結構

```
├── index.html   頁面結構（選單、遊戲、結算視窗）
├── style.css    樣式與動畫（含手機版 RWD）
├── words.js     題庫、同音字表、縮寫展開表
├── app.js       朗讀、辨識、判定、遊戲流程、統計
└── README.md    說明文件
```

想新增題目只要編輯 `words.js` 的 `items` 陣列即可。

---

## 七、瀏覽器支援

| 瀏覽器 | 朗讀 | 跟讀辨識 |
|---|---|---|
| 電腦版 Chrome / Edge | ✅ | ✅（建議） |
| Android Chrome | ✅ | ✅ |
| Safari / iPhone | ✅ | ⚠️ 不穩定 |
| Firefox | ✅ | ❌（會顯示提示，只能聽發音、看題庫） |

Chrome 的語音辨識是送到 Google 伺服器處理，**需要網路連線**。

---

## 八、資料保存

練習紀錄、各關最高分、口音／語速／音效設定都存在瀏覽器的 `localStorage`，重新整理後仍會保留；首頁「重設紀錄」可清除。超時沒有開口的題目只扣心，**不計入發音正確率**。

## 九、已知限制

- 辨識結果取決於 Google 語音服務，短單字偶爾仍可能誤判
- 不支援自訂題庫、線上排行榜（需後端）
- 怪物與音效皆為 Emoji 與 Web Audio 即時合成，沒有使用外部素材
