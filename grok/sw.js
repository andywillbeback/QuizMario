/* Home-screen install shell for /grok/.
   Network-first, and only for small shell files.
   Word banks and app scripts are not intercepted, so updates stay on the network. */
var CACHE = "juguang-shell-v1";
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
        if (key === CACHE) return Promise.resolve();
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
  event.respondWith(fetch(req, { cache: "reload" }).then(function (res) {
    if (res && res.ok && res.type === "basic" && !res.redirected) {
      var copy = res.clone();
      caches.open(CACHE).then(function (cache) {
        return cache.put(req, copy);
      }).catch(function () {});
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) {
      return hit || Promise.reject(new Error("offline"));
    });
  }));
});
