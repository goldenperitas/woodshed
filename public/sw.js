// Service worker: caches everything needed to boot with no network — the app
// shell, fonts, and the SQLite wasm the local database runs on. Screens are
// rendered from that local database, so once this is cached the app is fully
// usable offline, not just readable.
//
// Media is NOT cached here — audio and artwork live in IndexedDB and play via
// object URLs (see lib/offline.ts), which sidesteps Safari's Range quirks.

const CACHE = "woodshed-v9";
// Jackets fetched from the Mac live in their own cache. The versioned cache is
// emptied on every update — code and shells should be replaced wholesale — but
// re-downloading artwork requires being online again, which is exactly what
// the user may no longer be.
const MEDIA_CACHE = "woodshed-media";

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
  "/debug",
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
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("woodshed-v") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
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

  // Route payloads (the router's own fetches, marked with an RSC header) are
  // not documents. Answering one with the HTML shell does not merely fail to
  // render — the router sees a reply that is not a payload, treats the
  // navigation as a full page load, and sends the browser to the *response's*
  // URL, which is whichever tune was cached into the shell slot last. That is
  // how tapping a never-opened tune offline landed on the previous one.
  //
  // So: serve a payload only from a genuine cached payload, and otherwise let
  // the request fail. A failed payload fetch makes the router fall back to a
  // plain navigation to the href that was tapped, and that navigation is served
  // the shell below. Slower than a client-side transition, but it lands on the
  // right tune.
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
          return exact && isPayloadResponse(exact) ? exact : Response.error();
        }),
    );
    return;
  }

  // Documents: network-first, falling back through progressively more generic
  // shells. A tune this device has never opened still works, because the shell
  // is identical for every id and the page reads which tune to show from the
  // address bar.
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Only a real HTML document may become the shell. Next prefetches tune
        // links as route payloads, which share the URL but return flight data —
        // storing one of those as the shell means a later offline navigation
        // renders the payload as text instead of the page.
        if (isDocumentResponse(req, res)) {
          const shell = res.clone();
          caches.open(CACHE).then((c) => c.put(documentKey(url), shell));
        }
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

function documentKey(url) {
  return isTunePage(url) ? STANDARD_SHELL : url.pathname;
}




function put(req, res, cacheName) {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(cacheName || CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
