import { pickOne } from "./helpers.js";
import { celebrate } from "./celebrate.js";
import { showToast } from "./toast.js";
import { getDisplayName } from "./profile.js";
import { STREAK_MILESTONES, streakMilestoneMessage } from "./encourage.js";

const STREAK_KEY = "hebrewVerbApp:streak";
const DAILY_GOAL_KEY = "hebrewVerbApp:dailyGoal";
const DAILY_PROGRESS_KEY = "hebrewVerbApp:dailyProgress";
const FREEZE_KEY = "hebrewVerbApp:streakFreezes";
const DEFAULT_DAILY_GOAL = 15;
const MAX_FREEZES = 3;
const scheduleKey = (mode) => `hebrewVerbApp:srs:${mode}`;

// Days until an item in each Leitner box is due for review again. Box 1
// is "just got this wrong" (or never seen) — due immediately, since a
// missed item deserves another shot in the same session. Each correct
// answer moves an item up a box; any wrong answer resets it to box 1.
const INTERVAL_DAYS = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
const MAX_BOX = 5;
/** The Leitner box that counts as "mastered". */
export const MASTERED_BOX = MAX_BOX;

// A tally of practice answers per calendar day, for the My Progress activity
// calendar: { "2026-10-14": 23, ... }. Kept to the last ACTIVITY_DAYS_KEPT days.
const ACTIVITY_KEY = "hebrewVerbApp:activityLog";
const ACTIVITY_DAYS_KEPT = 400;

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA + "T00:00:00");
  const b = new Date(dateStrB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable — not critical */
  }
}

// ============ Streaks ============

export function getStreakInfo() {
  return loadJSON(STREAK_KEY, { currentStreak: 0, longestStreak: 0, lastActiveDate: null });
}

// ============ Daily goal ============

export function getDailyGoal() {
  const stored = loadJSON(DAILY_GOAL_KEY, null);
  return typeof stored === "number" && stored > 0 ? stored : DEFAULT_DAILY_GOAL;
}

export function setDailyGoal(n) {
  const goal = Math.max(1, Math.round(n));
  saveJSON(DAILY_GOAL_KEY, goal);
  renderStreakDisplay();
}

/** Today's practice-item count vs. the daily goal, for the sidebar's
 * progress bar and the Home page's "due today" card. Resets itself
 * the first time it's read on a new day (no separate cleanup needed). */
export function getDailyProgress() {
  const today = todayString();
  const stored = loadJSON(DAILY_PROGRESS_KEY, { date: today, count: 0 });
  const count = stored.date === today ? stored.count : 0;
  return { count, goal: getDailyGoal(), date: today };
}

function bumpDailyProgress() {
  const today = todayString();
  const stored = loadJSON(DAILY_PROGRESS_KEY, { date: today, count: 0 });
  const before = stored.date === today ? stored.count : 0;
  const count = before + 1;
  saveJSON(DAILY_PROGRESS_KEY, { date: today, count });
  bumpActivityLog(today);
  return { before, count };
}

/** "Dana, " or "" — for the few messages that address the student by name. */
function nameLead() {
  const name = getDisplayName();
  return name ? `${name}, ` : "";
}

/** Practice answers per day: { "YYYY-MM-DD": count }. Recording began with the
 * update that added the My Progress calendar, so earlier days are not in it. */
export function getActivityLog() {
  const log = loadJSON(ACTIVITY_KEY, {});
  return log && typeof log === "object" && !Array.isArray(log) ? log : {};
}

function bumpActivityLog(today) {
  const log = getActivityLog();
  log[today] = (log[today] || 0) + 1;
  const days = Object.keys(log).sort();
  for (const old of days.slice(0, Math.max(0, days.length - ACTIVITY_DAYS_KEPT))) delete log[old];
  saveJSON(ACTIVITY_KEY, log);
}

// ============ Streak freezes ============
// Missing exactly one day doesn't have to break a streak — the person
// earns a freeze every 7-day milestone (capped at MAX_FREEZES) and one
// is spent automatically the next time a single missed day would
// otherwise reset the count back to 1.

export function getStreakFreezeCount() {
  return loadJSON(FREEZE_KEY, 0);
}

function setStreakFreezeCount(n) {
  saveJSON(FREEZE_KEY, Math.max(0, Math.min(MAX_FREEZES, n)));
}

/** Call whenever the person does something that should count toward
 * today's streak (checking a practice answer, finishing a quiz
 * question, etc). Safe to call many times in one day — only the first
 * call each day actually changes the streak, though every call still
 * counts toward today's daily-goal progress. */
export function recordStreakActivity() {
  const { before, count } = bumpDailyProgress();

  const streak = getStreakInfo();
  const today = todayString();
  const firstActivityToday = streak.lastActiveDate !== today;

  if (streak.lastActiveDate === today) {
    // already counted today
  } else if (streak.lastActiveDate && daysBetween(streak.lastActiveDate, today) === 1) {
    streak.currentStreak = (streak.currentStreak || 0) + 1;
  } else if (streak.lastActiveDate && daysBetween(streak.lastActiveDate, today) === 2 && getStreakFreezeCount() > 0) {
    // Exactly one day was missed and a freeze is available — spend it
    // to keep the streak alive instead of resetting to 1.
    setStreakFreezeCount(getStreakFreezeCount() - 1);
    streak.currentStreak = (streak.currentStreak || 0) + 1;
  } else {
    streak.currentStreak = 1;
  }
  streak.lastActiveDate = today;
  streak.longestStreak = Math.max(streak.longestStreak || 0, streak.currentStreak);

  // Award a freeze every 7-day milestone, capped at MAX_FREEZES.
  if (streak.currentStreak > 0 && streak.currentStreak % 7 === 0 && streak.lastFreezeAwardedAt !== streak.currentStreak) {
    streak.lastFreezeAwardedAt = streak.currentStreak;
    setStreakFreezeCount(getStreakFreezeCount() + 1);
  }

  saveJSON(STREAK_KEY, streak);
  renderStreakDisplay();

  // Marking the moment: the daily goal (once a day, on the answer that reaches it) and a
  // streak milestone (on the first practice of the day that lands on one).
  const goal = getDailyGoal();
  if (before < goal && count >= goal) {
    celebrate("goal");
    showToast({
      icon: "🎯",
      title: "Daily goal reached!",
      body: `${nameLead()}well done. That's ${goal} answers today.`.replace(/^./, (c) => c.toUpperCase()),
      duration: 5000,
    });
  } else if (firstActivityToday && STREAK_MILESTONES.includes(streak.currentStreak)) {
    celebrate("streak");
    showToast({ icon: "🔥", title: "Streak milestone!", body: streakMilestoneMessage(streak.currentStreak), duration: 5000 });
  }
}

// ============ Spaced repetition (Leitner boxes) ============

function loadSchedule(mode) {
  return loadJSON(scheduleKey(mode), {});
}

function saveSchedule(mode, schedule) {
  saveJSON(scheduleKey(mode), schedule);
}

/** Record whether a specific item (identified by a stable key, e.g.
 * from helpers.js's morphKey) was answered correctly, updating its
 * Leitner box and next-due date. */
export function recordItemResult(mode, itemKey, correct) {
  const schedule = loadSchedule(mode);
  const existing = schedule[itemKey];
  const prevBox = existing ? existing.box : 1;
  const newBox = correct ? Math.min(prevBox + 1, MAX_BOX) : 1;
  const intervalDays = INTERVAL_DAYS[newBox] ?? 0;

  schedule[itemKey] = {
    box: newBox,
    dueDate: Date.now() + intervalDays * 86400000,
    timesSeen: (existing?.timesSeen || 0) + 1,
    timesCorrect: (existing?.timesCorrect || 0) + (correct ? 1 : 0),
  };
  saveSchedule(mode, schedule);
}

function categorize(mode, pool, keyFn) {
  const schedule = loadSchedule(mode);
  const now = Date.now();
  const due = [];
  const fresh = [];
  const notDue = [];
  for (const item of pool) {
    const sched = schedule[keyFn(item)];
    if (!sched) fresh.push(item);
    else if (sched.dueDate <= now) due.push(item);
    else notDue.push(item);
  }
  return { due, fresh, notDue };
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks an item from `pool`, prioritizing (in order): items that are
 * due for review, then items never seen before, then items not yet
 * due (recently correct, scheduled for later) as a last resort. This
 * is what makes Practice mode adaptive — it naturally surfaces weak
 * spots and steadily introduces new material, rather than sampling
 * uniformly at random.
 */
export function pickAdaptive(mode, pool, keyFn) {
  if (!pool || pool.length === 0) return null;
  const { due, fresh, notDue } = categorize(mode, pool, keyFn);
  if (due.length) return pickOne(due);
  if (fresh.length) return pickOne(fresh);
  return pickOne(notDue);
}

/** How many items in `pool` are currently due for review under `mode`
 * — used for the Home page's "due today" summary across every mode at
 * once, without building a full deck for each. */
export function getDueCount(mode, pool, keyFn) {
  if (!pool || pool.length === 0) return 0;
  return categorize(mode, pool, keyFn).due.length;
}

/**
 * Orders the whole of `pool` for a study session — due items first,
 * then never-seen items, then not-yet-due items, each group shuffled
 * internally. Unlike pickAdaptive (which returns a single item), this
 * is for building an entire deck/session in priority order, e.g. so a
 * flashcard round surfaces weak spots earlier in the deck.
 */
export function sortByPriority(mode, pool, keyFn) {
  if (!pool || pool.length === 0) return [];
  const { due, fresh, notDue } = categorize(mode, pool, keyFn);
  return [...shuffleArray(due), ...shuffleArray(fresh), ...shuffleArray(notDue)];
}

/** Counts of new / still-learning / mastered items within `pool`, for
 * a small progress readout on the Practice page. */
export function getMasteryStats(mode, pool, keyFn) {
  const schedule = loadSchedule(mode);
  let newCount = 0;
  let learning = 0;
  let mastered = 0;
  for (const item of pool) {
    const sched = schedule[keyFn(item)];
    if (!sched) newCount++;
    else if (sched.box >= MAX_BOX) mastered++;
    else learning++;
  }
  return { newCount, learning, mastered, total: pool.length };
}

/**
 * Like getMasteryStats, but computed directly from a mode's saved
 * schedule with no need for the full pool of possible items (which for
 * verb datasets depends on which datasets/filters are selected). Can't
 * report a "new" count (there's no pool to compare against), but
 * that's fine for a summary dashboard showing what's actually been
 * practiced so far.
 */
export function getScheduleSummary(mode) {
  const schedule = loadSchedule(mode);
  const items = Object.values(schedule);
  const mastered = items.filter((s) => s.box >= MAX_BOX).length;
  return { totalTracked: items.length, learning: items.length - mastered, mastered };
}

/** The saved schedule for one mode: { [itemKey]: { box, dueDate, timesSeen,
 * timesCorrect } }. Read-only — used by the Home page's weak-spot and
 * progress summaries. */
export function getScheduleEntries(mode) {
  return loadSchedule(mode);
}

/**
 * Counts DISTINCT item keys mastered across several SRS modes at once
 * (e.g. every mode a person could have practiced a given word or verb
 * form in), so a word mastered under more than one mode isn't counted
 * twice. Used for cross-mode achievement/goal tracking.
 */
export function getMasteredKeyCount(modes) {
  const set = new Set();
  for (const mode of modes) {
    const schedule = loadSchedule(mode);
    for (const [key, sched] of Object.entries(schedule)) {
      if (sched.box >= MAX_BOX) set.add(key);
    }
  }
  return set.size;
}

/** The DISTINCT item keys mastered in at least one of `modes` — the same
 * test getMasteredKeyCount uses, but returning the keys themselves. The Daily
 * Challenge uses this to slip a few already-mastered items in for review. */
export function getMasteredKeys(modes) {
  const set = new Set();
  for (const mode of modes) {
    for (const [key, sched] of Object.entries(loadSchedule(mode))) {
      if (sched.box >= MAX_BOX) set.add(key);
    }
  }
  return set;
}

// ============ Sidebar UI ============

/**
 * The sidebar's streak chip: a small link to My Progress showing the streak and
 * today's goal. (The daily-goal setting and Reset Progress now live on My Progress.)
 */
export function renderStreakDisplay() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("streak-display");
  if (!el) return;

  const streak = getStreakInfo();
  const daily = getDailyProgress();
  const freezes = getStreakFreezeCount();
  const pct = Math.min(100, Math.round((daily.count / daily.goal) * 100));
  const freezeNote = freezes > 0 ? ` <span title="${freezes} streak freeze${freezes === 1 ? "" : "s"} available">🧊×${freezes}</span>` : "";

  const headline = streak.currentStreak
    ? `<span class="streak-count">${streak.currentStreak}</span>
       <span class="streak-label">Day Streak${streak.longestStreak > streak.currentStreak ? ` · Best ${streak.longestStreak}` : ""}${freezeNote}</span>`
    : `<span class="streak-none">Practice today to start a streak.</span>`;

  el.innerHTML = `
    <a class="streak-chip" href="#progress" title="Open My Progress — ${daily.count} of ${daily.goal} practice items today">
      <span class="streak-chip-top">${headline}</span>
      <span class="daily-goal-bar"><span class="daily-goal-fill" style="width:${pct}%"></span></span>
      <span class="daily-goal-label">${daily.count} / ${daily.goal} today</span>
    </a>
  `;
}

/** Clears the streak, goal, calendar and every review schedule (the caller asks first). */
export function resetAllProgress() {
  try {
    localStorage.removeItem(STREAK_KEY);
    localStorage.removeItem(DAILY_GOAL_KEY);
    localStorage.removeItem(DAILY_PROGRESS_KEY);
    localStorage.removeItem(FREEZE_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    localStorage.removeItem("hebrewVerbApp:dailyLog"); // the Daily Challenge calendar
    localStorage.removeItem(scheduleKey("parsing"));
    localStorage.removeItem(scheduleKey("construction"));
    localStorage.removeItem(scheduleKey("vocab-typing-hebrew"));
    localStorage.removeItem(scheduleKey("vocab-typing-english"));
    localStorage.removeItem(scheduleKey("vocab-flashcards-hebrew"));
    localStorage.removeItem(scheduleKey("vocab-flashcards-english"));
    localStorage.removeItem(scheduleKey("verb-flashcards-hebrew"));
    localStorage.removeItem(scheduleKey("verb-flashcards-english"));
    localStorage.removeItem(scheduleKey("vocab-games-hebrew"));
    localStorage.removeItem(scheduleKey("vocab-games-english"));
    localStorage.removeItem(scheduleKey("accent-typing-names"));
    localStorage.removeItem(scheduleKey("accent-typing-symbol"));
    localStorage.removeItem(scheduleKey("accent-typing-form"));
    localStorage.removeItem(scheduleKey("accent-flashcards"));
    localStorage.removeItem(scheduleKey("accent-games-names"));
    localStorage.removeItem(scheduleKey("accent-games-symbol"));
    localStorage.removeItem(scheduleKey("consonant-typing-names"));
    localStorage.removeItem(scheduleKey("consonant-typing-symbol"));
    localStorage.removeItem(scheduleKey("consonant-typing-form"));
    localStorage.removeItem(scheduleKey("consonant-flashcards"));
    localStorage.removeItem(scheduleKey("consonant-games-names"));
    localStorage.removeItem(scheduleKey("consonant-games-symbol"));
    localStorage.removeItem(scheduleKey("vowel-typing-names"));
    localStorage.removeItem(scheduleKey("vowel-typing-symbol"));
    localStorage.removeItem(scheduleKey("vowel-typing-form"));
    localStorage.removeItem(scheduleKey("vowel-flashcards"));
    localStorage.removeItem(scheduleKey("vowel-games-names"));
    localStorage.removeItem(scheduleKey("vowel-games-symbol"));
  } catch (e) {
    /* ignore */
  }
  renderStreakDisplay();
}

let initialized = false;

/** Draws the sidebar's streak chip. Call once. */
export function initProgressSidebar() {
  if (initialized) return;
  initialized = true;
  renderStreakDisplay();
}
