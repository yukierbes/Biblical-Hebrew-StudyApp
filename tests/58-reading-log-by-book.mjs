import { setupApp, assert, summary } from "./helpers.mjs";
import {
  markVersesRead, unmarkVersesRead, markVerseRead, unmarkVerseRead, getChapterRead, getBookReadCounts, getReadLog, getReadingStats, migrateOldReadLog,
} from "../public/js/bible-insights.js";
import { findChanges } from "../public/js/sync-delta.js";

// The reading log: one small item per book, holding runs of verses per chapter, and the safe move from the old
// single log (one entry per verse).

const { localStorage } = await setupApp();
const P = "hebrewVerbApp:";
const OLD = P + "bibleReadLog";
const MIGRATED = "hebrewApp.bibleReadMigrated";
const refs = (book, ch, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${book}.${ch}.${from + i}`);
const snapshot = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => k.startsWith(P)).map((k) => [k, localStorage.getItem(k)]));
const d = (s) => new Date(s + "T12:00:00");
const clear = () => { for (const k of Object.keys(snapshot())) localStorage.removeItem(k); localStorage.removeItem(MIGRATED); };
const stored = (book) => JSON.parse(localStorage.getItem(P + "bibleRead:" + book) || "null");

console.log("Marking passages");
clear();
markVersesRead(refs("Gen", 1, 1, 8), d("2026-11-01"));
assert(JSON.stringify(stored("Gen")) === JSON.stringify({ 1: [[1, 8, "2026-11-01"]] }), "eight verses become one run: verses 1 to 8 on the day they were read");
assert(JSON.stringify(JSON.parse(localStorage.getItem(P + "bibleReadDays"))) === '["2026-11-01"]', "the day is noted once, in its own small item");
markVersesRead(refs("Gen", 1, 9, 16), d("2026-11-01"));
assert(JSON.stringify(stored("Gen")) === JSON.stringify({ 1: [[1, 16, "2026-11-01"]] }), "the next passage on the same day joins the run");
markVersesRead(refs("Gen", 1, 17, 23), d("2026-11-02"));
assert(JSON.stringify(stored("Gen")[1]) === JSON.stringify([[1, 16, "2026-11-01"], [17, 23, "2026-11-02"]]), "a passage on another day is its own run");
markVersesRead(refs("Gen", 1, 5, 6), d("2026-11-03")); // read again: dated again
assert(JSON.stringify(stored("Gen")[1]) === JSON.stringify([[1, 4, "2026-11-01"], [5, 6, "2026-11-03"], [7, 16, "2026-11-01"], [17, 23, "2026-11-02"]]), "reading verses again gives them the new date and splits the run");
markVersesRead(refs("Ps", 23, 1, 6), d("2026-11-03"));
assert(Object.keys(snapshot()).filter((k) => k.includes("bibleRead:")).sort().join() === `${P}bibleRead:Gen,${P}bibleRead:Ps`, "each book has its own item");
assert(getBookReadCounts("Gen")[1] === 23 && getBookReadCounts("Ps")[23] === 6 && Object.keys(getBookReadCounts("Exod")).length === 0, "counts per chapter");
assert(Object.keys(getChapterRead("Gen", 1)).length === 23 && getChapterRead("Gen", 1)[5] === "2026-11-03" && getChapterRead("Gen", 2)[1] === undefined, "a chapter's verses come back as { verse: date }");
markVersesRead(["nonsense", "Gen.x.1", "Gen.1.0", ""], d("2026-11-04"));
assert(getBookReadCounts("Gen")[1] === 23 && !JSON.parse(localStorage.getItem(P + "bibleReadDays")).includes("2026-11-04"), "something that is not a verse reference is ignored");

console.log("\nTaking verses back");
unmarkVersesRead(refs("Gen", 1, 7, 8));
assert(JSON.stringify(stored("Gen")[1]) === JSON.stringify([[1, 4, "2026-11-01"], [5, 6, "2026-11-03"], [9, 16, "2026-11-01"], [17, 23, "2026-11-02"]]), "unmarking verses splits a run");
unmarkVersesRead(refs("Ps", 23, 1, 6));
assert(localStorage.getItem(P + "bibleRead:Ps") === null, "when a book has nothing left, its item is removed");
unmarkVersesRead(["Nothing.1.1"]);
assert(Object.keys(getBookReadCounts("Gen")).length === 1, "unmarking something never marked changes nothing");

console.log("\nThe whole log, and the stats");
const log = getReadLog();
assert(log.verses["Gen.1.1"] === "2026-11-01" && log.verses["Gen.1.5"] === "2026-11-03" && !log.verses["Gen.1.7"] && Object.keys(log.verses).length === 21, "getReadLog gives the same shape as before: { verses, days }");
assert(JSON.stringify(log.days) === '["2026-11-01","2026-11-02","2026-11-03"]', "...with the days read");
const st = getReadingStats(d("2026-11-03"));
assert(st.verses === 21 && st.today === 2 && st.streak === 3 && st.best === 3 && st.days === 3, "the stats: verses read, read today, streak, best streak, days");
assert(getReadingStats(d("2026-11-04")).streak === 3 && getReadingStats(d("2026-11-05")).streak === 0, "a streak is alive on the day after, gone two days after");
markVerseRead("Gen.2.1", d("2026-11-03"));
assert(getChapterRead("Gen", 2)[1] === "2026-11-03", "markVerseRead and unmarkVerseRead still work for one verse");
unmarkVerseRead("Gen.2.1");
assert(Object.keys(getChapterRead("Gen", 2)).length === 0, "...");

console.log("\nSize");
clear();
const genesis = [];
const chapterSizes = [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26];
chapterSizes.forEach((n, i) => genesis.push(...refs("Gen", i + 1, 1, n)));
markVersesRead(genesis, d("2026-11-01"));
const genesisBytes = localStorage.getItem(P + "bibleRead:Gen").length;
assert(genesis.length === 1533 && genesisBytes < 2500, `all 1,533 verses of Genesis fit in ${genesisBytes} bytes (one run per chapter)`);
const oldStyle = JSON.stringify({ verses: Object.fromEntries(genesis.map((r) => [r, "2026-11-01"])), days: ["2026-11-01"] }).length;
assert(genesisBytes * 20 < oldStyle, `...about ${Math.round(oldStyle / genesisBytes)} times smaller than the old way (${oldStyle} bytes)`);
// reading one passage changes only that book's item (and the days), so only that is synced
const before = snapshot();
markVersesRead(refs("Ps", 23, 1, 6), d("2026-11-01"));
const { changed, removed } = findChanges(before, snapshot());
assert(changed.sort().join() === `${P}bibleRead:Ps` && removed.length === 0, "marking a passage in Psalms changes only the Psalms item (the day was already noted): that is all that syncs");
const before2 = snapshot();
markVersesRead(refs("Gen", 3, 1, 4), d("2026-11-09"));
const diff = findChanges(before2, snapshot());
assert(diff.changed.includes(P + "bibleRead:Gen") && diff.changed.includes(P + "bibleReadDays") && !diff.changed.includes(P + "bibleRead:Ps"), "...and a passage in Genesis on a new day changes the Genesis item and the days");

console.log("\nMoving from the old log");
clear();
const oldLog = JSON.stringify({ verses: { "Gen.1.1": "2026-10-20", "Gen.1.2": "2026-10-20", "Gen.1.3": "2026-10-21", "Ruth.1.1": "2026-10-22" }, days: ["2026-10-20", "2026-10-21", "2026-10-22"] });
localStorage.setItem(OLD, oldLog);
const stats = getReadingStats(d("2026-10-22"));
assert(stats.verses === 4 && stats.streak === 3 && stats.days === 3, "the old log's verses and days are counted");
assert(JSON.stringify(stored("Gen")) === JSON.stringify({ 1: [[1, 2, "2026-10-20"], [3, 3, "2026-10-21"]] }) && JSON.stringify(stored("Ruth")) === JSON.stringify({ 1: [[1, 1, "2026-10-22"]] }), "...and moved into the per-book items, with their dates");
assert(localStorage.getItem(OLD) === oldLog, "the old log is left exactly as it was (never written)");
assert(localStorage.getItem(MIGRATED) && !localStorage.getItem(MIGRATED).includes("Gen"), "a fingerprint of it is kept on this device only (not a synced item)");
unmarkVersesRead(["Gen.1.2"]);
migrateOldReadLog(); getReadLog(); getReadingStats();
assert(!getChapterRead("Gen", 1)[2], "a verse unmarked after the move stays unmarked, however often the log is read");
// a second device that still runs the old version adds to the old log
localStorage.setItem(OLD, JSON.stringify({ verses: { "Gen.1.1": "2026-10-20", "Gen.1.2": "2026-10-20", "Gen.1.3": "2026-10-21", "Ruth.1.1": "2026-10-22", "Exod.2.5": "2026-10-23" }, days: ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"] }));
const after = getReadLog();
assert(after.verses["Exod.2.5"] === "2026-10-23" && after.days.includes("2026-10-23"), "something the old version adds later is picked up");
assert(after.verses["Gen.1.1"] === "2026-10-20" && Object.keys(after.verses).length === 5, "...without duplicating anything");
clear();
localStorage.setItem(OLD, "not json {{");
assert(getReadingStats().verses === 0 && Object.keys(getReadLog().verses).length === 0, "a damaged old log is ignored, not a crash");
clear();
assert(getReadingStats().verses === 0 && getReadingStats().streak === 0 && getReadLog().days.length === 0, "a brand-new person has an empty log");
// an existing per-book mark is never overwritten by the old log's older date
markVersesRead(["Gen.1.1"], d("2026-11-05"));
localStorage.setItem(OLD, JSON.stringify({ verses: { "Gen.1.1": "2026-10-01" }, days: [] }));
assert(getChapterRead("Gen", 1)[1] === "2026-11-05", "the old log never overwrites a newer date");

summary();
