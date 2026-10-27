/* Teaching-voice ranking, playback, and cancellation.
 * Run: node tests/pronunciation.test.js
 *
 * Browser speech only. No cloud resolver and no streak-clip playback.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const speech = require(path.join(root, "grok/pronunciation.js"));

const src = fs.readFileSync(path.join(root, "grok/pronunciation.js"), "utf8");

function voice(name, lang, extra) {
  return Object.assign({
    name: name,
    lang: lang,
    voiceURI: name + "-" + lang,
    localService: true,
    default: false,
  }, extra || {});
}

function makeClock() {
  let seq = 1;
  const items = [];
  return {
    setTimeout(fn, ms) {
      const id = seq++;
      items.push({ id: id, ms: ms || 0, fn: fn, dead: false });
      return id;
    },
    clearTimeout(id) {
      const item = items.find(function (t) { return t.id === id; });
      if (item) item.dead = true;
    },
    flush(ms) {
      let budget = ms == null ? Infinity : ms;
      let guard = 0;
      while (guard++ < 10000) {
        const live = items.filter(function (t) { return !t.dead; });
        if (!live.length) return;
        const step = Math.min.apply(null, live.map(function (t) { return t.ms; }));
        if (budget !== Infinity && step > budget) {
          live.forEach(function (t) { t.ms -= budget; });
          return;
        }
        if (budget !== Infinity) budget -= step;
        const due = [];
        items.forEach(function (t) {
          if (t.dead) return;
          t.ms -= step;
          if (t.ms <= 0) due.push(t);
        });
        due.forEach(function (t) { t.dead = true; });
        due.forEach(function (t) { t.fn(); });
        if (budget !== Infinity && budget <= 0 && !items.some(function (t) { return !t.dead && t.ms <= 0; })) return;
      }
      throw new Error("timer loop");
    },
  };
}

function Utterance(text) {
  this.text = text;
  this.lang = "";
  this.rate = 1;
  this.pitch = 1;
  this.volume = 1;
  this.voice = null;
  this.onstart = null;
  this.onend = null;
  this.onerror = null;
}

function makeSynth(voices) {
  const listeners = [];
  const synth = {
    speaking: false,
    pending: false,
    paused: false,
    cancelled: 0,
    resumed: 0,
    spoken: [],
    inCancel: false,
    voices: voices || [],
    getVoices() {
      if (synth.reenter) {
        synth.reenter -= 1;
        synth.emit("voiceschanged");
      }
      return synth.voices;
    },
    speak(u) {
      if (synth.inCancel) throw new Error("speak during cancel");
      if (synth.failSpeak) {
        synth.failSpeak = false;
        throw new Error("speak failed");
      }
      synth.spoken.push(u);
      synth.speaking = true;
      synth.pending = false;
    },
    cancel() {
      synth.inCancel = true;
      synth.cancelled += 1;
      synth.speaking = false;
      synth.pending = false;
      synth.inCancel = false;
    },
    resume() { synth.resumed += 1; synth.paused = false; },
    addEventListener(name, fn) {
      if (name === "voiceschanged") listeners.push(fn);
    },
    removeEventListener(name, fn) {
      if (name !== "voiceschanged") return;
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    emit(name) {
      if (name !== "voiceschanged") return;
      listeners.slice().forEach(function (fn) { fn(); });
    },
  };
  return synth;
}

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    data: data,
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
  };
}

function mount(voices, extra) {
  const clock = makeClock();
  const synth = makeSynth(voices);
  const storage = memoryStorage(extra && extra.stored);
  const host = {
    addEventListener(name, fn) { host.handlers[name] = fn; },
    removeEventListener(name) { delete host.handlers[name]; },
    handlers: {},
  };
  const ctrl = speech.create(Object.assign({
    speechSynthesis: extra && Object.prototype.hasOwnProperty.call(extra, "speechSynthesis") ? extra.speechSynthesis : synth,
    Utterance: extra && Object.prototype.hasOwnProperty.call(extra, "Utterance") ? extra.Utterance : Utterance,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    storage: extra && Object.prototype.hasOwnProperty.call(extra, "storage") ? extra.storage : storage,
    window: host,
    isEnabled: extra && extra.isEnabled,
    onBeforeSpeak: extra && extra.onBeforeSpeak,
  }, {}));
  return { clock: clock, synth: synth, storage: storage, host: host, ctrl: ctrl };
}

const daniel = voice("Daniel", "en-GB");
const danielPlus = voice("Daniel (Enhanced)", "en-GB");
const googleUk = voice("Google UK English Female", "en-GB", { localService: false });
const googleUs = voice("Google US English", "en-US", { localService: false });
const samantha = voice("Samantha", "en-US");
const samanthaPlus = voice("Samantha (Enhanced)", "en-US");
const grandma = voice("Grandma", "en-GB");
const fred = voice("Fred", "en-GB");
const eddy = voice("Eddy", "en-GB");
const aria = voice("Microsoft Aria Online (Natural) - English (United Kingdom)", "en-GB");
const compactSam = voice("Samantha (Compact)", "en-GB");

{
  assert.strictEqual(speech.WORD_RATE, 0.88);
  assert.strictEqual(speech.EXAMPLE_RATE, 0.82);
  assert.strictEqual(speech.SLOW_RATE, 0.72);
  assert.ok(speech.WORD_RATE < 0.9 && speech.EXAMPLE_RATE < speech.WORD_RATE && speech.SLOW_RATE < speech.EXAMPLE_RATE);
  assert.strictEqual(speech.STORAGE_KEY, "qm_pronunciation_v1");
  assert.ok(!/resolveAudio|polly|speech\.googleapis|Cambridge|\bHD\b|\.m4a/i.test(src), "helper stays on browser speech");
  assert.ok(!src.includes("vocabSpotlight"), "pronunciation prefs are not the learning save");
}

{
  const picked = speech.selectVoice([daniel, danielPlus, googleUk, fred], "en-GB");
  assert.strictEqual(picked, danielPlus, "enhanced British teaching voice beats plain Daniel and Google");
  const google = speech.selectVoice([daniel, googleUk, grandma, fred], "en-GB");
  assert.strictEqual(google, googleUk, "Google UK English beats a plain teaching voice and legacy voices");
  const natural = speech.selectVoice([daniel, googleUk, aria], "en-GB");
  assert.strictEqual(natural, aria, "an explicit Natural voice outranks Google and plain Daniel");
  const clearUs = speech.selectVoice([grandma, fred, samanthaPlus], "en-GB");
  assert.strictEqual(clearUs, samanthaPlus, "a legacy British voice loses to a clearer American voice");
  const onlyNovelty = speech.selectVoice([fred, voice("Bad News", "en-US")], "en-GB");
  assert.strictEqual(onlyNovelty, null);
  const us = speech.selectVoice([daniel, samantha, googleUs], "en-US");
  assert.strictEqual(us, googleUs, "American accent prefers Google US English over British Daniel");
  const first = speech.selectVoice([
    voice("Google UK English Female", "en-GB"),
    voice("Google UK English Male", "en-GB"),
  ], "en-GB");
  assert.strictEqual(first.name, "Google UK English Female", "equal scores keep list order");
  const regional = speech.selectVoice([
    voice("English United Kingdom", "en-GB-x-rpb"),
    samantha,
  ], "en-GB");
  assert.strictEqual(regional.name, "English United Kingdom");
  const pinned = speech.selectVoice([googleUk, eddy], "en-GB", speech.voiceId(eddy));
  assert.strictEqual(pinned, eddy, "an explicit learner voice is honored");
  const compact = speech.selectVoice([compactSam, daniel], "en-GB");
  assert.strictEqual(compact, daniel, "compact loses to a normal teaching voice");
  assert.strictEqual(speech.describeVoice(danielPlus).quality, "enhanced");
  assert.strictEqual(speech.describeVoice(googleUk).quality, "standard");
  assert.strictEqual(speech.describeVoice(googleUk).localService, false);
  assert.strictEqual(speech.selectVoice([voice("Ting-Ting", "zh-CN"), fred], "en-GB"), null);
}

{
  const rig = mount([daniel, googleUk]);
  assert.strictEqual(rig.ctrl.getState().accent, "en-GB");
  assert.strictEqual(rig.ctrl.getState().selectedVoice.name, "Google UK English Female");
  assert.strictEqual(rig.ctrl.speak("  apple \n"), true);
  assert.strictEqual(rig.synth.spoken.length, 1);
  const u = rig.synth.spoken[0];
  assert.strictEqual(u.text, "apple");
  assert.strictEqual(u.voice, googleUk);
  assert.strictEqual(u.lang, "en-GB");
  assert.strictEqual(u.rate, speech.WORD_RATE);
  assert.strictEqual(u.pitch, 1);
  assert.strictEqual(u.volume, 1);
  assert.strictEqual(rig.ctrl.speak("apple"), true, "a second tap does not restart the same word");
  assert.strictEqual(rig.synth.spoken.length, 1);
  assert.strictEqual(rig.synth.cancelled, 0);
  u.onstart();
  u.onend();
  rig.synth.speaking = false;
  assert.strictEqual(rig.ctrl.getState().status, "ready");
  assert.strictEqual(rig.ctrl.speak("apple"), true);
  assert.strictEqual(rig.synth.spoken.length, 2, "replay after the word finishes");
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel, googleUk]);
  assert.strictEqual(rig.ctrl.speak("She ate an apple.", { example: true }), true);
  assert.strictEqual(rig.synth.spoken[0].rate, speech.EXAMPLE_RATE);
  rig.synth.spoken[0].onstart();
  rig.synth.spoken[0].onend();
  rig.synth.speaking = false;
  assert.strictEqual(rig.ctrl.speak("She ate an apple.", { example: true, slow: true }), true);
  assert.strictEqual(rig.synth.cancelled, 0, "slow starts after the line has finished");
  assert.strictEqual(rig.synth.spoken[1].rate, speech.SLOW_RATE);
  assert.strictEqual(rig.ctrl.replay(), true, "same slow line does not clip itself");
  assert.strictEqual(rig.synth.spoken.length, 2);
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel, googleUk]);
  rig.ctrl.speak("apple");
  const first = rig.synth.spoken[0];
  const onError = first.onerror;
  assert.strictEqual(rig.ctrl.speak("berry"), true);
  assert.strictEqual(rig.synth.spoken.length, 1, "the next word waits out the cancel gap");
  assert.ok(rig.synth.cancelled >= 1);
  assert.strictEqual(first.onerror, null, "the cancelled word cannot finish the new one");
  onError({ error: "interrupted" });
  rig.clock.flush(39);
  assert.strictEqual(rig.synth.spoken.length, 1);
  rig.clock.flush(1);
  assert.strictEqual(rig.synth.spoken.length, 2);
  assert.strictEqual(rig.synth.spoken[1].text, "berry");
  assert.strictEqual(rig.synth.spoken[1].rate, speech.WORD_RATE);
  rig.ctrl.destroy();
}

{
  const rig = mount([]);
  assert.strictEqual(rig.ctrl.speak("apple"), true);
  assert.strictEqual(rig.synth.spoken.length, 0, "wait for the voice list before speaking");
  rig.synth.voices = [daniel];
  rig.synth.emit("voiceschanged");
  assert.strictEqual(rig.synth.spoken.length, 1);
  assert.strictEqual(rig.synth.spoken[0].voice, daniel);
  rig.ctrl.destroy();
}

{
  const rig = mount([]);
  rig.ctrl.speak("apple");
  rig.clock.flush(700);
  assert.strictEqual(rig.synth.spoken.length, 1);
  assert.strictEqual(rig.synth.spoken[0].voice, null);
  assert.strictEqual(rig.synth.spoken[0].lang, "en-GB");
  rig.synth.speaking = false;
  rig.ctrl.speak("berry");
  rig.clock.flush(40);
  assert.strictEqual(rig.synth.spoken.length, 2, "a later word does not wait for voices again");
  assert.strictEqual(rig.synth.spoken[1].text, "berry");
  rig.ctrl.destroy();
}

{
  const rig = mount([googleUk, daniel]);
  rig.ctrl.speak("apple");
  const first = rig.synth.spoken[0];
  assert.strictEqual(first.voice, googleUk);
  first.onerror({ error: "voice-unavailable" });
  assert.strictEqual(rig.synth.spoken.length, 1);
  rig.clock.flush(40);
  assert.strictEqual(rig.synth.spoken.length, 2);
  assert.strictEqual(rig.synth.spoken[1].voice, daniel, "a failed voice is skipped once");
  rig.synth.spoken[1].onerror({ error: "synthesis-failed" });
  rig.clock.flush(40);
  assert.strictEqual(rig.synth.spoken.length, 2, "only one retry");
  assert.strictEqual(rig.ctrl.getState().status, "error");
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel]);
  rig.ctrl.speak("apple");
  const u = rig.synth.spoken[0];
  u.onstart();
  u.onerror({ error: "synthesis-failed" });
  rig.clock.flush(40);
  assert.strictEqual(rig.synth.spoken.length, 1, "no retry after audible speech started");
  rig.ctrl.destroy();
}

{
  const calls = [];
  const rig = mount([daniel], { onBeforeSpeak: function () { calls.push("before"); } });
  rig.synth.speaking = true;
  rig.ctrl.speak("apple");
  assert.deepStrictEqual(calls, ["before"]);
  assert.ok(rig.synth.cancelled >= 1, "an outside utterance is cancelled for the word");
  assert.strictEqual(rig.synth.spoken.length, 0);
  rig.clock.flush(40);
  assert.strictEqual(rig.synth.spoken.length, 1);
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel]);
  rig.synth.paused = true;
  rig.ctrl.speak("apple");
  assert.strictEqual(rig.synth.resumed, 1);
  assert.strictEqual(rig.synth.spoken.length, 1);
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel]);
  rig.synth.failSpeak = true;
  assert.doesNotThrow(function () { rig.ctrl.speak("apple"); });
  rig.clock.flush(40);
  assert.ok(rig.synth.spoken.length >= 1 || rig.ctrl.getState().status === "error");
  rig.ctrl.destroy();
}

{
  let on = false;
  const rig = mount([daniel], { isEnabled: function () { return on; } });
  assert.strictEqual(rig.ctrl.speak("apple"), false);
  assert.strictEqual(rig.synth.spoken.length, 0);
  on = true;
  assert.strictEqual(rig.ctrl.speak("apple"), true);
  assert.strictEqual(rig.synth.spoken.length, 1);
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel, samantha]);
  assert.strictEqual(rig.ctrl.setAccent("en-AU"), false);
  assert.strictEqual(rig.ctrl.getState().accent, "en-GB");
  assert.strictEqual(rig.ctrl.setAccent("en-US"), true);
  assert.strictEqual(rig.ctrl.getState().accent, "en-US");
  assert.strictEqual(rig.ctrl.getState().selectedVoice.name, "Samantha");
  const saved = JSON.parse(rig.storage.data[speech.STORAGE_KEY]);
  assert.strictEqual(saved.accent, "en-US");
  assert.strictEqual(saved.voiceId, "");
  rig.ctrl.speak("color");
  assert.strictEqual(rig.synth.spoken[0].voice, samantha);
  rig.ctrl.destroy();
}

{
  const rig = mount([googleUk, eddy]);
  assert.strictEqual(rig.ctrl.setVoice(speech.voiceId(eddy)), true);
  assert.strictEqual(rig.ctrl.getState().selectedVoice.name, "Eddy");
  assert.strictEqual(rig.ctrl.setVoice("missing"), false);
  assert.strictEqual(rig.ctrl.getState().selectedVoice.name, "Eddy");
  assert.strictEqual(rig.ctrl.setVoice(""), true);
  assert.strictEqual(rig.ctrl.getState().selectedVoice.name, "Google UK English Female");
  rig.ctrl.destroy();
}

{
  const stored = {};
  stored[speech.STORAGE_KEY] = JSON.stringify({ accent: "en-US", voiceId: speech.voiceId(samantha) });
  const rig = mount([daniel, samantha], { stored: stored });
  assert.strictEqual(rig.ctrl.getState().accent, "en-US");
  assert.strictEqual(rig.ctrl.getState().selectedVoice.name, "Samantha");
  rig.ctrl.destroy();
}

{
  const bad = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  const rig = mount([daniel], { storage: bad });
  assert.doesNotThrow(function () { rig.ctrl.setAccent("en-US"); });
  assert.strictEqual(rig.ctrl.getState().accent, "en-US");
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel]);
  rig.synth.reenter = 6;
  assert.doesNotThrow(function () { rig.synth.emit("voiceschanged"); });
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel]);
  rig.ctrl.speak("apple");
  const start = rig.synth.spoken[0].onstart;
  rig.clock.flush(6000);
  assert.strictEqual(rig.ctrl.getState().status, "error");
  assert.ok(rig.synth.cancelled >= 1, "a utterance that never starts is cancelled");
  assert.doesNotThrow(function () { start(); });
  assert.strictEqual(rig.ctrl.getState().status, "error");
  rig.ctrl.destroy();
}

{
  const rig = mount([daniel]);
  rig.ctrl.speak("apple");
  rig.ctrl.speak("berry");
  const cancels = rig.synth.cancelled;
  assert.strictEqual(rig.synth.spoken.length, 1);
  rig.ctrl.stop({ cancelSpeech: false });
  assert.strictEqual(rig.synth.cancelled, cancels, "streak playback owns the speech cancel");
  rig.clock.flush(80);
  assert.strictEqual(rig.synth.spoken.length, 1, "stop drops the queued word");
  assert.strictEqual(rig.synth.spoken[0].text, "apple");
  rig.ctrl.destroy();
}

{
  const clock = makeClock();
  const synth = makeSynth([daniel]);
  const ctrl = speech.create({
    speechSynthesis: synth,
    Utterance: Utterance,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    storage: memoryStorage(),
  });
  assert.strictEqual(ctrl.speak("apple"), true);
  assert.strictEqual(synth.spoken[0].text, "apple");
  assert.strictEqual(synth.spoken[0].rate, speech.WORD_RATE);
  ctrl.destroy();
}

{
  const bare = speech.create({
    speechSynthesis: null,
    Utterance: null,
    storage: memoryStorage(),
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    window: {},
  });
  assert.strictEqual(bare.speak("apple"), false);
  assert.strictEqual(bare.getState().supported, false);
  assert.doesNotThrow(function () { bare.stop(); });
}

{
  const seen = [];
  const rig = mount([daniel]);
  const off = rig.ctrl.subscribe(function (state) { seen.push(state.accent); });
  assert.ok(seen.length >= 1);
  rig.ctrl.setAccent("en-US");
  assert.strictEqual(seen[seen.length - 1], "en-US");
  off();
  const n = seen.length;
  rig.ctrl.setAccent("en-GB");
  assert.strictEqual(seen.length, n);
  rig.host.handlers.pagehide();
  assert.strictEqual(rig.ctrl.getState().status, "ready");
  rig.ctrl.destroy();
  rig.synth.emit("voiceschanged");
}

console.log("pronunciation ok");
