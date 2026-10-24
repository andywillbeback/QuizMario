/* Shared Supabase browser client. No-op until config.js has real values. */
(function () {
  "use strict";

  var cached = null;

  function config() {
    return window.QUIZMARIO_CONFIG || {};
  }

  function isConfigured() {
    var merge = window.QuizMarioMerge;
    if (!merge || typeof merge.isCloudConfigured !== "function") return false;
    return merge.isCloudConfigured(config());
  }

  function siteUrl() {
    var raw = String(config().SITE_URL || "https://andywillbeback.github.io/QuizMario/").trim();
    return raw.replace(/\/+$/, "") + "/";
  }

  function client() {
    if (cached) return cached;
    if (!isConfigured()) return null;
    var lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") return null;
    var cfg = config();
    cached = lib.createClient(
      String(cfg.SUPABASE_URL).trim().replace(/\/+$/, ""),
      String(cfg.SUPABASE_ANON_KEY).trim(),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "quizmario-auth",
        },
      }
    );
    return cached;
  }

  window.QuizMarioCloudClient = {
    config: config,
    isConfigured: isConfigured,
    siteUrl: siteUrl,
    client: client,
  };
})();
