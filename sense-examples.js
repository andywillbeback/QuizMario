/* A few extra examples for senses students mix up.
 * Loaded before game.js. Also require()-able from node tests.
 *
 * The bank sentence stays as it is. These are additional, sense-checked
 * lines shown after an answer. They are not a rewrite of words.js or
 * exam-tracks.js. Only homograph senses whose existing sentence covers one
 * reading of the gloss (or says 老师 for Miss) get a new line.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioSenseExamples = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var EXTRAS = {
    "may": [
      {
        example_en: "She may know the answer, but she is not sure.",
        example_zh: "她也许知道答案，但她不确定。",
      },
    ],
    "may:month": [
      {
        example_en: "We plant trees at school in early May.",
        example_zh: "我们五月初在学校种树。",
      },
    ],
    "miss:verb": [
      {
        example_en: "Hurry up, or we will miss the school bus.",
        example_zh: "快点，不然我们会错过校车。",
      },
    ],
    "miss:title": [
      {
        example_en: "Good morning, Miss Wang.",
        example_zh: "王小姐，早上好。",
      },
    ],
    "march": [
      {
        example_en: "The class will march in the school parade on Friday.",
        example_zh: "星期五这个班会参加学校的游行。",
      },
    ],
    "china:ware": [
      {
        example_en: "Be careful with that thin china bowl.",
        example_zh: "小心那只很薄的瓷碗。",
      },
    ],
  };

  function senseApi() {
    if (typeof module !== "undefined" && module.exports) {
      try { return require("./sense-id"); } catch (_) {}
    }
    return typeof globalThis !== "undefined" ? globalThis.QuizMarioSense : null;
  }

  function extrasFor(word) {
    var api = senseApi();
    var id = api && typeof api.senseId === "function" ? api.senseId(word) : String(word || "").trim().toLowerCase();
    var rows = EXTRAS[id];
    return rows ? rows.slice() : [];
  }

  function extrasById(id) {
    var rows = EXTRAS[id];
    return rows ? rows.slice() : [];
  }

  return {
    EXTRAS: EXTRAS,
    extrasFor: extrasFor,
    extrasById: extrasById,
  };
});
