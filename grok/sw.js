/* Home-screen install shell for /grok/.
   Network-first, and only for small shell files.
   Word banks and app scripts are not intercepted, so updates stay on the network. */
var CACHE = "juguang-shell-20261109-ielts1";
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
        if (key === CACHE || key.indexOf("juguang-shell-") !== 0) return Promise.resolve();
        return caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

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
  if (!isShellPath(url.pathname)) return;

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
  event.respondWith(Promise.race([network, timeout]).then(function (res) {
    if (res && res.ok && res.type === "basic" && !res.redirected) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) {
        return cache.put(req, copy);
      }).catch(function () {});
    }
    return res;
  }).catch(function () {
    var key = new URL(req.url);
    key.search = "";
    if (/\/grok\/?$/.test(key.pathname)) key.pathname = key.pathname.replace(/\/?$/, "/") + "index.html";
    return caches.open(CACHE).then(function (cache) { return cache.match(req).then(function (hit) { return hit || cache.match(key.href); }); })
      .then(function (hit) {
        return hit || new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p>暂时无法连接网络，请恢复网络后刷新重试。登录需要联网，已有学习记录仍保留。</p><a href="./login.html">重新打开登录页</a>', {status:503,headers:{"Content-Type":"text/html; charset=utf-8"}});
      });
  }).finally(function () { clearTimeout(timer); }));
});

