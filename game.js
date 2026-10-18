/* Vocab Spotlight — quiz-show English vocabulary trainer
 * Spaced repetition (Anki-lite / SM-2) + active recall. Offline HTML5.
 * v8: Good/Easy · 100×30 as Part A/B (15) · gloss+example fix · speech freeze guard · 本组进度
 * Optional cloud sync stamps save.updatedAt. Offline play ignores QuizMarioCloud.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "vocabSpotlight_v1";
  const TRACKS = (window.VOCAB_TRACKS || [{ id: "core", name: "原版核心" }]).map((t) =>
    t.id === "core" ? Object.assign({}, t, { sets: window.VOCAB_LEVELS || [], titles: (window.VOCAB_LEVELS || []).map((part, i) => {
      const setNum = Math.floor(i / 2) + 1;
      const partLetter = (i % 2 === 0) ? "A" : "B";
      const scene = (part && part[0] && part[0].scene) ? part[0].scene : "复习 · Review";
      return scene + " · 第" + setNum + "组 · Part " + partLetter;
    }) }) : t
  );
  let currentTrack = "core";
  let LEVELS = TRACKS[0].sets || [];
  let LEVEL_COUNT = LEVELS.length;
  const MIN_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  /** Learning step: 10 minutes */
  const LEARN_MS = 10 * MIN_MS;
  /** Max new cards introduced per level session (Anki-like) */
  const NEW_PER_SESSION = 12;
  /** Clearance: due==0, no new, no learning, ≥80% cards in review with interval≥1 day */
  const CLEAR_SOLID_PCT = 0.8;
  const CLEAR_MIN_INTERVAL_DAYS = 1;

  /** @typedef {{ef:number, interval:number, reps:number, lapses:number, due:number, correct:number, wrong:number, mastery:number, state:string}} CardProg */
  /** @typedef {{points:number, streak:number, bestStreak:number, unlockedLevel:number, cards:Object.<string, CardProg>, levelStars:Object.<string, number>, sortMode?:string, voiceOn?:boolean, dueOnly?:boolean, updatedAt?:string}} SaveData */

  /** @type {SaveData} */
  let save = loadSave();

  let currentLevel = 1;
  let queue = [];
  let currentCard = null;
  let awaiting = false;
  let sessionSeen = 0;
  let sessionTarget = 0;
  let firstCardOfSession = true;
  /** Root-affix browse stays in the word bank, but the control is hidden for now. */
  function publicSortMode(mode) {
    return mode === "scene" ? "scene" : "default";
  }
  /** @type {"default"|"scene"} */
  let sortMode = publicSortMode(save.sortMode);
  let voiceOn = save.voiceOn !== false; // default on
  let dueOnly = !!save.dueOnly;
  let killStreak = 0; // consecutive corrects this session (resets on wrong)
  /** When true, waiting for Good/Easy after a correct answer */
  let pendingRate = false;

  const KILL_LINES = {
    1: "First blood",
    2: "Double kill",
    3: "Triple kill",
    4: "Quadra kill",
    5: "Penta kill",
  };
  const SPREE_LINES = [
    { at: 3, text: "Killing spree" },
    { at: 4, text: "Rampage" },
    { at: 5, text: "Unstoppable" },
    { at: 6, text: "Dominating" },
    { at: 7, text: "Godlike" },
    { at: 8, text: "Legendary" },
  ];

  const $ = (id) => document.getElementById(id);

  function cardKey(levelIdx, word) {
    // core track keeps legacy keys so old backups stay valid
    return (currentTrack === "core" ? "" : currentTrack + "|") + levelIdx + "::" + word.toLowerCase();
  }

  /** Add v6 fields (tracks, learning log, profile) to a save object. */
  function extendSave(sv, data) {
    data = data || {};
    sv.track = data.track || "core";
    sv.trackUnlock = data.trackUnlock || {};
    sv.trackStars = data.trackStars || {};
    sv.daily = data.daily || {};
    sv.profile = data.profile || { name: "", cls: "" };
    if (data.updatedAt) sv.updatedAt = data.updatedAt;
    return sv;
  }

  function defaultCardProg() {
    return {
      ef: 2.5,
      interval: 0,
      reps: 0,
      lapses: 0,
      due: 0,
      correct: 0,
      wrong: 0,
      mastery: 0,
      state: "new",
    };
  }

  /** Migrate old step-counter due (< 1e12) → immediately due in real time. */
  function migrateCard(p) {
    if (!p || typeof p !== "object") return defaultCardProg();
    if (p.due != null && p.due > 0 && p.due < 1e12) {
      p.due = Date.now(); // old session-step due → review now
    }
    if (p.lapses == null) p.lapses = p.wrong || 0;
    if (!p.state) {
      if ((p.reps || 0) === 0 && (p.correct || 0) === 0 && (p.wrong || 0) === 0) p.state = "new";
      else if ((p.interval || 0) < 1) p.state = "learning";
      else p.state = "review";
    }
    if (p.ef == null) p.ef = 2.5;
    return p;
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const cards = data.cards || {};
        for (const k of Object.keys(cards)) cards[k] = migrateCard(cards[k]);
        return extendSave({
          points: data.points || 0,
          streak: data.streak || 0,
          bestStreak: data.bestStreak || 0,
          unlockedLevel: Math.max(1, data.unlockedLevel || 1),
          cards,
          levelStars: data.levelStars || {},
          sortMode: data.sortMode || "default",
          voiceOn: data.voiceOn !== false,
          dueOnly: !!data.dueOnly,
        }, data);
      }
    } catch (_) {}
    return extendSave({
      points: 0,
      streak: 0,
      bestStreak: 0,
      unlockedLevel: 1,
      cards: {},
      levelStars: {},
      sortMode: "default",
      voiceOn: true,
      dueOnly: false,
    }, {});
  }

  function persist(opts) {
    opts = opts || {};
    save.sortMode = sortMode;
    save.voiceOn = voiceOn;
    save.dueOnly = dueOnly;
    if (!(opts.keepUpdatedAt && save.updatedAt)) {
      save.updatedAt = new Date().toISOString();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    if (opts.upload !== false && window.QuizMarioCloud && typeof window.QuizMarioCloud.onLocalSave === "function") {
      try { window.QuizMarioCloud.onLocalSave(save); } catch (_) {}
    }
    refreshHud();
  }

  function getProg(key) {
    if (!save.cards[key]) save.cards[key] = defaultCardProg();
    else save.cards[key] = migrateCard(save.cards[key]);
    return save.cards[key];
  }

  function isNewCard(p) {
    return (p.state === "new") || ((p.reps || 0) === 0 && (p.correct || 0) === 0 && (p.wrong || 0) === 0);
  }

  function isLearning(p) {
    return p.state === "learning" || (!isNewCard(p) && (p.interval || 0) < 1 && (p.reps || 0) > 0);
  }

  function isDue(p, now) {
    if (isNewCard(p)) return false;
    return !p.due || p.due <= now;
  }

  /** Count Due / Learning / New for a level (0 = all levels). */
  function countSrs(levelNum) {
    const now = Date.now();
    let due = 0, learning = 0, neu = 0, mastered = 0;
    const range = levelNum
      ? [[levelNum - 1, LEVELS[levelNum - 1] || []]]
      : LEVELS.map((lv, i) => [i, lv]);
    for (const [li, words] of range) {
      for (const w of words) {
        const p = getProg(cardKey(li, w.word));
        if ((p.mastery || 0) >= 3) mastered++;
        if (isNewCard(p)) neu++;
        else if (isLearning(p)) {
          learning++;
          if (isDue(p, now)) due++;
        } else if (isDue(p, now)) due++;
      }
    }
    return { due, learning, neu, mastered };
  }

  /** Per-set clearance stats for pass rule. */
  function levelClearStats(levelNum) {
    const words = LEVELS[levelNum - 1] || [];
    const now = Date.now();
    let neu = 0, due = 0, learning = 0, solid = 0;
    const total = words.length;
    for (const w of words) {
      const p = getProg(cardKey(levelNum - 1, w.word));
      if (isNewCard(p)) {
        neu++;
        continue;
      }
      if (isDue(p, now)) due++;
      const interval = p.interval || 0;
      const isSolid = p.state === "review" && interval >= CLEAR_MIN_INTERVAL_DAYS;
      if (isSolid) solid++;
      else learning++; // not yet graduated to interval≥1d review
    }
    const need = Math.ceil(total * CLEAR_SOLID_PCT);
    return { total, neu, due, learning, solid, need, ready: neu === 0 && due === 0 && learning === 0 && solid >= need };
  }

  function refreshHud() {
    const setHud = (id, value) => {
      const el = $(id);
      if (el) el.textContent = value;
    };
    setHud("hud-points", String(save.points));
    setHud("hud-streak", String(save.streak));
    setHud("hud-best", String(save.bestStreak));
    setHud("hud-level", currentLevel ? String(currentLevel) : "—");
    const c = countSrs(currentLevel || 0);
    if ($("hud-mastered")) $("hud-mastered").textContent = String(c.mastered);
    if ($("hud-due")) $("hud-due").textContent = String(c.due);
    if ($("hud-learning")) $("hud-learning").textContent = String(c.learning);
    if ($("hud-new")) $("hud-new").textContent = String(c.neu);
    const clearEl = $("hud-clear");
    if (currentLevel) {
      const s = levelClearStats(currentLevel);
      if (clearEl) clearEl.textContent = s.ready ? "已通关" : (s.solid + "/" + s.need);
    } else if (clearEl) {
      clearEl.textContent = "—";
    }
  }

  function showScreen(name) {
    document.body.classList.toggle("at-gate", name === "gate");
    document.body.classList.toggle("at-play", name === "play");
    for (const el of document.querySelectorAll(".screen")) el.classList.remove("active");
    const s = $("screen-" + name);
    if (s) s.classList.add("active");
    // Level select is much taller than play. Leaving the old scroll offset
    // (especially with overflow-x:hidden on iOS) shows empty space instead of the word.
    try { window.scrollTo(0, 0); } catch (_) {}
  }

  function levelStars(levelNum) {
    const words = LEVELS[levelNum - 1] || [];
    if (!words.length) return 0;
    let sum = 0;
    for (const w of words) {
      const p = getProg(cardKey(levelNum - 1, w.word));
      sum += Math.min(3, p.mastery || 0);
    }
    const avg = sum / words.length;
    if (avg >= 2.5) return 3;
    if (avg >= 1.5) return 2;
    if (avg >= 0.6) return 1;
    return 0;
  }

  function levelMasteredCount(levelNum) {
    const words = LEVELS[levelNum - 1] || [];
    let n = 0;
    for (const w of words) {
      if ((getProg(cardKey(levelNum - 1, w.word)).mastery || 0) >= 3) n++;
    }
    return n;
  }

  function renderLevels() {
    const grid = $("level-grid");
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 1; i <= LEVEL_COUNT; i++) {
      const words = LEVELS[i - 1] || [];
      const locked = i > save.unlockedLevel;
      const stars = levelStars(i);
      const mastered = levelMasteredCount(i);
      const card = document.createElement("div");
      card.className = "level-card" + (locked ? " locked" : "");
      const cs = levelClearStats(i);
      const clearLabel = cs.ready ? "已通关" : ("通关 " + cs.solid + "/" + cs.need);
      card.innerHTML =
        '<div class="ln">' + escapeHtml(setTitle(i)) + (cs.ready ? " ✓" : "") + "</div>" +
        '<div class="meta">' + words.length + " words · " + mastered + "/" + words.length + " ★ · " +
        (function(){ const c=countSrs(i); return "Due "+c.due; })() +
        " · " + clearLabel + "</div>" +
        '<div class="stars">' + "★".repeat(stars) + "☆".repeat(3 - stars) + "</div>";
      if (!locked) {
        card.addEventListener("click", () => startLevel(i));
      }
      grid.appendChild(card);
    }
  }

  /**
   * Anki-lite / SM-2 schedule.
   * quality: 0 Again, 1 Good, 2 Easy
   * interval stored in days; due is Date.now()-based ms.
   */
  function schedule(prog, quality, nowMs) {
    const now = nowMs || Date.now();
    if (quality === 0) {
      prog.wrong = (prog.wrong || 0) + 1;
      prog.lapses = (prog.lapses || 0) + 1;
      prog.reps = 0;
      prog.interval = 0;
      prog.state = "learning";
      prog.due = now + LEARN_MS; // back in ~10 minutes
      prog.ef = Math.max(1.3, (prog.ef || 2.5) - 0.2);
      prog.mastery = Math.max(0, (prog.mastery || 0) - 1);
      return;
    }
    prog.correct = (prog.correct || 0) + 1;
    prog.reps = (prog.reps || 0) + 1;
    const ef = prog.ef || 2.5;

    if (prog.reps === 1) {
      // first success → short learning step
      prog.interval = LEARN_MS / DAY_MS; // ~10 minutes as fraction of a day
      prog.state = "learning";
      prog.due = now + LEARN_MS;
    } else if (prog.reps === 2) {
      prog.interval = 1;
      prog.state = "review";
      prog.due = now + 1 * DAY_MS;
    } else if (prog.reps === 3) {
      prog.interval = quality === 2 ? 4 : 3;
      prog.state = "review";
      prog.due = now + prog.interval * DAY_MS;
    } else {
      let next = Math.max(1, Math.round((prog.interval || 1) * ef));
      if (quality === 2) next = Math.max(next + 1, Math.round(next * 1.3));
      prog.interval = next;
      prog.state = "review";
      prog.due = now + prog.interval * DAY_MS;
    }

    if (quality === 2) prog.ef = Math.min(2.8, ef + 0.15);
    else prog.ef = Math.min(2.8, ef + 0.05);

    prog.mastery = Math.min(3, (prog.mastery || 0) + (quality === 2 ? 1 : 0.5));
    if (prog.mastery > 2.9) prog.mastery = 3;
    else if (prog.mastery > 1.9) prog.mastery = Math.max(prog.mastery, 2);
  }

  function formatDue(p) {
    if (isNewCard(p)) return "新词";
    if (!p.due) return "到期";
    const d = p.due - Date.now();
    if (d <= 0) return "到期";
    if (d < HOUR_LIKE()) return Math.max(1, Math.round(d / MIN_MS)) + " 分钟后";
    if (d < DAY_MS) return Math.max(1, Math.round(d / (60 * MIN_MS))) + " 小时后";
    return Math.max(1, Math.round(d / DAY_MS)) + " 天后";
  }
  function HOUR_LIKE() { return 60 * MIN_MS; }

  function cloneProg(p) {
    return {
      ef: p.ef, interval: p.interval, reps: p.reps, lapses: p.lapses,
      due: p.due, correct: p.correct, wrong: p.wrong, mastery: p.mastery, state: p.state,
    };
  }

  /** Preview next-interval label for Good (1) / Easy (2) / Again (0) without mutating real prog. */
  function previewScheduleLabel(prog, quality) {
    const fake = cloneProg(prog);
    schedule(fake, quality, Date.now());
    let label = formatDue(fake);
    if (quality === 0) label = "约 10 分钟后";
    else if ((fake.interval || 0) >= 1) label += "（间隔 " + fake.interval + " 天）";
    else if (fake.state === "learning") label = "约 10 分钟后（学习中）";
    return label;
  }

  function enrichItem(w, levelIdx, idx) {
    const key = cardKey(levelIdx, w.word);
    const p = getProg(key);
    return {
      key,
      word: w.word,
      meaning_zh: w.meaning_zh,
      example_en: w.example_en || "",
      example_zh: w.example_zh || "",
      pos: w.pos || "",
      roots: w.roots || "",
      affix: w.affix || "",
      root_group: w.root_group || "",
      scene: w.scene || "",
      explain_zh: w.explain_zh || "",
      sort: (p.due || 0),
      mastery: p.mastery || 0,
      srsState: p.state || "new",
      dueAt: p.due || 0,
    };
  }

  function sortItemsForBrowse(items) {
    if (sortMode === "root_affix") {
      items.sort((a, b) =>
        (a.root_group || "").localeCompare(b.root_group || "", "zh") ||
        a.word.localeCompare(b.word) ||
        a.mastery - b.mastery
      );
    } else if (sortMode === "scene") {
      items.sort((a, b) =>
        (a.scene || "").localeCompare(b.scene || "", "zh") ||
        a.word.localeCompare(b.word) ||
        a.mastery - b.mastery
      );
    } else {
      items.sort((a, b) => a.mastery - b.mastery || a.sort - b.sort);
    }
    return items;
  }

  function buildQueue(levelNum) {
    const words = LEVELS[levelNum - 1] || [];
    const items = words.map((w, idx) => enrichItem(w, levelNum - 1, idx));
    const now = Date.now();

    const due = [];
    const learning = [];
    const neu = [];
    const later = [];

    for (const it of items) {
      const p = getProg(it.key);
      if (isNewCard(p)) neu.push(it);
      else if (isDue(p, now)) due.push(it);
      else if (isLearning(p)) learning.push(it);
      else later.push(it); // review not yet due
    }

    due.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    learning.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));

    // Within new cards, honour root/scene browse order when selected
    if (sortMode === "root_affix" || sortMode === "scene") {
      sortItemsForBrowse(neu);
    } else {
      // slight shuffle of new so sessions vary
      for (let i = neu.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [neu[i], neu[j]] = [neu[j], neu[i]];
      }
    }

    const q = [...due, ...learning.filter((it) => !due.some((d) => d.key === it.key))];
    if (!dueOnly) {
      q.push(...neu.slice(0, NEW_PER_SESSION));
    }
    // If nothing due and dueOnly, fall back to earliest later reviews so session isn't empty.
    // Still-new cards must be included too: an all-new set would otherwise look "cleared".
    if (!q.length) {
      later.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
      if (dueOnly) q.push(...later.slice(0, 5));
      else q.push(...later.slice(0, 3));
      if (!q.length) q.push(...neu.slice(0, NEW_PER_SESSION));
    }
    return q;
  }

  let stepCounter = 0;
  const requeueSoon = [];

  function updateSortButtons() {
    const map = {
      default: "btn-sort-default",
      root_affix: "btn-sort-root",
      scene: "btn-sort-scene",
    };
    for (const [mode, id] of Object.entries(map)) {
      const el = $(id);
      if (!el) continue;
      el.classList.toggle("sort-active", mode === sortMode);
    }
    const label = $("sort-mode-label");
    if (label) {
      label.textContent = sortMode === "scene" ? "场景" : "默认（到期优先 SRS）";
    }
  }

  function setSortMode(mode) {
    sortMode = publicSortMode(mode);
    persist();
    updateSortButtons();
    // If playing, rebuild remaining queue preserving progress style
    if ($("screen-play").classList.contains("active") && currentLevel) {
      queue = buildQueue(currentLevel);
      requeueSoon.length = 0;
      renderBrowseStrip();
      refreshHud();
    }
  }

  function renderBrowseStrip() {
    const strip = $("browse-strip");
    if (!strip || !currentLevel) return;
    const words = LEVELS[currentLevel - 1] || [];
    const items = words.map((w, idx) => enrichItem(w, currentLevel - 1, idx));
    sortItemsForBrowse(items);
    let html = "";
    let lastGroup = null;
    for (const it of items) {
      const g = sortMode === "root_affix" ? it.root_group : sortMode === "scene" ? it.scene : null;
      if (g && g !== lastGroup) {
        html += '<span class="browse-group">' + escapeHtml(g) + "</span>";
        lastGroup = g;
      }
      const weak = (it.mastery || 0) < 2;
      html +=
        '<span class="browse-chip' + (weak ? " weak" : "") + '" title="' +
        escapeHtml(it.meaning_zh) + '">' +
        escapeHtml(it.word) +
        "</span>";
    }
    strip.innerHTML = html;
    strip.hidden = sortMode === "default";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function startLevel(levelNum) {
    currentLevel = levelNum;
    queue = buildQueue(levelNum);
    requeueSoon.length = 0;
    stepCounter = 0;
    sessionSeen = 0;
    sessionTarget = Math.max(queue.length, 1);
    firstCardOfSession = true;
    killStreak = 0;
    pendingRate = false;
    hideKillBanner();
    const choices = $("choices");
    if (choices) {
      choices.hidden = true;
      choices.innerHTML = "";
    }
    showScreen("play");
    const playLevel = $("play-level");
    if (playLevel) playLevel.textContent = setTitle(levelNum);
    updateSortButtons();
    syncDueOnlyBtn();
    renderBrowseStrip();
    refreshHud();
    nextCard();
  }

  function injectRequeues() {
    const ready = [];
    for (let i = requeueSoon.length - 1; i >= 0; i--) {
      if (requeueSoon[i].appearAt <= stepCounter) {
        ready.push(requeueSoon[i].card);
        requeueSoon.splice(i, 1);
      }
    }
    if (ready.length) queue.unshift(...ready);
  }

  function animRestart(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function clearAnim(el, className, ms) {
    if (!el) return;
    setTimeout(() => el.classList.remove(className), ms);
  }

  function spawnPointsFloater(bonus) {
    const stage = $("stage");
    if (!stage) return;
    const el = document.createElement("div");
    el.className = "points-floater";
    el.textContent = "+" + bonus;
    stage.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function flashStage(kind) {
    const flash = $("stage-flash");
    if (!flash) return;
    flash.className = "";
    void flash.offsetWidth;
    flash.classList.add(kind === "ok" ? "flash-ok" : "flash-bad");
    setTimeout(() => { flash.className = ""; }, 600);
  }

  // --- Hype streak voice ---
  // Prefer Andy's custom VO clips (audio/*.m4a from 古梅路 3); Web Speech TTS is fallback only.
  // NOT official LoL/Riot audio. Shut down when a spree (≥3) is broken.
  const SHUTDOWN_STREAK_MIN = 3; // LoL-like: ending a killing spree (3+)
  const CUSTOM_VO = {
    "First blood": "audio/01_first_blood.m4a",
    "Double kill": "audio/02_double_kill.m4a",
    "Triple kill": "audio/03_triple_kill.m4a",
    "Quadra kill": "audio/04_quadra_kill.m4a",
    "Penta kill": "audio/05_penta_kill.m4a",
    "Killing spree": "audio/06_killing_spree.m4a",
    Rampage: "audio/07_rampage.m4a",
    Dominating: "audio/08_dominating.m4a",
    Unstoppable: "audio/09_unstoppable.m4a",
    Godlike: "audio/10_godlike.m4a",
    Legendary: "audio/11_legendary.m4a",
    "Shut down": "audio/12_shut_down.m4a",
  };
  /** Longest-first so "Double kill" wins over shorter substrings. */
  const VO_PHRASE_KEYS = Object.keys(CUSTOM_VO).sort((a, b) => b.length - a.length);

  // Part A / Part B clearance lines. Not in CUSTOM_VO, so they never play a kill clip.
  const PART_CLEAR_TTS = { A: "Part A clear", B: "Part B clear" };
  /** @type {Object.<string, HTMLAudioElement>} */
  const voCache = {};
  /** @type {HTMLAudioElement[]} */
  let voPlaying = [];

  const VOICE_PROFILES = {
    "First blood": { rate: 1.14, pitch: 1.1, volume: 1 },
    "Double kill": { rate: 1.18, pitch: 1.16, volume: 1 },
    "Triple kill": { rate: 1.22, pitch: 1.22, volume: 1 },
    "Quadra kill": { rate: 1.26, pitch: 1.28, volume: 1 },
    "Penta kill": { rate: 1.3, pitch: 1.34, volume: 1 },
    "Killing spree": { rate: 1.18, pitch: 1.18, volume: 1 },
    Rampage: { rate: 1.22, pitch: 1.24, volume: 1 },
    Unstoppable: { rate: 1.24, pitch: 1.28, volume: 1 },
    Dominating: { rate: 1.26, pitch: 1.32, volume: 1 },
    Godlike: { rate: 1.28, pitch: 1.36, volume: 1 },
    // Legendary TTS softened — custom clip is preferred when present
    Legendary: { rate: 1.18, pitch: 1.16, volume: 1 },
    "Shut down": { rate: 1.12, pitch: 0.72, volume: 1 },
    Victory: { rate: 1.12, pitch: 1.18, volume: 1 },
    _default: { rate: 1.1, pitch: 1.05, volume: 1 },
  };

  let preferredVoice = null;
  let audioCtx = null;
  // getVoices() inside a voiceschanged listener re-fires voiceschanged on
  // Safari and on Chrome when the speech engine wakes on the first tap.
  // pickEnglishVoice is that listener, so an unguarded call recurses and
  // wedges the main thread (the 🔈 tap, including 闹钟 / alarm, never returns).
  let pickingVoice = false;
  let cachedVoices = [];
  let speakGen = 0;

  function readVoices() {
    if (!window.speechSynthesis) return cachedVoices;
    // Hold the lock through the rest of this turn. A voiceschanged queued by
    // getVoices() then no-ops instead of calling getVoices() again.
    if (pickingVoice) return cachedVoices;
    pickingVoice = true;
    try {
      cachedVoices = speechSynthesis.getVoices() || [];
      return cachedVoices;
    } catch (_) {
      return cachedVoices;
    } finally {
      setTimeout(() => { pickingVoice = false; }, 0);
    }
  }

  function cancelSpeech() {
    speakGen++;
    try {
      if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (_) {}
  }

  /** cancel() + speak() in the same turn hangs speechSynthesis and can freeze the tab. */
  function speakUtterance(u) {
    const ss = window.speechSynthesis;
    if (!ss || !u) return;
    const gen = ++speakGen;
    try { ss.cancel(); } catch (_) {}
    setTimeout(() => {
      if (gen !== speakGen) return;
      try { ss.speak(u); } catch (_) {}
    }, 0);
  }

  function pickEnglishVoice() {
    if (!window.speechSynthesis || pickingVoice) return preferredVoice;
    const voices = readVoices();
    if (!voices.length) return preferredVoice;
    // Prefer deeper / announcer-like English male voices when available
    const prefer = [
      /Daniel/i,
      /Alex/i,
      /Google UK English Male/i,
      /Google US English/i,
      /Microsoft (David|Mark|Guy)/i,
      /Male/i,
      /Samantha/i,
      /Natural/i,
    ];
    for (const re of prefer) {
      const hit = voices.find((v) => /^en/i.test(v.lang) && re.test(v.name));
      if (hit) {
        preferredVoice = hit;
        return preferredVoice;
      }
    }
    preferredVoice =
      voices.find((v) => /en-GB/i.test(v.lang)) ||
      voices.find((v) => /en-US/i.test(v.lang)) ||
      voices.find((v) => /^en(-|$)/i.test(v.lang)) ||
      voices.find((v) => /en/i.test(v.lang)) ||
      null;
    return preferredVoice;
  }
  if (window.speechSynthesis) {
    speechSynthesis.addEventListener("voiceschanged", pickEnglishVoice);
    pickEnglishVoice();
  }

  function resolveVoiceProfile(text, opts) {
    if (opts && (opts.rate != null || opts.pitch != null || opts.volume != null)) {
      const base = VOICE_PROFILES._default;
      return {
        rate: opts.rate != null ? opts.rate : base.rate,
        pitch: opts.pitch != null ? opts.pitch : base.pitch,
        volume: opts.volume != null ? opts.volume : base.volume,
      };
    }
    const raw = String(text || "");
    // Pick hottest matching profile when combined ("Double kill. Killing spree")
    const keys = Object.keys(VOICE_PROFILES).filter((k) => k !== "_default");
    let best = null;
    let bestScore = -1;
    for (const k of keys) {
      if (raw.toLowerCase().indexOf(k.toLowerCase()) >= 0) {
        const p = VOICE_PROFILES[k];
        const score = (p.rate || 0) + (p.pitch || 0) * 1.2;
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
    }
    return best || VOICE_PROFILES._default;
  }

  function stopCustomVo() {
    voPlaying.forEach((a) => {
      try {
        a.pause();
        a.currentTime = 0;
      } catch (_) {}
    });
    voPlaying = [];
  }

  function getCustomAudio(phrase) {
    const src = CUSTOM_VO[phrase];
    if (!src) return null;
    if (!voCache[phrase]) {
      const a = new Audio(src);
      a.preload = "auto";
      voCache[phrase] = a;
    }
    return voCache[phrase];
  }

  /** Extract known VO phrases from a line like "Double kill. Killing spree". */
  function extractVoPhrases(text) {
    const raw = String(text || "");
    const found = [];
    const used = [];
    for (const key of VO_PHRASE_KEYS) {
      const idx = raw.toLowerCase().indexOf(key.toLowerCase());
      if (idx < 0) continue;
      const end = idx + key.length;
      if (used.some(([s, e]) => !(end <= s || idx >= e))) continue;
      used.push([idx, end]);
      found.push({ key, idx });
    }
    found.sort((a, b) => a.idx - b.idx);
    return found.map((f) => f.key);
  }

  /** Play custom clips in order. Returns true if at least one started. */
  function playCustomPhrases(phrases) {
    const clips = [];
    for (const p of phrases) {
      const a = getCustomAudio(p);
      if (a) clips.push(a);
    }
    if (!clips.length) return false;
    stopCustomVo();
    cancelSpeech();
    let i = 0;
    let steps = 0;
    const playNext = () => {
      // onerror and a rejected play() can both re-enter; cap so a broken clip
      // cannot recurse on the main thread.
      if (i >= clips.length || steps++ > clips.length) {
        voPlaying = [];
        return;
      }
      const a = clips[i++];
      try {
        a.pause();
        a.currentTime = 0;
        a.onended = playNext;
        a.onerror = playNext;
        voPlaying = [a];
        const p = a.play();
        if (p && typeof p.catch === "function") p.catch(() => playNext());
      } catch (_) {
        playNext();
      }
    };
    playNext();
    return true;
  }

  /** @param {string} text @param {{rate?:number,pitch?:number,volume?:number}} [opts] */
  function speakLine(text, opts) {
    if (!voiceOn || !text) return;
    const phrases = extractVoPhrases(text);
    if (phrases.length && playCustomPhrases(phrases)) return;
    // TTS fallback when custom clip missing
    if (!window.speechSynthesis) return;
    try {
      stopCustomVo();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      const p = resolveVoiceProfile(text, opts);
      u.rate = p.rate;
      u.pitch = p.pitch;
      u.volume = p.volume;
      const v = preferredVoice || pickEnglishVoice();
      if (v) {
        u.voice = v;
        if (v.lang) u.lang = v.lang;
      }
      speakUtterance(u);
    } catch (_) {}
  }

  /** Short original oscillator sting — no sampled / copyrighted audio. */
  function playSting(kind) {
    if (!voiceOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t0 = audioCtx.currentTime;
      const master = audioCtx.createGain();
      master.connect(audioCtx.destination);
      if (kind === "legendary") {
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(freq, t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.015 + i * 0.04);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28 + i * 0.04);
          o.connect(g);
          g.connect(master);
          o.start(t0 + i * 0.04);
          o.stop(t0 + 0.4);
        });
      } else if (kind === "shutdown") {
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(0.28, t0 + 0.01);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(220, t0);
        o.frequency.exponentialRampToValueAtTime(55, t0 + 0.4);
        g.gain.setValueAtTime(0.4, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
        o.connect(g);
        g.connect(master);
        o.start(t0);
        o.stop(t0 + 0.48);
      }
    } catch (_) {}
  }

  function hideKillBanner() {
    const b = $("kill-banner");
    if (!b) return;
    b.classList.remove("show", "shutdown");
    b.textContent = "";
  }

  function showKillBanner(text, kind) {
    const b = $("kill-banner");
    if (!b || !text) return;
    b.textContent = text;
    b.classList.remove("show", "shutdown");
    if (kind === "shutdown") b.classList.add("shutdown");
    void b.offsetWidth;
    b.classList.add("show");
    setTimeout(() => {
      b.classList.remove("show", "shutdown");
    }, kind === "shutdown" ? 2000 : 1600);
  }

  function announceKillStreak() {
    const n = killStreak;
    let say = "";
    if (KILL_LINES[n]) say = KILL_LINES[n];
    const spree = SPREE_LINES.find((s) => s.at === n) || (n >= 8 ? { text: "Legendary" } : null);
    if (spree && spree.text !== say) {
      say = say ? say + ". " + spree.text : spree.text;
    }
    if (!say && n >= 8) say = "Legendary";
    if (say) {
      const isLegendary = /Legendary/i.test(say);
      showKillBanner(say.toUpperCase(), isLegendary ? "legendary" : "kill");
      if (isLegendary) playSting("legendary");
      speakLine(say);
    }
  }

  function announceShutDown() {
    showKillBanner("SHUT DOWN · 终结", "shutdown");
    playSting("shutdown");
    speakLine("Shut down");
  }

  function fillCardContent() {
    const promptLabel = $("prompt-label");
    if (promptLabel) promptLabel.textContent = "Chinese meaning → English word";
    const promptMain = $("prompt-main");
    if (promptMain) promptMain.textContent = currentCard.meaning_zh || "";
    const prog = getProg(currentCard.key);
    const filled = Math.floor(prog.mastery || 0);
    const starsHtml =
      '<span class="mastery-star-anim">' +
      "★".repeat(filled) +
      "☆".repeat(3 - filled) +
      "</span>";
    let metaBits = [];
    if (sortMode === "root_affix" && currentCard.root_group) metaBits.push(currentCard.root_group);
    if (sortMode === "scene" && currentCard.scene) metaBits.push(currentCard.scene);
    const srsTag = isNewCard(prog)
      ? "新词 New"
      : isDue(prog, Date.now())
        ? "到期 Due"
        : isLearning(prog)
          ? "学习中 Learning"
          : formatDue(prog);
    metaBits.unshift(srsTag);
    const hint = hintForCard(currentCard);
    const exampleZh = currentCard.example_zh ? "  ·  例：" + escapeHtml(currentCard.example_zh) : "";
    const hintEl = $("prompt-hint");
    if (hintEl) {
      hintEl.innerHTML =
        starsHtml +
        (metaBits.length ? "  ·  " + escapeHtml(metaBits.join(" · ")) : "") +
        (hint ? "  ·  hint: " + escapeHtml(hint) : "") +
        exampleZh;
    }
    const queueEl = $("play-queue");
    if (queueEl) queueEl.textContent = String(queue.length + requeueSoon.length);
    updateProgress();
    renderChoices();
  }

  function nextCard() {
    injectRequeues();
    // Keep the previous prompt on screen during the exit animation. Do not
    // grade or swap currentCard until the new card is painted, or a fast tap
    // answers the next word against the previous Chinese prompt.
    awaiting = true;
    const fb = $("feedback");
    if (fb) {
      fb.innerHTML = "";
      fb.className = "";
    }

    if (isLevelClear(currentLevel) && queue.length === 0 && requeueSoon.length === 0) {
      onLevelClear();
      return;
    }

    if (queue.length === 0) {
      queue = buildQueue(currentLevel);
      // Drop cards already seen this session if we still have unseen due/new
      if (!queue.length) {
        if (isLevelClear(currentLevel)) {
          onLevelClear();
          return;
        }
        // Nothing due: offer a short early-review slice or clear
        const words = LEVELS[currentLevel - 1] || [];
        const now = Date.now();
        const upcoming = words
          .map((w, idx) => enrichItem(w, currentLevel - 1, idx))
          .filter((it) => {
            const p = getProg(it.key);
            return !isNewCard(p) && p.due > now;
          })
          .sort((a, b) => a.dueAt - b.dueAt)
          .slice(0, 5);
        if (upcoming.length) queue = upcoming;
        else {
          // Do not call onLevelClear here. 巩固 0/40 is not a pass, and that
          // screen's Next set / Home loop never deals another question.
          const pool = words.map((w, idx) => enrichItem(w, currentLevel - 1, idx));
          const fresh = pool.filter((it) => isNewCard(getProg(it.key))).slice(0, NEW_PER_SESSION);
          queue = fresh.length ? fresh : pool.slice(0, NEW_PER_SESSION);
          if (!queue.length) {
            showScreen("home");
            return;
          }
        }
      }
    }

    const card = queue.shift();
    stepCounter += 1;
    sessionSeen += 1;

    const box = $("prompt-box");
    const doEnter = () => {
      currentCard = card;
      awaiting = false;
      fillCardContent();
      animRestart(box, "card-enter");
      clearAnim(box, "card-enter", 420);
      firstCardOfSession = false;
    };

    if (firstCardOfSession) {
      doEnter();
    } else {
      animRestart(box, "card-exit");
      setTimeout(() => {
        box.classList.remove("card-exit");
        doEnter();
      }, 260);
    }
  }

  function softenHint(example, word) {
    try {
      const re = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
      return example.replace(re, "___");
    } catch (_) {
      return example;
    }
  }

  function isPlaceholderExample(example) {
    return !example || /junior-high English sentence/i.test(example) ||
      /^Please .+ carefully during the lesson\.?$/i.test(example) ||
      /^I saw a .+ near the /i.test(example) ||
      /^Please listen .+ in class\.?$/i.test(example) ||
      /^It feels .+ at the /i.test(example) ||
      /^There is a .+ in our classroom\.?$/i.test(example);
  }

  /** Prefer a blanked real example; never show a placeholder template as the hint. */
  function hintForCard(card) {
    if (!card) return "";
    if (card.example_en && !isPlaceholderExample(card.example_en)) {
      return softenHint(card.example_en, card.word);
    }
    if (card.meaning_zh) return "意思：" + card.meaning_zh;
    if (card.scene) return String(card.scene).split("·")[0].trim();
    return "";
  }

  /**
   * 进度百分比 for the current word set (how far through this set, not 进步).
   * A card counts once it meets the existing clearance "solid" review-state:
   * state === "review" and interval >= CLEAR_MIN_INTERVAL_DAYS.
   * pct = round(solid / total * 100). 100% means every card in the set is solid.
   * The pass bar is still 80% of the set (stats.need), tracked separately.
   */
  function setCompletionPercent(stats) {
    const total = stats && stats.total ? stats.total : 0;
    if (!total) return 0;
    return Math.max(0, Math.min(100, Math.round((stats.solid / total) * 100)));
  }

  function updateProgress() {
    const s = levelClearStats(currentLevel);
    const pct = setCompletionPercent(s);
    const bar = $("play-progress");
    if (bar) bar.style.width = pct + "%";
    const pctEl = $("set-progress-pct");
    if (pctEl) pctEl.textContent = pct + "%";
    const barWrap = $("set-progress-bar");
    if (barWrap) {
      barWrap.setAttribute("aria-valuenow", String(pct));
      barWrap.setAttribute("aria-valuetext", "本组进度 " + pct + "%");
    }
    const label = $("play-clear-label");
    if (label) {
      label.textContent = s.ready
        ? "通关完成 · 本组进度 " + pct + "%"
        : ("本组进度 " + pct + "% · 巩固 " + s.solid + "/" + s.total +
           " · 通关需 " + s.need +
           " · 新" + s.neu + " 到期" + s.due + " 学" + s.learning);
    }
  }

  function normalizeAnswer(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ")
      .replace(/[.,!?;:]+$/g, "");
  }

  function answersMatch(input, expected) {
    const a = normalizeAnswer(input);
    const b = normalizeAnswer(expected);
    if (a === b) return true;
    const stripArt = (x) => x.replace(/^(a|an|the)\s+/, "");
    if (stripArt(a) === stripArt(b)) return true;
    return false;
  }

  function grade(correct, easy) {
    if (awaiting || !currentCard || pendingRate) return;
    awaiting = true;
    const prog = getProg(currentCard.key);
    const prevMastery = Math.floor(prog.mastery || 0);
    const fb = $("feedback");
    const nowMs = Date.now();

    logAnswer(correct, prog);
    if (correct) {
      // Hype first; SRS waits for Good / Easy
      save.streak += 1;
      killStreak += 1;
      if (save.streak > save.bestStreak) save.bestStreak = save.streak;
      const bonus = Math.min(50, 10 + save.streak * 2);
      save.points += bonus;
      pendingRate = true;

      const goodLabel = previewScheduleLabel(prog, 1);
      const easyLabel = previewScheduleLabel(prog, 2);
      fb.innerHTML =
        '<div class="fb-title">Correct! +' + bonus + "</div>" +
        '<div class="fb-answer">' + escapeHtml(currentCard.word) + "</div>" + speakButtons(currentCard) +
        '<div class="fb-meta">选择复习力度（Anki：Good / Easy）</div>' +
        '<div class="rate-row">' +
        '<button type="button" class="rate-btn good" id="btn-rate-good">Good · ' + escapeHtml(goodLabel) + "</button>" +
        '<button type="button" class="rate-btn easy" id="btn-rate-easy">Easy · ' + escapeHtml(easyLabel) + "</button>" +
        "</div>";
      fb.className = "ok show";

      flashStage("ok");
      spawnPointsFloater(bonus);
      animRestart($("stat-points"), "points-pop");
      clearAnim($("stat-points"), "points-pop", 450);
      animRestart($("stat-streak"), "bounce");
      clearAnim($("stat-streak"), "bounce", 500);
      announceKillStreak();
      persist();

      const bindRate = (id, q) => {
        const el = $(id);
        if (!el) return;
        el.addEventListener("click", () => confirmCorrect(q, prevMastery));
      };
      bindRate("btn-rate-good", 1);
      bindRate("btn-rate-easy", 2);
    } else {
      schedule(prog, 0, nowMs);
      save.streak = 0;
      const brokenStreak = killStreak;
      killStreak = 0;
      if (brokenStreak >= SHUTDOWN_STREAK_MIN) {
        announceShutDown();
      } else {
        hideKillBanner();
      }
      save.points = Math.max(0, save.points - 2);

      const explain =
        currentCard.explain_zh ||
        ("意思是「" + currentCard.meaning_zh + "」。");
      let why =
        "<div class=\"fb-explain\"><b>答案</b> " + escapeHtml(currentCard.word) +
        " — " + escapeHtml(currentCard.meaning_zh) + "</div>" +
        "<div class=\"fb-explain\">" + escapeHtml(explain) + "</div>";
      if (currentCard.scene) {
        why += '<div class="fb-meta">场景：' + escapeHtml(currentCard.scene) + "</div>";
      }
      why +=
        '<div class="fb-meta">下次 · 约 10 分钟后再练（短间隔 Again）· 本局稍后重现</div>';
      fb.innerHTML = '<div class="fb-title">再想想 Not yet</div>' + speakButtons(currentCard) + why;
      fb.className = "bad show";

      flashStage("bad");
      animRestart($("prompt-box"), "shake");
      clearAnim($("prompt-box"), "shake", 500);

      const delay = 1 + Math.floor(Math.random() * 2);
      requeueSoon.push({ appearAt: stepCounter + delay, card: { ...currentCard, _repeat: true } });
      if (!queue.some((c) => c.key === currentCard.key && c._repeat)) {
        queue.splice(Math.min(2, queue.length), 0, { ...currentCard, _repeat: true });
      }
      persist();
      setTimeout(nextCard, 2600);
    }
    $("play-queue").textContent = String(queue.length + requeueSoon.length);
    updateProgress();
  }

  function confirmCorrect(quality, prevMastery) {
    if (!pendingRate || !currentCard) return;
    pendingRate = false;
    const prog = getProg(currentCard.key);
    const nowMs = Date.now();
    schedule(prog, quality === 2 ? 2 : 1, nowMs);
    const fb = $("feedback");
    const qName = quality === 2 ? "Easy" : "Good";
    fb.innerHTML =
      '<div class="fb-title">Correct · ' + qName + "</div>" +
      '<div class="fb-answer">' + escapeHtml(currentCard.word) + "</div>" +
      '<div class="fb-meta">下次 · ' + escapeHtml(formatDue(prog)) +
      ((prog.interval || 0) >= 1 ? "（间隔 " + prog.interval + " 天）" : "") +
      "</div>";
    fb.className = "ok show";

    const newMastery = Math.floor(prog.mastery || 0);
    if (newMastery > (prevMastery || 0)) {
      animRestart($("prompt-box"), "mastery-glow");
      clearAnim($("prompt-box"), "mastery-glow", 750);
      animRestart($("stat-mastered"), "points-pop");
      clearAnim($("stat-mastered"), "points-pop", 450);
    }

    // Unlock next set only when this set meets the clearance bar
    if (isLevelClear(currentLevel) && currentLevel >= save.unlockedLevel) {
      save.unlockedLevel = Math.min(LEVEL_COUNT, currentLevel + 1);
      if (!save.trackUnlock || typeof save.trackUnlock !== "object") save.trackUnlock = {};
      save.trackUnlock[currentTrack] = save.unlockedLevel;
    }
    persist();
    updateProgress();
    setTimeout(nextCard, 700);
  }

  /** Hard MC distractors: same POS / scene / root_group / similar length·spelling */
  function scoreDistractor(candidate, target, levelWords) {
    let score = 0;
    const cw = candidate.word;
    const tw = target.word;
    if (normalizeAnswer(cw) === normalizeAnswer(tw)) return -1e9;

    if (candidate.pos && target.pos && candidate.pos === target.pos) score += 40;
    // Compatible POS families
    const phrasey = new Set(["phrasal", "verb_phrase", "prep_phrase", "adv_phrase", "conj", "modal_phrase", "idiom"]);
    if (phrasey.has(candidate.pos) && phrasey.has(target.pos)) score += 18;

    if (candidate.scene && target.scene && candidate.scene === target.scene) score += 28;
    if (candidate.root_group && target.root_group && candidate.root_group === target.root_group) score += 32;
    if (candidate.roots && target.roots && candidate.roots === target.roots) score += 20;
    if (candidate.affix && target.affix && candidate.affix === target.affix) score += 16;

    // Similar length (chars / tokens)
    const lenDiff = Math.abs(cw.length - tw.length);
    score += Math.max(0, 14 - lenDiff * 2);
    const tokDiff = Math.abs(cw.split(/\s+/).length - tw.split(/\s+/).length);
    if (tokDiff === 0) score += 12;
    else score -= tokDiff * 8;

    // Shared starting letters / edit proximity
    const a = normalizeAnswer(cw).replace(/\s+/g, "");
    const b = normalizeAnswer(tw).replace(/\s+/g, "");
    let commonPrefix = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) commonPrefix++;
      else break;
    }
    score += Math.min(10, commonPrefix * 3);

    // Prefer in-level; slight boost already implied by pool
    // Penalize clearly unrelated junk (no shared signals)
    if (score < 8) score -= 15;

    // Tiny noise so ties don't always pick same 3
    score += Math.random() * 3;
    return score;
  }

  function pickHardDistractors(target, count) {
    const levelWords = LEVELS[currentLevel - 1] || [];
    // Pool: same level first, then all levels for more near-miss options
    const pool = [];
    const seen = new Set();
    const add = (w, levelIdx) => {
      const k = normalizeAnswer(w.word);
      if (seen.has(k) || k === normalizeAnswer(target.word)) return;
      seen.add(k);
      pool.push({ ...w, _levelIdx: levelIdx });
    };
    levelWords.forEach((w) => add(w, currentLevel - 1));
    for (let li = 0; li < LEVELS.length; li++) {
      if (li === currentLevel - 1) continue;
      LEVELS[li].forEach((w) => add(w, li));
    }

    // Prefer same POS family first (adv/det/prep stay with peers — never here/much vs ever)
    const samePos = pool.filter((w) => w.pos && target.pos && w.pos === target.pos);
    const usePool = samePos.length >= count + 2 ? samePos : pool;

    const ranked = usePool
      .map((w) => ({ w, s: scoreDistractor(w, target, levelWords) }))
      .filter((x) => x.s > -1e8)
      .sort((a, b) => b.s - a.s);

    const picks = [];
    const usedPosScene = new Set();
    for (const { w, s } of ranked) {
      if (picks.length >= count) break;
      // Avoid three identical easy junk; prefer diversity of words but keep hardness
      if (s < 5 && picks.length >= 2) continue;
      picks.push(w.word);
      usedPosScene.add((w.pos || "") + "|" + (w.scene || ""));
    }
    // Fallback fill from same level if short
    if (picks.length < count) {
      for (const w of shuffle(levelWords.slice())) {
        if (picks.length >= count) break;
        if (normalizeAnswer(w.word) === normalizeAnswer(target.word)) continue;
        if (picks.some((p) => normalizeAnswer(p) === normalizeAnswer(w.word))) continue;
        picks.push(w.word);
      }
    }
    return picks.slice(0, count);
  }

  function renderChoices() {
    if (!currentCard) return;
    const correct = currentCard.word;
    const distractors = pickHardDistractors(currentCard, 3);
    const opts = [correct, ...distractors].filter((opt) => opt);
    shuffle(opts);
    const box = $("choices");
    if (!box) return;
    box.hidden = false;
    box.innerHTML = "";
    opts.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = i + 1 + ".  " + opt;
      b.addEventListener("click", () => {
        if (awaiting) return;
        const ok = answersMatch(opt, correct);
        b.classList.add(ok ? "ok" : "bad");
        grade(ok, false);
      });
      box.appendChild(b);
    });
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function isLevelClear(levelNum) {
    return levelClearStats(levelNum).ready;
  }

  /** Distinct Part A vs Part B finish line. Kill-streak ladder stays untouched. */
  function playPartClearCue(levelNum) {
    if (!voiceOn) return;
    const part = (levelNum % 2 === 1) ? "A" : "B";
    speakLine(PART_CLEAR_TTS[part]);
  }

  function onLevelClear() {
    const stars = levelStars(currentLevel);
    save.levelStars[String(currentLevel)] = Math.max(save.levelStars[String(currentLevel)] || 0, stars);
    if (currentLevel >= save.unlockedLevel) {
      save.unlockedLevel = Math.min(LEVEL_COUNT, currentLevel + 1);
      if (!save.trackUnlock || typeof save.trackUnlock !== "object") save.trackUnlock = {};
      save.trackUnlock[currentTrack] = save.unlockedLevel;
    }
    save.points += 50;
    persist();
    const cs = levelClearStats(currentLevel);
    $("clear-msg").textContent =
      setTitle(currentLevel) + " cleared (+50). Rule: 新词0 · 到期0 · 学习中0 · 巩固 " +
      cs.solid + "/" + cs.need + " (≥80%, interval≥1天). Stars: " + stars + "/3.";
    const starEl = $("clear-stars");
    starEl.className = "stars star-pop";
    starEl.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const s = document.createElement("span");
      s.textContent = i < stars ? "★" : "☆";
      starEl.appendChild(s);
    }
    showScreen("clear");
    spawnPointsFloater(50);
    flashStage("ok");
    playPartClearCue(currentLevel);
  }


  function setBackupStatus(msg) {
    const el = $("backup-status");
    if (el) el.textContent = msg || "";
  }

  function buildExportPayload() {
    persist();
    return {
      app: "QuizMario",
      key: STORAGE_KEY,
      version: 2,
      exportedAt: new Date().toISOString(),
      save: save,
    };
  }

  function snapshotToSave(payload) {
    const cards = {};
    const src = payload.cards || {};
    for (const k of Object.keys(src)) cards[k] = migrateCard(Object.assign({}, src[k]));
    return extendSave({
      points: payload.points || 0,
      streak: payload.streak || 0,
      bestStreak: payload.bestStreak || 0,
      unlockedLevel: Math.max(1, payload.unlockedLevel || 1),
      cards,
      levelStars: Object.assign({}, payload.levelStars || {}),
      sortMode: payload.sortMode || "default",
      voiceOn: payload.voiceOn !== false,
      dueOnly: !!payload.dueOnly,
    }, {
      track: payload.track,
      trackUnlock: Object.assign({}, payload.trackUnlock || {}),
      trackStars: Object.assign({}, payload.trackStars || {}),
      daily: Object.assign({}, payload.daily || {}),
      profile: Object.assign({ name: "", cls: "" }, payload.profile || {}),
      updatedAt: payload.updatedAt,
    });
  }

  function applySaveObject(next, opts) {
    opts = opts || {};
    save = next;
    applyTrack(save.track || "core", true);
    sortMode = publicSortMode(save.sortMode);
    voiceOn = save.voiceOn !== false;
    dueOnly = !!save.dueOnly;
    const voiceBtn = $("btn-voice-toggle");
    if (voiceBtn) {
      voiceBtn.textContent = voiceOn ? "🔊 连杀语音 On" : "🔇 连杀语音 Off";
      voiceBtn.classList.toggle("sort-active", voiceOn);
    }
    persist(opts);
    updateSortButtons();
    syncDueOnlyBtn();
    refreshHud();
    const nm = $("profile-name");
    const cl = $("profile-cls");
    if (nm) nm.value = (save.profile && save.profile.name) || "";
    if (cl) cl.value = (save.profile && save.profile.cls) || "";
    renderStats();
    if ($("screen-levels") && $("screen-levels").classList.contains("active")) renderLevels();
  }

  function applyImportedSave(data) {
    let payload = data;
    if (payload && payload.save && !payload.cards) payload = payload.save;
    if (!payload || typeof payload !== "object") throw new Error("Invalid backup");
    applySaveObject(snapshotToSave(payload), { upload: true });
  }

  function exportProgressFile() {
    try {
      const blob = new Blob([JSON.stringify(buildExportPayload(), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = URL.createObjectURL(blob);
      a.download = "quizmario-progress-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setBackupStatus("已导出 JSON。换设备前请保存好这个文件。");
    } catch (e) {
      setBackupStatus("导出失败：" + (e && e.message ? e.message : e));
    }
  }

  function toBackupCode() {
    const json = JSON.stringify(buildExportPayload());
    // unicode-safe base64
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return "QM1." + b64;
  }

  function fromBackupCode(text) {
    let t = (text || "").trim();
    if (t.startsWith("QM1.")) t = t.slice(4);
    const json = decodeURIComponent(escape(atob(t)));
    return JSON.parse(json);
  }

  function copyBackupCode() {
    try {
      const code = toBackupCode();
      const ta = $("backup-code");
      if (ta) ta.value = code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(
          () => setBackupStatus("备份码已复制。可粘贴到备忘录 / 微信文件传输。"),
          () => setBackupStatus("备份码已填入框内，请手动全选复制。")
        );
      } else {
        setBackupStatus("备份码已填入框内，请手动全选复制。");
      }
    } catch (e) {
      setBackupStatus("生成备份码失败：" + (e && e.message ? e.message : e));
    }
  }

  function importFromBackupCode() {
    try {
      const ta = $("backup-code");
      const text = ta ? ta.value : "";
      if (!text.trim()) {
        setBackupStatus("请先粘贴备份码。");
        return;
      }
      if (!confirm("导入会覆盖当前浏览器里的进度，继续？")) return;
      const data = fromBackupCode(text);
      applyImportedSave(data);
      setBackupStatus("已从备份码导入。");
    } catch (e) {
      setBackupStatus("备份码无效：" + (e && e.message ? e.message : e));
    }
  }

  function importProgressFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ""));
        if (!confirm("导入会覆盖当前浏览器里的进度，继续？")) return;
        applyImportedSave(data);
        setBackupStatus("已从 JSON 导入。");
      } catch (e) {
        setBackupStatus("导入失败：" + (e && e.message ? e.message : e));
      }
    };
    reader.onerror = () => setBackupStatus("读取文件失败。");
    reader.readAsText(file);
  }

  // ===== v6: tracks · learning data · report code · pronunciation =====
  function findTrack(id) { return TRACKS.find((t) => t.id === id) || TRACKS[0]; }

  function setTitle(i) {
    const t = findTrack(currentTrack);
    if (t.titles && t.titles[i - 1]) return t.titles[i - 1];
    const setNum = Math.floor((i - 1) / 2) + 1;
    const part = (i % 2 === 1) ? "A" : "B";
    return "第" + setNum + "组 · Part " + part;
  }

  /** Switch active word track; per-track unlock/stars are swapped in and out of save. */
  function applyTrack(id, initial) {
    const t = findTrack(id);
    if (initial) {
      // on load/import, save.unlockedLevel/levelStars belong to save.track
      save.trackUnlock[t.id] = save.unlockedLevel;
      save.trackStars[t.id] = save.levelStars;
    } else {
      save.trackUnlock[currentTrack] = save.unlockedLevel;
      save.trackStars[currentTrack] = save.levelStars;
    }
    currentTrack = t.id;
    LEVELS = t.sets || [];
    LEVEL_COUNT = LEVELS.length;
    save.track = t.id;
    save.unlockedLevel = Math.max(1, save.trackUnlock[t.id] || 1);
    save.levelStars = save.trackStars[t.id] || {};
    currentLevel = Math.min(currentLevel || 1, LEVEL_COUNT || 1);
    const sel = $("track-select");
    if (sel) sel.value = t.id;
    const d = $("track-desc");
    if (d) d.textContent = (t.desc || "") + " · " + LEVEL_COUNT + " 组 · " + LEVELS.reduce((a, s) => a + s.length, 0) + " 词";
  }

  function switchTrack(id) {
    applyTrack(id, false);
    currentLevel = 1;
    persist();
    renderLevels();
    renderStats();
  }

  function withTrack(id, fn) {
    const prev = currentTrack, pl = LEVELS, pc = LEVEL_COUNT, pu = save.unlockedLevel, ps = save.levelStars;
    currentTrack = id; LEVELS = findTrack(id).sets || []; LEVEL_COUNT = LEVELS.length;
    try { return fn(); } finally { currentTrack = prev; LEVELS = pl; LEVEL_COUNT = pc; save.unlockedLevel = pu; save.levelStars = ps; }
  }

  function dayKey(ms) {
    const d = new Date(ms || Date.now());
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /** Daily log: c/w = correct/wrong, rc/rw = answers on cards already in review (retention), n = new cards seen. */
  function logAnswer(correct, prog) {
    const k = dayKey();
    const d = save.daily[k] || (save.daily[k] = { c: 0, w: 0, rc: 0, rw: 0, n: 0 });
    if (correct) d.c++; else d.w++;
    if (isNewCard(prog)) d.n++;
    else if (prog.state === "review" && (prog.interval || 0) >= 1) { if (correct) d.rc++; else d.rw++; }
  }

  function activeStreak() {
    let n = 0;
    const t = new Date(); t.setHours(12, 0, 0, 0);
    if (!save.daily[dayKey(t.getTime())]) t.setDate(t.getDate() - 1); // today not yet studied: count to yesterday
    while (save.daily[dayKey(t.getTime())]) { n++; t.setDate(t.getDate() - 1); }
    return n;
  }

  function lastDays(n) {
    const out = [];
    const t = new Date(); t.setHours(12, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(t); x.setDate(t.getDate() - i);
      const k = dayKey(x.getTime());
      out.push(Object.assign({ day: k }, save.daily[k] || { c: 0, w: 0, rc: 0, rw: 0, n: 0 }));
    }
    return out;
  }

  function trackSummary(id) {
    return withTrack(id, () => {
      let learned = 0, total = 0;
      const cleared = [];
      LEVELS.forEach((words, li) => {
        for (const w of words) {
          total++;
          const p = save.cards[cardKey(li, w.word)];
          if (p && !isNewCard(p) && p.state === "review") learned++;
        }
        if (clearReadyPure(li, words)) cleared.push(li + 1);
      });
      return { learned, total, cleared, sets: LEVELS.length };
    });
  }

  /** Same pass rule as levelClearStats, but never creates card entries. */
  function clearReadyPure(li, words) {
    const now = Date.now();
    let neu = 0, due = 0, learning = 0, solid = 0;
    for (const w of words) {
      const p = save.cards[cardKey(li, w.word)];
      if (!p || isNewCard(p)) { neu++; continue; }
      if (isDue(p, now)) due++;
      if (p.state === "review" && (p.interval || 0) >= CLEAR_MIN_INTERVAL_DAYS) solid++; else learning++;
    }
    return words.length > 0 && neu === 0 && due === 0 && learning === 0 && solid >= Math.ceil(words.length * CLEAR_SOLID_PCT);
  }

  function weakWords(limit) {
    const list = [];
    for (const t of TRACKS) {
      withTrack(t.id, () => {
        LEVELS.forEach((words, li) => {
          for (const w of words) {
            const p = save.cards[cardKey(li, w.word)];
            if (p && (p.wrong || 0) > 0) list.push([w.word, w.meaning_zh, p.wrong || 0, (p.correct || 0)]);
          }
        });
      });
    }
    list.sort((a, b) => (b[2] - b[3] * 0.3) - (a[2] - a[3] * 0.3));
    return list.slice(0, limit || 12);
  }

  function computeStats() {
    const d7 = lastDays(7);
    const sum = (arr, f) => arr.reduce((a, x) => a + (x[f] || 0), 0);
    const all = Object.values(save.daily);
    const tracks = {};
    let learned = 0;
    for (const t of TRACKS) { tracks[t.id] = trackSummary(t.id); learned += tracks[t.id].learned; }
    const rc7 = sum(d7, "rc"), rw7 = sum(d7, "rw"), c7 = sum(d7, "c"), w7 = sum(d7, "w");
    return {
      streak: activeStreak(),
      activeDays: Object.keys(save.daily).length,
      learned,
      answers: sum(all, "c") + sum(all, "w"),
      acc: (sum(all, "c") + sum(all, "w")) ? sum(all, "c") / (sum(all, "c") + sum(all, "w")) : null,
      acc7: (c7 + w7) ? c7 / (c7 + w7) : null,
      ret7: (rc7 + rw7) ? rc7 / (rc7 + rw7) : null,
      tracks,
    };
  }

  const pct = (x) => (x == null ? "—" : Math.round(x * 100) + "%");

  function renderStats() {
    const box = $("stats-body");
    if (!box) return;
    const st = computeStats();
    const days = lastDays(14);
    const maxN = Math.max(1, ...days.map((d) => d.c + d.w));
    const W = 300, H = 110, bw = W / days.length;
    let bars = "", line = "";
    days.forEach((d, i) => {
      const n = d.c + d.w;
      const h = (n / maxN) * (H - 20);
      bars += '<rect x="' + (i * bw + 3) + '" y="' + (H - 14 - h) + '" width="' + (bw - 6) + '" height="' + h + '" rx="2" fill="rgba(61,231,255,.55)"><title>' + d.day + " 答题 " + n + "</title></rect>";
      if (n) {
        const y = H - 14 - (d.c / n) * (H - 20);
        line += (line ? " L" : "M") + (i * bw + bw / 2).toFixed(1) + " " + y.toFixed(1);
      }
      if (i % 2 === 0) bars += '<text x="' + (i * bw + bw / 2) + '" y="' + (H - 2) + '" font-size="8" text-anchor="middle" fill="#aaa">' + d.day.slice(5) + "</text>";
    });
    const svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="stats-chart" role="img" aria-label="近14天答题量与正确率">' + bars +
      (line ? '<path d="' + line + '" fill="none" stroke="#ffd84d" stroke-width="2"/>' : "") + "</svg>";
    let tr = "";
    for (const t of TRACKS) {
      const s = st.tracks[t.id];
      tr += "<li>" + escapeHtml(t.name) + "：已学会 " + s.learned + "/" + s.total + " · 通关 " + s.cleared.length + "/" + s.sets + " 组</li>";
    }
    box.innerHTML =
      '<div class="stats-grid">' +
      "<div><b>" + st.streak + "</b>连续打卡(天)</div>" +
      "<div><b>" + st.learned + "</b>已学会词数</div>" +
      "<div><b>" + pct(st.acc7) + "</b>近7天正确率</div>" +
      "<div><b>" + pct(st.ret7) + "</b>近7天复习保持率</div>" +
      "</div>" + svg +
      '<p class="stats-legend">柱：每日答题量 · 黄线：每日正确率 · 累计答题 ' + st.answers + " 次 · 学习 " + st.activeDays + " 天</p>" +
      '<ul class="stats-tracks">' + tr + "</ul>";
  }

  // ---- report code for teacher (compact, no full card dump) ----
  function buildReport() {
    persist();
    const st = computeStats();
    const tr = {};
    for (const id of Object.keys(st.tracks)) { const s = st.tracks[id]; tr[id] = [s.learned, s.total, s.cleared]; }
    return {
      v: 1,
      n: (save.profile.name || "").slice(0, 40),
      k: (save.profile.cls || "").slice(0, 40).toUpperCase(),
      at: new Date().toISOString(),
      s: st.streak, ad: st.activeDays, a: st.answers, acc: st.acc, a7: st.acc7, r7: st.ret7,
      tr,
      d: lastDays(30).filter((d) => d.c + d.w).map((d) => [d.day, d.c, d.w, d.rc, d.rw, d.n]),
      wk: weakWords(12),
    };
  }

  function reportCode() {
    return "QMR1." + btoa(unescape(encodeURIComponent(JSON.stringify(buildReport()))));
  }

  // ---- pronunciation (browser speechSynthesis, en-GB preferred) ----
  function pickGbVoice() {
    if (!("speechSynthesis" in window)) return null;
    const vs = readVoices();
    return vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }

  function sayEn(text) {
    if (!text || !("speechSynthesis" in window)) return false;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-GB";
      const v = pickGbVoice();
      if (v) u.voice = v;
      u.rate = 0.9;
      speakUtterance(u);
      return true;
    } catch (_) { return false; }
  }

  function speakButtons(card) {
    return '<div class="speak-row">' +
      '<button type="button" class="speak-btn" data-say="' + escapeHtml(card.word) + '">🔈 读单词</button>' +
      (card.example_en ? '<button type="button" class="speak-btn" data-say="' + escapeHtml(card.example_en) + '">🔈 读例句</button>' +
        '<div class="fb-ex">例：' + escapeHtml(card.example_en) +
        (card.example_zh ? " " + escapeHtml(card.example_zh) : "") + "</div>" : "") +
      "</div>";
  }

  function initV6Ui() {
    const sel = $("track-select");
    if (sel) {
      sel.innerHTML = TRACKS.map((t) => '<option value="' + t.id + '">' + escapeHtml(t.name) + "</option>").join("");
      sel.value = currentTrack;
      sel.addEventListener("change", () => switchTrack(sel.value));
      applyTrack(currentTrack, false);
    }
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".speak-btn");
      if (b) { e.preventDefault(); sayEn(b.getAttribute("data-say")); }
    });
    if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = () => {};
    const nm = $("profile-name"), cl = $("profile-cls");
    if (nm) nm.value = save.profile.name || "";
    if (cl) cl.value = save.profile.cls || "";
    const saveProfile = () => {
      save.profile = { name: (nm ? nm.value : "").trim(), cls: (cl ? cl.value : "").trim().toUpperCase() };
      persist();
    };
    if (nm) nm.addEventListener("change", saveProfile);
    if (cl) cl.addEventListener("change", saveProfile);
    const rb = $("btn-report");
    if (rb) rb.addEventListener("click", () => {
      saveProfile();
      const st = $("report-status");
      if (!save.profile.name || !save.profile.cls) { if (st) st.textContent = "请先填写姓名和班级码。"; return; }
      const code = reportCode();
      $("report-code").value = code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => st && (st.textContent = "学习报告码已复制，发给老师即可（微信/QQ）。"), () => st && (st.textContent = "已生成，请手动全选复制。"));
      } else if (st) st.textContent = "已生成，请手动全选复制。";
    });
    renderStats();
  }

  // test hook (harmless in production)
  window.__QM = {
    switchTrack, computeStats, buildReport, reportCode,
    get track() { return currentTrack; },
    get levels() { return LEVELS; },
    getSave() { return save; },
    applyCloudSave(data) {
      let payload = data;
      if (payload && payload.save && !payload.cards) payload = payload.save;
      if (!payload || typeof payload !== "object") throw new Error("Invalid cloud save");
      applySaveObject(snapshotToSave(payload), { keepUpdatedAt: true, upload: false });
    },
    touchUpdatedAt() {
      save.updatedAt = new Date().toISOString();
      persist({ keepUpdatedAt: true, upload: false });
      return save.updatedAt;
    },
  };

  // --- Wire UI ---

  if ($("btn-export")) $("btn-export").addEventListener("click", exportProgressFile);
  if ($("btn-import")) $("btn-import").addEventListener("click", () => $("import-file").click());
  if ($("import-file")) $("import-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importProgressFile(f);
    e.target.value = "";
  });
  if ($("btn-copy-code")) $("btn-copy-code").addEventListener("click", copyBackupCode);
  if ($("btn-paste-code")) $("btn-paste-code").addEventListener("click", importFromBackupCode);

  function enterExam(id) {
    try {
      switchTrack(id);
    } finally {
      showScreen("home");
    }
  }
  if ($("btn-gate-zhongkao")) $("btn-gate-zhongkao").addEventListener("click", () => enterExam("zhongkao"));
  if ($("btn-gate-gaokao")) $("btn-gate-gaokao").addEventListener("click", () => enterExam("gaokao"));
  if ($("btn-back-gate")) $("btn-back-gate").addEventListener("click", () => showScreen("gate"));

  $("btn-continue").addEventListener("click", () => {
    const lvl = Math.min(save.unlockedLevel, LEVEL_COUNT);
    startLevel(lvl);
  });
  $("btn-levels").addEventListener("click", () => {
    renderLevels();
    showScreen("levels");
  });
  $("btn-back-home").addEventListener("click", () => showScreen("home"));
  $("btn-reset").addEventListener("click", () => {
    const cloudNote = (window.QuizMarioCloud && window.QuizMarioCloud.loggedIn && window.QuizMarioCloud.loggedIn())
      ? "\n\n你已登录：这只清空本机。云端进度还在，刷新页面会再同步下来。"
      : "";
    if (confirm("Reset all Vocab Spotlight progress on this browser?" + cloudNote)) {
      localStorage.removeItem(STORAGE_KEY);
      save = loadSave();
      sortMode = "default";
      voiceOn = true;
      dueOnly = false;
      currentLevel = 1;
      applyTrack("core", true);
      killStreak = 0;
      pendingRate = false;
      refreshHud();
      updateSortButtons();
      syncDueOnlyBtn();
      alert("Progress cleared.");
    }
  });
  $("btn-quit").addEventListener("click", () => {
    showScreen("home");
    renderStats();
    refreshHud();
  });
  $("btn-clear-home").addEventListener("click", () => {
    showScreen("home");
    renderStats();
    refreshHud();
  });
  $("btn-next-level").addEventListener("click", () => {
    const cleared = isLevelClear(currentLevel);
    let next = cleared ? Math.min(LEVEL_COUNT, currentLevel + 1) : currentLevel;
    if (cleared && next > save.unlockedLevel) {
      save.unlockedLevel = next;
      if (!save.trackUnlock || typeof save.trackUnlock !== "object") save.trackUnlock = {};
      save.trackUnlock[currentTrack] = save.unlockedLevel;
      persist();
    }
    // A false clear (巩固 0/need) used to refuse Next or skip into another
    // empty clear screen. Resume this set, or open the next one when it really passed.
    startLevel(next);
  });

  // Sort mode buttons
  const bindSort = (id, mode) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("click", () => setSortMode(mode));
  };
  bindSort("btn-sort-default", "default");
  bindSort("btn-sort-root", "root_affix");
  bindSort("btn-sort-scene", "scene");

  function syncDueOnlyBtn() {
    const btn = $("btn-due-only");
    if (!btn) return;
    btn.textContent = dueOnly ? "📌 只练到期 On" : "📌 只练到期 Off";
    btn.classList.toggle("sort-active", dueOnly);
  }

  const dueOnlyBtn = $("btn-due-only");
  if (dueOnlyBtn) {
    syncDueOnlyBtn();
    dueOnlyBtn.addEventListener("click", () => {
      dueOnly = !dueOnly;
      persist();
      syncDueOnlyBtn();
      if ($("screen-play").classList.contains("active") && currentLevel) {
        queue = buildQueue(currentLevel);
        requeueSoon.length = 0;
        firstCardOfSession = true;
        nextCard();
      }
    });
  }

  // Voice toggle
  const voiceBtn = $("btn-voice-toggle");
  if (voiceBtn) {
    const syncVoiceBtn = () => {
      voiceBtn.textContent = voiceOn ? "🔊 连杀语音 On" : "🔇 连杀语音 Off";
      voiceBtn.classList.toggle("sort-active", voiceOn);
    };
    syncVoiceBtn();
    voiceBtn.addEventListener("click", () => {
      voiceOn = !voiceOn;
      persist();
      syncVoiceBtn();
      if (voiceOn) speakLine("First blood");
    });
  }

  // Number keys: Good/Easy while rating; else MC 1–4
  document.addEventListener("keydown", (e) => {
    const play = $("screen-play");
    if (!play || !play.classList.contains("active")) return;
    if (pendingRate) {
      if (e.key === "1" || e.key.toLowerCase() === "g") {
        e.preventDefault();
        const b = $("btn-rate-good");
        if (b) b.click();
      } else if (e.key === "2" || e.key.toLowerCase() === "e") {
        e.preventDefault();
        const b = $("btn-rate-easy");
        if (b) b.click();
      }
      return;
    }
    if (!awaiting) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 4) {
        const box = $("choices");
        const btn = box && box.querySelectorAll(".choice")[n - 1];
        if (btn) btn.click();
      }
    }
  });

  // Boot
  if (!LEVELS.length) {
    $("screen-home").innerHTML = "<p style='padding:24px;text-align:center'>No vocabulary loaded. Check words.js.</p>";
  }
  applyTrack(save.track, true);
  updateSortButtons();
  syncDueOnlyBtn();
  refreshHud();
  initV6Ui();
  showScreen("gate");
})();
