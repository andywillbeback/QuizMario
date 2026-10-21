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

  return { blankExample: blankExample };
});
