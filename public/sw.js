// Service worker: caches everything needed to boot with no network — the app
// shell, fonts, and the SQLite wasm the local database runs on. Screens are
// rendered from that local database, so once this is cached the app is fully
// usable offline, not just readable.
//
// Media is NOT cached here — audio and artwork live in IndexedDB and play via
// object URLs (see lib/offline.ts), which sidesteps Safari's Range quirks.

const CACHE = "woodshed-v13";
// Jackets fetched from the Mac live in their own cache. The versioned cache is
// emptied on every update — code and shells should be replaced wholesale — but
// re-downloading artwork requires being online again, which is exactly what
// the user may no longer be.
const MEDIA_CACHE = "woodshed-media";

// Precached on install so the first offline visit has a shell + fonts + icons.
// Hashed /_next/static chunks can't be listed here (names change per build);
// they get cached at runtime on the first online visit instead.
//
// One document covers every screen. The server sends the same bytes for every
// URL — the screen is chosen on the device from the address bar (see
// components/Screen.tsx) — so there is nothing per-route left to precache, and
// no way for a document cached under one address to render as the wrong
// screen under another.
const SHELL = "/";

const PRECACHE = [
  SHELL,
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

// The worker has nowhere of its own to keep a log, and it is the piece of this
// app least visible from the outside — offline, it decides what every screen
// is made of. So it tells the open documents what it did and they write it
// down. Fire and forget: reporting must never delay a response.
function report(ev, d) {
  self.clients
    .matchAll({ includeUncontrolled: true, type: "window" })
    .then((cs) => {
      for (const c of cs) c.postMessage({ woodshed: "log", ev, d });
    })
    .catch(() => {});
}

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("woodshed-v") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => report("sw.activate", { cache: CACHE })),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the sync endpoint, or audio: takes are large and Safari
  // needs real Range responses, which is why a device keeps whole blobs of the
  // ones it wants offline instead of streaming them through here.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/audio/")) return;

  // Jackets come from the Mac. Cache-first, so the shelf keeps its covers
  // offline without every device having to save them by hand.
  if (url.pathname.startsWith("/media/art/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res, MEDIA_CACHE))),
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

  // Route payloads (the router's own fetches, marked with an RSC header). The
  // app navigates with pushState now, so offline it should never ask for one —
  // sw.payload.miss going above zero in the event log means something started
  // using the router again.
  //
  // Answering one with the HTML shell is what made a tap on a never-opened
  // tune land on the previously opened one: the router sees a reply that is not
  // a payload, treats the navigation as a full page load, and sends the browser
  // to the *response's* URL. So serve a payload only from a genuine cached
  // payload and otherwise let the request fail — the router then falls back to
  // a plain navigation to the href that was tapped.
  //
  // Note what this deliberately does not do: an earlier attempt served payloads
  // from a normalized cache key, inventing a payload for a route the device had
  // never fetched, and navigation stopped on the phone (reverted in 7664ee7).
  // Failing is safe; guessing is not.
  if (req.headers.get("RSC")) {
    e.respondWith(
      fetch(req)
        .then((res) => put(req, res))
        .catch(async () => {
          const exact = await caches.match(req);
          if (exact && isPayloadResponse(exact)) return exact;
          // Reported because this is the moment a client-side transition turns
          // into a full page load — the cost this design is trying to avoid.
          report("sw.payload.miss", { path: url.pathname });
          return Response.error();
        }),
    );
    return;
  }

  // Everything else that is not a page — the icon, the manifest. Keyed on
  // itself, because unlike documents these really are different files.
  if (req.mode !== "navigate") {
    e.respondWith(fetch(req).then((res) => put(req, res)).catch(() => caches.match(req)));
    return;
  }

  // Documents: network-first, falling back to the one shell. A screen this
  // device has never opened still works, because every document *is* the same
  // document and the screen is picked from the address bar.
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Only a real HTML document may be kept as the shell — never a route
        // payload, which shares the URL but carries flight data and would
        // render as text.
        if (isDocumentResponse(req, res)) {
          const shell = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, shell));
        }
        return res;
      })
      .catch(async () => {
        const shell = await caches.match(SHELL);
        if (shell) {
          report("sw.doc", { path: url.pathname, from: "shell" });
          return shell;
        }
        report("sw.doc", { path: url.pathname, from: "miss" });
        return Response.error();
      }),
  );
});

// A cached document keyed by a payload URL would poison the router the same way
// a live one does, so the fallback checks what it found before handing it over.
function isPayloadResponse(res) {
  return (res.headers.get("content-type") || "").includes("text/x-component");
}

function isDocumentResponse(req, res) {
  return (
    req.mode === "navigate" &&
    res.ok &&
    res.type === "basic" &&
    (res.headers.get("content-type") || "").includes("text/html")
  );
}

function put(req, res, cacheName) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(cacheName || CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
