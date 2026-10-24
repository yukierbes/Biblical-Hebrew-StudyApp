// Small saved records the Bible in Context pages keep, apart from the spaced-repetition schedule:
//   word labels   the Hebrew word behind each saved item, so Home can name a weak or due item without loading a dataset
//   confusions    which answer was picked when another was right ("Lene" picked, "Forte" correct), for "Explain my mistake"
//   secrets       a few counters for the hidden badges
//   reading log   which Reading-page verses were marked as read, and on which days
// Everything is plain JSON in localStorage under keys starting "hebrewVerbApp:", so it is synced with the rest.

const LABELS_KEY = "hebrewVerbApp:bibleWordLabels";
const CONFUSE_KEY = "hebrewVerbApp:bibleConfusions";
const SECRETS_KEY = "hebrewVerbApp:bibleSecrets";
const READ_KEY = "hebrewVerbApp:bibleReadLog";

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

/** { verses: { "Gen.1.1": "2026-10-24" }, days: ["2026-10-24", …] } */
export function getReadLog() {
  const log = load(READ_KEY, { verses: {}, days: [] });
  log.verses ||= {};
  log.days ||= [];
  return log;
}

export function markVerseRead(ref, now = new Date()) {
  const log = getReadLog();
  const today = ymd(now);
  log.verses[ref] = today;
  if (!log.days.includes(today)) log.days.push(today);
  log.days.sort();
  save(READ_KEY, log);
  return log;
}

export function unmarkVerseRead(ref) {
  const log = getReadLog();
  delete log.verses[ref];
  save(READ_KEY, log);
  return log;
}

/** { streak (days in a row, alive if read today or yesterday), best, today (verses read today), verses (distinct verses read), days } */
export function getReadingStats(now = new Date()) {
  const log = getReadLog();
  const days = [...new Set(log.days)].sort();
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
    const gap = dayNum(ymd(now)) - dayNum(days[days.length - 1]);
    if (gap <= 1) {
      streak = 1;
      for (let i = days.length - 1; i > 0; i--) {
        if (dayNum(days[i]) - dayNum(days[i - 1]) === 1) streak += 1;
        else break;
      }
    }
  }
  const today = ymd(now);
  return {
    streak,
    best,
    today: Object.values(log.verses).filter((d) => d === today).length,
    verses: Object.keys(log.verses).length,
    days: days.length,
  };
}
