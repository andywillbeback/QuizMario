/* Vocab Spotlight — quiz-show English vocabulary trainer
 * Spaced repetition (Anki-lite / SM-2) + active recall. Offline HTML5.
 * v8: Good/Easy · 100×30 as Part A/B (15) · gloss+example fix · speech freeze guard · 本组进度
 * Clearance (通关): ≥80% of the set in review with interval ≥1 day (srs-rules.js).
 * 已学会 is a later-day clean recall, not the same thing as 通关 or 保持率.
 * 继续闯关 is regular study with no clock. 12分钟挑战 is the only timed mode (CHALLENGE_MS).
 * 通关 is 看英文选中文. 拼写 is tracked separately and does not block the first 通关.
 * 今日必练: due cards first, then 错词本 fill-in (review-queues.js). ZH→EN, still schedule().
 * 错词本 storage stays separate: misses and cumulative wrong >= 2; two correct
 * ratings of a book card inside 今日必练 graduate it. 继续闯关 is EN→ZH study.
 * Optional cloud sync stamps save.updatedAt. Offline play ignores QuizMarioCloud.
 * learner-events.js emits quizmario signals only. schedule() remains the only SRS clock.
 * Home loop strip (home-loop.js): signed-in home shows 薄弱点 → 今日必练.
 * ALS 补了 / 回流词 stays unimplemented until source=als rows are readable.
 * 今日必练 clear pushes 继续闯关第 N 组, then 去 ALS 修语法.
 * Wrong MC picks are tagged 形近 / 义近 / 词性 / 其他 (error-types.js)
 * and summed on the student home and the 今日必练 clear screen.
 * Progress story (progress-narrative.js): signed-in home adds 1–3 plain
 * lines from the must queue, frontier, placement, and the top miss.
 * Practice reminder (practice-reminder.js): after 稍后, the next home
 * entry can show one compact tip, once per day on this device. It stays
 * hidden while the soft gate is up. No push and no SMS.
 * A card with a sense id, or more than one sense in the track, shows a short
 * Chinese cue (sense-cue.js). The cue is not the gloss and not the headword.
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
  const SRS = window.QuizMarioSRS;
  if (!SRS) throw new Error("srs-rules.js must load before game.js");
  const RQ = window.QuizMarioQueues;
  if (!RQ) throw new Error("review-queues.js must load before game.js");
  const HL = window.QuizMarioHomeLoop;
  if (!HL) throw new Error("home-loop.js must load before game.js");
  const Practice = window.QuizMarioPractice;
  if (!Practice) throw new Error("practice.js must load before game.js");
  const FB = window.QuizMarioFeedback;
  if (!FB) throw new Error("feedback.js must load before game.js");
  const Sense = window.QuizMarioSense;
  if (!Sense) throw new Error("sense-id.js must load before game.js");
  const SenseCue = window.QuizMarioSenseCue;
  if (!SenseCue) throw new Error("sense-cue.js must load before game.js");
  const Placement = window.QuizMarioPlacement;
  if (!Placement) throw new Error("placement.js must load before game.js");
  const ET = window.QuizMarioErrorTypes;
  if (!ET) throw new Error("error-types.js must load before game.js");
  const PN = window.QuizMarioProgressNarrative;
  if (!PN) throw new Error("progress-narrative.js must load before game.js");
  const PR = window.QuizMarioPracticeReminder;
  if (!PR) throw new Error("practice-reminder.js must load before game.js");
  const SenseExamples = window.QuizMarioSenseExamples;
  const MIN_MS = SRS.MIN_MS;
  const DAY_MS = SRS.DAY_MS;
  /** Fallback when practice.js is bypassed. Live sessions use Practice.newWordBudget. */
  const NEW_PER_SESSION = Practice.STUDY_NEW;

  /** @typedef {{ef:number, interval:number, reps:number, lapses:number, due:number, correct:number, wrong:number, mastery:number, state:string}} CardProg */
  /** @typedef {{points:number, streak:number, bestStreak:number, unlockedLevel:number, cards:Object.<string, CardProg>, levelStars:Object.<string, number>, sortMode?:string, voiceOn?:boolean, updatedAt?:string}} SaveData */

  /** @type {SaveData} */
  let save = loadSave();

  let currentLevel = 1;
  let queue = [];
  let currentCard = null;
  let awaiting = false;
  let sessionSeen = 0;
  let sessionTarget = 0;
  let firstCardOfSession = true;
  /** Bumps when a session is left, so a late card animation cannot paint over fail/home. */
  let playGen = 0;
  /** True when this visit opened a set that had already cleared. Review, not a challenge. */
  let sessionStartedClear = false;
  /** "level" keeps the set flow. "placement" is the 10-item EN→ZH probe. "must" is 今日必练. "due" / "wrongbook" remain for older sessions. "spelling" does not count. */
  let sessionKind = "level";
  /** True only for the set opened straight after placement. */
  let sessionStarter = false;
  let placementTally = { correct: 0, total: 0, planned: Placement.ITEM_COUNT };
  /** "study" has no clock. "challenge" is the 12-minute set. */
  let sessionMode = "study";
  /** "meaning" is EN→ZH and counts toward 通关. "form" is the ZH→EN review used by 今日必练. "spelling" does not. */
  let sessionDirection = "meaning";
  /** True only when the student home is being opened, not on the 稍后 refresh. */
  let practiceReminderArmed = false;
  /** Keeps today's tip on screen after the local flag is stored, until home is left. */
  let practiceReminderHeld = false;
  /** Headwords missed in this visit, for the concrete feedback line. */
  let sessionWrongs = [];
  let levelClearing = false;
  let challengeActive = false;
  let challengeFailed = false;
  let challengeDeadline = 0;
  let challengeTimer = null;
  /** Optional [0, 1) roll so a test can force one achievement line. */
  let forcedChallengeRoll = null;
  /** Student UI has no scene or root-affix sort. Saved values collapse to default. */
  function publicSortMode(_mode) {
    return "default";
  }
  /** @type {"default"} */
  let sortMode = publicSortMode(save.sortMode);
  let voiceOn = save.voiceOn !== false; // default on
  let killStreak = 0; // consecutive corrects this session (resets on wrong)
  /** When true, waiting for Good/Easy after a correct answer */
  let pendingRate = false;
  /** Options from the correct tap, applied when Good / Easy schedules the card. */
  let pendingAttempt = null;

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
    // Ordinary words keep the lowercased key so old backups stay valid.
    // may/May and the other case splits use a sense token instead.
    return Sense.cardKeyFor(currentTrack, levelIdx, word);
  }

  let senseIndex = null;
  let senseIndexLevels = null;

  function currentSenseCount(word) {
    if (senseIndexLevels !== LEVELS) {
      const flat = [];
      for (let i = 0; i < LEVELS.length; i++) {
        const set = LEVELS[i] || [];
        for (let j = 0; j < set.length; j++) flat.push(set[j]);
      }
      senseIndex = SenseCue.indexCards(flat);
      senseIndexLevels = LEVELS;
    }
    return SenseCue.countIn(senseIndex, word);
  }

  /** Pre-answer sense line. Empty for a single plain sense, so the card stays quiet. */
  function paintSenseCue(card) {
    const el = $("prompt-sense");
    if (!el) return;
    const text = card
      ? (SenseCue.senseCue(card, {
          direction: sessionDirection,
          senseCount: currentSenseCount(card.word),
          production: true,
        }) || "")
      : "";
    el.textContent = text;
    el.hidden = !text;
  }

  function catalogGroups() {
    const groups = [];
    const push = (track, sets) => {
      (sets || []).forEach((words, li) => {
        for (const w of words || []) {
          if (w && w.word) groups.push({ track: track, levelIdx: li, word: w.word });
        }
      });
    };
    push("core", window.VOCAB_LEVELS || []);
    const exams = window.VOCAB_EXAM_TRACKS || [];
    for (const t of exams) push(t.id, t.sets);
    for (const t of window.VOCAB_TRACKS || []) {
      if (!t || t.id === "core") continue;
      if (exams.some((e) => e.id === t.id)) continue;
      push(t.id, t.sets);
    }
    return groups;
  }

  /** Add v6 fields (tracks, learning log, profile) to a save object. */
  function extendSave(sv, data) {
    data = data || {};
    sv.track = data.track || "core";
    sv.trackUnlock = data.trackUnlock || {};
    sv.trackStars = data.trackStars || {};
    sv.daily = data.daily || {};
    sv.profile = data.profile || { name: "", cls: "" };
    sv.wrongBook = Sense.migrateWrongBook(
      (data.wrongBook && typeof data.wrongBook === "object" && !Array.isArray(data.wrongBook))
        ? data.wrongBook
        : {}
    );
    sv.mustPractice = normalizeMustPractice(data.mustPractice);
    sv.placement = Placement.normalizePlacement(data.placement);
    sv.missReasons = ET.normalizeLog(data.missReasons);
    const practice = data.practice && typeof data.practice === "object" ? data.practice : {};
    sv.practice = {
      meaning: Object.assign({ n: 0, good: 0 }, practice.meaning || {}),
      spelling: Object.assign({ n: 0, good: 0 }, practice.spelling || {}),
      hint: Object.assign({ n: 0, good: 0 }, practice.hint || {}),
    };
    if (data.updatedAt) sv.updatedAt = data.updatedAt;
    return sv;
  }

  function defaultCardProg() {
    return SRS.defaultCardProg();
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
    if (SRS.noteLegacyMastery) SRS.noteLegacyMastery(p);
    return p;
  }

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const cards = Sense.migrateCards(data.cards || {}, catalogGroups());
        for (const k of Object.keys(cards)) cards[k] = migrateCard(cards[k]);
        return extendSave({
          points: data.points || 0,
          streak: data.streak || 0,
          bestStreak: data.bestStreak || 0,
          unlockedLevel: Math.max(1, data.unlockedLevel || 1),
          cards,
          levelStars: data.levelStars || {},
          sortMode: publicSortMode(data.sortMode),
          voiceOn: data.voiceOn !== false,
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
    }, {});
  }

  function persist(opts) {
    opts = opts || {};
    save.sortMode = sortMode;
    save.voiceOn = voiceOn;
    delete save.dueOnly;
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
    return SRS.isNewCard(p);
  }

  function isLearning(p) {
    return SRS.isLearning(p);
  }

  function isDue(p, now) {
    return SRS.isDue(p, now);
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
        if (SRS.isMasteredCard(p)) mastered++;
        if (isNewCard(p)) neu++;
        else if (isLearning(p)) {
          learning++;
          if (isDue(p, now)) due++;
        } else if (isDue(p, now)) due++;
      }
    }
    return { due, learning, neu, mastered };
  }

  /** Per-set clearance stats. Pass is solid >= 80%; see srs-rules.js. */
  function levelClearStats(levelNum) {
    const words = LEVELS[levelNum - 1] || [];
    const now = Date.now();
    const progs = [];
    for (const w of words) progs.push(getProg(cardKey(levelNum - 1, w.word)));
    return SRS.summarizeSet(progs, now);
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
    if (name === "home") {
      practiceReminderArmed = true;
      refreshHomeQueues();
    } else {
      practiceReminderArmed = false;
      practiceReminderHeld = false;
      dismissMustGate();
      const tip = $("must-reminder");
      if (tip) tip.hidden = true;
    }
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
      if (SRS.isMasteredCard(getProg(cardKey(levelNum - 1, w.word)))) n++;
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
        '<div class="meta">已学会 ' + mastered + "/" + words.length + " · " + clearLabel + " · " +
        (function(){ const c=countSrs(i); return "Due "+c.due; })() +
        "</div>" +
        '<div class="stars">' + "★".repeat(stars) + "☆".repeat(3 - stars) + "</div>";
      if (!locked) {
        card.insertAdjacentHTML("beforeend", '<button type="button" class="ghost set-challenge">12分钟挑战</button>');
        card.addEventListener("click", () => startLevel(i));
        const challengeBtn = card.querySelector(".set-challenge");
        if (challengeBtn) {
          challengeBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            startLevel(i, { mode: "challenge" });
          });
        }
      }
      grid.appendChild(card);
    }
  }

  /** Anki-lite / SM-2. quality: 0 Again, 1 Good, 2 Easy. opts carries 不会 / hintSeen. */
  function schedule(prog, quality, nowMs, opts) {
    return SRS.schedule(prog, quality, nowMs, opts);
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
      due: p.due, correct: p.correct, wrong: p.wrong, unknown: p.unknown, mastery: p.mastery,
      mastered: p.mastered, scheduledAt: p.scheduledAt, lastOutcome: p.lastOutcome, state: p.state,
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
      sense_id: w.sense_id || "",
      roots: w.roots || "",
      affix: w.affix || "",
      root_group: w.root_group || "",
      scene: w.scene || "",
      explain_zh: w.explain_zh || "",
      sort: (p.due || 0),
      mastery: p.mastery || 0,
      srsState: p.state || "new",
      dueAt: p.due || 0,
      levelIdx: levelIdx,
    };
  }

  function countSeenCards() {
    let n = 0;
    const cards = save.cards || {};
    for (const k of Object.keys(cards)) {
      const p = cards[k];
      if (!p) continue;
      const spell = p.spelling || {};
      if ((p.correct || 0) + (p.wrong || 0) + (p.unknown || 0) + (spell.correct || 0) + (spell.wrong || 0) + (spell.unknown || 0) > 0) n++;
    }
    return n;
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

    for (let i = neu.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [neu[i], neu[j]] = [neu[j], neu[i]];
    }

    const q = [...due, ...learning.filter((it) => !due.some((d) => d.key === it.key))];
    const budget = Practice.newWordBudget({
      beginner: Practice.isBeginner(countSeenCards()),
      dueCount: due.length,
      mode: sessionMode,
      newAvailable: neu.length,
    });
    q.push(...neu.slice(0, budget));
    // Nothing due, learning, or new: a short early review so a finished set can still be opened.
    if (!q.length) {
      later.sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
      q.push(...later.slice(0, 3));
    }
    return q;
  }

  let stepCounter = 0;
  const requeueSoon = [];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function startLevel(levelNum, opts) {
    opts = opts || {};
    playGen += 1;
    levelClearing = false;
    sessionKind = "level";
    sessionStarter = !!opts.starter;
    sessionMode = opts.mode === "challenge" ? "challenge" : "study";
    sessionDirection = "meaning";
    sessionWrongs = [];
    currentLevel = levelNum;
    const progressLabel = $("set-progress-label");
    if (progressLabel) progressLabel.textContent = sessionStarter ? "起始组" : "本组进度";
    const nextBtn = $("btn-next-level");
    if (nextBtn) nextBtn.hidden = false;
    sessionStartedClear = isLevelClear(levelNum);
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
    if (playLevel) {
      const title = setTitle(levelNum);
      playLevel.textContent = sessionStarter
        ? ("起始组 · " + title)
        : (sessionMode === "challenge" ? (title + " · 挑战") : title);
    }
    if (sessionStarter) showPlacementNote(Placement.starterNote(setTitle(levelNum)));
    else hidePlacementNote();
    refreshHud();
    if (Practice.usesChallengeClock(sessionMode)) beginChallenge();
    else stopChallenge();
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
    if (ready.length) {
      const incoming = ready.filter((card) => !queue.some((c) => c.key === card.key));
      if (incoming.length) queue.unshift(...incoming);
    }
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
  function playSting(kind, opts) {
    opts = opts || {};
    if (!voiceOn && !opts.force) return;
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
      } else if (kind === "cheer") {
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          o.type = "triangle";
          o.frequency.setValueAtTime(freq, t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02 + i * 0.07);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34 + i * 0.06);
          o.connect(g);
          g.connect(master);
          o.start(t0 + i * 0.07);
          o.stop(t0 + 0.58);
        });
      } else if (kind === "regret") {
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7);
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(392, t0);
        o.frequency.exponentialRampToValueAtTime(98, t0 + 0.62);
        g.gain.setValueAtTime(0.45, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.68);
        o.connect(g);
        g.connect(master);
        o.start(t0);
        o.stop(t0 + 0.72);
      } else if (kind === "applause") {
        const dur = 1.5;
        const len = Math.floor(audioCtx.sampleRate * dur);
        const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let c = 0; c < 46; c++) {
          const start = Math.floor((0.02 + Math.random() * 1.3) * audioCtx.sampleRate);
          const amp = 0.3 + Math.random() * 0.7;
          const clapLen = Math.floor(audioCtx.sampleRate * 0.02);
          for (let i = 0; i < clapLen && start + i < len; i++) {
            data[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (audioCtx.sampleRate * 0.004));
          }
        }
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.value = 900;
        master.gain.setValueAtTime(0.85, t0);
        src.connect(filter);
        filter.connect(master);
        src.start(t0);
        src.stop(t0 + dur);
      } else if (kind === "crow") {
        master.gain.setValueAtTime(0.9, t0);
        for (let k = 0; k < 3; k++) {
          const t = t0 + k * 0.42;
          const o = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          const filter = audioCtx.createBiquadFilter();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(720, t);
          o.frequency.exponentialRampToValueAtTime(380, t + 0.24);
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(1400, t);
          filter.Q.value = 3.2;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.34, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
          o.connect(filter);
          filter.connect(g);
          g.connect(master);
          o.start(t);
          o.stop(t + 0.32);
        }
      }
    } catch (_) {}
  }

  /**
   * Challenge audio. Optional spoken overrides, if the files exist:
   *   audio/13_challenge_cheer.m4a
   *   audio/14_challenge_regret.m4a
   * Otherwise the default is applause or crow caws
   * (audio/15_applause.wav, audio/16_crows.wav), then a procedural sting.
   * The default path does not speak a human line.
   */
  function playSrc(src, onFail) {
    if (!src) {
      onFail();
      return;
    }
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      onFail();
    };
    try {
      const audio = new Audio(src);
      audio.preload = "auto";
      audio.addEventListener("error", fail, { once: true });
      const started = audio.play();
      if (started && typeof started.then === "function") {
        started.then(() => { settled = true; }).catch(fail);
      }
    } catch (_) {
      fail();
    }
  }

  function rollChallenge() {
    if (forcedChallengeRoll == null) return Math.random();
    const roll = forcedChallengeRoll;
    forcedChallengeRoll = null;
    return roll;
  }

  function playChallengeCue(kind) {
    const voice = SRS.CHALLENGE_VO[kind];
    const sfx = SRS.CHALLENGE_SFX[kind];
    const sting = kind === "success" ? "applause" : "crow";
    playSrc(voice, () => playSrc(sfx, () => playSting(sting, { force: true })));
  }

  function showCrowPass() {
    const el = $("crow-pass");
    if (!el) return;
    el.hidden = false;
    el.classList.remove("fly");
    void el.offsetWidth;
    el.classList.add("fly");
  }

  function hideKillBanner() {
    const b = $("kill-banner");
    if (!b) return;
    b.classList.remove("show", "shutdown", "cheer");
    b.textContent = "";
  }

  function showKillBanner(text, kind) {
    const b = $("kill-banner");
    if (!b || !text) return;
    b.textContent = text;
    b.classList.remove("show", "shutdown", "cheer");
    if (kind === "shutdown" || kind === "regret") b.classList.add("shutdown");
    if (kind === "cheer") b.classList.add("cheer");
    void b.offsetWidth;
    b.classList.add("show");
    setTimeout(() => {
      b.classList.remove("show", "shutdown", "cheer");
    }, (kind === "shutdown" || kind === "regret") ? 2200 : 1600);
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

  function hidePlacementNote() {
    const note = $("placement-note");
    if (!note) return;
    note.hidden = true;
    note.textContent = "";
  }

  function showPlacementNote(text) {
    const note = $("placement-note");
    if (!note) return;
    note.hidden = false;
    note.textContent = text || "";
  }

  function fillPlacementCard() {
    const planned = placementTally.planned || Placement.ITEM_COUNT;
    const index = Math.max(1, planned - queue.length);
    const promptLabel = $("prompt-label");
    if (promptLabel) promptLabel.textContent = "英文 → 中文意思";
    const promptMain = $("prompt-main");
    if (promptMain) promptMain.textContent = currentCard.word || "";
    const playLevel = $("play-level");
    if (playLevel) playLevel.textContent = Placement.itemLabel(index, planned);
    let hint = "";
    if (currentCard.example_en && !isPlaceholderExample(currentCard.example_en)) {
      hint = softenHint(currentCard.example_en, currentCard.word);
    }
    const hintEl = $("prompt-hint");
    if (hintEl) {
      const bits = ["摸底 · 不计通关"];
      if (currentCard.pos) bits.push(currentCard.pos);
      if (hint) bits.push("hint: " + hint);
      hintEl.textContent = bits.join(" · ");
    }
    paintSenseCue(currentCard);
    const queueEl = $("play-queue");
    if (queueEl) queueEl.textContent = String(queue.length + 1);
    showPlacementNote(Placement.itemNote(planned));
    updateProgress();
    renderChoices();
  }

  function fillCardContent() {
    if (sessionKind === "placement") {
      fillPlacementCard();
      return;
    }
    const meaningMode = sessionDirection === "meaning";
    const promptLabel = $("prompt-label");
    if (promptLabel) {
      promptLabel.textContent = meaningMode
        ? "英文 → 中文意思"
        : (sessionDirection === "spelling" ? "拼写 · 中文 → 英文" : "中文意思 → 英文单词");
    }
    const promptMain = $("prompt-main");
    if (promptMain) promptMain.textContent = meaningMode ? (currentCard.word || "") : (currentCard.meaning_zh || "");
    const prog = getProg(currentCard.key);
    const filled = Math.floor(prog.mastery || 0);
    const starsHtml =
      '<span class="mastery-star-anim">' +
      "★".repeat(filled) +
      "☆".repeat(3 - filled) +
      "</span>";
    const metaBits = [];
    const now = Date.now();
    let srsTag;
    if (SRS.isMasteredCard(prog)) srsTag = isDue(prog, now) ? "已学会 · 到期" : "已学会";
    else if (isNewCard(prog)) srsTag = "新词 New";
    else if (isDue(prog, now)) srsTag = "到期 Due";
    else if (SRS.isSolidCard(prog)) srsTag = "已巩固 · " + formatDue(prog);
    else if (isLearning(prog)) srsTag = "学习中 Learning";
    else srsTag = formatDue(prog);
    metaBits.unshift(srsTag);
    if (currentCard.pos) metaBits.push(currentCard.pos);
    if (sessionDirection === "spelling") metaBits.push("拼写不计入通关");
    let hint = "";
    if (meaningMode) {
      if (currentCard.example_en && !isPlaceholderExample(currentCard.example_en)) {
        hint = softenHint(currentCard.example_en, currentCard.word);
      }
    } else {
      hint = hintForCard(currentCard);
    }
    const exampleZh = !meaningMode && currentCard.example_zh ? "  ·  例：" + escapeHtml(currentCard.example_zh) : "";
    const hintEl = $("prompt-hint");
    if (hintEl) {
      hintEl.innerHTML =
        starsHtml +
        (metaBits.length ? "  ·  " + escapeHtml(metaBits.join(" · ")) : "") +
        (hint ? "  ·  hint: " + escapeHtml(hint) : "") +
        exampleZh;
    }
    paintSenseCue(currentCard);
    if (sessionKind !== "must") {
      const queueEl = $("play-queue");
      if (queueEl) queueEl.textContent = String(queue.length + requeueSoon.length);
    }
    updateProgress();
    renderChoices();
  }

  function stopChallenge() {
    challengeActive = false;
    if (challengeTimer) {
      clearInterval(challengeTimer);
      challengeTimer = null;
    }
    renderChallengeTimer();
  }

  function renderChallengeTimer() {
    const wrap = $("challenge-clock");
    const el = $("challenge-timer");
    if (!wrap || !el) return;
    if (!challengeActive || challengeFailed) {
      wrap.hidden = true;
      el.textContent = "";
      el.classList.remove("warn");
      return;
    }
    const left = challengeDeadline - Date.now();
    wrap.hidden = false;
    el.textContent = SRS.formatChallengeClock(left);
    el.classList.toggle("warn", left > 0 && left <= MIN_MS);
    wrap.setAttribute("aria-label", "挑战剩余 " + el.textContent);
  }

  function beginChallenge() {
    challengeFailed = false;
    stopChallenge();
    if (sessionStartedClear) {
      renderChallengeTimer();
      return;
    }
    challengeActive = true;
    challengeDeadline = Date.now() + SRS.CHALLENGE_MS;
    renderChallengeTimer();
    challengeTimer = setInterval(tickChallenge, 250);
  }

  function tickChallenge() {
    if (!challengeActive || challengeFailed) return;
    renderChallengeTimer();
    const outcome = SRS.evaluateChallenge({
      active: true,
      startedClear: sessionStartedClear,
      deadline: challengeDeadline,
      cleared: isLevelClear(currentLevel),
    }, Date.now());
    if (outcome === "success") onLevelClear();
    else if (outcome === "fail") failChallenge();
  }

  function failChallenge() {
    if (challengeFailed || !challengeActive) return;
    if (isLevelClear(currentLevel)) {
      onLevelClear();
      return;
    }
    challengeFailed = true;
    playGen += 1;
    stopChallenge();
    queue = [];
    requeueSoon.length = 0;
    pendingRate = false;
    awaiting = true;
    const mins = Math.round(SRS.CHALLENGE_MS / MIN_MS);
    const msg = $("fail-msg");
    if (msg) msg.textContent = mins + " 分钟到了。这组还没通关。错词会再出现，再试一次即可。";
    const banner = $("fail-banner");
    if (banner) {
      banner.hidden = false;
      banner.textContent = SRS.pickChallengeLine("fail", rollChallenge());
    }
    showScreen("fail");
    showCrowPass();
    playChallengeCue("fail");
  }

  function nextCard() {
    if (challengeFailed) return;
    const play = $("screen-play");
    if (!play || !play.classList.contains("active")) return;
    const gen = playGen;
    injectRequeues();
    // Keep the previous prompt on screen during the exit animation. Do not
    // grade or swap currentCard until the new card is painted, or a fast tap
    // answers the next word against the previous Chinese prompt.
    awaiting = true;
    pendingAttempt = null;
    setUnknownVisible(false);
    const fb = $("feedback");
    if (fb) {
      fb.innerHTML = "";
      fb.className = "";
    }

    if (challengeActive) {
      const outcome = SRS.evaluateChallenge({
        active: true,
        startedClear: sessionStartedClear,
        deadline: challengeDeadline,
        cleared: isLevelClear(currentLevel),
      }, Date.now());
      if (outcome === "fail") {
        failChallenge();
        return;
      }
    }

    if (sessionKind !== "level") {
      if (queue.length === 0 && requeueSoon.length) {
        for (let i = requeueSoon.length - 1; i >= 0; i--) {
          const again = requeueSoon[i].card;
          requeueSoon.splice(i, 1);
          if (again && !queue.some((c) => c.key === again.key)) queue.unshift(again);
        }
      }
      if (queue.length === 0 && requeueSoon.length === 0) {
        finishQueueSession();
        return;
      }
    } else {
      const endSet = SRS.shouldEndSet({
        ready: isLevelClear(currentLevel),
        startedClear: sessionStartedClear,
        queueEmpty: queue.length === 0,
        requeueEmpty: requeueSoon.length === 0,
      });
      if (endSet) {
        queue = [];
        requeueSoon.length = 0;
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
            const fallbackBudget = Math.max(1, Practice.newWordBudget({
              beginner: Practice.isBeginner(countSeenCards()),
              dueCount: 0,
              mode: sessionMode,
              newAvailable: pool.length,
            }));
            const fresh = pool.filter((it) => isNewCard(getProg(it.key))).slice(0, fallbackBudget);
            queue = fresh.length ? fresh : pool.slice(0, fallbackBudget);
            if (!queue.length) {
              showScreen("home");
              return;
            }
          }
        }
      }
    }

    const card = queue.shift();
    if (card && card.levelIdx != null) currentLevel = card.levelIdx + 1;
    stepCounter += 1;
    sessionSeen += 1;

    const box = $("prompt-box");
    const doEnter = () => {
      if (gen !== playGen || challengeFailed) return;
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
    const api = window.QuizMarioCloze;
    if (api && typeof api.blankExample === "function") return api.blankExample(example, word);
    return example == null ? "" : String(example);
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
   * 本组进度. A graduated card (review, interval >= 1 day) counts 1.
   * A card recalled once since its last miss counts 0.5, so the bar moves
   * before the second correct. The pass line is still stats.need (80% graduated).
   */
  function setCompletionPercent(stats) {
    const total = stats && stats.total ? stats.total : 0;
    if (!total) return 0;
    const credit = stats && stats.credit != null ? stats.credit : (stats.solid || 0);
    return Math.max(0, Math.min(100, Math.round((credit / total) * 100)));
  }

  function updateProgress() {
    if (sessionKind === "must") {
      paintMustRemaining(mustRemainingCount());
      return;
    }
    if (sessionKind === "due" || sessionKind === "wrongbook" || sessionKind === "spelling" || sessionKind === "placement") {
      const left = queue.length + requeueSoon.length + (currentCard ? 1 : 0);
      const total = Math.max(sessionTarget, left, 1);
      const done = Math.max(0, Math.min(total, total - left));
      const pct = Math.round((done / total) * 100);
      const modeLabel = queueModeLabel(sessionKind);
      const bar = $("play-progress");
      if (bar) bar.style.width = pct + "%";
      const pctEl = $("set-progress-pct");
      if (pctEl) pctEl.textContent = "剩 " + left;
      const barWrap = $("set-progress-bar");
      if (barWrap) {
        barWrap.setAttribute("aria-valuenow", String(pct));
        barWrap.setAttribute("aria-valuetext", modeLabel + " 剩余 " + left);
      }
      const label = $("set-progress-label");
      if (label) label.textContent = modeLabel;
      return;
    }
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
        : ("本组进度 " + pct + "% · 巩固 " + s.solid + "/" + s.need);
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

  function attemptOpts(card, extra) {
    return Object.assign({
      firstTry: !(card && card._repeat),
      hintSeen: !!(card && card._hintSeen),
      now: Date.now(),
    }, extra || {});
  }

  function setUnknownVisible(on) {
    const b = $("btn-unknown");
    if (!b) return;
    b.hidden = !on;
  }

  function bumpPractice(bucket, good) {
    if (!save.practice || typeof save.practice !== "object") {
      save.practice = { meaning: { n: 0, good: 0 }, spelling: { n: 0, good: 0 }, hint: { n: 0, good: 0 } };
    }
    const row = save.practice[bucket] || (save.practice[bucket] = { n: 0, good: 0 });
    row.n += 1;
    if (good) row.good += 1;
  }

  function rememberWrongWord(word) {
    if (!word || sessionWrongs.indexOf(word) !== -1) return;
    sessionWrongs.push(word);
  }

  function feedbackHtml(view) {
    return (view && view.lines || []).map((line) => '<div class="fb-meta">' + escapeHtml(line) + "</div>").join("");
  }

  function extraExampleHtml(card) {
    if (!SenseExamples || !card || typeof SenseExamples.extrasFor !== "function") return "";
    const rows = SenseExamples.extrasFor(card.word);
    if (!rows || !rows.length) return "";
    const row = rows[0];
    return '<div class="fb-ex">补充例句：' + escapeHtml(row.example_en || "") + " " + escapeHtml(row.example_zh || "") + "</div>";
  }

  function viewFor(outcome, chosen, dueLabel, signal) {
    return FB.describeAttempt({
      word: currentCard.word,
      meaning: currentCard.meaning_zh,
      direction: sessionDirection,
      outcome: outcome,
      picked: chosen || "",
      hintSeen: !!(currentCard && currentCard._hintSeen),
      dueLabel: dueLabel,
      spellingSignal: signal,
      recentWrongs: sessionWrongs.slice(),
    });
  }

  function gradeSpelling(correct, chosen, outcome) {
    awaiting = true;
    setUnknownVisible(false);
    const kind = outcome || (correct ? "correct" : "wrong");
    const prog = getProg(currentCard.key);
    const noted = Practice.noteSpelling(prog, kind, Date.now());
    bumpPractice("spelling", kind === "correct");
    if (kind !== "correct") rememberWrongWord(currentCard.word);
    const fb = $("feedback");
    const view = viewFor(kind, chosen, "", noted.signal);
    const title = kind === "correct" ? "拼写对了" : (kind === "unknown" ? "不会 · 先看答案" : "拼写再想想");
    if (fb) {
      fb.innerHTML =
        '<div class="fb-title">' + title + "</div>" +
        '<div class="fb-answer">' + escapeHtml(currentCard.word) + " — " + escapeHtml(currentCard.meaning_zh || "") + "</div>" +
        feedbackHtml(view) +
        extraExampleHtml(currentCard) +
        '<div class="rate-row"><button type="button" class="rate-btn good" id="btn-feedback-continue">' +
        '<span class="rate-zh">继续</span><span class="rate-sub">Continue</span></button></div>';
      fb.className = (kind === "correct" ? "ok" : "bad") + " show";
    }
    persist();
    const cont = $("btn-feedback-continue");
    if (cont) cont.addEventListener("click", () => {
      if ($("btn-feedback-continue") !== cont) return;
      nextCard();
    });
    const queueEl = $("play-queue");
    if (queueEl) queueEl.textContent = String(queue.length + requeueSoon.length);
    updateProgress();
  }

  function gradePlacement(correct, chosen, outcome) {
    awaiting = true;
    setUnknownVisible(false);
    const kind = outcome || (correct ? "correct" : "wrong");
    const hit = kind === "correct";
    placementTally.total += 1;
    if (hit) placementTally.correct += 1;
    const fb = $("feedback");
    const title = hit ? "对了" : (kind === "unknown" ? "不会 · 先看答案" : "再想想");
    if (fb) {
      fb.innerHTML =
        '<div class="fb-title">' + title + "</div>" +
        '<div class="fb-answer">' + escapeHtml(currentCard.word) + " — " + escapeHtml(currentCard.meaning_zh || "") + "</div>" +
        '<div class="fb-meta">摸底 ' + placementTally.total + "/" + placementTally.planned + " · 不计通关</div>" +
        '<div class="rate-row"><button type="button" class="rate-btn good" id="btn-feedback-continue">' +
        '<span class="rate-zh">继续</span><span class="rate-sub">Continue</span></button></div>';
      fb.className = (hit ? "ok" : "bad") + " show";
    }
    const queueEl = $("play-queue");
    if (queueEl) queueEl.textContent = String(queue.length);
    const cont = $("btn-feedback-continue");
    if (cont) cont.addEventListener("click", () => {
      if ($("btn-feedback-continue") !== cont) return;
      nextCard();
    });
  }

  function grade(correct, easy, chosen, outcome) {
    if (sessionKind === "placement") {
      if (awaiting || !currentCard || pendingRate) return;
      gradePlacement(correct, chosen, outcome);
      return;
    }
    if (awaiting || !currentCard || pendingRate) return;
    if (sessionKind === "spelling") {
      gradeSpelling(correct, chosen, outcome);
      return;
    }
    awaiting = true;
    setUnknownVisible(false);
    const kind = outcome || (correct ? "correct" : "wrong");
    const prog = getProg(currentCard.key);
    const prevMastery = Math.floor(prog.mastery || 0);
    const fb = $("feedback");
    const opts = attemptOpts(currentCard, { outcome: kind, correct: kind === "correct" });
    const nowMs = opts.now;
    if (kind !== "correct") rememberWrongWord(currentCard.word);
    if (sessionDirection === "meaning") bumpPractice("meaning", kind === "correct");
    bumpPractice("hint", kind === "correct" && !(currentCard && currentCard._hintSeen));

    logAnswer(kind === "correct", prog, opts);
    const reviewedDays = (prog && !SRS.isNewCard(prog) && prog.interval != null) ? prog.interval : null;
    if (kind === "correct") {
      pendingAttempt = opts;
      emitLearnerAnswer(true, currentCard, "", "correct", null, reviewedDays);
      // Hype first; SRS waits for Good / Easy
      save.streak += 1;
      killStreak += 1;
      if (save.streak > save.bestStreak) save.bestStreak = save.streak;
      const bonus = Math.min(50, 10 + save.streak * 2);
      save.points += bonus;
      pendingRate = true;

      const goodLabel = previewScheduleLabel(prog, 1);
      const easyLabel = previewScheduleLabel(prog, 2);
      const rateBtn = (id, cls, zh, en, when) =>
        '<button type="button" class="rate-btn ' + cls + '" id="' + id + '">' +
        '<span class="rate-zh">' + zh + "</span>" +
        '<span class="rate-sub">' + en + " · " + escapeHtml(when) + "</span></button>";
      fb.innerHTML =
        '<div class="fb-title">Correct! +' + bonus + "</div>" +
        '<div class="fb-answer">' + escapeHtml(currentCard.word) + "</div>" +
        feedbackHtml(viewFor("correct", "", "答对后选「记住了」或「太简单」", "")) +
        '<div class="fb-meta">选下次再练的时间</div>' +
        '<div class="rate-row">' +
        rateBtn("btn-rate-good", "good", "记住了", "Good", goodLabel) +
        rateBtn("btn-rate-easy", "easy", "太简单", "Easy", easyLabel) +
        "</div>" +
        speakButtons(currentCard);
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
      schedule(prog, 0, nowMs, opts);
      rememberMiss(currentCard, prog, reviewedDays);
      const reason = kind === "wrong" ? recordMissReason(currentCard, chosen) : null;
      emitLearnerAnswer(false, currentCard, kind === "unknown" ? "" : chosen, kind, reason, reviewedDays);
      save.streak = 0;
      const brokenStreak = killStreak;
      killStreak = 0;
      if (kind === "wrong") {
        if (brokenStreak >= SHUTDOWN_STREAK_MIN) {
          announceShutDown();
        } else {
          hideKillBanner();
        }
        save.points = Math.max(0, save.points - 2);
      } else {
        hideKillBanner();
      }

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
      if (kind === "unknown") {
        why += '<div class="fb-meta">这题记成「不会」，不算选错。稍后还会再出现。</div>';
      } else {
        why += '<div class="fb-meta">下次 · 约 10 分钟后再练（短间隔 Again）· 本局稍后重现</div>';
        if (reason && reason.line) why += '<div class="fb-meta">' + escapeHtml(reason.line) + "</div>";
      }
      if (sessionKind === "wrongbook" || (sessionKind === "must" && cardInWrongBook(currentCard))) {
        why += '<div class="fb-meta">还在错词本里 · 连续答对两次才会毕业</div>';
      }
      why += feedbackHtml(viewFor(kind, chosen, "约 10 分钟后", ""));
      why += extraExampleHtml(currentCard);
      why += '<div class="rate-row"><button type="button" class="rate-btn good" id="btn-feedback-continue">' +
        '<span class="rate-zh">继续</span><span class="rate-sub">Continue</span></button></div>';
      const title = kind === "unknown" ? "不会 · 先看答案" : "再想想 Not yet";
      fb.innerHTML = '<div class="fb-title">' + title + "</div>" + speakButtons(currentCard) + why;
      fb.className = "bad show";

      flashStage("bad");
      animRestart($("prompt-box"), "shake");
      clearAnim($("prompt-box"), "shake", 500);

      // One later repeat. Inserting into both queue and requeueSoon counted
      // the miss twice (题数 +2) and dealt the same word twice.
      // The repeat already saw the answer, so it cannot count as a clean recall.
      const alreadyWaiting = requeueSoon.some((r) => r.card && r.card.key === currentCard.key)
        || queue.some((c) => c.key === currentCard.key && c._repeat);
      if (!alreadyWaiting) {
        const delay = 1 + Math.floor(Math.random() * 2);
        requeueSoon.push({
          appearAt: stepCounter + delay,
          card: {
            ...currentCard,
            _repeat: true,
            _hintSeen: true,
            _answerExposedAt: new Date(nowMs).toISOString(),
          },
        });
      }
      persist();
      const cont = $("btn-feedback-continue");
      if (cont) cont.addEventListener("click", () => {
        if ($("btn-feedback-continue") !== cont) return;
        nextCard();
      });
    }
    if (sessionKind !== "must") {
      $("play-queue").textContent = String(queue.length + requeueSoon.length);
    }
    updateProgress();
  }

  function confirmCorrect(quality, prevMastery) {
    if (!pendingRate || !currentCard) return;
    pendingRate = false;
    const LE = learnerEvents();
    if (LE && typeof LE.noteGrade === "function") {
      try {
        LE.noteGrade({
          item_id: currentCard.key,
          headword: currentCard.word,
          event_type: LE.TYPES.CORRECT,
        }, quality === 2 ? "easy" : "good");
      } catch (_) {}
    }
    const prog = getProg(currentCard.key);
    const opts = pendingAttempt || attemptOpts(currentCard, { outcome: "correct", correct: true });
    pendingAttempt = null;
    const nowMs = opts.now || Date.now();
    schedule(prog, quality === 2 ? 2 : 1, nowMs, opts);
    let bookNote = "";
    if ((sessionKind === "wrongbook" || (sessionKind === "must" && cardInWrongBook(currentCard))) && currentCard) {
      const res = RQ.noteWrongBookCorrect(
        ensureWrongBook(),
        RQ.lemmaKey(currentTrack, currentCard.word),
        prog.wrong || 0
      );
      bookNote = res.graduated
        ? '<div class="fb-meta">错词本毕业 · 这个词先离开错词本了</div>'
        : '<div class="fb-meta">错词本连续答对 ' + res.streak + "/2</div>";
    }
    const fb = $("feedback");
    const qName = quality === 2 ? "太简单" : "记住了";
    fb.innerHTML =
      '<div class="fb-title">Correct · ' + qName + "</div>" +
      '<div class="fb-answer">' + escapeHtml(currentCard.word) + "</div>" +
      feedbackHtml(viewFor("correct", "", formatDue(prog), "")) +
      '<div class="fb-meta">下次见 · ' + escapeHtml(formatDue(prog)) + "</div>" +
      extraExampleHtml(currentCard) +
      bookNote;
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

  /** Hard MC distractors: same POS / scene / root_group / similar length·spelling.
   *  Same meaning_zh is excluded: ZH→EN grading is an exact lemma match, so a
   *  synonym option would be marked wrong. */
  function scoreDistractor(candidate, target, levelWords) {
    let score = 0;
    const cw = candidate.word;
    const tw = target.word;
    if (normalizeAnswer(cw) === normalizeAnswer(tw)) return -1e9;
    if (sameGloss(candidate.meaning_zh, target.meaning_zh)) return -1e9;

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
      if (sameGloss(w.meaning_zh, target.meaning_zh)) return;
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
        if (sameGloss(w.meaning_zh, target.meaning_zh)) continue;
        if (picks.some((p) => normalizeAnswer(p) === normalizeAnswer(w.word))) continue;
        picks.push(w.word);
      }
    }
    return picks.slice(0, count);
  }

  function meaningsMatch(a, b) {
    return String(a || "").trim() === String(b || "").trim();
  }

  /** Identical non-empty gloss. Blank glosses are not treated as synonyms. */
  function sameGloss(a, b) {
    return meaningsMatch(a, b) && String(a || "").trim().length > 0;
  }

  function pickMeaningDistractors(target, count) {
    const correct = String(target.meaning_zh || "").trim();
    const pool = [];
    const seen = new Set();
    if (correct) seen.add(correct);
    const add = (w) => {
      if (!w || w.word === target.word) return;
      const gloss = String(w.meaning_zh || "").trim();
      if (!gloss || seen.has(gloss)) return;
      seen.add(gloss);
      pool.push(w);
    };
    const levelWords = LEVELS[currentLevel - 1] || [];
    levelWords.forEach(add);
    for (let li = 0; li < LEVELS.length; li++) {
      if (li === currentLevel - 1) continue;
      (LEVELS[li] || []).forEach(add);
    }
    const samePos = pool.filter((w) => w.pos && target.pos && w.pos === target.pos);
    const usePool = samePos.length >= count ? samePos : pool;
    const top = usePool.slice(0, Math.max(count * 4, count));
    shuffle(top);
    return top.slice(0, count).map((w) => w.meaning_zh);
  }

  function paintChoices(opts, correct, match) {
    const box = $("choices");
    if (!box) return;
    shuffle(opts);
    box.hidden = false;
    box.setAttribute("aria-label", sessionDirection === "meaning" ? "选择中文意思" : "选择英文单词");
    box.innerHTML = "";
    opts.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "choice";
      b.textContent = i + 1 + ".  " + opt;
      b.addEventListener("click", () => {
        if (awaiting) return;
        const ok = match(opt, correct);
        b.classList.add(ok ? "ok" : "bad");
        grade(ok, false, opt, ok ? "correct" : "wrong");
      });
      box.appendChild(b);
    });
    setUnknownVisible(true);
  }

  function renderChoices() {
    if (!currentCard) return;
    if (sessionDirection === "meaning") {
      const correct = currentCard.meaning_zh || "";
      const opts = [correct, ...pickMeaningDistractors(currentCard, 3)].filter((opt) => String(opt || "").trim());
      while (opts.length < 4) {
        const filler = "（其他义项 " + opts.length + "）";
        if (opts.indexOf(filler) === -1) opts.push(filler);
        else break;
      }
      paintChoices(opts, correct, meaningsMatch);
      return;
    }
    const correct = currentCard.word;
    const opts = [correct, ...pickHardDistractors(currentCard, 3)].filter((opt) => opt);
    paintChoices(opts, correct, answersMatch);
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
    if (challengeFailed || levelClearing) return;
    levelClearing = true;
    const challengeWon = challengeActive && !sessionStartedClear;
    stopChallenge();
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
    const mins = Math.round(SRS.CHALLENGE_MS / MIN_MS);
    const line = "巩固 " + cs.solid + "/" + cs.total + "，通关线 " + cs.need + "（80%，间隔≥1天）。";
    $("clear-msg").textContent = challengeWon
      ? (setTitle(currentLevel) + " 在 " + mins + " 分钟内通关（+50）。" + line)
      : (setTitle(currentLevel) + " 通关（+50）。" + line);
    const starEl = $("clear-stars");
    starEl.className = "stars star-pop";
    starEl.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const s = document.createElement("span");
      s.textContent = i < stars ? "★" : "☆";
      starEl.appendChild(s);
    }
    const trophy = $("clear-trophy");
    if (trophy) trophy.hidden = !challengeWon;
    const title = $("clear-title");
    if (title) title.textContent = challengeWon ? "挑战成功" : "通关";
    const achievement = challengeWon ? SRS.pickChallengeLine("success", rollChallenge()) : "";
    const achEl = $("clear-achievement");
    if (achEl) {
      achEl.hidden = !challengeWon;
      achEl.textContent = achievement;
    }
    const clearScreen = $("screen-clear");
    if (clearScreen) clearScreen.classList.toggle("challenge-win", !!challengeWon);
    resetClearActions();
    const nextBtn = $("btn-next-level");
    if (nextBtn) nextBtn.hidden = false;
    showScreen("clear");
    spawnPointsFloater(50);
    flashStage("ok");
    if (challengeWon) {
      playChallengeCue("success");
    } else {
      playPartClearCue(currentLevel);
    }
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
    const src = Sense.migrateCards(payload.cards || {}, catalogGroups());
    const cards = {};
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
    }, {
      track: payload.track,
      trackUnlock: Object.assign({}, payload.trackUnlock || {}),
      trackStars: Object.assign({}, payload.trackStars || {}),
      daily: Object.assign({}, payload.daily || {}),
      profile: Object.assign({ name: "", cls: "" }, payload.profile || {}),
      updatedAt: payload.updatedAt,
      wrongBook: payload.wrongBook && typeof payload.wrongBook === "object" ? payload.wrongBook : {},
      practice: payload.practice && typeof payload.practice === "object" ? payload.practice : {},
      mustPractice: payload.mustPractice,
      placement: payload.placement,
      missReasons: payload.missReasons,
    });
  }

  function applySaveObject(next, opts) {
    opts = opts || {};
    save = next;
    applyTrack(save.track || "core", true);
    sortMode = publicSortMode(save.sortMode);
    save.sortMode = sortMode;
    voiceOn = save.voiceOn !== false;
    delete save.dueOnly;
    const voiceBtn = $("btn-voice-toggle");
    if (voiceBtn) {
      voiceBtn.textContent = voiceOn ? "🔊 连杀语音 On" : "🔇 连杀语音 Off";
      voiceBtn.classList.toggle("sort-active", voiceOn);
    }
    persist(opts);
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

  /** Daily log. rc/rw are cross-day 保持率 only. unk is「不会」, not a wrong pick. */
  function logAnswer(correct, prog, opts) {
    opts = opts || {};
    const k = dayKey(opts.now);
    const d = save.daily[k] || (save.daily[k] = { c: 0, w: 0, rc: 0, rw: 0, n: 0, unk: 0 });
    SRS.applyDailyAnswer(d, prog, Object.assign({ correct: !!correct }, opts));
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
      out.push(Object.assign({ day: k }, save.daily[k] || { c: 0, w: 0, rc: 0, rw: 0, n: 0, unk: 0 }));
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
          if (p && SRS.isMasteredCard(p)) learned++;
        }
        if (clearReadyPure(li, words)) cleared.push(li + 1);
      });
      return { learned, total, cleared, sets: LEVELS.length };
    });
  }

  /** Same pass rule as levelClearStats, but never creates card entries. */
  function clearReadyPure(li, words) {
    const now = Date.now();
    const progs = [];
    for (const w of words) progs.push(save.cards[cardKey(li, w.word)] || null);
    return SRS.summarizeSet(progs, now).ready;
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
    const guessed = sum(all, "c") + sum(all, "w");
    return {
      streak: activeStreak(),
      activeDays: Object.keys(save.daily).length,
      learned,
      answers: guessed + sum(all, "unk"),
      acc: guessed ? sum(all, "c") / guessed : null,
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
    const maxN = Math.max(1, ...days.map((d) => d.c + d.w + (d.unk || 0)));
    const W = 300, H = 110, bw = W / days.length;
    let bars = "", line = "";
    days.forEach((d, i) => {
      const guessed = d.c + d.w;
      const n = guessed + (d.unk || 0);
      const h = (n / maxN) * (H - 20);
      bars += '<rect x="' + (i * bw + 3) + '" y="' + (H - 14 - h) + '" width="' + (bw - 6) + '" height="' + h + '" rx="2" fill="rgba(61,231,255,.55)"><title>' + d.day + " 答题 " + n + "</title></rect>";
      if (guessed) {
        const y = H - 14 - (d.c / guessed) * (H - 20);
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
    refreshHomeQueues();
    const spellLine = spellingLine();
    const axes = FB.radarFromEvidence({
      meaning: save.practice && save.practice.meaning,
      spelling: save.practice && save.practice.spelling,
      retention: retentionEvidence(),
      hint: save.practice && save.practice.hint,
    });
    const radar = axes ? ('<div class="stats-radar-wrap">' + FB.radarSvg(axes) + "</div>") : "";
    box.innerHTML =
      '<div class="stats-grid">' +
      "<div><b>" + st.streak + "</b>连续打卡(天)</div>" +
      "<div><b>" + st.learned + "</b>已学会词数</div>" +
      "<div><b>" + pct(st.acc7) + "</b>近7天正确率</div>" +
      "<div><b>" + pct(st.ret7) + "</b>近7天复习保持率</div>" +
      "</div>" + svg +
      '<p class="stats-legend">柱：每日答题量 · 黄线：每日正确率 · 累计答题 ' + st.answers + " 次 · 学习 " + st.activeDays + " 天</p>" +
      '<p class="stats-legend">通关是一组里已经巩固的词够了（间隔至少 1 天）。已学会要等下一天、第一次就认对，而且之前没看到答案。保持率只算这些隔天复习。点「不会」单独记下，不算选错。拼写单独记，不挡住第一次通关。</p>' +
      spellLine +
      radar +
      '<ul class="stats-tracks">' + tr + "</ul>";
  }

  function retentionEvidence() {
    let n = 0;
    let good = 0;
    const daily = save.daily || {};
    for (const k of Object.keys(daily)) {
      const d = daily[k] || {};
      n += (d.rc || 0) + (d.rw || 0);
      good += d.rc || 0;
    }
    return { n: n, good: good };
  }

  function spellingLine() {
    let cards = 0;
    let correct = 0;
    let wrong = 0;
    for (const p of Object.values(save.cards || {})) {
      const s = p && p.spelling;
      if (!s) continue;
      if ((s.correct || 0) + (s.wrong || 0) + (s.unknown || 0) === 0) continue;
      cards++;
      correct += s.correct || 0;
      wrong += s.wrong || 0;
    }
    if (!cards) return "";
    return '<p class="stats-legend">拼写 ' + cards + " 词 · 对 " + correct + " · 错 " + wrong + " · 不计入通关</p>";
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
      d: lastDays(30).filter((d) => d.c + d.w + (d.unk || 0)).map((d) => [d.day, d.c, d.w, d.rc, d.rw, d.n, d.unk || 0]),
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
    get challengeMs() { return SRS.CHALLENGE_MS; },
    debugExpireChallenge() {
      if (!challengeActive || challengeFailed) return false;
      challengeDeadline = Date.now() - 1;
      tickChallenge();
      return true;
    },
    debugCelebrateChallenge() {
      if (!challengeActive || challengeFailed) return false;
      onLevelClear();
      return true;
    },
    debugSetChallengeRoll(roll) {
      forcedChallengeRoll = roll;
    },
    get sessionKind() { return sessionKind; },
    debugPreviewCard(word, direction) {
      const want = String(word || "");
      let found = null;
      let levelIdx = 0;
      for (let li = 0; li < LEVELS.length; li++) {
        const set = LEVELS[li] || [];
        for (let i = 0; i < set.length; i++) {
          if (set[i] && set[i].word === want) {
            found = set[i];
            levelIdx = li;
            break;
          }
        }
        if (found) break;
      }
      if (!found) return { ok: false, word: want };
      playGen += 1;
      levelClearing = false;
      stopChallenge();
      challengeFailed = false;
      sessionKind = "must";
      sessionStarter = false;
      sessionMode = "study";
      sessionDirection = direction === "form" || direction === "spelling" ? direction : "meaning";
      sessionWrongs = [];
      sessionStartedClear = true;
      currentLevel = levelIdx + 1;
      queue = [enrichItem(found, levelIdx, 0)];
      requeueSoon.length = 0;
      stepCounter = 0;
      sessionSeen = 0;
      sessionTarget = 1;
      firstCardOfSession = true;
      pendingRate = false;
      awaiting = false;
      hideKillBanner();
      hidePlacementNote();
      const choices = $("choices");
      if (choices) {
        choices.hidden = true;
        choices.innerHTML = "";
      }
      showScreen("play");
      const playLevel = $("play-level");
      if (playLevel) playLevel.textContent = setTitle(levelIdx + 1);
      nextCard();
      const el = $("prompt-sense");
      const cue = el && !el.hidden ? (el.textContent || "") : "";
      const choiceText = Array.from(document.querySelectorAll("#choices .choice")).map((b) => b.textContent || "");
      return {
        ok: true,
        word: found.word,
        gloss: found.meaning_zh || "",
        prompt: ($("prompt-main") && $("prompt-main").textContent) || "",
        label: ($("prompt-label") && $("prompt-label").textContent) || "",
        cue: cue,
        hidden: !el || !!el.hidden,
        choices: choiceText,
        clockHidden: !!($("challenge-clock") && $("challenge-clock").hidden),
      };
    },
    /** ZH→EN hard options for one headword. Optional levels replace the active track for the call. */
    debugHardDistractors(word, count, levels) {
      const n = count == null ? 3 : count;
      const prevLevels = LEVELS;
      const prevCount = LEVEL_COUNT;
      const prevLevel = currentLevel;
      if (Array.isArray(levels)) {
        LEVELS = levels;
        LEVEL_COUNT = levels.length;
      }
      try {
        const want = String(word || "");
        let found = null;
        let levelIdx = 0;
        for (let li = 0; li < LEVELS.length; li++) {
          const set = LEVELS[li] || [];
          for (let i = 0; i < set.length; i++) {
            if (set[i] && set[i].word === want) {
              found = set[i];
              levelIdx = li;
              break;
            }
          }
          if (found) break;
        }
        if (!found) return [];
        currentLevel = levelIdx + 1;
        return pickHardDistractors(found, n);
      } finally {
        LEVELS = prevLevels;
        LEVEL_COUNT = prevCount;
        currentLevel = prevLevel;
      }
    },
    debugFinishPlacement(correct) {
      if (sessionKind !== "placement") return false;
      const planned = placementTally.planned || Placement.ITEM_COUNT;
      const c = Math.max(0, Math.min(planned, Math.floor(Number(correct) || 0)));
      placementTally.correct = c;
      placementTally.total = planned;
      queue = [];
      requeueSoon.length = 0;
      finishPlacement();
      const setNum = Number(($("btn-placement-enter") && $("btn-placement-enter").dataset.set) || save.unlockedLevel || 1);
      return { ok: true, set: setNum, correct: c, total: planned };
    },
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

  if ($("btn-unknown")) $("btn-unknown").addEventListener("click", () => grade(false, false, "", "unknown"));
  if ($("btn-export")) $("btn-export").addEventListener("click", exportProgressFile);
  if ($("btn-import")) $("btn-import").addEventListener("click", () => $("import-file").click());
  if ($("import-file")) $("import-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importProgressFile(f);
    e.target.value = "";
  });
  if ($("btn-copy-code")) $("btn-copy-code").addEventListener("click", copyBackupCode);
  if ($("btn-paste-code")) $("btn-paste-code").addEventListener("click", importFromBackupCode);

  const MUST_EMPTY = "今天没有到期或错词。先去闯关，到时间的词和错过的词会进今日必练。";

  function normalizeMustPractice(raw) {
    const row = raw && typeof raw === "object" ? raw : {};
    return {
      day: typeof row.day === "string" ? row.day : "",
      started: !!row.started,
      dismissed: !!row.dismissed,
    };
  }

  function ensureWrongBook() {
    if (!save.wrongBook || typeof save.wrongBook !== "object" || Array.isArray(save.wrongBook)) {
      save.wrongBook = {};
    }
    return save.wrongBook;
  }

  function openedGroupLimit() {
    return Math.min(LEVELS.length, Math.max(1, save.unlockedLevel || 1));
  }

  function learnerEvents() {
    return window.QuizMarioLearnerEvents || null;
  }

  /** Core bank stamps words.js. Exam tracks have no separate content hash. */
  function contentVersionForTrack(track) {
    const id = track || currentTrack || "core";
    if (id === "core") return window.QUIZMARIO_CONTENT_VERSION || "words-v12";
    return "exam-tracks:" + id;
  }

  function reviewIntervalDays(card) {
    if (!card || !card.key || !save.cards) return null;
    const prog = save.cards[card.key];
    if (!prog || SRS.isNewCard(prog) || prog.interval == null) return null;
    return prog.interval;
  }

  function learnerSenseInput(card) {
    const track = (card && card.track) || currentTrack;
    const input = {
      lemma: (card && (card.word || card.lemma)) || "",
      pos: (card && card.pos) || "",
      gloss_zh: (card && (card.meaning_zh || card.gloss_zh)) || "",
      content_version: contentVersionForTrack(track),
      bank_version: contentVersionForTrack(track),
    };
    if (card && card.sense_id) input.sense_id = card.sense_id;
    const days = reviewIntervalDays(card);
    if (days != null) input.review_interval_days = days;
    return input;
  }

  function emitLearnerAnswer(correct, card, chosen, outcome, reason, intervalDays) {
    const LE = learnerEvents();
    if (!LE || !card || typeof LE.record !== "function") return;
    const kind = outcome || (correct ? "correct" : "wrong");
    const type = kind === "unknown" && LE.TYPES.UNKNOWN ? LE.TYPES.UNKNOWN : (correct ? LE.TYPES.CORRECT : LE.TYPES.WRONG);
    const input = Object.assign(learnerSenseInput(card), {
      event_type: type,
      headword: card.word,
      item_id: card.key,
      track: currentTrack,
      gloss_zh: card.meaning_zh || "",
      outcome: kind,
      task_direction: sessionDirection,
      first_attempt: !(card && card._repeat),
      answer_exposed: !!(card && card._hintSeen),
    });
    if (card && card._answerExposedAt) input.answer_exposed_at = card._answerExposedAt;
    if (intervalDays != null) input.review_interval_days = intervalDays;
    if (kind === "wrong" && chosen) input.answer = chosen;
    if (kind === "wrong" && reason && reason.bucket && ET.LABELS[reason.bucket]) {
      input.reason = reason.bucket;
      input.reason_zh = ET.LABELS[reason.bucket];
    }
    try { LE.record(input); } catch (_) {}
  }

  function emitWrongBook(card, intervalDays) {
    const LE = learnerEvents();
    if (!LE || !card || typeof LE.record !== "function") return;
    try {
      const input = Object.assign(learnerSenseInput(card), {
        event_type: LE.TYPES.WRONG_BOOK,
        headword: card.word || card.lemma,
        item_id: card.key || card.cardKey || "",
        track: card.track || currentTrack,
        gloss_zh: card.meaning_zh || card.gloss_zh || "",
      });
      if (intervalDays != null) input.review_interval_days = intervalDays;
      LE.record(input);
    } catch (_) {}
  }

  function lookupBankWord(surface, direction) {
    const want = String(surface || "").trim();
    if (!want) return null;
    const norm = want.toLowerCase();
    const targetNorm = currentCard ? String(currentCard.word || "").trim().toLowerCase() : "";
    for (let li = 0; li < LEVELS.length; li++) {
      const words = LEVELS[li] || [];
      for (const w of words) {
        if (!w) continue;
        if (direction === "meaning") {
          if (String(w.meaning_zh || "").trim() !== want) continue;
        } else if (String(w.word || "").trim().toLowerCase() !== norm) {
          continue;
        }
        if (targetNorm && String(w.word || "").trim().toLowerCase() === targetNorm) continue;
        return w;
      }
    }
    return null;
  }

  /** Wrong MC picks only. Placement and spelling stay out of the tally. */
  function recordMissReason(card, chosen) {
    try {
      if (!card || !ET.countsAsMiss("wrong")) return null;
      if (sessionKind === "placement" || sessionKind === "spelling") return null;
      const picked = String(chosen || "").trim();
      if (!picked) return null;
      const direction = sessionDirection === "meaning" ? "meaning" : "form";
      const entry = lookupBankWord(picked, direction);
      const result = ET.classifyMiss({
        target: card,
        chosen: entry || picked,
        direction: direction,
      });
      const otherLabel = entry && entry.word ? entry.word : picked;
      save.missReasons = ET.noteMiss(save.missReasons, {
        bucket: result.bucket,
        lemma: card.word || "",
        gloss: card.meaning_zh || "",
        chosen: picked,
        chosenLemma: entry && entry.word ? entry.word : "",
        track: currentTrack,
        at: Date.now(),
      });
      result.line = ET.feedbackLine(result, otherLabel);
      return result;
    } catch (_) {
      return null;
    }
  }

  function findSurface(words, lemma) {
    const id = Sense.senseId(lemma);
    return words.find((x) => Sense.senseId(x.word) === id)
      || words.find((x) => String(x.word).toLowerCase() === String(lemma || "").trim().toLowerCase());
  }

  function glossAt(levelIdx, lemma) {
    const w = findSurface(LEVELS[levelIdx] || [], lemma);
    return w ? (w.meaning_zh || "") : "";
  }

  function signalDueItems(items) {
    const LE = learnerEvents();
    if (!LE || typeof LE.recordDue !== "function" || !items || !items.length) return;
    try {
      LE.recordDue(items.map((it) => {
        const row = {
          headword: it.word,
          lemma: it.word,
          pos: it.pos || "",
          item_id: it.key,
          track: currentTrack,
          gloss_zh: it.meaning_zh || "",
          due_ms: it.dueAt || 0,
          content_version: contentVersionForTrack(currentTrack),
          bank_version: contentVersionForTrack(currentTrack),
        };
        if (it.sense_id) row.sense_id = it.sense_id;
        const days = reviewIntervalDays(it);
        if (days != null) row.review_interval_days = days;
        return row;
      }));
    } catch (_) {}
  }

  function rememberMiss(card, prog, intervalDays) {
    if (!card || !card.word) return null;
    const res = RQ.touchWrongBook(ensureWrongBook(), {
      lemmaKey: RQ.lemmaKey(currentTrack, card.word),
      lemma: card.word,
      track: currentTrack,
      levelIdx: card.levelIdx != null ? card.levelIdx : (currentLevel - 1),
      cardKey: card.key,
      now: Date.now(),
    }, prog, "miss");
    if (res && res.entered) emitWrongBook(card, intervalDays);
    return res;
  }

  function scanWrongBook() {
    const book = ensureWrongBook();
    const before = new Set();
    for (const k of Object.keys(book)) {
      if (book[k] && book[k].active) before.add(k);
    }
    const entries = [];
    const limit = openedGroupLimit();
    for (let li = 0; li < limit; li++) {
      const words = LEVELS[li] || [];
      for (const w of words) {
        const key = cardKey(li, w.word);
        const prog = save.cards[key];
        if (!prog) continue;
        entries.push({
          lemmaKey: RQ.lemmaKey(currentTrack, w.word),
          lemma: w.word,
          track: currentTrack,
          levelIdx: li,
          cardKey: key,
          prog: prog,
          now: Date.now(),
        });
      }
    }
    const added = RQ.scanCumulative(book, entries);
    if (added > 0) {
      for (const entry of entries) {
        const row = book[entry.lemmaKey];
        if (!row || !row.active || before.has(entry.lemmaKey)) continue;
        const surface = findSurface(LEVELS[entry.levelIdx] || [], entry.lemma);
        emitWrongBook({
          word: entry.lemma,
          key: entry.cardKey,
          track: entry.track,
          meaning_zh: surface ? (surface.meaning_zh || "") : glossAt(entry.levelIdx, entry.lemma),
          pos: surface ? (surface.pos || "") : "",
          sense_id: surface && surface.sense_id ? surface.sense_id : "",
        });
      }
    }
    return added;
  }

  function dueQueueItems(now) {
    const limit = openedGroupLimit();
    const groups = [];
    for (let li = 0; li < limit; li++) groups.push({ levelIdx: li, words: LEVELS[li] || [] });
    const rows = RQ.collectDue({
      groups: groups,
      unlockedLevel: save.unlockedLevel,
      cards: save.cards,
      now: now || Date.now(),
      cardKey: function (levelIdx, word) { return cardKey(levelIdx, word); },
      isNewCard: SRS.isNewCard,
      isDue: SRS.isDue,
    });
    return rows.map((row) => {
      const it = enrichItem(row.word, row.levelIdx, 0);
      it.levelIdx = row.levelIdx;
      return it;
    });
  }

  function wrongBookQueueItems() {
    scanWrongBook();
    const rows = RQ.activeWrongEntries(ensureWrongBook(), currentTrack);
    const items = [];
    for (const row of rows) {
      const li = row.levelIdx || 0;
      const words = LEVELS[li] || [];
      const w = findSurface(words, row.lemma || "");
      if (!w) continue;
      const it = enrichItem(w, li, 0);
      it.levelIdx = li;
      const prog = save.cards[row.cardKey] || save.cards[it.key];
      it._wrong = prog ? (prog.wrong || 0) : (row.priority || 0);
      it._missAt = row.lastMissAt || 0;
      items.push(it);
    }
    items.sort((a, b) => (b._wrong - a._wrong) || (a._missAt - b._missAt));
    return items;
  }

  function cardInWrongBook(card) {
    if (!card || !card.word) return false;
    const row = ensureWrongBook()[RQ.lemmaKey(currentTrack, card.word)];
    return !!(row && row.active);
  }

  function mustPracticeItems(now) {
    return RQ.mergePracticeQueue(dueQueueItems(now), wrongBookQueueItems());
  }

  /** Same merged due + wrong-book queue the home surfaces count. */
  function mustRemainingCount(now) {
    return RQ.mustRemainingCount(dueQueueItems(now), wrongBookQueueItems());
  }

  function paintMustRemaining(count) {
    const view = RQ.mustRemainReadout(count);
    const queueEl = $("play-queue");
    if (queueEl) queueEl.textContent = view.badge;
    const total = Math.max(sessionTarget, view.count, 1);
    const done = Math.max(0, Math.min(total, total - view.count));
    const pct = Math.round((done / total) * 100);
    const bar = $("play-progress");
    if (bar) bar.style.width = pct + "%";
    const pctEl = $("set-progress-pct");
    if (pctEl) pctEl.textContent = view.leftLabel;
    const barWrap = $("set-progress-bar");
    if (barWrap) {
      barWrap.setAttribute("aria-valuenow", String(pct));
      barWrap.setAttribute("aria-valuetext", "今日必练 剩余 " + view.count);
    }
    const label = $("set-progress-label");
    if (label) label.textContent = "今日必练";
  }

  function queueModeLabel(kind) {
    if (kind === "placement") return "摸底";
    if (kind === "must") return "今日必练";
    if (kind === "due") return "今日到期";
    if (kind === "spelling") return "拼写";
    return "错词本";
  }

  function todayKey(now) {
    return SRS.calendarDay(now || Date.now());
  }

  function signedIn() {
    return !!(window.QuizMarioCloud && typeof window.QuizMarioCloud.loggedIn === "function" && window.QuizMarioCloud.loggedIn());
  }

  function setCountBadge(id, n) {
    const el = $(id);
    if (!el) return;
    el.textContent = String(n);
    el.hidden = !(n > 0);
  }

  function showQueueEmpty(text) {
    const el = $("queue-empty");
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  }

  function hideQueueEmpty() {
    const el = $("queue-empty");
    if (el) el.hidden = true;
  }

  function applyHomePrimacy(mode) {
    const must = $("btn-must-practice");
    const cont = $("btn-continue");
    const queues = $("home-queues");
    const home = $("screen-home");
    if (home) home.setAttribute("data-review-primacy", mode);
    if (!must || !cont) return;
    if (mode === "hidden") {
      must.hidden = true;
      must.classList.remove("is-hero");
      cont.classList.remove("secondary");
      if (queues) queues.hidden = true;
      return;
    }
    must.hidden = false;
    if (mode === "primary") {
      if (queues) {
        queues.hidden = false;
        queues.appendChild(must);
      }
      must.classList.remove("secondary");
      must.classList.add("is-hero");
      cont.classList.add("secondary");
      return;
    }
    must.classList.add("secondary");
    must.classList.remove("is-hero");
    cont.classList.remove("secondary");
    cont.insertAdjacentElement("afterend", must);
    if (queues) queues.hidden = true;
  }

  function studentHomeActive() {
    const home = $("screen-home");
    return !!(home && home.classList.contains("active"));
  }

  function frontierLevelNumber() {
    return HL.frontierGroup(save.unlockedLevel, LEVEL_COUNT);
  }

  function startFrontierLevel() {
    hideQueueEmpty();
    startLevel(frontierLevelNumber());
  }

  function renderHomeLoop(count) {
    const strip = $("home-loop");
    if (!strip) return;
    const LE = learnerEvents();
    const events = LE && typeof LE.list === "function" ? LE.list() : [];
    const view = HL.homeLoopStrip({
      signedIn: signedIn(),
      onHome: studentHomeActive(),
      mustCount: count,
      als: HL.alsReturnCounts(events),
    });
    strip.hidden = !view.visible;
    strip.setAttribute("data-action", view.action || "");
    strip.setAttribute("data-mode", view.mode || "hidden");
    const title = $("home-loop-title");
    const detail = $("home-loop-detail");
    if (title) title.textContent = view.text || "";
    if (detail) detail.textContent = view.detail || "";
  }

  function paintReasonBox(el, view) {
    if (!el) return;
    view = view || { visible: false };
    el.hidden = !view.visible;
    if (!view.visible) return;
    const tax = el.querySelector("[data-reason-taxonomy]");
    const lead = el.querySelector("[data-reason-lead]");
    const counts = el.querySelector("[data-reason-counts]");
    const list = el.querySelector("[data-reason-examples]");
    if (tax) tax.textContent = view.taxonomy || "";
    if (lead) lead.textContent = view.lead || "";
    if (counts) counts.textContent = view.countsLine || "";
    if (list) {
      list.textContent = "";
      const lines = view.examples || [];
      for (let i = 0; i < lines.length; i++) {
        const li = document.createElement("li");
        li.textContent = lines[i];
        list.appendChild(li);
      }
    }
  }

  function renderMissReasons() {
    const view = ET.present(save.missReasons);
    if (!studentHomeActive()) view.visible = false;
    paintReasonBox($("miss-reasons"), view);
  }

  function renderTodayNarrative(mustCount) {
    const el = $("today-narrative");
    if (!el) return;
    const reasons = ET.present(save.missReasons);
    const gate = RQ.freshDailyGate(save.mustPractice, todayKey());
    let cleared = 0;
    try {
      const summary = trackSummary(currentTrack);
      cleared = summary && summary.cleared ? summary.cleared.length : 0;
    } catch (_) {}
    const placed = save.placement && save.placement[currentTrack];
    const view = PN.todayNarrative({
      signedIn: signedIn(),
      onHome: studentHomeActive(),
      mustCount: mustCount,
      mustStarted: !!(gate && gate.started),
      frontier: frontierLevelNumber(),
      setsCleared: cleared,
      placement: placed || null,
      topMiss: reasons.visible ? reasons.leadBucket : "",
    });
    el.hidden = !view.visible;
    const list = $("today-narrative-lines");
    if (!list) return;
    list.textContent = "";
    if (!view.visible) return;
    for (let i = 0; i < view.lines.length; i++) {
      const li = document.createElement("li");
      li.textContent = view.lines[i];
      list.appendChild(li);
    }
  }

  function renderClearReasons() {
    paintReasonBox($("clear-reasons"), ET.present(save.missReasons));
  }

  function resetClearActions() {
    const cont = $("btn-clear-continue");
    const als = $("btn-clear-als");
    const home = $("btn-clear-home");
    const placed = $("btn-placement-enter");
    if (placed) placed.hidden = true;
    if (cont) cont.hidden = true;
    if (als) als.hidden = true;
    if (home) {
      home.classList.add("secondary");
      home.classList.remove("ghost");
    }
    const reasons = $("clear-reasons");
    if (reasons) reasons.hidden = true;
  }

  function showMustClearActions(plan) {
    resetClearActions();
    const nextBtn = $("btn-next-level");
    if (nextBtn) nextBtn.hidden = true;
    const cont = $("btn-clear-continue");
    if (cont) {
      cont.hidden = false;
      cont.textContent = plan.primaryLabel;
    }
    const als = $("btn-clear-als");
    if (als && plan.showAls) {
      als.hidden = false;
      als.textContent = plan.alsLabel;
      als.href = plan.alsHref;
    }
    const home = $("btn-clear-home");
    if (home) {
      home.classList.remove("secondary");
      home.classList.add("ghost");
    }
    renderClearReasons();
  }

  function dismissMustGate() {
    const gate = $("must-gate");
    if (gate) gate.hidden = true;
  }

  function maybeShowMustGate(count) {
    const gate = $("must-gate");
    if (!gate) return;
    const show = RQ.shouldShowSoftGate({
      signedIn: signedIn(),
      onHome: studentHomeActive(),
      count: count,
      day: todayKey(),
      record: save.mustPractice,
    });
    if (!show) {
      gate.hidden = true;
      return;
    }
    const copy = $("must-gate-copy");
    if (copy) copy.textContent = RQ.softGateLine(count);
    const wasHidden = gate.hidden;
    gate.hidden = false;
    if (wasHidden) {
      const start = $("btn-must-start");
      if (start && typeof start.focus === "function") start.focus();
    }
  }

  function refreshHomeQueues() {
    if (!$("btn-must-practice")) return;
    hideQueueEmpty();
    const added = scanWrongBook();
    const dueItems = dueQueueItems();
    signalDueItems(dueItems);
    const count = RQ.mustRemainingCount(dueItems, wrongBookQueueItems());
    setCountBadge("must-badge", count);
    const mode = RQ.homePrimacy({
      count: count,
      day: todayKey(),
      record: save.mustPractice,
    });
    applyHomePrimacy(mode);
    renderHomeLoop(count);
    renderMissReasons();
    renderTodayNarrative(count);
    const hint = $("continue-hint");
    if (hint) {
      hint.hidden = false;
      if (count > 0 && mode === "primary") {
        hint.textContent = "今天有 " + count + " 道到期/错词，先做今日必练。";
      } else if (count > 0) {
        hint.textContent = "今日必练还剩 " + count + " 道。继续闯关是看英文选中文。";
      } else {
        hint.textContent = "今天没有到期或错词。继续闯关是看英文选中文。";
      }
    }
    maybeShowMustGate(count);
    renderPracticeReminder(count);
    if (added > 0) persist();
  }

  function loadPracticeReminder() {
    try {
      const raw = localStorage.getItem(PR.STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : null;
    } catch (_) {
      return null;
    }
  }

  function storePracticeReminder(row) {
    try {
      localStorage.setItem(PR.STORAGE_KEY, JSON.stringify(row));
    } catch (_) {}
  }

  function renderPracticeReminder(count) {
    const el = $("must-reminder");
    if (!el) return;
    const gateEl = $("must-gate");
    const softGateVisible = !!(gateEl && !gateEl.hidden);
    const day = todayKey();
    const gate = RQ.freshDailyGate(save.mustPractice, day);
    const dismissed = !!(gate && gate.dismissed);
    const opts = {
      signedIn: signedIn(),
      onHome: studentHomeActive(),
      enteringHome: practiceReminderArmed,
      count: count,
      day: day,
      dismissed: dismissed,
      softGateVisible: softGateVisible,
      reminder: loadPracticeReminder(),
    };
    const show = PR.shouldShowPracticeReminder(opts);
    const keep = practiceReminderHeld
      && opts.signedIn
      && opts.onHome
      && opts.enteringHome
      && !softGateVisible
      && dismissed
      && (Number(count) || 0) >= 1;
    if (!show && !keep) {
      el.hidden = true;
      if (!opts.onHome || !opts.enteringHome || softGateVisible || (Number(count) || 0) < 1) {
        practiceReminderHeld = false;
      }
      return;
    }
    const copy = $("must-reminder-copy");
    if (copy) copy.textContent = PR.practiceReminderLine(count);
    el.hidden = false;
    if (!practiceReminderHeld) {
      practiceReminderHeld = true;
      storePracticeReminder(PR.markPracticeReminder(opts.reminder, day));
    }
  }

  window.__QM.onSessionReady = function () {
    if (sessionKind === "placement" && !currentNeedsPlacement()) {
      playGen += 1;
      stopChallenge();
      hidePlacementNote();
      showScreen("home");
      return;
    }
    const home = $("screen-home");
    if (home && home.classList.contains("active")) refreshHomeQueues();
    else dismissMustGate();
  };

  function markMust(action) {
    save.mustPractice = RQ.markDailyGate(save.mustPractice, todayKey(), action);
    persist();
  }

  function startMustPractice() {
    const items = mustPracticeItems();
    markMust("start");
    dismissMustGate();
    if (!items.length) {
      showQueueEmpty(MUST_EMPTY);
      refreshHomeQueues();
      return;
    }
    hideQueueEmpty();
    signalDueItems(items.filter((it) => it.fromDue));
    startQueueSession("must", items);
  }

  function laterMustPractice() {
    markMust("dismiss");
    dismissMustGate();
    // This paint is the dismiss itself, not a new home entry.
    practiceReminderArmed = false;
    practiceReminderHeld = false;
    refreshHomeQueues();
  }

  function startSpellingSession() {
    const lvl = Math.min(Math.max(1, save.unlockedLevel || 1), LEVEL_COUNT);
    currentLevel = lvl;
    const words = LEVELS[lvl - 1] || [];
    const items = words.map((w, idx) => enrichItem(w, lvl - 1, idx));
    const now = Date.now();
    const due = [];
    const neu = [];
    const rest = [];
    for (const it of items) {
      const p = getProg(it.key);
      if (isNewCard(p)) neu.push(it);
      else if (isDue(p, now)) due.push(it);
      else rest.push(it);
    }
    const budget = Practice.newWordBudget({
      beginner: Practice.isBeginner(countSeenCards()),
      dueCount: due.length,
      mode: "spelling",
      newAvailable: neu.length,
    });
    const q = due.slice();
    q.push(...neu.slice(0, budget));
    const batch = q.length ? q : (rest.length ? rest.slice(0, Practice.BEGINNER_NEW) : items.slice(0, Practice.BEGINNER_NEW));
    if (!batch.length) {
      showQueueEmpty("这一组还没有可以拼写的词。");
      return;
    }
    hideQueueEmpty();
    startQueueSession("spelling", batch);
  }

  function startQueueSession(kind, items) {
    playGen += 1;
    levelClearing = false;
    sessionStarter = false;
    hidePlacementNote();
    sessionKind = kind;
    sessionDirection = kind === "spelling" ? "spelling" : "form";
    sessionMode = "study";
    sessionWrongs = [];
    sessionStartedClear = true;
    queue = items.slice();
    requeueSoon.length = 0;
    stepCounter = 0;
    sessionSeen = 0;
    sessionTarget = Math.max(queue.length, 1);
    firstCardOfSession = true;
    killStreak = 0;
    pendingRate = false;
    challengeFailed = false;
    hideKillBanner();
    stopChallenge();
    const choices = $("choices");
    if (choices) {
      choices.hidden = true;
      choices.innerHTML = "";
    }
    hideQueueEmpty();
    showScreen("play");
    const playLevel = $("play-level");
    const modeLabel = queueModeLabel(kind);
    if (playLevel) playLevel.textContent = modeLabel;
    const progressLabel = $("set-progress-label");
    if (progressLabel) progressLabel.textContent = modeLabel;
    refreshHud();
    nextCard();
  }

  function currentNeedsPlacement() {
    return Placement.needsPlacement({
      signedIn: placementSignedIn(),
      trackId: currentTrack,
      cards: save.cards,
      unlockedLevel: save.unlockedLevel,
      placement: save.placement,
    });
  }

  function placementSignedIn() {
    if (signedIn()) return true;
    try {
      if (window.__QM_EXPECT_SESSION) return true;
    } catch (_) {}
    return !!(document.documentElement && document.documentElement.classList.contains("session-ok"));
  }

  function startPlacement() {
    const probes = Placement.probeItems(LEVELS, Placement.ITEM_COUNT);
    if (!probes.length) {
      showScreen("home");
      return;
    }
    playGen += 1;
    levelClearing = false;
    sessionKind = "placement";
    sessionStarter = false;
    sessionDirection = "meaning";
    sessionMode = "study";
    sessionWrongs = [];
    sessionStartedClear = true;
    placementTally = { correct: 0, total: 0, planned: probes.length };
    queue = probes.map((item) => ({
      key: "placement:" + item.levelIdx + ":" + item.word,
      word: item.word,
      meaning_zh: item.meaning_zh,
      example_en: item.example_en || "",
      example_zh: item.example_zh || "",
      pos: item.pos || "",
      levelIdx: item.levelIdx,
    }));
    requeueSoon.length = 0;
    stepCounter = 0;
    sessionSeen = 0;
    sessionTarget = queue.length;
    firstCardOfSession = true;
    killStreak = 0;
    pendingRate = false;
    challengeFailed = false;
    currentCard = null;
    hideKillBanner();
    stopChallenge();
    const choices = $("choices");
    if (choices) {
      choices.hidden = true;
      choices.innerHTML = "";
    }
    const fb = $("feedback");
    if (fb) {
      fb.innerHTML = "";
      fb.className = "";
    }
    showScreen("play");
    const progressLabel = $("set-progress-label");
    if (progressLabel) progressLabel.textContent = "摸底";
    refreshHud();
    nextCard();
  }

  function finishPlacement() {
    stopChallenge();
    pendingRate = false;
    awaiting = true;
    sessionStarter = false;
    hidePlacementNote();
    const total = placementTally.planned || placementTally.total || Placement.ITEM_COUNT;
    const correct = Math.max(0, Math.min(total, placementTally.correct || 0));
    const setNum = Placement.startingSet(correct, total, LEVEL_COUNT);
    if (setNum > (save.unlockedLevel || 1)) {
      save.unlockedLevel = setNum;
      if (!save.trackUnlock || typeof save.trackUnlock !== "object") save.trackUnlock = {};
      save.trackUnlock[currentTrack] = save.unlockedLevel;
    }
    const titled = setTitle(setNum);
    save.placement = Placement.normalizePlacement(Object.assign({}, save.placement, {
      [currentTrack]: {
        done: true,
        correct: correct,
        total: total,
        set: setNum,
        at: new Date().toISOString(),
      },
    }));
    persist();
    resetClearActions();
    const nextBtn = $("btn-next-level");
    if (nextBtn) nextBtn.hidden = true;
    const enter = $("btn-placement-enter");
    if (enter) {
      enter.hidden = false;
      enter.textContent = Placement.ENTER_LABEL;
      enter.dataset.set = String(setNum);
    }
    const trophy = $("clear-trophy");
    if (trophy) trophy.hidden = true;
    const achEl = $("clear-achievement");
    if (achEl) {
      achEl.hidden = true;
      achEl.textContent = "";
    }
    const starEl = $("clear-stars");
    if (starEl) starEl.innerHTML = "";
    const clearScreen = $("screen-clear");
    if (clearScreen) clearScreen.classList.remove("challenge-win");
    const title = $("clear-title");
    if (title) title.textContent = Placement.RESULT_TITLE;
    const msg = $("clear-msg");
    if (msg) {
      msg.textContent = Placement.resultMessage({
        correct: correct,
        total: total,
        set: setNum,
        setTitle: titled,
      });
    }
    const home = $("btn-clear-home");
    if (home) {
      home.classList.remove("secondary");
      home.classList.add("ghost");
    }
    showScreen("clear");
    if (enter && typeof enter.focus === "function") enter.focus();
  }

  function enterStarterSet() {
    const btn = $("btn-placement-enter");
    const n = btn ? parseInt(btn.dataset.set, 10) : save.unlockedLevel;
    if (btn) btn.hidden = true;
    const home = $("btn-clear-home");
    if (home) {
      home.classList.add("secondary");
      home.classList.remove("ghost");
    }
    const setNum = Math.min(Math.max(1, n || save.unlockedLevel || 1), LEVEL_COUNT || 1);
    startLevel(setNum, { starter: true });
  }

  function finishQueueSession() {
    if (sessionKind === "placement") {
      finishPlacement();
      return;
    }
    stopChallenge();
    pendingRate = false;
    awaiting = true;
    const kind = sessionKind;
    const trophy = $("clear-trophy");
    if (trophy) trophy.hidden = true;
    const achEl = $("clear-achievement");
    if (achEl) {
      achEl.hidden = true;
      achEl.textContent = "";
    }
    const starEl = $("clear-stars");
    if (starEl) starEl.innerHTML = "";
    const clearScreen = $("screen-clear");
    if (clearScreen) clearScreen.classList.remove("challenge-win");
    const nextBtn = $("btn-next-level");
    if (nextBtn) nextBtn.hidden = true;
    resetClearActions();
    const title = $("clear-title");
    const msg = $("clear-msg");
    if (kind === "must") {
      const left = mustRemainingCount();
      const plan = HL.clearNextActions({
        kind: "must",
        unlockedLevel: save.unlockedLevel,
        levelCount: LEVEL_COUNT,
        left: left,
      });
      if (title) title.textContent = plan.title;
      if (msg) msg.textContent = plan.message;
      showMustClearActions(plan);
    } else if (kind === "due") {
      if (title) title.textContent = "今日到期练完了";
      if (msg) msg.textContent = "这批到期的词都见过了。还没到时间的，会按记忆曲线再出现。";
    } else if (kind === "spelling") {
      if (title) title.textContent = "这轮拼写练完了";
      if (msg) msg.textContent = "拼写单独记，不改变本组通关。";
    } else {
      const left = wrongBookQueueItems().length;
      if (title) title.textContent = left ? "这轮错词练完了" : "错词本清空了";
      if (msg) msg.textContent = left
        ? ("错词本还剩 " + left + " 个。同一个词在错词本里连续答对两次，就会毕业离开。")
        : "这些词都在错词本里连续答对了两次，已经毕业离开。";
    }
    showScreen("clear");
  }

  function enterExam(id) {
    try {
      switchTrack(id);
    } finally {
      if (currentNeedsPlacement()) startPlacement();
      else showScreen("home");
    }
  }
  if ($("btn-gate-zhongkao")) $("btn-gate-zhongkao").addEventListener("click", () => enterExam("zhongkao"));
  if ($("btn-gate-gaokao")) $("btn-gate-gaokao").addEventListener("click", () => enterExam("gaokao"));
  if ($("btn-back-gate")) $("btn-back-gate").addEventListener("click", () => showScreen("gate"));

  $("btn-continue").addEventListener("click", () => startFrontierLevel());
  if ($("btn-challenge")) $("btn-challenge").addEventListener("click", () => {
    const lvl = Math.min(Math.max(1, save.unlockedLevel || 1), LEVEL_COUNT);
    hideQueueEmpty();
    startLevel(lvl, { mode: "challenge" });
  });
  if ($("btn-spelling")) $("btn-spelling").addEventListener("click", () => startSpellingSession());
  if ($("btn-must-practice")) $("btn-must-practice").addEventListener("click", () => startMustPractice());
  if ($("btn-must-remind")) $("btn-must-remind").addEventListener("click", () => startMustPractice());
  if ($("btn-must-start")) $("btn-must-start").addEventListener("click", () => startMustPractice());
  if ($("btn-must-later")) $("btn-must-later").addEventListener("click", () => laterMustPractice());
  if ($("home-loop")) $("home-loop").addEventListener("click", () => {
    const action = $("home-loop").getAttribute("data-action");
    if (action === "must") startMustPractice();
    else if (action === "continue") startFrontierLevel();
  });
  if ($("btn-clear-continue")) $("btn-clear-continue").addEventListener("click", () => startFrontierLevel());
  if ($("btn-placement-enter")) $("btn-placement-enter").addEventListener("click", () => enterStarterSet());
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
      try { localStorage.removeItem(PR.STORAGE_KEY); } catch (_) {}
      practiceReminderHeld = false;
      if (window.QuizMarioLearnerEvents && typeof window.QuizMarioLearnerEvents.clear === "function") {
        window.QuizMarioLearnerEvents.clear();
      }
      save = loadSave();
      sortMode = "default";
      voiceOn = true;
      currentLevel = 1;
      applyTrack("core", true);
      killStreak = 0;
      pendingRate = false;
      refreshHud();
      refreshHomeQueues();
      alert("Progress cleared.");
    }
  });
  $("btn-quit").addEventListener("click", () => {
    playGen += 1;
    stopChallenge();
    challengeFailed = false;
    sessionStarter = false;
    hidePlacementNote();
    showScreen("home");
    renderStats();
    refreshHud();
  });
  if ($("btn-fail-retry")) $("btn-fail-retry").addEventListener("click", () => {
    challengeFailed = false;
    startLevel(currentLevel, { mode: "challenge" });
  });
  if ($("btn-fail-home")) $("btn-fail-home").addEventListener("click", () => {
    playGen += 1;
    challengeFailed = false;
    stopChallenge();
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
    const cont = $("btn-feedback-continue");
    if (cont && e.key === "Enter") {
      e.preventDefault();
      cont.click();
      return;
    }
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
  sortMode = publicSortMode(save.sortMode);
  save.sortMode = sortMode;
  refreshHud();
  // Drop a leftover 只练到期 flag without touching updatedAt, so sync order stays intact.
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored && Object.prototype.hasOwnProperty.call(stored, "dueOnly")) {
      delete stored.dueOnly;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
  } catch (_) {}
  initV6Ui();
  showScreen("gate");
})();
