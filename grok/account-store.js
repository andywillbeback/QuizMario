/* Account-scoped local data. A cached auth id selects a cache, never grants access.
 * Unowned legacy progress is preserved at its old key and is never auto-assigned.
 */
(function (root, factory) {
  var create = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = create;
  if (root && root.document) root.QuizMarioAccountStore = create(root.localStorage);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return function (storage) {
    var verifiedOwner = null;
    function hint() {
      try { var s = JSON.parse(storage.getItem('quizmario-auth') || 'null'); return s && s.user && String(s.user.id || '') || ''; }
      catch (_) { return ''; }
    }
    function owner() { return verifiedOwner === null ? hint() : verifiedOwner; }
    function key(base, id) { return base + ':account:' + encodeURIComponent(id === undefined ? owner() : String(id || 'unassigned')); }
    return {
      owner: owner,
      activate: function (id) { verifiedOwner = String(id || ''); return verifiedOwner; },
      key: key,
      get: function (base, id) { return storage.getItem(key(base, id)); },
      set: function (base, value, id) { storage.setItem(key(base, id), String(value)); },
      remove: function (base, id) { storage.removeItem(key(base, id)); },
      keys: function (base, id) {
        var prefix = key(base, id) + ':', out = [];
        for (var i = 0; i < storage.length; i++) { var k = storage.key(i); if (k && k.indexOf(prefix) === 0) out.push(k); }
        return out.sort();
      },
      raw: storage,
    };
  };
});
