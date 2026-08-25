// Service worker: caches everything needed to boot with no network — the app
// shell, fonts, and the SQLite wasm the local database runs on. Screens are
// rendered from that local database, so once this is cached the app is fully
// usable offline, not just readable.
//
// Media is NOT cached here — audio and artwork live in IndexedDB and play via
// object URLs (see lib/offline.ts), which sidesteps Safari's Range quirks.

const CACHE = "woodshed-v4";

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
  // Never intercept API calls or media served from the Mac.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/audio/") ||
    url.pathname.startsWith("/art/")
  )
    return;

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

  // Pages: network-first, and offline fall back through progressively more
  // generic shells. A tune page for a tune this device has never loaded still
  // opens, because the shell is identical for every id.
  e.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(async () => {
        const exact = await caches.match(req);
        if (exact) return exact;
        if (url.pathname.startsWith("/standards/")) {
          const shell = await caches.match(STANDARD_SHELL);
          if (shell) return shell;
        }
        return caches.match("/");
      }),
  );
});

function put(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
