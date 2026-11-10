// Reading without a connection.
//
// The service worker (sw.js) keeps a copy of every dataset the app downloads and serves that copy when the
// network is not there. "Save for offline" asks for what Reading needs in one go, so a flight or a commute works
// without having opened each chapter first. Because a whole Bible is a lot to keep on a phone, a BOOK is saved at a
// time: that book's chapters, plus the shared pieces (the index, the Mixed review and the practice data its
// questions draw on, vocabulary and accents for the "words you know" figures).

import { authFetch } from "./auth-fetch.js";
import { loadBibleData, setDatasetVersion, datasetUrl } from "./bible-data.js";
import { BIBLE_PAGES } from "./bible-areas.js";
import { getPracticeConfig } from "./bible-practice.js";
import { chapterDatasetName } from "./reading-data.js";

const KEY = "hebrewApp.offlineSaved";

/**
 * The datasets to save for one book: the shared ones, then every chapter of the book. `index` is the Reading index
 * ("bible-reading"); without it only the shared ones are listed.
 */
export function offlineDatasets(index = null, bookId = null) {
  const names = new Set(["bible-reading", "bible-mixed", "vocabulary", "accents"]);
  for (const p of BIBLE_PAGES) {
    const c = getPracticeConfig(p.page);
    names.add(c ? c.dataset : p.page);
  }
  const book = index && Array.isArray(index.books) ? index.books.find((b) => b.id === bookId) : null;
  if (book) for (let n = 1; n <= book.chapters.length; n++) names.add(chapterDatasetName(book.id, n));
  return [...names];
}

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** { when, count, books: { Gen: { when, version } } } for what has been saved on this device, or null. */
export function getOfflineSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (e) {
    return null;
  }
}

/**
 * Downloads one book (the service worker stores each file as it arrives), a few at a time. `onProgress(done, total)`
 * is called as files finish. Returns { ok, failed: [names] }.
 */
export async function saveReadingForOffline(onProgress = () => {}, { bookId = null } = {}) {
  let index = null;
  try {
    index = await loadBibleData("bible-reading");
    setDatasetVersion("rd-", index.version);
  } catch (e) {
    /* the chapters are then left out, and the result says so below */
  }
  const names = offlineDatasets(index, bookId);
  const failed = [];
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      try {
        const res = await authFetch(datasetUrl(name));
        if (!res.ok) failed.push(name);
        else await res.arrayBuffer(); // read it through so the copy is complete
      } catch (e) {
        failed.push(name);
      }
      done += 1;
      onProgress(done, names.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, names.length) }, worker));
  if (!index) failed.push("bible-reading-chapters");
  const ok = failed.length === 0;
  if (ok) {
    try {
      const before = getOfflineSaved() || {};
      const books = { ...(before.books || {}) };
      if (bookId) books[bookId] = { when: Date.now(), version: index.version };
      localStorage.setItem(KEY, JSON.stringify({ when: Date.now(), count: names.length, books }));
    } catch (e) {
      /* not critical */
    }
  }
  return { ok, failed };
}
