import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { recordAttempt } from "../public/js/history.js";
import { recordItemResult, getScheduleEntries } from "../public/js/srs.js";
import * as ach from "../public/js/pages/achievements.js";
import * as ba from "../public/js/bible-areas.js";
import * as bi from "../public/js/bible-insights.js";
import * as hd from "../public/js/home-data.js";
import * as dd from "../public/js/daily-data.js";
import { getVocabRows } from "../public/js/vocab-data.js";

// Tiered badges, the path, comebacks, secret badges, the Cataloger fix, and the Bible records
// (word labels, repeated mix-ups, due and weak Bible items, the reading log).

const { document, localStorage } = await setupApp();
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));

console.log("Badge structure");
const ids = ach.ACHIEVEMENTS.map((a) => a.id);
assert(new Set(ids).size === ids.length, "every level has its own id");
assert(ach.BADGES.filter((b) => b.tiers).every((b) => b.tiers.length === 3), "tiered badges always have Bronze, Silver and Gold");
for (const old of ["vocab-mastery-10", "vocab-mastery-50", "vocab-mastery-150", "streak-3", "streak-30", "accent-mastery-10", "daily-first", "org-cataloger"]) {
  assert(ids.includes(old), `the earlier id ${old} is kept, so it is not announced twice`);
}
const bibleBadges = ach.BADGES.filter((b) => b.id.startsWith("bible-page-"));
assert(bibleBadges.length === 15 && bibleBadges.every((b) => b.tiers.join() === "80,90,100"), "one badge per Bible page: 80%, 90%, 100%");
assert(["bible-group-marks", "bible-group-words", "bible-group-prefixes", "bible-all"].every((id) => ach.BADGES.some((b) => b.id === id)), "a badge per multi-page group, and one for all 15");
assert(ach.BADGES.find((b) => b.id === "bible-group-prefixes").title === "Prefix Pro", "the Prefixes group badge is Prefix Pro");

console.log("\nMastery targets follow the real data");
const ctx0 = ach.buildContext();
const lv = (id) => ach.badgeStatus(ach.BADGES.find((b) => b.id === id), ctx0).levels.map((l) => l.target);
assert(lv("consonant-mastery")[2] === ctx0.totals.consonants && ctx0.totals.consonants >= 30, `Gold for consonants is all of them (${ctx0.totals.consonants})`);
assert(lv("vowel-mastery")[2] === ctx0.totals.vowels, `Gold for vowels is all of them (${ctx0.totals.vowels})`);

console.log("\nThe Cataloger fix");
assert(getVocabRows().length > 0, "vocabulary rows are loaded for this test");
assert(ctx0.categorizedWords === 0, "words that only have the dataset's own categories do not count");

console.log("\nBible badges from quiz scores");
recordAttempt("bible-dagesh", { score: 9, total: 10, percent: 90, datasets: ["Genesis"], retry: false });
let ctx = ach.buildContext();
let st = ach.badgeStatus(ach.BADGES.find((b) => b.id === "bible-page-bible-dagesh"), ctx);
assert(st.levels.map((l) => l.earned).join() === "true,true,false", "90% earns Bronze and Silver on Dagesh");
assert(st.page === "bible-dagesh", "its Go button leads to that page");
const prefixPages = ba.BIBLE_GROUPS.find((g) => g.id === "prefixes").pages.map((p) => p.page);
for (const pg of prefixPages.slice(0, 4)) recordAttempt(pg, { score: 10, total: 10, percent: 100, datasets: ["Genesis"], retry: false });
ctx = ach.buildContext();
let grp = ach.badgeStatus(ach.BADGES.find((b) => b.id === "bible-group-prefixes"), ctx);
assert(grp.current === 0 && grp.earnedCount === 0, "Prefix Pro needs EVERY prefix page: four of five is not enough");
assert(prefixPages.includes(grp.page) && !ctx.bibleBest[grp.page], "...and its Go button points at the page still to do");
recordAttempt(prefixPages[4], { score: 8, total: 10, percent: 80, datasets: ["Genesis"], retry: false });
ctx = ach.buildContext();
grp = ach.badgeStatus(ach.BADGES.find((b) => b.id === "bible-group-prefixes"), ctx);
assert(grp.levels.map((l) => l.earned).join() === "true,false,false", "with the last page at 80%, Prefix Pro is Bronze");
assert(ach.badgeStatus(ach.BADGES.find((b) => b.id === "bible-all"), ctx).earnedCount === 0, "Context Champion needs all 15 pages");

console.log("\nQuiz passes");
assert(ctx.passedQuizzes >= 6 && ctx.perfectQuizzes >= 4, "passes and perfect scores are counted across the Bible pages too");

console.log("\nComebacks");
assert(ach.longestBreakReturned({ "2026-10-01": 5, "2026-10-02": 3 }) === 0, "practising on consecutive days is not a break");
assert(ach.longestBreakReturned({ "2026-10-01": 5, "2026-10-12": 3 }) === 10, "ten days with nothing in between is a ten-day break");
assert(ach.longestBreakReturned({ "2026-10-01": 5, "2026-10-04": 1, "2026-10-30": 2, "2026-10-31": 0 }) === 25, "the longest break counts; empty days do not");
assert(ach.countTurnarounds([[50, 60, 75]]) === 1, "50 to 75 is a turnaround (+25)");
assert(ach.countTurnarounds([[50, 60, 65]]) === 0, "+15 is not enough");
assert(ach.countTurnarounds([[90, 85, 95]]) === 0, "scores that were already passing are not a weak start");
assert(ach.countTurnarounds([[40, 70], [30, 31], [20, 90]]) === 2, "counted once per quiz");
const bh = [...Array(3)].map((_, i) => ({ score: 5, total: 10, percent: [40, 55, 90][i], datasets: ["Genesis"] }));
for (const e of bh) recordAttempt("bible-noun", e);
ctx = ach.buildContext();
assert(ctx.turnarounds >= 1, "a Bible page turned around from 40% to 90% counts");

console.log("\nSecret badges");
assert(ctx.secretFlags.perfectRun >= 3, "three perfect quizzes in a row are noticed");
const secret = (id) => ach.badgeStatus(ach.BADGES.find((b) => b.id === id), ctx);
assert(secret("secret-hattrick").complete, "Hat Trick is earned");
assert(!secret("secret-pausal").complete, "Pausal Pro is not earned yet");
bi.recordRareCorrect("bible-article", "pausal", "Gen.6.4#2#", 2);
assert(!ach.badgeStatus(ach.BADGES.find((b) => b.id === "secret-pausal"), ach.buildContext()).complete, "one of two rare examples is not enough");
bi.recordRareCorrect("bible-article", "pausal", "Gen.6.19#5#", 2);
assert(ach.badgeStatus(ach.BADGES.find((b) => b.id === "secret-pausal"), ach.buildContext()).complete, "both Pausal Lengthening examples earn Pausal Pro");

console.log("\nThe path");
const path = ach.getPathStatus(ach.buildContext());
assert(path.length === 4 && path.map((c) => c.title).join() === "Letters,Vowels,Words,Reading", "Letters, Vowels, Words, Reading");
assert(path[0].current && !path[0].done && !path[1].current, "the first unfinished chapter is the current one");
assert(path.every((c) => c.note.length > 20), "each chapter has its note");

console.log("\nNext three");
const next = ach.getNextBadgeSteps(3, ach.buildContext());
assert(next.length <= 3 && next.length >= 1, "at most three");
assert(next.every((n) => n.page && getPageExists(n.page)), "each leads to a page that exists");
assert(new Set(next.map((n) => n.badgeId)).size === next.length, "each badge once");
assert(!next.some((n) => /secret/.test(n.badgeId)), "secret badges never appear");
function getPageExists(page) { return !!document.querySelector(`.nav-btn[data-page="${page}"]`) || page === "daily-challenge"; }

console.log("\nBible word labels, due and weak items");
recordItemResult("bible:dagesh", "Gen.12.8#3#1", false);
recordItemResult("bible:dagesh", "Gen.12.8#3#1", false);
recordItemResult("bible:dagesh", "Gen.12.8#3#1", false);
bi.rememberBibleWord("bible:dagesh", "Gen.12.8#3#1", "הָ/הָר");
const weak = hd.getWeakSpots(50).filter((w) => w.areaId === "bible");
assert(weak.length === 1 && weak[0].page === "bible-dagesh" && weak[0].label === "הָהָר", "a missed Bible item is a weak spot, named by its Hebrew word");
assert(weak[0].missed === 3 && weak[0].areaTitle.includes("Dagesh"), "with its page and misses");
recordItemResult("bible:vav", "Gen.1.1#0#", true); // due at once? no: box 2 waits a day
const due = ba.getBibleDue(Date.now() + 40 * 86400000);
assert(due.total >= 2 && due.byPage["bible-vav"] === 1, "items come due as time passes");
const dueNow = ba.getBibleDue();
assert(dueNow.byPage["bible-dagesh"] === 1, "a missed item is due again straight away");
assert(ba.bibleItemLabel("bible-vav", "Gen.1.1#0#") === "Genesis 1:1, word 1", "an item with no saved word falls back to its verse");
const sugg = hd.getStudySuggestion(hd.getAllAreaStats(), dueNow);
assert(sugg.kind === "bible-due" && sugg.count === dueNow.total, "Today suggests the Bible review when it has the most due");
assert(hd.totalDue(hd.getAllAreaStats(), dueNow) === hd.totalDue(hd.getAllAreaStats()) + dueNow.total, "the Today count includes Bible items");

console.log("\nDrill with Bible items");
await dd.prepareDrill([{ areaId: "bible", page: "bible-dagesh", key: "Gen.12.8#3#1" }]);
const q = dd.buildDrill([{ areaId: "bible", page: "bible-dagesh", key: "Gen.12.8#3#1" }], false);
assert(Array.isArray(q), "a drill with a Bible item builds without error");

console.log("\nExplain my mistake");
const n1 = bi.recordConfusion("bible-dagesh", "", "forte", "Dagesh Forte", "lene", "Dagesh Lene", "forte");
const n2 = bi.recordConfusion("bible-dagesh", "", "forte", "Dagesh Forte", "lene", "Dagesh Lene", "forte");
assert(n1 === 1 && n2 === 2 && bi.getConfusions("bible-dagesh").length === 0, "two mix-ups are not yet pointed out");
const n3 = bi.recordConfusion("bible-dagesh", "", "forte", "Dagesh Forte", "lene", "Dagesh Lene", "forte");
const c = bi.getConfusions("bible-dagesh");
assert(n3 === 3 && c.length === 1 && c[0].pickedLabel === "Dagesh Lene" && c[0].correctLabel === "Dagesh Forte", "the third time it is named");
bi.easeConfusion("bible-dagesh", "", "forte");
assert(bi.getConfusions("bible-dagesh").length === 0, "getting it right eases the count down");

console.log("\nReading log");
const day = (s) => new Date(s + "T12:00:00");
bi.markVerseRead("Gen.1.1", day("2026-10-20"));
bi.markVerseRead("Gen.1.2", day("2026-10-21"));
bi.markVerseRead("Gen.1.3", day("2026-10-22"));
bi.markVerseRead("Gen.1.3", day("2026-10-22"));
let rs = bi.getReadingStats(day("2026-10-22"));
assert(rs.streak === 3 && rs.best === 3 && rs.verses === 3 && rs.today === 1, "three days in a row, three verses, one today");
rs = bi.getReadingStats(day("2026-10-23"));
assert(rs.streak === 3, "yesterday's reading keeps the streak alive");
rs = bi.getReadingStats(day("2026-10-25"));
assert(rs.streak === 0 && rs.best === 3, "a missed day ends the streak but not the best");
bi.unmarkVerseRead("Gen.1.3");
assert(bi.getReadingStats(day("2026-10-22")).verses === 2, "a verse can be unmarked");

console.log("\nManifest");
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
assert(manifest.name === "Biblical Hebrew Study App" && manifest.short_name === "Biblical Hebrew Study App", "the installed app is named Biblical Hebrew Study App");

summary();
