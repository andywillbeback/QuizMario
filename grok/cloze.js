/* Blank the target word in an example sentence.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * Mask a whole token (or a multi-word token span), never a raw substring.
 * "a" must not hit "at" or "gate". "at" must not hit "gate" or "sat".
 * Punctuation and the rest of the sentence stay as written.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioCloze = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Replace each whole-word occurrence of `word` with "___".
   * A token edge is any side that is not a letter, number, or apostrophe.
   */
  function blankExample(example, word) {
    var text = example == null ? "" : String(example);
    var target = word == null ? "" : String(word).trim();
    if (!text || !target) return text;
    var parts = target.split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (!parts.length) return text;
    var body = parts.join("\\s+");
    var re;
    try {
      re = new RegExp("(?<![\\p{L}\\p{N}'’])(?:" + body + ")(?![\\p{L}\\p{N}'’])", "giu");
    } catch (_) {
      return text;
    }
    return text.replace(re, "___");
  }

  var PLACEHOLDER_EXAMPLE = [
    /junior-high English sentence/i,
    /^Please .+ carefully during the lesson\.?$/i,
    /^I saw a .+ near the /i,
    /^Please listen .+ in class\.?$/i,
    /^It feels .+ at the /i,
    /^There is a .+ in our classroom\.?$/i,
  ];

  function isPlaceholderExample(example) {
    if (!example) return true;
    var text = String(example);
    for (var i = 0; i < PLACEHOLDER_EXAMPLE.length; i++) {
      if (PLACEHOLDER_EXAMPLE[i].test(text)) return true;
    }
    return false;
  }

  /** True when `word` is a whole token in `text`, even if blanking failed closed. */
  function containsToken(text, word) {
    var raw = text == null ? "" : String(text);
    var target = word == null ? "" : String(word).trim();
    if (!raw || !target) return false;
    if (blankExample(raw, target) !== raw) return true;
    var escaped = escapeRegExp(target);
    try {
      return new RegExp("(?:^|[^A-Za-z0-9'’])(?:" + escaped + ")(?:$|[^A-Za-z0-9'’])", "i").test(" " + raw + " ");
    } catch (_) {
      return raw.toLowerCase().indexOf(target.toLowerCase()) !== -1;
    }
  }

  /**
   * Sentence to read aloud. The headword stays audible.
   * A visual cloze ("___") is filled with the headword so TTS never says
   * the word "blank" and never spells out underscore runs.
   * On-screen hints still use blankExample.
   */
  function spokenExample(example, word) {
    var text = example == null ? "" : String(example);
    var target = word == null ? "" : String(word).trim();
    if (!text) return "";
    if (target && /_{3,}/.test(text)) text = text.replace(/_{3,}/g, target);
    return text;
  }

  /**
   * During-card speech. Meaning (and challenge, which is meaning) may auto-speak
   * the English prompt and offers 读单词 plus the full example.
   * Spelling and other ZH→EN modes hide 读单词 and 读例句 until the answer is
   * on screen (`opts.revealed`), so a tap cannot speak the headword early.
   * After reveal, 读例句 is the real sentence with the headword filled in.
   */
  function cardSpeechPlan(card, direction, opts) {
    card = card || {};
    opts = opts || {};
    var meaning = direction === "meaning";
    var revealed = !!opts.revealed;
    var word = card.word || "";
    var example = card.example_en || "";
    var plan = {
      autoSpeakWord: !!(meaning && word),
      showWord: !!((meaning || revealed) && word),
      exampleSay: "",
    };
    if (!example || isPlaceholderExample(example)) return plan;
    if (!meaning && !revealed) return plan;
    plan.exampleSay = spokenExample(example, word);
    return plan;
  }

  return {
    blankExample: blankExample,
    isPlaceholderExample: isPlaceholderExample,
    containsToken: containsToken,
    spokenExample: spokenExample,
    cardSpeechPlan: cardSpeechPlan,
  };
});
