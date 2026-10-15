/* =============================================================
 *  Bug Hunter｜英文聽讀闖關  (SWP09)
 *  - SpeechSynthesis：朗讀單字 / 片語 / 句子
 *  - SpeechRecognition：辨識使用者跟讀，自動判定念對 / 念錯
 *  - localStorage：保存每個字的練習統計、各關最高分、設定
 * ============================================================= */
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis || null;
  const STORE_KEY = "swp09-bug-hunter-v1";
  const PASS_THRESHOLD = 0.8;   // 片語/句子逐字相似度門檻
  const SAFETY_STOP_MS = 5000;  // 錄音保險停止
  const FEEDBACK_MS = 1600;     // 顯示對錯後到下一題的間隔

  /* ---------------- 儲存 ---------------- */
  function loadStore() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (d && typeof d === "object") {
        return { words: d.words || {}, best: d.best || {}, settings: d.settings || {} };
      }
    } catch (e) { /* 無痕模式或資料毀損時就用空白紀錄 */ }
    return { words: {}, best: {}, settings: {} };
  }
  const store = loadStore();
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 忽略 */ }
  }
  const settings = Object.assign({ accent: "en-US", rate: 1, sound: true }, store.settings);
  function saveSettings() { store.settings = settings; saveStore(); }

  function recordAttempt(en, ok) {
    const s = store.words[en] || (store.words[en] = { tries: 0, correct: 0 });
    s.tries += 1;
    if (ok) s.correct += 1;
    saveStore();
  }

  /* ---------------- 朗讀 SpeechSynthesis ---------------- */
  let voices = [];
  function refreshVoices() { voices = synth ? synth.getVoices() : []; }
  if (synth) {
    refreshVoices();
    synth.onvoiceschanged = refreshVoices;
  }
  function pickVoice(lang) {
    const want = lang.toLowerCase();
    const list = voices.filter((v) => v.lang.replace("_", "-").toLowerCase() === want);
    return list.find((v) => /google|natural|online/i.test(v.name)) || list[0] || null;
  }
  function speak(text, onDone) {
    if (!synth) { if (onDone) onDone(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = settings.accent;
    const v = pickVoice(settings.accent);
    if (v) u.voice = v;
    u.rate = settings.rate;
    let done = false;
    const finish = () => { if (done) return; done = true; if (onDone) onDone(); };
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
    if (onDone) setTimeout(finish, 7000); // Chrome 偶爾不觸發 onend 的保險
  }

  /* ---------------- 音效 Web Audio ---------------- */
  let actx = null;
  function tone(seq) {
    if (!settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime + 0.01;
      seq.forEach(([freq, start, dur, type = "square", vol = 0.07]) => {
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t0 + start);
        g.gain.setValueAtTime(vol, t0 + start);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        o.connect(g).connect(actx.destination);
        o.start(t0 + start);
        o.stop(t0 + start + dur + 0.03);
      });
    } catch (e) { /* 不支援就安靜 */ }
  }
  const SFX = {
    hit: [[523, 0, 0.08], [784, 0.07, 0.14]],
    miss: [[220, 0, 0.15, "sawtooth"], [147, 0.12, 0.28, "sawtooth"]],
    win: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.35]],
    lose: [[392, 0, 0.22, "triangle", 0.1], [330, 0.22, 0.22, "triangle", 0.1], [262, 0.44, 0.45, "triangle", 0.1]]
  };

  /* ---------------- 比對邏輯 ---------------- */
  const homoIndex = new Map();
  HOMOPHONES.forEach((group, i) => group.forEach((w) => {
    if (!homoIndex.has(w)) homoIndex.set(w, new Set());
    homoIndex.get(w).add(i);
  }));

  // 轉小寫、展開縮寫、去標點
  function normalize(s) {
    let t = String(s).toLowerCase().replace(/[’‘`]/g, "'");
    t = t.split(/\s+/).map((w) => {
      const bare = w.replace(/[^a-z0-9']/g, "");
      return CONTRACTIONS[bare] || w;
    }).join(" ");
    return t.replace(/'/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(s) { const n = normalize(s); return n ? n.split(" ") : []; }

  function wordEq(a, b) {
    if (a === b) return true;
    // 單複數容錯：password / passwords
    if (a.length > 3 && b.length > 3 && a.replace(/s$/, "") === b.replace(/s$/, "")) return true;
    const ga = homoIndex.get(a), gb = homoIndex.get(b);
    if (ga && gb) for (const g of ga) if (gb.has(g)) return true;
    return false;
  }

  // 用 LCS 對齊目標字與辨識字，回傳每個目標字是否被念到
  function align(target, heard) {
    const n = target.length, m = heard.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = wordEq(target[i], heard[j])
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const marks = new Array(n).fill(false);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (wordEq(target[i], heard[j])) { marks[i] = true; i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    return marks;
  }

  /**
   * 判定一次跟讀
   * @param {string} targetText 正確答案
   * @param {string[]} alternatives 辨識器回傳的多個候選結果
   * @returns {{pass:boolean, score:number, marks:boolean[], heard:string}}
   */
  function judge(targetText, alternatives) {
    const target = tokens(targetText);
    const compactTarget = target.join("");
    let best = { pass: false, score: -1, marks: target.map(() => false), heard: alternatives[0] || "" };

    for (const alt of alternatives) {
      const heard = tokens(alt);
      if (!heard.length) continue;
      let marks, score;

      if (heard.join("") === compactTarget) {
        // "data base" 也算 "database"
        marks = target.map(() => true); score = 1;
      } else if (target.length === 1) {
        // 單字：候選結果中任一個字符合即算對（方案 B：多候選 + 同音字）
        const ok = heard.some((w) => wordEq(target[0], w));
        marks = [ok]; score = ok ? 1 : 0;
      } else {
        // 片語 / 句子：逐字比對，達門檻算通過（方案 C）
        marks = align(target, heard);
        score = marks.filter(Boolean).length / target.length;
      }
      if (score > best.score) best = { pass: score >= PASS_THRESHOLD, score, marks, heard: alt };
      if (score === 1) break;
    }
    if (target.length === 1) best.pass = best.score === 1;
    return best;
  }
  window.SWP09 = { judge, normalize }; // 方便在 Console 測試

  /* ---------------- 選單 / 統計 ---------------- */
  const els = {
    banner: $("#unsupportedBanner"),
    menu: $("#menu"), game: $("#game"),
    levelList: $("#levelList"),
    statAccuracy: $("#statAccuracy"), statTries: $("#statTries"), statCorrect: $("#statCorrect"),
    accent: $("#accentSelect"), soundToggle: $("#soundToggle"),
    hudTitle: $("#hudTitle"), hearts: $("#hearts"), score: $("#score"),
    monster: $("#monster"), monsterName: $("#monsterName"), damage: $("#damage"),
    hpFill: $("#hpFill"), hpText: $("#hpText"), combo: $("#combo"),
    timerFill: $("#timerFill"),
    qMode: $("#qMode"), qEn: $("#qEn"), qZh: $("#qZh"), qSpeak: $("#qSpeak"),
    mic: $("#micBtn"), heard: $("#heard"), feedback: $("#feedback"),
    overlay: $("#overlay"), ovEmoji: $("#ovEmoji"), ovTitle: $("#ovTitle"),
    ovBody: $("#ovBody"), ovActions: $("#ovActions")
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function mostMissed(limit = 3) {
    return Object.entries(store.words)
      .map(([en, s]) => ({ en, miss: s.tries - s.correct, rate: s.correct / s.tries }))
      .filter((x) => x.miss > 0)
      .sort((a, b) => b.miss - a.miss || a.rate - b.rate)
      .slice(0, limit)
      .map((x) => x.en);
  }

  function renderMenu() {
    let tries = 0, correct = 0;
    Object.values(store.words).forEach((s) => { tries += s.tries; correct += s.correct; });
    els.statTries.textContent = tries;
    els.statCorrect.textContent = correct;
    els.statAccuracy.textContent = tries ? Math.round((correct / tries) * 100) + "%" : "--";

    const missed = new Set(mostMissed());
    els.levelList.innerHTML = LEVELS.map((lv, idx) => {
      const best = store.best[lv.id] || 0;
      const modeLabel = lv.mode === "listen" ? "🎧 聽音念" : "👀 看字念";
      const rows = lv.items.map((it) => {
        const s = store.words[it.en];
        const stat = s
          ? `<span class="rate">${s.correct}/${s.tries}</span> 念對（${Math.round((s.correct / s.tries) * 100)}%）`
          : "尚未練習";
        const isMiss = missed.has(it.en);
        return `<li class="word-row${isMiss ? " miss" : ""}">
            <button type="button" class="icon-btn" data-say="${escapeHtml(it.en)}" title="播放發音">🔊</button>
            <div><div class="word-en">${escapeHtml(it.en)}${isMiss ? '<span class="badge-miss">常錯</span>' : ""}</div>
                 <div class="word-zh">${escapeHtml(it.zh)}</div></div>
            <div class="word-stat">${stat}</div>
          </li>`;
      }).join("");
      return `<article class="level-card">
          <div class="level-head">
            <div class="level-monster">${lv.monster}</div>
            <div class="level-info">
              <h3>${escapeHtml(lv.title)}</h3>
              <div class="level-meta">${modeLabel} · 每題 ${lv.timeLimit} 秒 · 魔王：${lv.monsterName} · 最高分 <b>${best}</b></div>
            </div>
            <button type="button" class="start-btn" data-start="${idx}" ${SR ? "" : "disabled"}>
              ${SR ? "開始闖關 ▶" : "需 Chrome/Edge"}
            </button>
          </div>
          <ul class="word-list">${rows}</ul>
        </article>`;
    }).join("");
  }

  els.levelList.addEventListener("click", (e) => {
    const say = e.target.closest("[data-say]");
    if (say) { speak(say.dataset.say); return; }
    const start = e.target.closest("[data-start]");
    if (start && !start.disabled) startLevel(Number(start.dataset.start));
  });

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("確定要清除所有練習紀錄與最高分嗎？")) return;
    store.words = {};
    store.best = {};
    saveStore();
    renderMenu();
  });

  /* ---------------- 設定 ---------------- */
  function applySettingsUI() {
    els.accent.value = settings.accent;
    document.querySelectorAll(".seg button").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.rate) === settings.rate);
    });
    els.soundToggle.textContent = settings.sound ? "🔊" : "🔇";
  }
  els.accent.addEventListener("change", () => { settings.accent = els.accent.value; saveSettings(); });
  document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    settings.rate = Number(b.dataset.rate); saveSettings(); applySettingsUI();
  }));
  els.soundToggle.addEventListener("click", () => {
    settings.sound = !settings.sound; saveSettings(); applySettingsUI();
  });

  /* ---------------- 遊戲狀態 ---------------- */
  const game = {
    active: false, levelIdx: 0, level: null,
    queue: [], current: null,
    hp: 0, maxHp: 0, hearts: 3,
    combo: 0, maxCombo: 0, score: 0,
    tries: 0, correct: 0,
    remaining: 0, timerRunning: false, lastTick: 0, timerId: null,
    busy: false,          // 顯示結果中，不接受錄音
    revealed: false,
    qid: 0                // 題目編號，用來忽略上一題延遲觸發的回呼
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startLevel(idx) {
    const lv = LEVELS[idx];
    Object.assign(game, {
      active: true, levelIdx: idx, level: lv,
      queue: shuffle(lv.items), current: null,
      hp: lv.items.length, maxHp: lv.items.length, hearts: 3,
      combo: 0, maxCombo: 0, score: 0, tries: 0, correct: 0,
      busy: false
    });
    els.menu.hidden = true;
    els.game.hidden = false;
    els.overlay.hidden = true;
    els.hudTitle.textContent = lv.title;
    els.monster.textContent = lv.monster;
    els.monster.className = "monster";
    els.monsterName.textContent = lv.monsterName;
    renderHud();
    clearInterval(game.timerId);
    game.timerId = setInterval(tick, 100);
    window.scrollTo({ top: 0 });
    nextQuestion();
  }

  function renderHud() {
    els.hearts.textContent = "❤️".repeat(game.hearts) + "🖤".repeat(3 - game.hearts);
    els.score.textContent = game.score;
    els.hpFill.style.width = (game.hp / game.maxHp) * 100 + "%";
    els.hpText.textContent = `HP ${game.hp} / ${game.maxHp}`;
    const mult = multiplier();
    els.combo.textContent = game.combo >= 2 ? `🔥 ${game.combo} 連擊！ 傷害 x${mult}` : "";
  }
  function multiplier() { return game.combo >= 6 ? 3 : game.combo >= 3 ? 2 : 1; }

  function renderQuestion(marks) {
    const it = game.current;
    const lv = game.level;
    els.qMode.textContent = lv.mode === "listen" ? "🎧 聽音念：仔細聽，然後念出來" : "👀 看字念：念出下面的英文";
    els.qZh.textContent = it.zh;
    const hide = lv.mode === "listen" && !game.revealed;
    els.qEn.classList.toggle("hidden-word", hide);
    if (hide) {
      els.qEn.textContent = it.en.split(" ").map((w) => "_".repeat(Math.min(w.replace(/[^a-z]/gi, "").length, 8))).join("  ");
    } else {
      els.qEn.innerHTML = it.en.split(" ").map((w, i) => {
        const cls = marks ? (marks[i] ? " ok" : " ng") : "";
        return `<span class="w${cls}">${escapeHtml(w)}</span>`;
      }).join(" ");
    }
  }

  function nextQuestion() {
    if (!game.active) return;
    game.current = game.queue.shift();
    game.revealed = false;
    game.busy = false;
    game.remaining = game.level.timeLimit;
    els.heard.textContent = "";
    setFeedback("", "");
    renderQuestion();
    updateTimerBar();
    setMicState("idle");

    game.qid += 1;
    if (game.level.mode === "listen") {
      // 聽音模式：念完題目才開始計時
      const qid = game.qid;
      game.timerRunning = false;
      updateTimerBar();
      speak(game.current.en, () => {
        if (game.active && game.qid === qid && !game.busy && recState === "idle" && !game.timerRunning) resumeTimer();
      });
    } else {
      resumeTimer();
    }
  }

  /* ---------------- 計時 ---------------- */
  function resumeTimer() { game.timerRunning = true; game.lastTick = performance.now(); updateTimerBar(); }
  function pauseTimer() { game.timerRunning = false; updateTimerBar(); }
  function tick() {
    if (!game.active || !game.timerRunning || game.busy) return;
    const now = performance.now();
    game.remaining -= (now - game.lastTick) / 1000;
    game.lastTick = now;
    if (game.remaining <= 0) {
      game.remaining = 0;
      updateTimerBar();
      onTimeout();
      return;
    }
    updateTimerBar();
  }
  function updateTimerBar() {
    const pct = Math.max(0, game.remaining / (game.level ? game.level.timeLimit : 1)) * 100;
    els.timerFill.style.width = pct + "%";
    els.timerFill.classList.toggle("low", pct < 30 && game.timerRunning);
    els.timerFill.classList.toggle("paused", !game.timerRunning && !game.busy);
  }

  /* ---------------- 語音辨識 SpeechRecognition ---------------- */
  let rec = null;
  let recState = "idle"; // idle | listening
  let safetyTimer = null;

  function setMicState(state) {
    els.mic.classList.toggle("listening", state === "listening");
    els.mic.disabled = !SR || game.busy;
    els.mic.setAttribute("aria-label", state === "listening" ? "錄音中，點擊停止" : "開始錄音");
  }

  function startListening() {
    if (!SR || !game.active || game.busy) return;
    if (recState === "listening") { if (rec) rec.stop(); return; } // 再按一次 = 提早結束
    if (recState !== "idle") return;
    recState = "starting";
    pauseTimer();
    if (synth) synth.cancel(); // 避免把朗讀聲錄進去

    let gotFinal = false;
    let errored = false;
    rec = new SR();
    rec.lang = settings.accent;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          gotFinal = true;
          const alts = Array.from({ length: r.length }, (_, k) => r[k].transcript);
          handleAnswer(alts);
          return;
        }
        interim += r[0].transcript;
      }
      els.heard.textContent = interim ? `聽到：${interim}…` : "";
    };

    rec.onerror = (e) => {
      errored = true;
      if (!game.active) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setFeedback("🎙️ 麥克風權限被拒絕。請點網址列左側的鎖頭圖示允許麥克風，再按一次麥克風。（不扣心、計時暫停）", "info");
        // 計時保持暫停，等玩家處理好權限
      } else if (e.error === "aborted") {
        // 我們自己中止的，不處理
      } else {
        const msg = {
          "no-speech": "沒聽到聲音，再試一次（不扣心）",
          "audio-capture": "找不到麥克風，請確認裝置後再試（不扣心）",
          network: "網路連線有問題，辨識失敗，再試一次（不扣心）"
        }[e.error] || `辨識發生錯誤（${e.error}），再試一次（不扣心）`;
        systemRetry(msg);
      }
    };

    rec.onend = () => {
      clearTimeout(safetyTimer);
      recState = "idle";
      setMicState("idle");
      if (game.active && !gotFinal && !errored && !game.busy) systemRetry("沒聽清楚，再試一次（不扣心）");
    };

    try {
      rec.start();
      recState = "listening";
      setMicState("listening");
      els.heard.textContent = "🎙️ 請說…";
      setFeedback("", "");
      safetyTimer = setTimeout(() => { if (rec) rec.stop(); }, SAFETY_STOP_MS);
    } catch (err) {
      recState = "idle";
      systemRetry("無法啟動麥克風，再試一次（不扣心）");
    }
  }

  function abortListening() {
    clearTimeout(safetyTimer);
    if (rec) { try { rec.abort(); } catch (e) { /* 忽略 */ } }
    recState = "idle";
  }

  function systemRetry(msg) {
    setFeedback(msg, "info");
    els.heard.textContent = "";
    if (game.active && !game.busy) resumeTimer();
  }

  els.mic.addEventListener("click", startListening);
  els.qSpeak.addEventListener("click", () => { if (game.current) speak(game.current.en); });

  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || els.game.hidden || !els.overlay.hidden) return;
    if (e.target.tagName === "SELECT" || e.target.tagName === "INPUT") return;
    e.preventDefault();
    if (e.repeat) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    startListening();
  });

  /* ---------------- 判定與戰鬥 ---------------- */
  function setFeedback(text, kind) {
    els.feedback.textContent = text;
    els.feedback.className = "feedback" + (kind ? " " + kind : "");
  }

  function handleAnswer(alts) {
    if (!game.active || game.busy) return;
    const it = game.current;
    const res = judge(it.en, alts);
    game.busy = true;
    game.timerRunning = false;
    game.revealed = true;
    game.tries += 1;
    recordAttempt(it.en, res.pass);
    renderQuestion(res.marks);
    els.heard.textContent = `辨識結果：「${res.heard}」` +
      (res.marks.length > 1 ? `（相符 ${Math.round(res.score * 100)}%）` : "");
    setMicState("idle");

    if (res.pass) onCorrect();
    else onWrong("❌ 念錯了！正確念法聽一次 👂");
  }

  function onCorrect() {
    game.correct += 1;
    game.combo += 1;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    const mult = multiplier();
    const gained = 100 * mult + Math.round(game.remaining * 10);
    game.score += gained;
    game.hp -= 1;

    tone(SFX.hit);
    els.monster.classList.remove("hit"); void els.monster.offsetWidth; els.monster.classList.add("hit");
    els.damage.textContent = `-1  +${gained}`;
    els.damage.classList.remove("show"); void els.damage.offsetWidth; els.damage.classList.add("show");
    els.combo.classList.remove("pop"); void els.combo.offsetWidth; els.combo.classList.add("pop");
    setFeedback(mult > 1 ? `⭕ 念對了！連擊加成 x${mult}` : "⭕ 念對了！", "good");
    renderHud();

    if (game.hp <= 0) {
      els.monster.classList.add("dead");
      setTimeout(winLevel, 900);
    } else {
      setTimeout(nextQuestion, FEEDBACK_MS);
    }
  }

  function onWrong(msg) {
    game.combo = 0;
    game.hearts -= 1;
    game.queue.push(game.current); // 稍後再出一次
    tone(SFX.miss);
    els.hearts.classList.remove("hurt"); void els.hearts.offsetWidth; els.hearts.classList.add("hurt");
    setFeedback(msg, "bad");
    renderHud();

    if (game.hearts <= 0) {
      setTimeout(loseLevel, 1100);
    } else {
      // 念錯時播放正確發音讓玩家學習
      setTimeout(() => { if (game.active) speak(game.current.en); }, 300);
      setTimeout(nextQuestion, FEEDBACK_MS + 900);
    }
  }

  function onTimeout() {
    if (game.busy || recState !== "idle") return;
    game.busy = true;
    game.timerRunning = false;
    game.revealed = true;
    renderQuestion();
    setMicState("idle");
    // 超時沒有開口，不計入發音正確率，但仍扣心
    onWrong("⏰ 時間到！");
  }

  /* ---------------- 結算 ---------------- */
  function endGameLoop() {
    game.active = false;
    clearInterval(game.timerId);
    abortListening();
    if (synth) synth.cancel();
  }

  function levelSummary() {
    const acc = game.tries ? Math.round((game.correct / game.tries) * 100) : 0;
    return `<div class="big">${game.score}</div>
      <div>本關跟讀正確率 ${acc}%（${game.correct}/${game.tries}）· 最高連擊 ${game.maxCombo}</div>`;
  }

  function showOverlay(emoji, title, body, actions) {
    els.ovEmoji.textContent = emoji;
    els.ovTitle.textContent = title;
    els.ovBody.innerHTML = body;
    els.ovActions.innerHTML = "";
    actions.forEach(([label, fn, primary]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = primary ? "start-btn" : "ghost-btn";
      b.textContent = label;
      b.addEventListener("click", fn);
      els.ovActions.appendChild(b);
    });
    els.overlay.hidden = false;
    const first = els.ovActions.querySelector(".start-btn");
    if (first) first.focus();
  }

  function saveBest() {
    const id = game.level.id;
    const isRecord = game.score > (store.best[id] || 0);
    if (isRecord) { store.best[id] = game.score; saveStore(); }
    return isRecord;
  }

  function winLevel() {
    endGameLoop();
    tone(SFX.win);
    const isRecord = saveBest();
    const last = game.levelIdx === LEVELS.length - 1;
    const body = levelSummary() + (isRecord ? '<div class="record">🏆 新紀錄！</div>' : "");
    const actions = last
      ? [["回選單", goMenu, true], ["再玩一次", () => startLevel(game.levelIdx), false]]
      : [["下一關 ▶", () => startLevel(game.levelIdx + 1), true], ["回選單", goMenu, false]];
    showOverlay(last ? "🎉" : "✨", last ? "全部通關！當機魔王被擊敗了" : `擊敗 ${game.level.monsterName}！`, body, actions);
  }

  function loseLevel() {
    endGameLoop();
    tone(SFX.lose);
    const isRecord = saveBest();
    const body = levelSummary() + (isRecord ? '<div class="record">🏆 新紀錄！</div>' : "") +
      "<div>先回選單用 🔊 多聽幾次常錯的字再挑戰吧！</div>";
    showOverlay("💀", "挑戰失敗", body, [["再挑戰一次", () => startLevel(game.levelIdx), true], ["回選單", goMenu, false]]);
  }

  function goMenu() {
    endGameLoop();
    els.overlay.hidden = true;
    els.game.hidden = true;
    els.menu.hidden = false;
    renderMenu();
    window.scrollTo({ top: 0 });
  }
  $("#backBtn").addEventListener("click", goMenu);

  /* ---------------- 啟動 ---------------- */
  if (!SR) els.banner.hidden = false;
  if (!synth) {
    els.banner.hidden = false;
    els.banner.innerHTML += "<br>（這個瀏覽器也不支援語音朗讀 SpeechSynthesis。）";
  }
  applySettingsUI();
  renderMenu();
})();
