/* Public shell, plus versioned vocabulary set files. A warm shell cache gets a
   short network freshness window; background refresh stays alive through its
   cache write. Bank files are cache-first for this version path. Authentication,
   learner records and application scripts are never intercepted. */
var CACHE = "juguang-shell-20261113-set1";
var BANK_CACHE = "juguang-banks-20261113-set1";
var SHELL = [
  "./index.html",
  "./login.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(url).catch(function () {});
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        var oldShell = key.indexOf("juguang-shell-") === 0 && key !== CACHE;
        var oldBanks = key.indexOf("juguang-banks-") === 0 && key !== BANK_CACHE;
        if (!oldShell && !oldBanks) return Promise.resolve();
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isBankPath(pathname) {
  return /\/data\/banks\/20261113-set1\//.test(pathname);
}

function bankResponse(req, event) {
  return caches.open(BANK_CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var saved = cache.put(req, res.clone());
          if (event && event.waitUntil) event.waitUntil(Promise.resolve(saved).catch(function () {}));
        }
        return res;
      });
    });
  });
}

function isShellPath(pathname) {
  return /\/(?:index|login)\.html$/.test(pathname)
    || /\/manifest\.webmanifest$/.test(pathname)
    || /\/favicon\.svg$/.test(pathname)
    || /\/apple-touch-icon\.png$/.test(pathname)
    || /\/icon-192\.png$/.test(pathname)
    || /\/icon-512\.png$/.test(pathname)
    || /\/grok\/?$/.test(pathname);
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isBankPath(url.pathname)) {
    event.respondWith(bankResponse(req, event));
    return;
  }
  if (!isShellPath(url.pathname)) return;
  if (/[?&](?:code|access_token|refresh_token|error|error_description)=/.test(url.search)) return;

  var key = new URL(req.url);
  key.search = "";
  if (/\/grok\/?$/.test(key.pathname)) key.pathname = key.pathname.replace(/\/?$/, "/") + "index.html";
  var cached = caches.open(CACHE).then(function (cache) {
    return cache.match(key.href);
  }).catch(function () { return null; });

  // Reload so GitHub Pages' HTTP cache cannot pin a stale shell.
  var controller = typeof AbortController === "function" ? new AbortController() : null;
  var timer;
  var timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      reject(new Error("shell network timeout"));
      if (controller) controller.abort();
    }, 6000);
  });
  var network = fetch(req, { cache: "reload", signal: controller ? controller.signal : undefined }).then(function (res) {
    if (!res || !res.ok) throw new Error("shell network unavailable");
    return res.clone().arrayBuffer().then(function () { return res; });
  });
  var refresh = Promise.race([network, timeout]).finally(function () { clearTimeout(timer); });
  var saved = refresh.then(function (res) {
    if (res && res.ok && res.type === "basic" && !res.redirected) {
      var copy = res.clone();
      return caches.open(CACHE).then(function (cache) {
        return cache.put(key.href, copy);
      });
    }
  });
  // Returning cached HTML must not terminate the refresh or its cache.put.
  // Conversely, a slow cache write must not delay a fresh network response.
  if (event.waitUntil) event.waitUntil(saved.catch(function () {}));
  event.respondWith(cached.then(function (hit) {
    if (!hit) return refresh.catch(function () {
      return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>暂时无法连接网络，请恢复网络后刷新重试。登录需要联网，已有学习记录仍保留。</p><a href="./login.html">重新打开登录页</a>', {status:503,headers:{"Content-Type":"text/html; charset=utf-8"}});
    });
    var warmTimer;
    var quickCache = new Promise(function (resolve) { warmTimer = setTimeout(function () { resolve(hit); }, 350); });
    return Promise.race([refresh.catch(function () { return hit; }), quickCache])
      .finally(function () { clearTimeout(warmTimer); });
  }));
});

