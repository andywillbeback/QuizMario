/* Maps the public root doors onto the 1st edition.
 * Loaded only by the root index, login, and teacher documents.
 * It does not read or write the student session.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.QuizMarioRootDoor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DOORS = {
    "index.html": "grok/",
    "login.html": "grok/login.html",
    "teacher.html": "grok/teacher.html"
  };

  function targetPath(pathname, search, hash) {
    var path = String(pathname || "/");
    if (path.charAt(0) !== "/") path = "/" + path;
    var q = search || "";
    var h = hash || "";
    if (q && q.charAt(0) !== "?") q = "?" + q;
    if (h && h.charAt(0) !== "#") h = "#" + h;
    var endsWithSlash = path.charAt(path.length - 1) === "/";
    var segments = path.split("/").filter(Boolean);
    var last = segments.length ? segments[segments.length - 1] : "";
    var isFile = !endsWithSlash && last.indexOf(".") !== -1;
    var file = isFile ? last : "index.html";
    var dirSegments = isFile ? segments.slice(0, -1) : segments.slice();
    var parent = dirSegments.length ? dirSegments[dirSegments.length - 1] : "";
    if (parent === "grok") return null;
    var dest = DOORS[file];
    if (!dest) return null;
    var dir = "/" + dirSegments.join("/");
    if (dir !== "/") dir += "/";
    return dir + dest + q + h;
  }

  return { DOORS: DOORS, targetPath: targetPath };
});
