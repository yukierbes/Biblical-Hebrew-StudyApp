// What the Home page knows, worked out from the app's saved practice data.
//
// Everything here is plain data in, plain data out (no HTML), so the Home page
// stays a thin layer and each piece can be tested on its own:
//
//   AREAS / getAreaStats      — the five study areas: how much is mastered, what is due
//   getStudySuggestion        — the one thing to do next ("Study now")
//   getStreakStatus           — the streak, and what keeps it alive today
//   getWeakSpots              — the items missed most, for "Drill these"
//   getWordOfTheDay           — one verb form, the same all day
//   getRecentActivity         — last practice day and last quiz score
//   timeAgo                   — "2 hours ago"

import { getVocabRows } from "./vocab-data.js";
import { vocabRowKey } from "./vocab-overrides.js";
import { getAccentRows } from "./accent-data.js";
import { accentRowKey } from "./accent-filters.js";
import { getLetterSet } from "./letter-sets.js";
import { getAvailableDatasets, loadVerbData } from "./data.js";
import { morphKey } from "./helpers.js";
import { loadHistory } from "./history.js";
import { ACHIEVEMENTS, buildContext } from "./pages/achievements.js";
import {
  getDueCount,
  getMasteredKeyCount,
  getScheduleEntries,
  getStreakInfo,
  getStreakFreezeCount,
  getDailyProgress,
} from "./srs.js";

export const AREA_ORDER = ["consonants", "vowels", "vocabulary", "verbs", "accents"];

// ---------------------------------------------------------------------
// The five study areas
// ---------------------------------------------------------------------

function letterArea(setId) {
  const set = getLetterSet(setId);
  const p = set.srsPrefix;
  const page = set.pagePrefix;
  const nounPlural = set.plural;
  return {
    id: setId,
    title: set.title,
    noun: nounPlural,
    pool: set.rows,
    key: set.rowKey,
    // Every mode that can make an item "mastered" (the old keyboard-shortcut
    // typing mode is kept so earlier practice still counts).
    statModes: [`${p}-typing-names`, `${p}-typing-form`, `${p}-typing-symbol`, `${p}-flashcards`, `${p}-games-names`, `${p}-games-symbol`],
    // The modes that have a "due for review" queue, and where each is practised.
    dueModes: [
      { mode: `${p}-typing-names`, label: "Typing", page: `${page}-typing`, link: { type: `${page}-typing-focus`, promptWith: "names" } },
      { mode: `${p}-typing-form`, label: "Typing", page: `${page}-typing`, link: { type: `${page}-typing-focus`, promptWith: "form" } },
      { mode: `${p}-flashcards`, label: "Flashcards", page: `${page}-flashcards` },
    ],
    buttons: [
      { label: "Review", page: `${page}-review`, tip: `Browse, filter, print and download the ${nounPlural}` },
      { label: "Flashcards", page: `${page}-flashcards`, tip: `See a ${set.singular} in Hebrew and flip to reveal its ${set.id === "vowels" ? "name, class, and length" : "name and transliteration"}` },
      { label: "Typing", page: `${page}-typing`, tip: `Type the ${set.singular} from its name, or type the name of the ${set.singular} shown, with Practice and Quiz modes` },
      { label: "Games", page: `${page}-games`, tip: "Five arcade-style modes that test recall" },
    ],
    drill: true,
  };
}

function vocabularyArea() {
  const dir = (d) => ({ type: "vocab-typing-focus", direction: d });
  return {
    id: "vocabulary",
    title: "Vocabulary",
    noun: "words",
    pool: getVocabRows,
    key: vocabRowKey,
    statModes: ["vocab-typing-hebrew", "vocab-typing-english", "vocab-flashcards-hebrew", "vocab-flashcards-english", "vocab-games-hebrew", "vocab-games-english"],
    dueModes: [
      { mode: "vocab-typing-hebrew", label: "Typing", page: "vocab-typing", link: dir("hebrew") },
      { mode: "vocab-typing-english", label: "Typing", page: "vocab-typing", link: dir("english") },
      { mode: "vocab-flashcards-hebrew", label: "Flashcards", page: "vocab-flashcards", link: { type: "vocab-flashcards-focus", direction: "hebrew" } },
      { mode: "vocab-flashcards-english", label: "Flashcards", page: "vocab-flashcards", link: { type: "vocab-flashcards-focus", direction: "english" } },
    ],
    buttons: [
      { label: "Review", page: "vocabulary", tip: "Browse and filter vocabulary by lesson, part of speech, category, and frequency" },
      { label: "Flashcards", page: "vocab-flashcards", tip: "Drill words with flip cards — mark each one as known or save it for later review" },
      { label: "Typing", page: "vocab-typing", tip: "Type the Hebrew or English translation from a prompt, with Practice and Quiz modes" },
      { label: "Games", page: "vocab-games", tip: "Five arcade-style modes that test recall" },
    ],
    drill: true,
  };
}

function verbsArea() {
  return {
    id: "verbs",
    title: "Verbs",
    noun: "verb forms",
    pool: () => loadVerbData(getAvailableDatasets()),
    key: morphKey,
    statModes: ["parsing", "construction", "verb-flashcards-hebrew", "verb-flashcards-english"],
    dueModes: [
      { mode: "parsing", label: "Parsing", page: "parsing" },
      { mode: "construction", label: "Construction", page: "construction" },
      { mode: "verb-flashcards-hebrew", label: "Flashcards", page: "verb-flashcards", link: { type: "verb-flashcards-focus", direction: "hebrew" } },
      { mode: "verb-flashcards-english", label: "Flashcards", page: "verb-flashcards", link: { type: "verb-flashcards-focus", direction: "english" } },
    ],
    buttons: [
      { label: "Review", page: "review", tip: "Every form as a list, by binyan, or by verb root — print, download and build study lists" },
      { label: "Flashcards", page: "verb-flashcards", tip: "Flip cards for verb forms, Hebrew first or English first" },
      { label: "Parsing", page: "parsing", tip: "Identify the grammar of a given verb form" },
      { label: "Construction", page: "construction", tip: "Write a verb form and its translation from a prompt" },
    ],
    drill: false, // the drill quiz has no verb questions
  };
}

function accentsArea() {
  return {
    id: "accents",
    title: "Accents",
    noun: "accents",
    pool: getAccentRows,
    key: accentRowKey,
    statModes: ["accent-typing-names", "accent-typing-form", "accent-typing-symbol", "accent-flashcards", "accent-games-names", "accent-games-symbol"],
    dueModes: [
      { mode: "accent-typing-names", label: "Typing", page: "accent-typing", link: { type: "accent-typing-focus", promptWith: "names" } },
      { mode: "accent-typing-form", label: "Typing", page: "accent-typing", link: { type: "accent-typing-focus", promptWith: "form" } },
      { mode: "accent-flashcards", label: "Flashcards", page: "accent-flashcards" },
    ],
    buttons: [
      { label: "Review", page: "accent-review", tip: "Browse and filter Hebrew cantillation accents by Type and Group" },
      { label: "Flashcards", page: "accent-flashcards", tip: "See an accent in context and flip to reveal its name and grouping" },
      { label: "Typing", page: "accent-typing", tip: "Type the accent from its name, or type the English name of the accent shown, with Practice and Quiz modes" },
      { label: "Games", page: "accent-games", tip: "Five arcade-style modes that test recall" },
    ],
    drill: true,
  };
}

/** The five areas, in the order they are shown everywhere: Consonants, Vowels, Vocabulary, Verbs, Accents. */
export function getAreas() {
  return [letterArea("consonants"), letterArea("vowels"), vocabularyArea(), verbsArea(), accentsArea()];
}

/**
 * How far along an area is:
 *   total     items in the area
 *   mastered  items mastered in at least one mode (each counted once)
 *   tracked   items practised at all, in any mode
 *   due       items waiting for review, added up over the area's review queues
 *             (the same way the Today card has always counted them)
 *   pct       whole-number percent mastered
 */
export function getAreaStats(area) {
  const pool = area.pool();
  const total = pool.length;
  const mastered = getMasteredKeyCount(area.statModes);
  const trackedKeys = new Set();
  for (const mode of area.statModes) for (const k of Object.keys(getScheduleEntries(mode))) trackedKeys.add(k);
  let due = 0;
  for (const dm of area.dueModes) due += getDueCount(dm.mode, pool, area.key);
  return {
    total,
    mastered: Math.min(mastered, total),
    tracked: trackedKeys.size,
    due,
    pct: total ? Math.min(100, Math.round((mastered / total) * 100)) : 0,
  };
}

/** Stats for every area: [{ area, stats }] in the usual order. */
export function getAllAreaStats() {
  return getAreas().map((area) => ({ area, stats: getAreaStats(area) }));
}

/** Items due across everything (what the Today card shows). */
export function totalDue(allStats) {
  return allStats.reduce((n, { stats }) => n + stats.due, 0);
}

// ---------------------------------------------------------------------
// "Study now"
// ---------------------------------------------------------------------

/**
 * The single best next step:
 *   { kind: "due", area, dueMode, count }  — the area with the most due, at its busiest queue
 *   { kind: "start", area }                — nothing due, but an area never touched: start it
 *   { kind: "daily" }                      — everything is up to date: do the Daily Challenge
 */
export function getStudySuggestion(allStats) {
  let best = null;
  for (const { area, stats } of allStats) {
    if (stats.due > 0 && (!best || stats.due > best.stats.due)) best = { area, stats };
  }
  if (best) {
    // Within the area, the queue with the most due items.
    const pool = best.area.pool();
    let top = null;
    for (const dm of best.area.dueModes) {
      const n = getDueCount(dm.mode, pool, best.area.key);
      if (n > 0 && (!top || n > top.n)) top = { dm, n };
    }
    return { kind: "due", area: best.area, dueMode: top.dm, count: best.stats.due };
  }
  const untouched = allStats.find(({ stats }) => stats.tracked === 0 && stats.total > 0);
  if (untouched) return { kind: "start", area: untouched.area };
  return { kind: "daily" };
}

// ---------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

/**
 * { streak, practisedToday, atRisk, freezes, count, goal, remainingToGoal }
 * A streak counts as alive if you practised today or yesterday (or the day
 * before, when a streak freeze would cover the missed day); `atRisk` means
 * it is alive but nothing has been practised yet today.
 */
export function getStreakStatus(now = new Date()) {
  const info = getStreakInfo();
  const today = ymd(now);
  const daily = getDailyProgress();
  const freezes = getStreakFreezeCount();
  let streak = 0;
  if (info.lastActiveDate && info.currentStreak) {
    const gap = daysBetween(info.lastActiveDate, today);
    if (gap <= 1 || (gap === 2 && freezes > 0)) streak = info.currentStreak;
  }
  const practisedToday = info.lastActiveDate === today;
  return {
    streak,
    practisedToday,
    atRisk: streak > 0 && !practisedToday,
    freezes,
    count: daily.count,
    goal: daily.goal,
    remainingToGoal: Math.max(0, daily.goal - daily.count),
  };
}

// ---------------------------------------------------------------------
// Weak spots
// ---------------------------------------------------------------------

/** What an item shows as in the weak-spot list. */
function weakLabel(area, row) {
  if (area.id === "vocabulary") return `${row.Hebrew}${row.English ? " — " + row.English : ""}`;
  if (area.id === "accents") return row.EnglishName || row.HebrewName;
  return row.Name;
}

/**
 * The items missed most, across Consonants, Vowels, Vocabulary and Accents
 * (verb forms are left out: the drill quiz has no verb questions).
 * An item counts as weak once it has been missed at least twice and is
 * right less than 80% of the time; the worst come first.
 *   [{ areaId, areaTitle, key, label, row, seen, missed, direction? }]
 * `direction` (vocabulary only) is the direction it is missed in most.
 */
export function getWeakSpots(limit = 5) {
  const out = [];
  for (const area of getAreas()) {
    if (!area.drill) continue;
    const pool = area.pool();
    if (pool.length === 0) continue;
    const byKey = new Map(pool.map((r) => [area.key(r), r]));
    const stats = new Map(); // key -> { seen, correct, byMode }
    for (const mode of area.statModes) {
      for (const [key, e] of Object.entries(getScheduleEntries(mode))) {
        if (!byKey.has(key)) continue;
        const s = stats.get(key) || { seen: 0, correct: 0, byMode: {} };
        const missed = (e.timesSeen || 0) - (e.timesCorrect || 0);
        s.seen += e.timesSeen || 0;
        s.correct += e.timesCorrect || 0;
        s.byMode[mode] = (s.byMode[mode] || 0) + missed;
        stats.set(key, s);
      }
    }
    for (const [key, s] of stats) {
      const missed = s.seen - s.correct;
      if (missed < 2 || s.correct / s.seen >= 0.8) continue;
      const row = byKey.get(key);
      const item = { areaId: area.id, areaTitle: area.title, key, label: weakLabel(area, row), row, seen: s.seen, missed };
      if (area.id === "vocabulary") {
        const heb = (s.byMode["vocab-typing-hebrew"] || 0) + (s.byMode["vocab-flashcards-hebrew"] || 0) + (s.byMode["vocab-games-hebrew"] || 0);
        const eng = (s.byMode["vocab-typing-english"] || 0) + (s.byMode["vocab-flashcards-english"] || 0) + (s.byMode["vocab-games-english"] || 0);
        item.direction = eng > heb ? "english" : "hebrew";
      }
      out.push(item);
    }
  }
  out.sort((a, b) => b.missed - a.missed || (a.seen - a.missed) / a.seen - (b.seen - b.missed) / b.seen || a.label.localeCompare(b.label));
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------
// Word of the day
// ---------------------------------------------------------------------

/** A small stable hash, so the same date always picks the same form. */
function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One verb form for the day — the same for everyone all day, a different one
 * tomorrow:  { form, gloss, parsing: { verb, binyan, mode, pgn } } or null.
 * Only finite forms with a person are chosen, so the parsing has something to say.
 */
export function getWordOfTheDay(now = new Date()) {
  const rows = loadVerbData(getAvailableDatasets()).filter((r) => r.Conjugation && r.Binyan && r.Mode);
  if (rows.length === 0) return null;
  const row = rows[hashString(ymd(now)) % rows.length];
  const pgn = `${row.Person || ""}${row.Gender || ""}${row.Number || ""}`;
  return {
    form: row.Conjugation,
    gloss: row["Gloss Translation"] || "",
    parsing: { verb: row.Dataset, binyan: row.Binyan, mode: row.Mode, pgn },
  };
}

/**
 * One vocabulary word for the day — the same all day, a different one tomorrow:
 *   { hebrew, english, lesson, frequency, pos } or null.
 * (Hashed separately from the verb of the day, so the two don't move in step.)
 */
export function getVocabOfTheDay(now = new Date()) {
  const rows = getVocabRows().filter((r) => r.Hebrew && r.English);
  if (rows.length === 0) return null;
  const row = rows[hashString("vocab-" + ymd(now)) % rows.length];
  return { hebrew: row.Hebrew, english: row.English, lesson: row.Lesson, frequency: row.Frequency, pos: row.POS };
}

// ---------------------------------------------------------------------
// Achievements closest to being earned
// ---------------------------------------------------------------------

/**
 * The achievements not yet unlocked that are furthest along, nearest first:
 *   [{ id, icon, title, desc, progress, target, ratio }]
 * Only ones with some progress are listed. Returns { items, allUnlocked }.
 */
export function getClosestAchievements(limit = 4) {
  const ctx = buildContext();
  const locked = ACHIEVEMENTS.map((a) => ({ a, progress: a.progress(ctx) })).filter(({ a, progress }) => progress < a.target);
  const items = locked
    .map(({ a, progress }) => ({
      id: a.id,
      icon: a.icon,
      title: a.title,
      desc: a.desc,
      progress,
      target: a.target,
      ratio: progress / a.target,
    }))
    .filter((x) => x.ratio > 0)
    .sort((x, y) => y.ratio - x.ratio)
    .slice(0, limit);
  return { items, allUnlocked: locked.length === 0 };
}

// ---------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------

export const QUIZ_HISTORY_MODES = [
  ["parsing", "Verb Parsing"],
  ["construction", "Verb Construction"],
  ["vocab-typing", "Vocabulary Typing"],
  ["accent-typing", "Accents Typing"],
  ["consonant-typing", "Consonants Typing"],
  ["vowel-typing", "Vowels Typing"],
  ["bible-article", "Definite Article"],
  ["bible-dagesh", "Dagesh"],
  ["bible-suffix", "Pronominal Suffixes"],
];

/** { lastPracticeDate, lastQuiz: { label, score, total, percent, timestamp } | null } */
export function getRecentActivity() {
  let lastQuiz = null;
  for (const [mode, label] of QUIZ_HISTORY_MODES) {
    const newest = loadHistory(mode)[0];
    if (newest && (!lastQuiz || newest.timestamp > lastQuiz.timestamp)) {
      lastQuiz = { label, score: newest.score, total: newest.total, percent: newest.percent, timestamp: newest.timestamp };
    }
  }
  return { lastPracticeDate: getStreakInfo().lastActiveDate || null, lastQuiz };
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", "2 weeks ago", ... */
export function timeAgo(ts, now = Date.now()) {
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  return "a while ago";
}

/** "today", "yesterday", "3 days ago" for a YYYY-MM-DD date. */
export function dayAgo(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const n = daysBetween(dateStr, ymd(now));
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}
