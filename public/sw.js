// Bump this whenever any cached file changes, so old clients pick up
// the new version instead of being stuck on a stale cache forever.
const CACHE_VERSION = "hebrew-verb-app-v35";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "js/main.js",
  "js/constants.js",
  "js/data.js",
  "js/vocab-data.js",
  "js/vocab-overrides.js",
  "js/vocab-answer-matching.js",
  "js/vocab-roots.js",
  "js/root-editor.js",
  "js/accent-data.js",
  "js/accent-filters.js",
  "js/accent-keyboard.js",
  "js/accent-answer-matching.js",
  "js/category-editor.js",
  "js/deep-link.js",
  "js/filters.js",
  "js/filter-presets.js",
  "js/helpers.js",
  "js/history.js",
  "js/history-ui.js",
  "js/print.js",
  "js/hebrew-keyboard.js",
  "js/toast.js",
  "js/swipe-card.js",
  "js/srs.js",
  "js/cloud-sync.js",
  "js/auth-fetch.js",
  "js/table.js",
  "js/widgets.js",
  "js/pages/home.js",
  "js/pages/review.js",
  "js/pages/verb-flashcards.js",
  "js/pages/parsing.js",
  "js/pages/construction.js",
  "js/pages/search.js",
  "js/pages/vocabulary.js",
  "js/pages/vocab-flashcards.js",
  "js/pages/vocab-typing.js",
  "js/pages/vocab-games.js",
  "js/pages/accent-review.js",
  "js/pages/accent-flashcards.js",
  "js/pages/accent-typing.js",
  "js/pages/accent-games.js",
  "js/pages/progress.js",
  "js/pages/achievements.js",
  "js/pages/daily-challenge.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Only manage same-origin requests (the app shell). Cross-origin CDN
  // requests (Google Fonts, SheetJS) pass straight through to the
  // network — they're not essential for the core app to function
  // offline, and caching opaque cross-origin responses adds
  // complexity with little benefit here.
  if (url.origin !== self.location.origin) return;

  // Never cache calls to the sync API — it must always hit the network
  // fresh, or a stale cached response could silently overwrite newer
  // progress with old data on a later "cached" sync.
  if (url.pathname.startsWith("/.netlify/functions/")) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
