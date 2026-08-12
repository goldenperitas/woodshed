// Minimal service worker: app-shell caching so the PWA opens offline.
// Audio is NOT cached here — downloaded tracks live in IndexedDB and play
// via object URLs (see lib/offline.ts), which sidesteps Safari's Range quirks.

const CACHE = "woodshed-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/drill", "/manifest.json"])));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept API calls or audio files.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/audio/")) return;

  // Build assets: network-first, fall back to cache offline. In production the
  // filenames are content-hashed so the network copy is cheap and always right;
  // in dev the hash can be reused across edits, so cache-first would pin the app
  // to stale code. Network-first keeps online iterations fresh either way.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      fetch(req).then((res) => put(req, res)).catch(() => caches.match(req)),
    );
    return;
  }

  // Pages: network-first, fall back to cache when offline.
  e.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
  );
});

function put(req, res) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
