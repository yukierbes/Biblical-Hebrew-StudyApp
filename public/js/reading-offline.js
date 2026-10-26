// Reading without a connection.
//
// The service worker (sw.js) keeps a copy of every dataset the app downloads and serves that copy when the
// network is not there. "Save for offline" asks for everything Reading needs in one go (the passages, the
// Mixed review and the practice data its questions draw on, plus vocabulary and accents for the "words you
// know" figures), so a flight or a commute works without having opened each page first.

import { authFetch } from "./auth-fetch.js";
import { BIBLE_PAGES } from "./bible-areas.js";
import { getPracticeConfig } from "./bible-practice.js";

const KEY = "hebrewApp.offlineSaved";

/** Every dataset Reading can need. */
export function offlineDatasets() {
  const names = new Set(["bible-reading", "bible-mixed", "vocabulary", "accents"]);
  for (const p of BIBLE_PAGES) {
    const c = getPracticeConfig(p.page);
    names.add(c ? c.dataset : p.page);
  }
  return [...names];
}

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** { when, count } of the last successful save on this device, or null. */
export function getOfflineSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (e) {
    return null;
  }
}

/**
 * Downloads every dataset (the service worker stores each as it arrives). `onProgress(done, total)` is called
 * after each one. Returns { ok, failed: [names] }.
 */
export async function saveReadingForOffline(onProgress = () => {}) {
  const names = offlineDatasets();
  const failed = [];
  let done = 0;
  for (const name of names) {
    try {
      const res = await authFetch(`/.netlify/functions/get-data?dataset=${encodeURIComponent(name)}`);
      if (!res.ok) failed.push(name);
      else await res.arrayBuffer(); // read it through so the copy is complete
    } catch (e) {
      failed.push(name);
    }
    done += 1;
    onProgress(done, names.length);
  }
  const ok = failed.length === 0;
  if (ok) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ when: Date.now(), count: names.length }));
    } catch (e) {
      /* not critical */
    }
  }
  return { ok, failed };
}
