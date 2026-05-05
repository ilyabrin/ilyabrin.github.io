/* ============================================
   Service Worker for Offline Reading
   Progressive Web App (PWA) Support
   ============================================ */

const CACHE_NAME = "ilyabrin-blog-v2";
const OFFLINE_URL = "/offline.html";
const MAX_CACHE_ENTRIES = 60;

// Files to cache immediately on install
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/theme.css",
  "/theme.js",
  "/custom-improvements.css",
  "/custom-improvements.js",
];

// ── Install: precache essential files ──────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(
          PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" }))
        )
      )
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Precache failed:", err))
  );
});

// ── Activate: remove old caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: tiered caching strategy ────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (!request.url.startsWith(self.location.origin)) return;
  if (/yandex\.|google-analytics\.|algolia/.test(request.url)) return;

  const url = new URL(request.url);

  // Static assets: cache-first (CSS, JS, fonts, images)
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML pages: network-first, fall back to cache, then offline page
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── Strategies ─────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await putInCache(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await putInCache(request, response.clone());
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match(OFFLINE_URL);
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const networkPromise = fetch(request).then((response) => {
    if (response.ok) putInCache(request, response.clone());
    return response;
  });

  return cached || networkPromise;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function putInCache(request, response) {
  const cache = await caches.open(CACHE_NAME);

  // Evict oldest entry if over limit
  const keys = await cache.keys();
  if (keys.length >= MAX_CACHE_ENTRIES) {
    await cache.delete(keys[0]);
  }

  await cache.put(request, response);
}

function isStaticAsset(pathname) {
  return /\.(css|js|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico)$/i.test(pathname);
}

// ── Messages from client ───────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
