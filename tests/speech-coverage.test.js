/* Grok speech coverage without Web Speech. Plans are pure; game.js is read as source. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const cloze = require(path.join(root, "grok/cloze.js"));

const game = fs.readFileSync(path.join(root, "grok/game.js"), "utf8");
const index = fs.readFileSync(path.join(root, "grok/index.html"), "utf8");

const real = {
  word: "apple",
  example_en: "She ate an apple after lunch.",
  example_zh: "她午饭后吃了一个苹果。",
};
const placeholder = {
  word: "apple",
  example_en: "I saw a apple near the school gate.",
};
const safeExample = {
  word: "apple",
  example_en: "Lunch is at noon in the dining hall.",
};

{
  const meaning = cloze.cardSpeechPlan(real, "meaning");
  assert.strictEqual(meaning.autoSpeakWord, true);
  assert.strictEqual(meaning.showWord, true);
  assert.strictEqual(meaning.exampleSay, real.example_en);
  const challenge = cloze.cardSpeechPlan(real, "meaning");
  assert.strictEqual(challenge.autoSpeakWord, true, "challenge uses the meaning prompt");
}

{
  const held = cloze.cardSpeechPlan(placeholder, "meaning");
  assert.strictEqual(held.exampleSay, "", "placeholder examples are not spoken");
  assert.strictEqual(held.showWord, true);
}

{
  for (const direction of ["spelling", "form"]) {
    const plan = cloze.cardSpeechPlan(real, direction);
    assert.strictEqual(plan.autoSpeakWord, false, direction + " must not auto-speak the answer");
    assert.strictEqual(plan.showWord, false, direction + " must not offer 读单词 before the guess");
    assert.ok(plan.exampleSay, direction + " still offers a safe example");
    assert.ok(plan.exampleSay.indexOf("blank") !== -1, plan.exampleSay);
    assert.ok(!cloze.containsToken(plan.exampleSay, "apple"), plan.exampleSay);
  }
}

{
  const open = cloze.cardSpeechPlan(safeExample, "spelling");
  assert.strictEqual(open.exampleSay, safeExample.example_en);
  assert.strictEqual(open.showWord, false);
  const empty = cloze.cardSpeechPlan({ word: "apple", example_en: "" }, "form");
  assert.strictEqual(empty.exampleSay, "");
  assert.strictEqual(empty.autoSpeakWord, false);
}

{
  assert.ok(index.includes('id="card-speak"'), "every card has a speak row");
  assert.ok(game.includes("function renderCardSpeech"));
  assert.ok(game.includes("cardSpeechPlan"));
  assert.ok(game.includes("🔊 读单词") && game.includes("🔊 读例句"));
  const fill = game.slice(game.indexOf("function fillCardContent"), game.indexOf("function stopChallenge"));
  assert.ok(fill.includes("renderCardSpeech()"), "card speech is painted with the prompt, not only after grade");
  const enter = game.slice(game.indexOf("const doEnter"), game.indexOf("if (firstCardOfSession)"));
  assert.ok(enter.includes("maybeSpeakPrompt()"), "auto-speak runs on card enter");
  assert.ok(enter.indexOf("stopTeachingSpeech()") < enter.indexOf("maybeSpeakPrompt()"), "the previous word is stopped before the next read");
  const auto = game.slice(game.indexOf("function maybeSpeakPrompt"), game.indexOf("function bumpPractice"));
  assert.ok(auto.includes('sessionDirection !== "meaning"'), "ZH→EN / spelling do not auto-speak");
  assert.ok(auto.includes("if (!voiceOn) return"), "auto-speak stays behind the streak voice toggle");
  assert.ok(auto.includes("speakTeaching(currentCard.word"), "auto-speak uses the teaching voice");
  assert.ok(!auto.includes("speakLine("), "a headword must not play a kill-streak clip");
  const speak = game.slice(game.indexOf("function speakLine"), game.indexOf("function playSting"));
  assert.ok(speak.includes("if (!voiceOn || !text) return"), "kill-streak TTS stays behind voiceOn");
  assert.ok(speak.includes("if (!opts.lexicon)"));
  assert.ok(speak.includes("if (!window.speechSynthesis) return"), "missing speechSynthesis is a no-op");
  assert.ok(speak.includes("speakUtterance(u)"), "cancel and speak stay on different turns");
  assert.ok(game.includes("stopTeachingSpeech({ cancelSpeech: false })"), "streak audio invalidates teaching speech before its own cancel");
  const say = game.slice(game.indexOf("function sayEn"), game.indexOf("function speakButtons"));
  assert.ok(say.includes('!("speechSynthesis" in window)'), "speak buttons no-op without speechSynthesis");
  assert.ok(say.includes("return false"));
  assert.ok(game.includes("function speakTeaching"), "buttons and auto-speak share the teaching helper");
  assert.ok(game.includes('speakTeaching(b.getAttribute("data-say")'), "replay buttons use the teaching voice");
  const buttons = game.slice(game.indexOf("function speakButtons"), game.indexOf("function initV6Ui"));
  assert.ok(buttons.includes("isPlaceholderExample"), "feedback 读例句 skips placeholders");
  assert.ok(buttons.includes("🔊 读单词") && buttons.includes("🔊 读例句") && buttons.includes("slowSpeakButton"));
  assert.ok(buttons.includes('data-say-kind="word"') && buttons.includes('data-say-kind="example"'));
  assert.ok(game.includes(">慢速</button>"), "slow replay is available on the speak row");
  assert.ok(game.includes("playPartClearCue") && game.includes("if (!voiceOn) return"));
  assert.ok(game.includes('speakLine("Shut down")') && game.includes("announceKillStreak"));
  assert.ok(game.includes("audio/01_first_blood.m4a") && game.includes("audio/12_shut_down.m4a"), "streak clips stay on the recorded files");
  assert.ok(index.includes('src="pronunciation.js"') && index.indexOf('src="pronunciation.js"') < index.indexOf('src="game.js"'));
  assert.ok(index.includes('id="btn-accent"') && index.includes("英音"), "British default with an American switch");
  assert.ok(!index.includes("HD") && !index.includes("Cambridge"), "the page does not promise a studio voice");
  assert.ok(!game.includes("resolveAudio") && !game.includes("speech.googleapis"), "teaching speech stays on the browser");
}

console.log("speech-coverage ok");
