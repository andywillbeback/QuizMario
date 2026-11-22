/* Recorded streak audio must stay cancelled when a word takes over playback. */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../grok/game.js"), "utf8");

function between(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, "recorded voice functions remain available");
  return source.slice(from, to);
}

const functions = between("function stopCustomVo()", "function extractVoPhrases(") +
  between("function playCustomPhrases(", "function speakLine(");

function harness() {
  const played = [];
  const clips = new Map();
  class Audio {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      this.onended = null;
      this.onerror = null;
      clips.set(src, this);
    }
    play() {
      played.push(this.src);
      return new Promise((resolve, reject) => {
        this.pending = { resolve, reject };
      });
    }
    pause() {
      // Browsers can reject play() after pause() aborts its pending start.
      if (this.pending) {
        this.pending.reject(new Error("AbortError: playback was paused"));
        this.pending = null;
      }
    }
    started() {
      this.pending.resolve();
      this.pending = null;
    }
  }
  const context = { Audio };
  vm.runInNewContext(`
    let voGeneration = 0;
    let voPlaying = [];
    const voCache = {};
    const CUSTOM_VO = { first: "first", second: "second", fresh: "fresh" };
    function cancelSpeech() {}
    ${functions}
    this.voice = {
      play: playCustomPhrases,
      stop: stopCustomVo,
      active: () => voPlaying.map(a => a.src)
    };
  `, context, { filename: "grok/game.js:recorded-voice" });
  return {
    ...context.voice,
    active: () => Array.from(context.voice.active()),
    played,
    clips,
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

(async function () {
  {
    const voice = harness();
    assert.equal(voice.play(["first", "second"]), true);
    const first = voice.clips.get("first");
    const lateEnd = first.onended;
    const lateError = first.onerror;
    voice.stop();
    await settle();
    lateEnd();
    lateError();
    assert.deepEqual(voice.played, ["first"], "a cancelled play rejection or late event must not start the next clip");
    assert.deepEqual(voice.active(), [], "cancelled playback must remain empty");
  }

  for (const oldQueue of [["first"], ["first", "second"]]) {
    const voice = harness();
    voice.play(oldQueue);
    const first = voice.clips.get("first");
    const lateEnd = first.onended;
    const lateError = first.onerror;
    // A new queue cancels the old one while its play() promise is pending.
    voice.play(["fresh"]);
    await settle();
    lateEnd();
    lateError();
    assert.deepEqual(voice.played, ["first", "fresh"], "old callbacks must not resume an obsolete queue");
    assert.deepEqual(voice.active(), ["fresh"], "old completion must not clear the newer queue");
  }

  {
    const voice = harness();
    voice.play(["first", "second"]);
    const first = voice.clips.get("first");
    first.started();
    await settle();
    first.onended();
    assert.deepEqual(voice.played, ["first", "second"], "an uncancelled queue still advances normally");
    assert.deepEqual(voice.active(), ["second"]);
    const second = voice.clips.get("second");
    second.started();
    await settle();
    second.onended();
    assert.deepEqual(voice.active(), [], "normal completion releases the last clip");
  }

  console.log("word-autoplay-cancellation ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
