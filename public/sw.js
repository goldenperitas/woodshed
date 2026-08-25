// Service worker: caches everything needed to boot with no network — the app
// shell, fonts, and the SQLite wasm the local database runs on. Screens are
// rendered from that local database, so once this is cached the app is fully
// usable offline, not just readable.
//
// Media is NOT cached here — audio and artwork live in IndexedDB and play via
// object URLs (see lib/offline.ts), which sidesteps Safari's Range quirks.

const CACHE = "woodshed-v6";

// Precached on install so the first offline visit has a shell + fonts + icons.
// Hashed /_next/static chunks can't be listed here (names change per build);
// they get cached at runtime on the first online visit instead.
// "/standards/_shell" is a stand-in: every tune page renders the same shell
// and reads its id from the address bar, so one cached copy serves them all.
const STANDARD_SHELL = "/standards/_shell";

const PRECACHE = [
  "/",
  "/drill",
  "/groups",
  "/listening",
  "/standards/new",
  STANDARD_SHELL,
  "/db-worker.js",
  "/sqlite/sqlite3.mjs",
  "/sqlite/sqlite3.wasm",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/fonts/anton.woff2",
  "/fonts/space-mono-400.woff2",
  "/fonts/space-mono-700.woff2",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Resilient: a single failed request must not abort the whole precache.
      Promise.all(
        PRECACHE.map((u) =>
          fetch(u, { cache: "reload" })
            .then((res) => (res.ok ? cache.put(u, res) : null))
            .catch(() => null),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the sync endpoint, or audio: takes are large and Safari
  // needs real Range responses, which is why they are stored as blobs instead.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/audio/")) return;

  // Jackets uploaded before media moved onto the device still live on the Mac.
  // Cache-first, so the shelf keeps its covers offline.
  if (url.pathname.startsWith("/art/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))),
    );
    return;
  }

  // The database engine: cache-first and never revalidated. It is large,
  // immutable, and nothing renders until it has loaded.
  if (url.pathname.startsWith("/sqlite/") || url.pathname === "/db-worker.js") {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  // Self-hosted fonts: cache-first (immutable, and critical to render offline).
  if (url.pathname.startsWith("/fonts/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  // Build assets: network-first (dev hashes can be reused across edits, so
  // cache-first would pin stale code), fall back to cache offline.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(fetch(req).then((res) => put(req, res)).catch(() => caches.match(req)));
    return;
  }

  // Route payloads for client-side navigation.
  //
  // These cannot be cached by request: Next varies them on
  // next-router-state-tree, whose value depends on which page you navigated
  // *from*, so a stored response almost never matches the next request. Left
  // alone, every offline navigation fails and degrades to a full document
  // load — which tears down the database worker and loses the current route.
  //
  // So they are stored under a normalised key instead. Every tune shares one
  // entry, since the page carries no server data and differs only by the id
  // in the address bar.
  if (isRouteData(req, url)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) cacheUnder(routeDataKey(url), res.clone());
          return res;
        })
        // No cached payload: fail, and let Next fall back to a document load,
        // which the handler below can still answer from the shell.
        .catch(() => caches.match(routeDataKey(url)).then((hit) => hit || Response.error())),
    );
    return;
  }

  // Documents: network-first, falling back through progressively more generic
  // shells. A tune this device has never opened still works, because the shell
  // is identical for every id.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === "basic") cacheUnder(documentKey(url), res.clone());
        return put(req, res);
      })
      .catch(async () => {
        const exact = await caches.match(req);
        if (exact) return exact;
        const shell = await caches.match(documentKey(url));
        if (shell) return shell;
        return caches.match("/");
      }),
  );
});

// A tune page URL is the one route whose id is unbounded; everything else is
// a fixed path and can key on itself.
function isTunePage(url) {
  return url.pathname.startsWith("/standards/") && url.pathname !== "/standards/new";
}

function documentKey(url) {
  return isTunePage(url) ? STANDARD_SHELL : url.pathname;
}

function routeDataKey(url) {
  return "/__route" + (isTunePage(url) ? "/standards/[id]" : url.pathname);
}

function isRouteData(req, url) {
  return req.headers.get("rsc") !== null || url.searchParams.has("_rsc");
}

function cacheUnder(key, res) {
  caches.open(CACHE).then((c) => c.put(key, res));
}

function put(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
