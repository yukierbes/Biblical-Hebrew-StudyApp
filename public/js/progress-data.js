// What the My Progress page knows, worked out from the app's saved practice data.
//
// Like home-data.js this is plain data in, plain data out (no HTML), so the page
// stays a thin layer and every number can be tested on its own:
//
//   getOverview            — headline numbers (streak, mastered, active days)
//   getAreaBreakdown       — new / learning / mastered for an area, and per mode
//   getItemMap             — every consonant, vowel or accent with its status
//   getGroupMastery        — mastery by lesson, binyan, … (Vocabulary and Verbs)
//   getAccuracyGroups      — how often you are RIGHT by category (Strengths)
//   getWeakList            — every weak item, for the full weak-spots list
//   getQuizTrends          — quiz scores over time, per quiz
//   getReviewForecast      — reviews due each day this week
//   getActivityGrid        — the practice calendar
//
// The status words mean the same as on the Home page: an item is MASTERED once it
// reaches the top box in at least one mode, LEARNING once it has been practised at
// all, and NEW before that.

import { getAreas, getAllAreaStats, getStreakStatus, getWeakSpots, totalDue, QUIZ_HISTORY_MODES } from "./home-data.js";
import { getScheduleEntries, getActivityLog, getDailyGoal, getStreakInfo, getMasteryStats, MASTERED_BOX } from "./srs.js";
import { loadHistory } from "./history.js";

/** Fewer answers than this and a category's accuracy isn't shown as a verdict. */
export const MIN_ANSWERS = 5;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

// ---------------------------------------------------------------------
// Names for the practice modes
// ---------------------------------------------------------------------

const VOCAB_MODE_LABELS = {
  "vocab-typing-hebrew": "Typing: Hebrew → English",
  "vocab-typing-english": "Typing: English → Hebrew",
  "vocab-flashcards-hebrew": "Flashcards: Hebrew first",
  "vocab-flashcards-english": "Flashcards: English first",
  "vocab-games-hebrew": "Games: Hebrew → English",
  "vocab-games-english": "Games: English → Hebrew",
};
const VERB_MODE_LABELS = {
  parsing: "Parsing",
  construction: "Construction",
  "verb-flashcards-hebrew": "Flashcards: Hebrew first",
  "verb-flashcards-english": "Flashcards: English first",
};
const NOUN = { consonants: "Consonant", vowels: "Vowel", accents: "Accent" };

/** "Typing: Name → Vowel" for a saved practice mode of an area. */
export function modeLabel(area, mode) {
  if (VOCAB_MODE_LABELS[mode]) return VOCAB_MODE_LABELS[mode];
  if (VERB_MODE_LABELS[mode]) return VERB_MODE_LABELS[mode];
  const noun = NOUN[area.id] || "Item";
  const kind = mode.replace(/^(consonant|vowel|accent)-/, "");
  switch (kind) {
    case "typing-names":
      return `Typing: Name → ${noun}`;
    case "typing-form":
      return `Typing: ${noun} → Name`;
    case "typing-symbol":
      return area.id === "accents" ? "Daily Challenge: copy the accent" : "Typing: keyboard shortcut (earlier version)";
    case "flashcards":
      return "Flashcards";
    case "games-names":
      return `Games: Name → ${noun}`;
    case "games-symbol":
      return `Games: ${noun} → Keyboard`;
    default:
      return mode;
  }
}

// ---------------------------------------------------------------------
// Per-item status
// ---------------------------------------------------------------------

/**
 * Everything the saved schedules say about each item of an area, combined over
 * all of its modes: Map key -> { mastered, seen, correct }. Items never
 * practised are not in the map.
 */
export function getItemStatusMap(area) {
  const map = new Map();
  for (const mode of area.statModes) {
    for (const [key, e] of Object.entries(getScheduleEntries(mode))) {
      const s = map.get(key) || { mastered: false, seen: 0, correct: 0 };
      if (e.box >= MASTERED_BOX) s.mastered = true;
      s.seen += e.timesSeen || 0;
      s.correct += e.timesCorrect || 0;
      map.set(key, s);
    }
  }
  return map;
}

const statusOf = (map, key) => (map.has(key) ? (map.get(key).mastered ? "mastered" : "learning") : "new");

/** { mastered, learning, new, total, due, pct } for one area, from its pool. */
export function getAreaSplit(area, statusMap = getItemStatusMap(area)) {
  const split = { mastered: 0, learning: 0, new: 0, total: 0 };
  for (const row of area.pool()) {
    split[statusOf(statusMap, area.key(row))]++;
    split.total++;
  }
  return split;
}

/**
 * The detail for one area: its split, and one line per mode it has been
 * practised in: [{ mode, label, newCount, learning, mastered, total }].
 */
export function getAreaBreakdown(area) {
  const pool = area.pool();
  const modes = [];
  for (const mode of area.statModes) {
    const m = getMasteryStats(mode, pool, area.key);
    if (m.learning + m.mastered === 0) continue; // never used in this mode
    modes.push({ mode, label: modeLabel(area, mode), ...m });
  }
  return { split: getAreaSplit(area), modes };
}

// ---------------------------------------------------------------------
// Groupings (by lesson, binyan, class, …)
// ---------------------------------------------------------------------

const PERSON_LABELS = { 1: "1st person", 2: "2nd person", 3: "3rd person", "": "No person (participles, infinitives)" };
const PERSON_ORDER = ["1st person", "2nd person", "3rd person", PERSON_LABELS[""]];
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * How each area can be broken down. `by(row)` gives the group name (or several,
 * for a row that belongs to more than one); `sort` is "natural" (the order the
 * data lists them), "alpha" (numbers in order), "size" (biggest first) or an
 * explicit list.
 */
export const GROUPINGS = {
  consonants: [
    {
      id: "category",
      title: "By category",
      sort: "size",
      by: (r) => {
        const parts = String(r.Category || "").split(",").map((s) => s.trim()).filter(Boolean);
        return parts.length ? parts : ["No category"];
      },
    },
  ],
  vowels: [
    { id: "class", title: "By class", sort: "alpha", by: (r) => `Class ${r.Class}` },
    { id: "length", title: "By length", sort: ["Short", "Reduced", "Changeably long", "Unchangeably long"], by: (r) => cap(r.Length) },
  ],
  vocabulary: [
    { id: "lesson", title: "By lesson", sort: "alpha", by: (r) => `Lesson ${r.Lesson}` },
    { id: "pos", title: "By part of speech", sort: "size", by: (r) => r.POS || "Other" },
  ],
  verbs: [
    { id: "binyan", title: "By binyan", sort: "natural", by: (r) => r.Binyan },
    { id: "mode", title: "By verb form", sort: "natural", by: (r) => r.Mode },
    { id: "person", title: "By person", sort: PERSON_ORDER, by: (r) => PERSON_LABELS[r.Person || ""] || PERSON_LABELS[""] },
    { id: "verb", title: "By verb", sort: "alpha", by: (r) => r.Dataset },
  ],
  accents: [
    { id: "type", title: "By type", sort: "natural", by: (r) => r.Type },
    { id: "group", title: "By group", sort: "alpha", by: (r) => (r.Group ? `Group ${r.Group}` : "No group") },
  ],
};

function sortGroups(groups, sort) {
  const list = [...groups];
  if (Array.isArray(sort)) return list.sort((a, b) => sort.indexOf(a.label) - sort.indexOf(b.label));
  if (sort === "alpha") return list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  if (sort === "size") return list.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
  return list; // "natural": first appearance in the data
}

/** The groups of an area under one grouping: [{ label, total, items: [{row,key}] }]. */
function buildGroups(area, grouping) {
  const byLabel = new Map();
  for (const row of area.pool()) {
    const labels = [].concat(grouping.by(row)).filter(Boolean);
    for (const label of labels) {
      if (!byLabel.has(label)) byLabel.set(label, { label, total: 0, items: [] });
      const g = byLabel.get(label);
      g.total++;
      g.items.push({ row, key: area.key(row) });
    }
  }
  return sortGroups([...byLabel.values()], grouping.sort);
}

/** Mastery by group: [{ label, total, mastered, learning, new }]. */
export function getGroupMastery(area, grouping, statusMap = getItemStatusMap(area)) {
  return buildGroups(area, grouping).map((g) => {
    const out = { label: g.label, total: g.total, mastered: 0, learning: 0, new: 0 };
    for (const it of g.items) out[statusOf(statusMap, it.key)]++;
    return out;
  });
}

/**
 * Accuracy by group: [{ label, total, practised, seen, correct, pct }].
 * `seen`/`correct` add up every answer to the group's items in every mode;
 * `pct` is null until there is at least one answer.
 */
export function getAccuracyGroups(area, grouping, statusMap = getItemStatusMap(area)) {
  return buildGroups(area, grouping).map((g) => {
    let seen = 0;
    let correct = 0;
    let practised = 0;
    for (const it of g.items) {
      const s = statusMap.get(it.key);
      if (!s) continue;
      practised++;
      seen += s.seen;
      correct += s.correct;
    }
    return { label: g.label, total: g.total, practised, seen, correct, pct: seen ? Math.round((correct / seen) * 100) : null };
  });
}

/** Strongest and weakest of a set of accuracy groups (only those with enough answers). */
export function strongestAndWeakest(groups) {
  const enough = groups.filter((g) => g.seen >= MIN_ANSWERS && g.pct !== null);
  if (enough.length < 2) return null;
  const sorted = [...enough].sort((a, b) => b.pct - a.pct || b.seen - a.seen);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.pct === worst.pct) return null;
  return { best, worst };
}

// ---------------------------------------------------------------------
// The item map (consonants, vowels, accents)
// ---------------------------------------------------------------------

/**
 * Every item of a small area with its status, in the data's order:
 * [{ key, name, form, group, status, weak, seen, correct }].
 * `weak` marks an item the Home page would list as a weak spot.
 */
export function getItemMap(area) {
  const statusMap = getItemStatusMap(area);
  const weakKeys = new Set(getWeakSpots(Infinity).filter((w) => w.areaId === area.id).map((w) => w.key));
  return area.pool().map((row) => {
    const key = area.key(row);
    const s = statusMap.get(key);
    const form = area.id === "accents" ? row.Symbol : row.Form;
    return {
      key,
      name: area.id === "accents" ? row.EnglishName || row.HebrewName : row.Name,
      form: form || "",
      group: area.id === "vowels" ? `Class ${row.Class}` : area.id === "accents" ? row.Type : null,
      status: statusOf(statusMap, key),
      weak: weakKeys.has(key),
      seen: s ? s.seen : 0,
      correct: s ? s.correct : 0,
    };
  });
}

// ---------------------------------------------------------------------
// Weak spots
// ---------------------------------------------------------------------

/** All weak items (worst first), optionally for one area: same rule as Home. */
export function getWeakList(areaId = null) {
  const all = getWeakSpots(Infinity);
  return areaId ? all.filter((w) => w.areaId === areaId) : all;
}

// ---------------------------------------------------------------------
// Quiz trends
// ---------------------------------------------------------------------

/**
 * One entry per quiz that has been taken: [{ mode, label, attempts (oldest first,
 * as percents), best, average, latest, trend: "up" | "down" | "flat" | null }].
 * The app keeps the last 20 attempts of each quiz.
 */
export function getQuizTrends() {
  const out = [];
  for (const [mode, label] of QUIZ_HISTORY_MODES) {
    const history = loadHistory(mode);
    if (history.length === 0) continue;
    const attempts = history.map((h) => h.percent).reverse();
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    let trend = null;
    if (attempts.length >= 4) {
      const half = Math.floor(attempts.length / 2);
      const diff = mean(attempts.slice(-half)) - mean(attempts.slice(0, half));
      trend = diff >= 5 ? "up" : diff <= -5 ? "down" : "flat";
    }
    out.push({
      mode,
      label,
      attempts,
      best: Math.max(...attempts),
      average: Math.round(mean(attempts)),
      latest: attempts[attempts.length - 1],
      trend,
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Review forecast
// ---------------------------------------------------------------------

/**
 * How many reviews fall due on each of the next 7 days (counting the same queues
 * the Home page counts as "due"). Day 0 is today and includes everything already
 * overdue. { days: [{ label, count }], dueNow, later }
 */
export function getReviewForecast(now = new Date()) {
  const counts = new Array(7).fill(0);
  let dueNow = 0;
  let later = 0;
  for (const area of getAreas()) {
    const keys = new Set(area.pool().map(area.key));
    for (const dm of area.dueModes) {
      for (const [key, e] of Object.entries(getScheduleEntries(dm.mode))) {
        if (!keys.has(key)) continue;
        if (e.dueDate <= now.getTime()) dueNow++;
        const idx = Math.max(0, dayDiff(now, new Date(e.dueDate)));
        if (idx >= 7) later++;
        else counts[idx]++;
      }
    }
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = counts.map((count, i) => ({
    label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : names[addDays(now, i).getDay()],
    count,
  }));
  return { days, dueNow, later };
}

// ---------------------------------------------------------------------
// Activity calendar
// ---------------------------------------------------------------------

/** 0 = nothing, 1–4 = how close the day came to the daily goal (4 = goal met). */
export function activityLevel(count, goal) {
  if (!count) return 0;
  if (count >= goal) return 4;
  if (count >= goal * 0.5) return 3;
  if (count >= goal * 0.25) return 2;
  return 1;
}

/**
 * The calendar: `weeks` columns of 7 days (Sunday on top), ending with the week
 * that holds today. { cells: [{ date, count, level, col, row, future }],
 * months: [{ col, label }], activeDays, answers, firstLogged, goal, weeks }
 */
export function getActivityGrid(weeks = 26, now = new Date()) {
  const log = getActivityLog();
  const goal = getDailyGoal();
  const today = startOfDay(now);
  const thisSunday = addDays(today, -today.getDay());
  const first = addDays(thisSunday, -(weeks - 1) * 7);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const cells = [];
  const months = [];
  let activeDays = 0;
  let answers = 0;
  let lastMonth = -1;
  for (let col = 0; col < weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const d = addDays(first, col * 7 + row);
      const future = d > today;
      const count = future ? 0 : log[ymd(d)] || 0;
      if (count > 0) {
        activeDays++;
        answers += count;
      }
      cells.push({ date: ymd(d), count, level: activityLevel(count, goal), col, row, future });
      if (row === 0 && d.getMonth() !== lastMonth) {
        months.push({ col, label: monthNames[d.getMonth()] });
        lastMonth = d.getMonth();
      }
    }
  }
  // A month label needs room: if the next month starts within 3 columns, the
  // earlier (partial) month goes unlabelled rather than running into it.
  for (let i = months.length - 2; i >= 0; i--) {
    if (months[i + 1].col - months[i].col < 3) months.splice(i, 1);
  }
  const loggedDays = Object.keys(log).filter((k) => log[k] > 0).sort();
  return { cells, months, activeDays, answers, firstLogged: loggedDays[0] || null, goal, weeks };
}

// ---------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------

/**
 * The headline numbers: { streak, bestStreak, today: { count, goal }, mastered,
 * total, pct, due, activeDays30, answers7, answersPrev7 }.
 */
export function getOverview(now = new Date()) {
  const allStats = getAllAreaStats();
  const status = getStreakStatus(now);
  const info = getStreakInfo();
  const log = getActivityLog();
  let activeDays30 = 0;
  let answers7 = 0;
  let answersPrev7 = 0;
  for (let i = 0; i < 30; i++) {
    const n = log[ymd(addDays(now, -i))] || 0;
    if (n > 0) activeDays30++;
    if (i < 7) answers7 += n;
    else if (i < 14) answersPrev7 += n;
  }
  const mastered = allStats.reduce((n, { stats }) => n + stats.mastered, 0);
  const total = allStats.reduce((n, { stats }) => n + stats.total, 0);
  return {
    streak: status.streak,
    bestStreak: Math.max(info.longestStreak || 0, status.streak),
    today: { count: status.count, goal: status.goal },
    mastered,
    total,
    pct: total ? Math.round((mastered / total) * 100) : 0,
    due: totalDue(allStats),
    activeDays30,
    answers7,
    answersPrev7,
  };
}
