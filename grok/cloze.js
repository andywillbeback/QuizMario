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

  /** Speakable cloze: the answer token becomes the word "blank", not the spelling. */
  function speechBlank(example, word) {
    return blankExample(example, word).replace(/___+/g, "blank");
  }

  /**
   * During-card speech. Meaning (and challenge, which is meaning) may speak the
   * English prompt. Spelling and other ZH→EN modes must not speak the answer
   * word; the example is spoken only after the answer token is blanked.
   */
  function cardSpeechPlan(card, direction) {
    card = card || {};
    var meaning = direction === "meaning";
    var word = card.word || "";
    var example = card.example_en || "";
    var plan = {
      autoSpeakWord: !!(meaning && word),
      showWord: !!(meaning && word),
      exampleSay: "",
    };
    if (!example || isPlaceholderExample(example)) return plan;
    if (meaning) {
      plan.exampleSay = example;
      return plan;
    }
    if (containsToken(example, word)) {
      var spoken = speechBlank(example, word);
      if (!containsToken(spoken, word)) plan.exampleSay = spoken;
      return plan;
    }
    plan.exampleSay = example;
    return plan;
  }

  return {
    blankExample: blankExample,
    isPlaceholderExample: isPlaceholderExample,
    containsToken: containsToken,
    speechBlank: speechBlank,
    cardSpeechPlan: cardSpeechPlan,
  };
});
