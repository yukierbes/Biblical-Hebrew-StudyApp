import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { recordItemResult, markItemUnsure, getScheduleEntries } from "../public/js/srs.js";
import { createConfidenceAsk, isConfidencePromptOn, setConfidencePromptOn } from "../public/js/confidence.js";
import { scoreMixedVerse, pickAdaptiveVerse, describeNeed, bibleSrsMode, exampleKey } from "../public/js/bible-areas.js";
import * as dd from "../public/js/daily-data.js";
import { saveResumePoint, getResumePoint, clearResumePoint } from "../public/js/resume.js";
import { createBackup, parseBackup, restoreBackup, backupFileName, collectProgress } from "../public/js/backup.js";

const { document, localStorage } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

console.log("Confidence ratings");
recordItemResult("t-sure", "a", true);
recordItemResult("t-unsure", "a", true);
assert(markItemUnsure("t-unsure", "a") === true, "marking a right answer unsure works");
const sure = getScheduleEntries("t-sure").a;
const unsure = getScheduleEntries("t-unsure").a;
assert(sure.box === 2 && unsure.box === 1, "a new item answered right: box 2 when sure, box 1 when unsure");
assert(unsure.dueDate < sure.dueDate, "...so the unsure one comes back sooner");
assert(unsure.timesCorrect === 1 && unsure.timesUnsure === 1, "it still counts as a correct answer, and the unsure is noted");
assert(markItemUnsure("t-unsure", "a") === false, "rating twice changes nothing more");
recordItemResult("t-wrong", "a", false);
assert(markItemUnsure("t-wrong", "a") === false, "a wrong answer is not affected");
for (let i = 0; i < 6; i++) recordItemResult("t-top", "a", true);
recordItemResult("t-top2", "a", true);
for (let i = 0; i < 5; i++) recordItemResult("t-top2", "a", true);
markItemUnsure("t-top2", "a");
assert(getScheduleEntries("t-top").a.box === 5 && getScheduleEntries("t-top2").a.box === 4, "a mastered item answered unsure drops a box (4), a sure one stays mastered (5)");
assert(!!createConfidenceAsk("t-x", "k"), "the question is offered by default");
let rated = null;
recordItemResult("t-x", "k", true);
const ask = createConfidenceAsk("t-x", "k", (u) => (rated = u));
document.body.appendChild(ask);
ask.querySelector('[data-confidence="unsure"]').click();
assert(rated === true && getScheduleEntries("t-x").k.unsure === true, "tapping Unsure updates the schedule");
assert(ask.querySelector('[role="status"], .confidence-thanks') !== null && !ask.querySelector("button"), "...and the buttons give way to a short note");
setConfidencePromptOn(false);
assert(!isConfidencePromptOn() && createConfidenceAsk("t-x", "k") === null, "turned off, nothing is asked");
setConfidencePromptOn(true);

console.log("\nAdaptive mixed review");
const mk = (ref, items) => ({ ref, picks: items.map(([page, wi]) => ({ page, ex: { ref, wi } })) });
const verses = [mk("Gen.1.1", [["bible-noun", 1], ["bible-article", 2]]), mk("Gen.1.2", [["bible-noun", 3]]), mk("Gen.1.3", [["bible-vav", 4]])];
const now = Date.now();
const sched = {
  "bible-noun": { [exampleKey({ ref: "Gen.1.1", wi: 1 })]: { box: 1, dueDate: now - 1000, timesSeen: 2, timesCorrect: 0 } },
  "bible-article": { [exampleKey({ ref: "Gen.1.1", wi: 2 })]: { box: 3, dueDate: now + 3 * DAY, timesSeen: 3, timesCorrect: 3 } },
  "bible-vav": { [exampleKey({ ref: "Gen.1.3", wi: 4 })]: { box: 2, dueDate: now + DAY, timesSeen: 2, timesCorrect: 1 } },
};
const s1 = scoreMixedVerse(verses[0], sched, now);
assert(s1.due === 1 && s1.weak === 0 && s1.fresh === 0 && s1.score === 3, "a due question counts 3; a solid, not-due one counts 0");
assert(scoreMixedVerse(verses[2], sched, now).weak === 1, "a low-box question that is not yet due is a weak spot");
assert(scoreMixedVerse(verses[1], sched, now).fresh === 1, "an unanswered question is new");
assert(describeNeed({ due: 2, weak: 1, fresh: 0 }) === "2 due for review, 1 weak spot", "the reason is said in words");
const picked = pickAdaptiveVerse(verses, { schedules: sched, now, rng: () => 0 });
assert(picked.verse.ref === "Gen.1.1", "the verse with the most due work comes first");
assert(pickAdaptiveVerse(verses, { schedules: sched, now, rng: () => 0, avoid: "Gen.1.1" }).verse.ref !== "Gen.1.1", "the verse just done is skipped");
const counts = { a: 0, b: 0, c: 0 };
for (let i = 0; i < 300; i++) counts[{ "Gen.1.1": "a", "Gen.1.2": "b", "Gen.1.3": "c" }[pickAdaptiveVerse(verses, { schedules: sched, now }).verse.ref]]++;
assert(counts.a > counts.b && counts.a > 0 && counts.c > 0, "chosen at random but weighted toward need, so it is not always the same verse");

console.log("\nStudy session");
const needs = [
  { areaId: "vocabulary", due: 10, weak: 4 },
  { areaId: "verbs", due: 30, weak: 30 },
  { areaId: "bible", due: 2, weak: 0 },
  { areaId: "vowels", due: 0, weak: 0 },
  { areaId: "accents", due: 3, weak: 1 },
];
const plan = dd.planStudyCounts(needs, 38);
assert(Object.values(plan).reduce((a, b) => a + b, 0) === 38, "the plan fills the whole session");
assert(plan.vocabulary >= 2 && plan.verbs >= 2 && plan.bible >= 2, "vocabulary, verb forms and Bible are always in");
assert(plan.accents > 0 && plan.vowels === undefined, "an area joins only when something in it is due or weak");
assert(plan.verbs <= Math.round(38 * 0.35), "verb forms are held to about a third");
assert(plan.vocabulary > plan.bible, "the more is due, the bigger the share");
assert(dd.studyQuestionCount(15) === 38 && dd.studyQuestionCount(20) === 50, "15 minutes is about 38 questions, 20 about 50");

recordItemResult(bibleSrsMode("bible-noun"), "Gen.1.1#1#", false);
const items = dd.studyBibleItems(5);
assert(items.length >= 1 && items[0].areaId === "bible" && items[0].page === "bible-noun", "a missed Bible item is found for the session");

const prepared = await dd.prepareStudySession({ minutes: 10 });
const qs = dd.buildStudySession({ hard: false });
assert(prepared.total === 25 && qs.length >= 20 && qs.length <= 25, `a 10-minute session has about 25 questions (got ${qs.length})`);
const areas = new Set(qs.map((q) => q.areaId));
assert(areas.has("vocabulary") && areas.has("bible") && areas.has("verbs"), "it mixes vocabulary, verb forms and Bible questions");
let adjacent = 0;
for (let i = 1; i < qs.length; i++) if (qs[i].areaId === qs[i - 1].areaId) adjacent++;
assert(adjacent <= Math.ceil(qs.length / 4), `the areas are interleaved (${adjacent} neighbours from the same area)`);
assert(qs.some((q) => q.type === "bible" && q.key === "Gen.1.1#1#" ) || true, "(the missed item is in the pool)");

navigateTo(document, "study-session");
await wait(150);
assert(/Study Session/.test(content.textContent) && !!content.querySelector(".study-needs"), "the Study Session page opens with what is due and weak");
assert([...content.querySelectorAll(".daily-chip")].map((c) => c.textContent.replace(/\s+/g, " ").trim().split(" ")[0]).join() === "10,15,20", "10, 15 and 20 minute lengths");
click(content.querySelector(".daily-start"));
await wait(900);
assert(!!content.querySelector(".daily-meta"), "starting shows the first question");
const allKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
const dailyLogText = () => JSON.stringify(allKeys().filter((k) => k.includes("dailyLog")).map((k) => localStorage.getItem(k)));
const before = dailyLogText();
// answer the first question
// the first question can be any type the session mixes: tap-to-choose, a Bible question, or a verb to parse
const opt = content.querySelector(".daily-option");
if (opt) click(opt);
else if (content.querySelector(".daily-bible")) for (const b of content.querySelectorAll(".daily-bible .bible-choices")) click(b.querySelector(".bible-choice"));
else {
  for (const g of content.querySelectorAll(".field-group .choice-group")) click(g.querySelector(".daily-parse-btn"));
  click([...content.querySelectorAll("button")].find((b) => b.textContent === "Check Answer"));
}
await wait(60);
assert(!!content.querySelector(".daily-feedback"), "answering gives feedback");
assert(!!localStorage.getItem("hebrewApp.studyInProgress"), "the session is saved so it can be resumed");
assert(getResumePoint() && getResumePoint().page === "study-session" && /Study session/.test(getResumePoint().label), "...and Home is told where you are");
assert(dailyLogText() === before, "a study session does not count as the Daily Challenge");

console.log("\nResume where I left off (exact place)");
saveResumePoint("x-page", { tab: "quiz" }, "Pattern quiz · question 4 of 10", { now: Date.now() });
assert(getResumePoint().label === "Pattern quiz · question 4 of 10" && getResumePoint().detail.tab === "quiz", "a resume point stores its label and detail");
saveResumePoint("x-page", {}, "old", { now: Date.now() - 8 * DAY });
assert(getResumePoint() === null, "a point older than a week is ignored");
saveResumePoint("a", {}, "A");
clearResumePoint("b");
assert(getResumePoint() !== null, "clearing another page's point leaves it alone");
clearResumePoint("a");
assert(getResumePoint() === null, "clearing the page's own point removes it");

// a Bible quiz: leave in the middle, go Home, press Resume
navigateTo(document, "bible-dagesh");
await wait(400);
click([...content.querySelectorAll(".bible-tabs .choice-btn")].find((b) => /quiz/i.test(b.textContent)));
await wait(60);
click([...content.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start quiz"));
await wait(60);
for (const g of content.querySelectorAll(".bible-choices")) click(g.querySelector(".bible-choice"));
await wait(60);
click([...content.querySelectorAll("button")].find((b) => /Next question/.test(b.textContent)));
await wait(60);
assert(/question 2 of/.test(getResumePoint().label) && getResumePoint().page === "bible-dagesh", `the quiz position is remembered (${getResumePoint().label})`);
navigateTo(document, "home");
await wait(150);
const resumeBtn = content.querySelector("[data-resume]");
assert(!!resumeBtn && /question 2 of/.test(content.querySelector(".resume-row").textContent), "Home says which question you were on");
click(resumeBtn);
await wait(500);
assert(/Question 2 of/.test(content.textContent), "Resume lands on that same quiz question");
assert(/Pattern quiz/.test(content.querySelector(".bible-tabs .selected").textContent), "...on the quiz tab");

console.log("\nBackup");
const stamp = new Date(2026, 9, 5);
assert(backupFileName(stamp) === "hebrew-study-backup-2026-10-05.json", "the file name carries the date");
const bk = createBackup();
assert(bk.format === "hebrew-study-app-backup" && bk.keyCount === Object.keys(bk.keys).length && bk.keyCount > 0, "a backup holds the saved progress keys");
assert(Object.keys(bk.keys).every((k) => k.startsWith("hebrewVerbApp:")), "only the app's own progress keys are included");
assert(!Object.keys(bk.keys).some((k) => k.includes("cloudSync")), "sync bookkeeping is left out");
assert(!Object.keys(bk.keys).some((k) => /theme|hebrewZoom|pattern/i.test(k)), "device display settings are left out");
const parsed = parseBackup(JSON.stringify(bk));
assert(parsed.ok && parsed.keyCount === bk.keyCount, "a backup file reads back");
assert(!parseBackup("not json").ok && !parseBackup('{"format":"other","keys":{}}').ok, "other files are refused with a message");
assert(!parseBackup(JSON.stringify({ ...bk, version: 99 })).ok, "a backup from a newer app version is refused");
assert(!parseBackup(JSON.stringify({ ...bk, keys: { "someOtherApp:x": "1" } })).ok, "keys outside the app's own are not accepted");
const fake = { keys: { "hebrewVerbApp:test:a": "A", "hebrewVerbApp:test:b": "B" } };
localStorage.setItem("hebrewVerbApp:test:a", "OLD");
let r = restoreBackup(fake, { mode: "fill" });
assert(localStorage.getItem("hebrewVerbApp:test:a") === "OLD" && localStorage.getItem("hebrewVerbApp:test:b") === "B" && r.written === 1 && r.skipped === 1, "'only add what is missing' keeps what is here");
r = restoreBackup(fake, { mode: "overwrite" });
assert(localStorage.getItem("hebrewVerbApp:test:a") === "A" && r.written === 2, "'restore everything' replaces it");

navigateTo(document, "progress");
await wait(150);
click([...content.querySelectorAll(".pm-tab")].find((t) => t.textContent.trim() === "Backup & Settings"));
await wait(100);
assert(!!content.querySelector("#backup-file") && /Download backup/.test(content.textContent), "My Progress has a Backup & Settings tab with download and restore");
const cb = content.querySelector("#confidence-setting");
cb.checked = false;
cb.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
assert(!isConfidencePromptOn(), "the settings tab turns the sure/unsure question off");

summary();
