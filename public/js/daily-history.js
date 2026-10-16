// The Daily Challenge's memory: which days were completed (for the calendar,
// the "compared with yesterday" line and the Daily Challenge achievements), the
// person's chosen settings, and a round that was left half-finished.
//
//   hebrewVerbApp:dailyLog       { "2026-10-15": { score, total, percent, stars, hard, length, rounds } }
//   hebrewVerbApp:dailySettings  { length, areas, hard, sound }
//   hebrewApp.dailyInProgress    the unfinished round (this device only)
//
// The first two start with "hebrewVerbApp:", so they sync between a person's
// devices like the rest of their progress; the unfinished round stays on the
// device it was started on.

const LOG_KEY = "hebrewVerbApp:dailyLog";
const SETTINGS_KEY = "hebrewVerbApp:dailySettings";
const PROGRESS_KEY = "hebrewApp.dailyInProgress";

export const LENGTHS = [5, 10, 15];
export const AREA_IDS = ["consonants", "vowels", "vocabulary", "verbs", "accents"];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

/** "2026-10-15" for a Date (local time). */
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};

// ---------------- Settings ----------------

export function defaultSettings() {
  return { length: 10, areas: [...AREA_IDS], hard: false, sound: false };
}

export function loadSettings() {
  const saved = read(SETTINGS_KEY, null);
  const s = defaultSettings();
  if (!saved || typeof saved !== "object") return s;
  if (LENGTHS.includes(saved.length)) s.length = saved.length;
  if (Array.isArray(saved.areas)) {
    const areas = AREA_IDS.filter((a) => saved.areas.includes(a));
    if (areas.length) s.areas = areas;
  }
  s.hard = saved.hard === true;
  s.sound = saved.sound === true;
  return s;
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

// ---------------- Completed days ----------------

/** 1 star for finishing, 2 for 70% or more, 3 for 90% or more. */
export function starsFor(percent) {
  return percent >= 90 ? 3 : percent >= 70 ? 2 : 1;
}

export function loadLog() {
  const log = read(LOG_KEY, {});
  return log && typeof log === "object" ? log : {};
}

/**
 * Notes a finished Daily Challenge round. Several rounds in one day are
 * allowed: the day keeps its best round and counts how many were played.
 * Returns the day's entry.
 */
export function recordCompletion({ score, total, hard, length }, now = new Date()) {
  const log = loadLog();
  const day = ymd(now);
  const percent = total ? Math.round((score / total) * 100) : 0;
  const round = { score, total, percent, stars: starsFor(percent), hard: !!hard, length };
  const prev = log[day];
  if (!prev) log[day] = { ...round, rounds: 1 };
  else {
    const better = percent > prev.percent || (percent === prev.percent && round.hard && !prev.hard);
    log[day] = { ...(better ? round : prev), hard: prev.hard || round.hard, rounds: (prev.rounds || 1) + 1 };
  }
  write(LOG_KEY, log);
  return log[day];
}

export function getEntry(dateStr, log = loadLog()) {
  return log[dateStr] || null;
}

export function getYesterday(now = new Date(), log = loadLog()) {
  return getEntry(addDays(ymd(now), -1), log);
}

/**
 * { days, perfectDays, threeStarDays, hardDays, run, bestRun }
 *   days          days with at least one finished round
 *   perfectDays   days with a 100% round
 *   threeStarDays days with a 3-star round
 *   hardDays      days finished in Hard mode
 *   run           the current run of consecutive days (still alive if today or yesterday was done)
 *   bestRun       the longest run ever
 */
export function getStats(now = new Date(), log = loadLog()) {
  const dates = Object.keys(log).sort();
  let bestRun = 0;
  let streak = 0;
  let prev = null;
  for (const d of dates) {
    streak = prev && addDays(prev, 1) === d ? streak + 1 : 1;
    bestRun = Math.max(bestRun, streak);
    prev = d;
  }
  const today = ymd(now);
  const alive = prev && (prev === today || addDays(prev, 1) === today);
  return {
    days: dates.length,
    perfectDays: dates.filter((d) => log[d].percent === 100).length,
    threeStarDays: dates.filter((d) => log[d].stars === 3).length,
    hardDays: dates.filter((d) => log[d].hard).length,
    run: alive ? streak : 0,
    bestRun,
  };
}

/**
 * The weeks of a month for the calendar: [[cell | null x7] ...], Sunday first.
 * A cell is { day, date, entry, isToday, isFuture }.
 */
export function monthGrid(year, month, now = new Date(), log = loadLog()) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = ymd(now);
  const cells = Array(first.getDay()).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = ymd(new Date(year, month, day));
    cells.push({ day, date, entry: log[date] || null, isToday: date === today, isFuture: date > today });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---------------- A round left half-finished ----------------

export function saveInProgress(round, now = new Date()) {
  write(PROGRESS_KEY, { ...round, date: ymd(now) });
}

/** Today's unfinished round, or null (an older one is discarded). */
export function loadInProgress(now = new Date()) {
  const r = read(PROGRESS_KEY, null);
  if (!r || r.date !== ymd(now) || !Array.isArray(r.questions) || r.index >= r.questions.length) {
    if (r) clearInProgress();
    return null;
  }
  return r;
}

export function clearInProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch (e) {
    /* ignore */
  }
}
