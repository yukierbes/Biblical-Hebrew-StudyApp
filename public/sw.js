// A new version here makes browsers drop their old cached copy of the app and
// pick up the new files and data. You don't edit this by hand: on every Netlify
// deploy, scripts/stamp-sw.mjs replaces it with that deploy's commit id.
// (The value below is only what runs when the site is served some other way.)
const CACHE_VERSION = "hebrew-verb-app-v39";

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
  "js/letter-data.js",
  "js/session.js",
  "js/home-data.js",
  "js/daily-history.js",
  "js/daily-data.js",
  "js/confidence.js",
  "js/resume.js",
  "js/backup.js",
  "js/pages/study-session.js",
  "js/daily-sound.js",
  "js/progress-data.js",
  "js/progress-charts.js",
  "js/letter-sets.js",
  "js/letter-sidebar.js",
  "js/letter-answer-matching.js",
  "js/name-matching.js",
  "js/vowel-keyboard.js",
  "js/print-data-table.js",
  "js/print-letter-table.js",
  "js/review-columns.js",
  "js/review-tools.js",
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
  "js/sidebar-resize.js",
  "js/sidebar-collapse.js",
  "js/appearance.js",
  "js/bible-data.js",
  "js/bible-text.js",
  "js/bible-areas.js",
  "js/bible-insights.js",
  "js/bible-practice.js",
  "js/pages/bible-article.js",
  "js/pages/bible-reading.js",
  "js/pages/bible-dagesh.js",
  "js/pages/bible-suffix.js",
  "js/pages/bible-prefix.js",
  "js/pages/bible-qames.js",
  "js/pages/bible-sheva.js",
  "js/pages/bible-syllable.js",
  "js/pages/grammar-pages.js",
  "js/pages/credits.js",
  "js/profile.js",
  "js/personal.js",
  "js/celebrate.js",
  "js/encourage.js",
  "js/reports.js",
  "js/item-tray.js",
  "js/item-specs.js",
  "js/result-extras.js",
  "js/filter-state.js",
  "js/page-finder.js",
  "js/verb-tables.js",
  "js/print-tables.js",
  "js/srs.js",
  "js/cloud-sync.js",
  "js/auth-fetch.js",
  "js/table.js",
  "js/widgets.js",
  "js/pages/home.js",
  "js/pages/reports.js",
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
  "js/pages/letter-review.js",
  "js/pages/letter-flashcards.js",
  "js/pages/letter-typing.js",
  "js/pages/letter-games.js",
  "js/pages/consonant-review.js",
  "js/pages/consonant-flashcards.js",
  "js/pages/consonant-typing.js",
  "js/pages/consonant-games.js",
  "js/pages/vowel-review.js",
  "js/pages/vowel-flashcards.js",
  "js/pages/vowel-typing.js",
  "js/pages/vowel-games.js",
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
