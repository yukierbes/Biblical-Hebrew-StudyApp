// Small saved records the Bible in Context pages keep, apart from the spaced-repetition schedule:
//   word labels   the Hebrew word behind each saved item, so Home can name a weak or due item without loading a dataset
//   confusions    which answer was picked when another was right ("Lene" picked, "Forte" correct), for "Explain my mistake"
//   secrets       a few counters for the hidden badges
//   reading log   which Reading-page passages were marked as read, and on which days. One item per BOOK, holding runs
//                 of verses per chapter ("verses 1 to 9 on 2026-11-08"), so the whole Bible stays small and a change
//                 syncs only the book it is in
// Everything is plain JSON in localStorage under keys starting "hebrewVerbApp:", so it is synced with the rest.

const LABELS_KEY = "hebrewVerbApp:bibleWordLabels";
const CONFUSE_KEY = "hebrewVerbApp:bibleConfusions";
const SECRETS_KEY = "hebrewVerbApp:bibleSecrets";
const READ_KEY = "hebrewVerbApp:bibleReadLog"; // the OLD single log (one entry per verse): still read, never written
const READ_PREFIX = "hebrewVerbApp:bibleRead:"; // + a book id (Gen, Ps ...): { "<chapter>": [[from, to, "YYYY-MM-DD"], ...] }
const DAYS_KEY = "hebrewVerbApp:bibleReadDays"; // the days something was read: ["2026-11-08", ...]
const MIGRATED_KEY = "hebrewApp.bibleReadMigrated"; // this device only: a fingerprint of the old log that has been folded in

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable: not critical */
  }
}

const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------- word labels ----------------

/** Remembers the Hebrew text of the word an item is about (pieces joined, so no "/" marks). */
export function rememberBibleWord(mode, key, text) {
  if (!text) return;
  const all = load(LABELS_KEY, {});
  const clean = String(text).split("/").join("");
  if (all[mode] && all[mode][key] === clean) return;
  (all[mode] ||= {})[key] = clean;
  save(LABELS_KEY, all);
}

/** The remembered word for an item, or "" if it was practised before labels were kept. */
export function bibleWordLabel(mode, key) {
  const all = load(LABELS_KEY, {});
  return (all[mode] && all[mode][key]) || "";
}

// ---------------- confusions ("Explain my mistake") ----------------

/** How many times the same wrong answer is needed before the app points it out. */
export const CONFUSION_THRESHOLD = 3;

/**
 * Records one wrong pick: in the answer box `partTitle` of `page`, `pickedLabel` was chosen when `correctLabel` was right.
 * Returns the running count for that exact pair.
 */
export function recordConfusion(page, partTitle, correctId, correctLabel, pickedId, pickedLabel, patternId = null) {
  const all = load(CONFUSE_KEY, {});
  const pageMap = (all[page] ||= {});
  const k = `${partTitle || ""}|${correctId}|${pickedId}`;
  const e = (pageMap[k] ||= { n: 0, partTitle: partTitle || "", correctLabel, pickedLabel, patternId });
  e.n += 1;
  e.last = Date.now();
  if (patternId) e.patternId = patternId;
  save(CONFUSE_KEY, all);
  return e.n;
}

/** When the learner later picks the right answer for that pair, the count eases down (a mix-up that is fixed fades away). */
export function easeConfusion(page, partTitle, correctId) {
  const all = load(CONFUSE_KEY, {});
  const pageMap = all[page];
  if (!pageMap) return;
  let changed = false;
  for (const [k, e] of Object.entries(pageMap)) {
    if (k.startsWith(`${partTitle || ""}|${correctId}|`) && e.n > 0) {
      e.n -= 1;
      changed = true;
      if (e.n === 0) delete pageMap[k];
    }
  }
  if (changed) save(CONFUSE_KEY, all);
}

/** Mix-ups seen at least `min` times on one page (or every page), most frequent first. */
export function getConfusions(page = null, min = CONFUSION_THRESHOLD) {
  const all = load(CONFUSE_KEY, {});
  const out = [];
  for (const [pg, map] of Object.entries(all)) {
    if (page && pg !== page) continue;
    for (const e of Object.values(map)) if (e.n >= min) out.push({ page: pg, ...e });
  }
  return out.sort((a, b) => b.n - a.n);
}

// ---------------- hidden-badge counters ----------------

export function getSecrets() {
  return load(SECRETS_KEY, { rare: {} });
}

/**
 * Notes a correct answer on a pattern that is rare in the text. `total` is how many examples that pattern has;
 * the badge is earned once every example of one rare pattern has been answered correctly.
 */
export function recordRareCorrect(page, patternId, exampleKey, total) {
  const s = getSecrets();
  s.rare ||= {};
  const id = `${page}:${patternId}`;
  const r = (s.rare[id] ||= { total, keys: [] });
  r.total = total;
  if (!r.keys.includes(exampleKey)) r.keys.push(exampleKey);
  save(SECRETS_KEY, s);
}

// ---------------- reading log ----------------

const hashText = (t) => {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return `${t.length}:${h}`;
};

/** "Gen.12.3" -> ["Gen", 12, 3] */
const splitRef = (ref) => {
  const [b, c, v] = String(ref).split(".");
  return [b, Number(c), Number(v)];
};

function loadBook(bookId) {
  const book = load(READ_PREFIX + bookId, {});
  return book && typeof book === "object" && !Array.isArray(book) ? book : {};
}

/** { verseNumber: "YYYY-MM-DD" } for one chapter. */
function chapterDates(book, chapter) {
  const out = {};
  for (const [from, to, date] of book[chapter] || []) for (let v = from; v <= to; v++) out[v] = date;
  return out;
}

/** Saves one chapter from { verseNumber: date }: runs of consecutive verses with the same date become one entry. */
function saveChapter(bookId, chapter, dates) {
  const book = loadBook(bookId);
  const nums = Object.keys(dates).map(Number).sort((a, b) => a - b);
  const runs = [];
  for (const v of nums) {
    const last = runs[runs.length - 1];
    if (last && last[1] === v - 1 && last[2] === dates[v]) last[1] = v;
    else runs.push([v, v, dates[v]]);
  }
  if (runs.length) book[chapter] = runs;
  else delete book[chapter];
  if (Object.keys(book).length) save(READ_PREFIX + bookId, book);
  else {
    try {
      localStorage.removeItem(READ_PREFIX + bookId);
    } catch (e) {
      /* not critical */
    }
  }
}

function readBookIds() {
  const ids = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(READ_PREFIX)) ids.push(k.slice(READ_PREFIX.length));
    }
  } catch (e) {
    /* not critical */
  }
  return ids;
}

function loadDays() {
  const days = load(DAYS_KEY, []);
  return Array.isArray(days) ? days : [];
}

function addDay(day) {
  const days = loadDays();
  if (!days.includes(day)) {
    days.push(day);
    days.sort();
    save(DAYS_KEY, days);
  }
}

/**
 * Folds the old single log (one entry per verse, under bibleReadLog) into the per-book items. Safe to run any number
 * of times: it does its work only when the old log is there and has changed since it was last folded in (a second
 * device that still has the old version of the app may keep adding to it). Nothing is ever written to the old log.
 */
export function migrateOldReadLog() {
  let raw = null;
  try {
    raw = localStorage.getItem(READ_KEY);
  } catch (e) {
    return;
  }
  if (!raw) return;
  const fingerprint = hashText(raw);
  let done = null;
  try {
    done = localStorage.getItem(MIGRATED_KEY);
  } catch (e) {
    /* not critical */
  }
  if (done === fingerprint) return;
  let old;
  try {
    old = JSON.parse(raw);
  } catch (e) {
    return;
  }
  const touched = new Map(); // "Book|chapter" -> { verse: date }
  for (const [ref, date] of Object.entries((old && old.verses) || {})) {
    const [b, c, v] = splitRef(ref);
    if (!b || !c || !v) continue;
    const key = `${b}|${c}`;
    if (!touched.has(key)) touched.set(key, chapterDates(loadBook(b), c));
    const dates = touched.get(key);
    if (!dates[v]) dates[v] = date;
  }
  for (const [key, dates] of touched) {
    const [b, c] = key.split("|");
    saveChapter(b, Number(c), dates);
  }
  for (const d of (old && old.days) || []) addDay(d);
  try {
    localStorage.setItem(MIGRATED_KEY, fingerprint);
  } catch (e) {
    /* not critical */
  }
}

/** { verseNumber: "YYYY-MM-DD" } of the verses of one chapter that are marked as read. */
export function getChapterRead(bookId, chapter) {
  migrateOldReadLog();
  return chapterDates(loadBook(bookId), chapter);
}

/** How many verses of a book are marked as read, per chapter: { 1: 31, 2: 25 }. */
export function getBookReadCounts(bookId) {
  migrateOldReadLog();
  const out = {};
  for (const [c, runs] of Object.entries(loadBook(bookId))) out[c] = runs.reduce((n, [from, to]) => n + (to - from + 1), 0);
  return out;
}

/** Marks verses (refs such as "Gen.1.1") as read today. A verse already read is dated today again. */
export function markVersesRead(refs, now = new Date()) {
  migrateOldReadLog();
  const today = ymd(now);
  const touched = new Map();
  for (const ref of refs) {
    const [b, c, v] = splitRef(ref);
    if (!b || !(c >= 1) || !(v >= 1)) continue; // not a verse reference
    const key = `${b}|${c}`;
    if (!touched.has(key)) touched.set(key, chapterDates(loadBook(b), c));
    touched.get(key)[v] = today;
  }
  for (const [key, dates] of touched) {
    const [b, c] = key.split("|");
    saveChapter(b, Number(c), dates);
  }
  if (touched.size) addDay(today);
}

/** Takes verses back out of the log. (The days read are not changed.) */
export function unmarkVersesRead(refs) {
  migrateOldReadLog();
  const touched = new Map();
  for (const ref of refs) {
    const [b, c, v] = splitRef(ref);
    const key = `${b}|${c}`;
    if (!touched.has(key)) touched.set(key, chapterDates(loadBook(b), c));
    delete touched.get(key)[v];
  }
  for (const [key, dates] of touched) {
    const [b, c] = key.split("|");
    saveChapter(b, Number(c), dates);
  }
}

export const markVerseRead = (ref, now = new Date()) => markVersesRead([ref], now);
export const unmarkVerseRead = (ref) => unmarkVersesRead([ref]);

/** { verses: { "Gen.1.1": "2026-10-24" }, days: ["2026-10-24", …] }: the whole log in one piece (the shape the app has always used). */
export function getReadLog() {
  migrateOldReadLog();
  const verses = {};
  for (const id of readBookIds()) {
    for (const [c, runs] of Object.entries(loadBook(id))) for (const [from, to, date] of runs) for (let v = from; v <= to; v++) verses[`${id}.${c}.${v}`] = date;
  }
  return { verses, days: loadDays() };
}

/** { streak (days in a row, alive if read today or yesterday), best, today (verses read today), verses (distinct verses read), days } */
export function getReadingStats(now = new Date()) {
  migrateOldReadLog();
  const today = ymd(now);
  let verses = 0;
  let readToday = 0;
  for (const id of readBookIds()) {
    for (const runs of Object.values(loadBook(id))) {
      for (const [from, to, date] of runs) {
        verses += to - from + 1;
        if (date === today) readToday += to - from + 1;
      }
    }
  }
  const days = [...new Set(loadDays())].sort();
  const dayNum = (s) => Math.round(Date.parse(s + "T00:00:00Z") / 86400000);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    const n = dayNum(d);
    run = prev !== null && n - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  let streak = 0;
  if (days.length) {
    const gap = dayNum(today) - dayNum(days[days.length - 1]);
    if (gap <= 1) {
      streak = 1;
      for (let i = days.length - 1; i > 0; i--) {
        if (dayNum(days[i]) - dayNum(days[i - 1]) === 1) streak += 1;
        else break;
      }
    }
  }
  return { streak, best, today: readToday, verses, days: days.length };
}
