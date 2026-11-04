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

  /* Probe only the two routes to this project before sending credentials.
     Never retry an auth POST here: a timed-out refresh may already have rotated
     its token, and replaying signup/reset requests can duplicate side effects. */
  function routeFetch(cfg) {
    var primary = String(cfg.SUPABASE_URL).trim().replace(/\/+$/, "");
    var fallback = String(cfg.SUPABASE_FALLBACK_URL || "").trim().replace(/\/+$/, "");
    var proxy = "https://quizmario-supabase-proxy.juguang-qm.workers.dev";
    var direct = "https://cmainasvlfdynidabunp.supabase.co";
    if (!((primary === proxy && fallback === direct) || (primary === direct && fallback === proxy)) || typeof window.fetch !== "function") return null;
    var nativeFetch = window.fetch.bind(window);
    var selected = "";
    var selecting = null;
    var failedUntil = {};

    function deadline(run, milliseconds, signal) {
      return new Promise(function (resolve, reject) {
        var controller = typeof window.AbortController === "function" ? new window.AbortController() : null;
        var settled = false;
        var timer;
        function finish(error, value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", cancel);
          if (error) reject(error);
          else resolve(value);
        }
        function cancel() {
          var error = new Error("Request aborted");
          error.name = "AbortError";
          finish(error);
          if (controller) controller.abort();
        }
        if (signal && signal.aborted) { cancel(); return; }
        if (signal) signal.addEventListener("abort", cancel);
        timer = setTimeout(function () {
          finish(new Error("QM_AUTH_TIMEOUT: 登录服务响应超时，请稍后重试。"));
          if (controller) controller.abort();
        }, milliseconds);
        Promise.resolve().then(function () {
          return run(controller ? controller.signal : signal);
        }).then(function (value) { finish(null, value); }, function (error) { finish(error); });
      });
    }

    function chooseRoute() {
      if (selected) return Promise.resolve(selected);
      if (selecting) return selecting;
      selecting = new Promise(function (resolve, reject) {
        var routes = [primary, fallback].filter(function (base) { return !(failedUntil[base] > Date.now()); });
        if (!routes.length) routes = [primary, fallback];
        var remaining = routes.length;
        var decided = false;
        routes.forEach(function (base) {
          deadline(function (signal) {
            return nativeFetch(base + "/auth/v1/health", {
              headers: { apikey: String(cfg.SUPABASE_ANON_KEY).trim() },
              cache: "no-store",
              signal: signal,
            }).then(function (response) {
              if (!response.ok) throw new Error("Health check failed");
              return response.json();
            }).then(function (body) {
              if (!body || body.name !== "GoTrue") throw new Error("Unexpected auth service");
              return base;
            });
          }, 8000).then(function (base) {
            if (!decided) { decided = true; selected = base; resolve(base); }
          }, function () {
            remaining -= 1;
            if (!remaining && !decided) reject(new Error("QM_AUTH_NETWORK: 两条登录线路均不可达，请检查网络后重试。"));
          });
        });
      }).catch(function (error) { selecting = null; throw error; });
      return selecting;
    }

    return function (input, init) {
      var url = typeof input === "string" ? input : input.url || String(input);
      if (url.indexOf(primary + "/") !== 0) return nativeFetch(input, init);
      var callerSignal = (init && init.signal) || (input && input.signal);
      // A caller can cancel while the shared health checks continue for other
      // requests. Do not attach its signal to the shared probe operation.
      return deadline(function () { return chooseRoute(); }, 8500, callerSignal).then(function (base) {
        return deadline(function (signal) {
          var options = Object.assign({}, init || {}, { signal: signal });
          var target = base + url.slice(primary.length);
          var request;
          if (typeof input !== "string" && window.Request && input instanceof window.Request) {
            request = nativeFetch(new window.Request(target, input), options);
          } else {
            request = nativeFetch(target, options);
          }
          return request.then(function (response) {
            if (response.status >= 500) { failedUntil[base] = Date.now() + 60000; selected = ""; selecting = null; }
            // Auth JSON is small. Include its body in the deadline so a server
            // that sends headers but stalls mid-body cannot hold the SDK lock.
            if (url.slice(primary.length).indexOf("/auth/v1/") === 0 && typeof response.clone === "function") {
              return response.clone().arrayBuffer().then(function () { return response; });
            }
            return response;
          });
        }, 15000, callerSignal).catch(function (error) {
          if (!error || error.name !== "AbortError") failedUntil[base] = Date.now() + 60000;
          throw error;
        });
      }).catch(function (error) {
        if (!error || error.name !== "AbortError") { selected = ""; selecting = null; }
        throw error;
      });
    };
  }

  function canPersistSession() {
    var key = "quizmario-auth-storage-check";
    try {
      window.localStorage.setItem(key, "1");
      var ok = window.localStorage.getItem(key) === "1";
      window.localStorage.removeItem(key);
      return ok;
    } catch (_) { return false; }
  }

  function boundedLock() {
    var locks = window.navigator && window.navigator.locks;
    if (!locks || !locks.request || !window.AbortController) return null;
    return function (name, acquireTimeout, fn) {
      var controller = new window.AbortController();
      var timer;
      var options = acquireTimeout === 0 ? { mode: "exclusive", ifAvailable: true }
        : { mode: "exclusive", signal: controller.signal };
      if (acquireTimeout !== 0) timer = setTimeout(function () { controller.abort(); }, acquireTimeout > 0 ? Math.min(acquireTimeout, 5000) : 5000);
      function lockError() {
        var e = new Error("QM_AUTH_LOCK: 另一聚光页面正在同步登录，请关闭其他聚光页面后重试。");
        e.isAcquireTimeout = true;
        return e;
      }
      return Promise.resolve().then(function () {
        return locks.request(name, options, function (lock) {
          clearTimeout(timer);
          if (!lock) throw lockError();
          return fn();
        });
      }).catch(function (error) {
        if (controller.signal.aborted) throw lockError();
        throw error;
      }).finally(function () { clearTimeout(timer); });
    };
  }

  function client() {
    if (cached) return cached;
    if (!isConfigured()) return null;
    var lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") return null;
    var cfg = config();
    var transport = routeFetch(cfg);
    var lock = boundedLock();
    var authOptions = {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "quizmario-auth",
    };
    if (lock) authOptions.lock = lock;
    cached = lib.createClient(
      String(cfg.SUPABASE_URL).trim().replace(/\/+$/, ""),
      String(cfg.SUPABASE_ANON_KEY).trim(),
      {
        global: transport ? { fetch: transport } : {},
        auth: authOptions,
      }
    );
    return cached;
  }

  window.QuizMarioCloudClient = {
    config: config,
    isConfigured: isConfigured,
    siteUrl: siteUrl,
    client: client,
    canPersistSession: canPersistSession,
  };
})();

