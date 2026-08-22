import { assert, summary } from "./helpers.mjs";

console.log("SRS logic (Leitner boxes, adaptive picking, streaks)");

// Minimal localStorage mock — no DOM needed for these pure-logic checks.
const storageData = {};
global.localStorage = {
  getItem: (k) => (k in storageData ? storageData[k] : null),
  setItem: (k, v) => {
    storageData[k] = String(v);
  },
  removeItem: (k) => {
    delete storageData[k];
  },
};

const { recordItemResult, pickAdaptive, getMasteryStats, recordStreakActivity, getStreakInfo } = await import(
  "../js/srs.js"
);

// ---- Leitner box transitions ----
recordItemResult("test", "itemA", true); // first attempt, correct -> box 2
let raw = JSON.parse(storageData["hebrewVerbApp:srs:test"]);
assert(raw.itemA.box === 2, "first correct answer moves a new item to box 2");
assert(raw.itemA.dueDate > Date.now(), "box 2 has a due date in the future (1 day out)");

recordItemResult("test", "itemA", true); // correct again -> box 3
raw = JSON.parse(storageData["hebrewVerbApp:srs:test"]);
assert(raw.itemA.box === 3, "second correct answer advances to box 3");

recordItemResult("test", "itemA", false); // wrong -> resets to box 1
raw = JSON.parse(storageData["hebrewVerbApp:srs:test"]);
assert(raw.itemA.box === 1, "a wrong answer resets the box to 1, regardless of prior progress");
assert(raw.itemA.dueDate <= Date.now(), "box 1 is due immediately");

recordItemResult("test", "itemB", false); // brand new item, first attempt wrong -> box 1
raw = JSON.parse(storageData["hebrewVerbApp:srs:test"]);
assert(raw.itemB.box === 1, "a new item's first wrong answer is box 1 (due immediately)");

// Box should cap at 5 (MAX_BOX), not climb indefinitely.
for (let i = 0; i < 10; i++) recordItemResult("test", "itemC", true);
raw = JSON.parse(storageData["hebrewVerbApp:srs:test"]);
assert(raw.itemC.box === 5, "repeated correct answers cap out at box 5, not climbing forever");

// ---- timesSeen / timesCorrect bookkeeping ----
assert(raw.itemA.timesSeen === 3, "itemA was attempted 3 times total");
assert(raw.itemA.timesCorrect === 2, "itemA was correct 2 of those 3 times");

// ---- pickAdaptive priority: due > fresh (never seen) > not-due ----
delete storageData["hebrewVerbApp:srs:priority"];
const pool = [
  { id: "due-item" },
  { id: "fresh-item" },
  { id: "not-due-item" },
];
// Manually seed the schedule: "due-item" is overdue, "not-due-item" is scheduled far in the future.
localStorage.setItem(
  "hebrewVerbApp:srs:priority",
  JSON.stringify({
    "due-item": { box: 1, dueDate: Date.now() - 1000, timesSeen: 1, timesCorrect: 0 },
    "not-due-item": { box: 5, dueDate: Date.now() + 999999999, timesSeen: 5, timesCorrect: 5 },
  })
);
// "fresh-item" has no entry at all — never seen.

const keyFn = (item) => item.id;
const picks = new Set();
for (let i = 0; i < 20; i++) picks.add(pickAdaptive("priority", pool, keyFn).id);
assert(picks.size === 1 && picks.has("due-item"), "when a due item exists, it's always picked over fresh/not-due items");

// Remove the due item — fresh should now win over not-due. Use a pool
// that excludes "due-item" entirely here, since clearing its schedule
// entry would otherwise make it look "fresh" too (no longer due),
// muddying this specific comparison.
localStorage.setItem(
  "hebrewVerbApp:srs:priority",
  JSON.stringify({
    "not-due-item": { box: 5, dueDate: Date.now() + 999999999, timesSeen: 5, timesCorrect: 5 },
  })
);
const freshVsNotDuePool = [{ id: "fresh-item" }, { id: "not-due-item" }];
const picks2 = new Set();
for (let i = 0; i < 20; i++) picks2.add(pickAdaptive("priority", freshVsNotDuePool, keyFn).id);
assert(picks2.size === 1 && picks2.has("fresh-item"), "with no due items, a never-seen item is picked over a not-yet-due one");

// Only not-due items left — should still return something (last resort).
const onlyNotDuePool = [{ id: "not-due-item" }];
const fallbackPick = pickAdaptive("priority", onlyNotDuePool, keyFn);
assert(fallbackPick.id === "not-due-item", "falls back to a not-due item if it's the only option available");

// ---- getMasteryStats ----
delete storageData["hebrewVerbApp:srs:mastery"];
localStorage.setItem(
  "hebrewVerbApp:srs:mastery",
  JSON.stringify({
    a: { box: 5, dueDate: 0 },
    b: { box: 3, dueDate: 0 },
  })
);
const statsPool = [{ id: "a" }, { id: "b" }, { id: "c" }];
const stats = getMasteryStats("mastery", statsPool, (item) => item.id);
assert(stats.mastered === 1, "1 item at box 5 counts as mastered");
assert(stats.learning === 1, "1 item below box 5 (but seen) counts as learning");
assert(stats.newCount === 1, "1 item with no schedule entry counts as new");
assert(stats.total === 3, "total reflects the full pool size");

// ---- Streaks ----
delete storageData["hebrewVerbApp:streak"];
recordStreakActivity();
let streak = getStreakInfo();
assert(streak.currentStreak === 1, "first-ever activity starts a streak of 1");

recordStreakActivity(); // same day again — should NOT double-count
streak = getStreakInfo();
assert(streak.currentStreak === 1, "calling it again the same day does not increment further");

// Simulate "yesterday" by directly manipulating the stored date, then
// recording activity "today" — streak should increment.
const y = new Date();
y.setDate(y.getDate() - 1);
const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
localStorage.setItem("hebrewVerbApp:streak", JSON.stringify({ currentStreak: 4, longestStreak: 4, lastActiveDate: yesterday }));
recordStreakActivity();
streak = getStreakInfo();
assert(streak.currentStreak === 5, "activity on the day right after the last one extends the streak");
assert(streak.longestStreak === 5, "longest streak tracks the new high");

// Simulate a gap of several days — streak should reset to 1, but
// longestStreak should be preserved as a "personal best".
localStorage.setItem(
  "hebrewVerbApp:streak",
  JSON.stringify({ currentStreak: 10, longestStreak: 10, lastActiveDate: "2020-01-01" })
);
recordStreakActivity();
streak = getStreakInfo();
assert(streak.currentStreak === 1, "a multi-day gap resets the current streak to 1");
assert(streak.longestStreak === 10, "the longest-streak record is preserved even after a reset");

summary();
