/* Orkin Proposal Studio service worker — offline app shell. API routes are never cached. */
const VERSION = "ops-v2";
// Works at the domain root or under a sub-path (e.g. GitHub Pages /Aa/).
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const SHELL = ["/", "/new", "/proposal", "/estimates", "/library", "/import", "/knowledge", "/settings", "/manifest.webmanifest", "/pdf.worker.min.mjs"].map((p) => BASE + p);
const FONTS = ["roboto-condensed-latin-400-normal.woff", "roboto-condensed-latin-500-normal.woff", "roboto-condensed-latin-700-normal.woff", "roboto-condensed-latin-800-normal.woff", "lato-latin-400-normal.woff", "lato-latin-400-italic.woff", "lato-latin-700-normal.woff", "lato-latin-900-normal.woff"].map((f) => `${BASE}/fonts/${f}`);

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => Promise.all([...SHELL, ...FONTS].map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null)))).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith(BASE + "/api/")) return;

  // Immutable build assets, fonts, icons: cache-first.
  const rel = url.pathname.slice(BASE.length);
  if (rel.startsWith("/_next/static/") || rel.startsWith("/fonts/") || rel.startsWith("/icons/") || rel === "/pdf.worker.min.mjs") {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network-first, fall back to cached page (query strings ignored so /proposal?id=… works offline).
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // Other same-origin GETs (RSC payloads etc.): network, then cache.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && rel.startsWith("/_next/")) caches.open(VERSION).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: false }).then((hit) => hit || Response.error())),
  );
});

// The page sends the same-origin assets it already loaded (before this worker controlled it) so they work offline.
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "cache-urls" || !Array.isArray(e.data.urls)) return;
  const urls = e.data.urls.filter((u) => {
    try {
      const x = new URL(u);
      return x.origin === self.location.origin && !x.pathname.startsWith(BASE + "/api/");
    } catch {
      return false;
    }
  });
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(urls.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null)))));
});
