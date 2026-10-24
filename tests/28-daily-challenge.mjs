import { setupApp, assert, summary, navigateTo, findButtonByText, click } from "./helpers.mjs";
import { recordItemResult } from "../public/js/srs.js";
import { getLetterSet } from "../public/js/letter-sets.js";
import * as dd from "../public/js/daily-data.js";
import * as dh from "../public/js/daily-history.js";
import { ACHIEVEMENTS, buildContext } from "../public/js/pages/achievements.js";

// The Daily Challenge: personal questions, tap-to-answer by default, Hard mode
// typing, verbs by tapping the parts, match-to-category, instant feedback, a
// summary of every answer, stars, calendar and saved progress.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const ALL = ["consonants", "vowels", "vocabulary", "verbs", "accents"];

console.log("\nBuilding a round");
for (const length of [5, 10, 15]) {
  const qs = dd.buildChallenge({ length, areas: ALL, hard: false });
  assert(qs.length === length, `a ${length}-question round has ${length} questions`);
  assert(qs.filter((q) => q.type === "parse").length <= 3, `${length}: at most three verb questions`);
  assert(qs.filter((q) => q.type === "match").length === (length === 15 ? 2 : length === 10 ? 1 : 0), `${length}: match-to-category rounds (none at 5, one at 10, two at 15)`);
}
let qs = dd.buildChallenge({ length: 10, areas: ["vowels", "accents"], hard: false });
assert(qs.every((q) => ["vowels", "accents"].includes(q.areaId)), "only the ticked areas are asked about");
qs = dd.buildChallenge({ length: 10, areas: ["verbs"], hard: false });
assert(qs.length === 10 && qs.every((q) => q.type === "parse"), "verbs only: ten verb-parsing questions");
qs = dd.buildChallenge({ length: 10, areas: ALL, hard: true });
assert(qs.every((q) => ["typed", "parse", "match"].includes(q.type)) && qs.some((q) => q.type === "typed"), "Hard mode types the answers (verbs and matching stay as taps)");
qs = dd.buildChallenge({ length: 15, areas: ALL, hard: false });
assert(qs.every((q) => ["mc", "parse", "match"].includes(q.type)), "normally everything is tap-to-answer");

console.log("\nTap-to-answer questions");
const mcs = dd.buildChallenge({ length: 15, areas: ["consonants", "vowels", "vocabulary", "accents"], hard: false }).filter((q) => q.type === "mc");
assert(mcs.length > 8, "plenty of multiple-choice questions");
assert(mcs.every((q) => q.options.includes(q.answer) && new Set(q.options).size === q.options.length), "every question's choices are distinct and include the answer");
assert(mcs.every((q) => q.options.length >= 3 && q.options.length <= 4), "three or four choices");
assert(dd.grade(mcs[0], mcs[0].answer).correct && !dd.grade(mcs[0], "zzz-not-an-option").correct, "right and wrong taps are graded");
// the two vowels written with one mark are never offered as each other's wrong answer
let sawTwin = false;
for (let i = 0; i < 40 && !sawTwin; i++) {
  const v = dd.buildDrill([{ areaId: "vowels", key: getLetterSet("vowels").rowKey(getLetterSet("vowels").rows().find((r) => /^qame/i.test(r.Name.normalize("NFC")) && !/-/.test(r.Name))) }], false)[0];
  if (v && v.direction === "form") {
    sawTwin = true;
    assert(!v.options.some((o) => /ḥaṭuf/.test(o.normalize("NFC")) && o !== v.answer), "a shared-mark vowel's twin is not offered as a wrong answer");
    assert(/qameṣ.*ḥaṭuf|ḥaṭuf.*qameṣ/.test(v.answer.normalize("NFC")), "...and both names are accepted as the answer");
  }
}
assert(sawTwin, "(checked a mark → name question for the shared mark)");

console.log("\nVerbs: tap the parts");
const parse = dd.buildChallenge({ length: 5, areas: ["verbs"], hard: false })[0];
const t0 = parse.tuples[0];
const right = Object.fromEntries(dd.PARSE_FIELDS.map((f, i) => [f, t0[i] === "" ? "NA" : t0[i]]));
assert(dd.grade(parse, right).correct, "the right parsing is accepted (NA means blank)");
assert(!dd.grade(parse, { ...right, Binyan: "Hophal", Mode: "Perfect" }).correct || t0[0] === "Hophal", "a wrong binyan is not");
if (parse.tuples.length > 1) {
  const alt = Object.fromEntries(dd.PARSE_FIELDS.map((f, i) => [f, parse.tuples[1][i] === "" ? "NA" : parse.tuples[1][i]]));
  assert(dd.grade(parse, alt).correct, "when a form fits several parsings, any of them counts");
}

console.log("\nPersonal, with mastered items mixed in");
const cset = getLetterSet("consonants");
const masteredKeys = new Set(cset.rows().slice(0, 12).map(cset.rowKey));
for (const k of masteredKeys) for (let i = 0; i < 8; i++) recordItemResult("consonant-typing-names", k, true);
let counts = [];
for (let i = 0; i < 5; i++) {
  const r = dd.buildChallenge({ length: 5, areas: ["consonants"], hard: false });
  counts.push(r.filter((q) => masteredKeys.has(q.key)).length);
}
assert(counts.every((n) => n === 1), "five-question round: exactly one mastered item slipped in for review (got " + counts.join(",") + ")");
const missed = cset.rows()[20];
recordItemResult("consonant-typing-names", cset.rowKey(missed), false);
let seen = 0;
for (let i = 0; i < 5; i++) seen += dd.buildChallenge({ length: 5, areas: ["consonants"], hard: false }).some((q) => q.key === cset.rowKey(missed)) ? 1 : 0;
assert(seen === 5, "an item you just missed is always in the next round");

console.log("\nMatch to category");
const m = dd.buildChallenge({ length: 10, areas: ["vowels", "consonants", "accents", "vocabulary"], hard: false }).find((q) => q.type === "match");
assert(m && m.items.length >= 3 && m.buckets.length >= 2 && m.buckets.length <= 3, "a match round has 3–4 items and 2–3 categories");
assert(m.items.every((i) => m.buckets.includes(i.bucket)), "every item belongs to one of the shown categories");
const ans = Object.fromEntries(m.items.map((i) => [i.key, i.bucket]));
assert(dd.grade(m, ans).correct, "the right matches are accepted");
const wrongOne = { ...ans, [m.items[0].key]: m.buckets.find((b) => b !== m.items[0].bucket) };
const g = dd.grade(m, wrongOne);
assert(!g.correct && g.items.filter((i) => !i.ok).length === 1, "one wrong match marks just that item");

console.log("\nHistory, stars and the calendar");
assert(dh.starsFor(100) === 3 && dh.starsFor(90) === 3 && dh.starsFor(89) === 2 && dh.starsFor(70) === 2 && dh.starsFor(69) === 1 && dh.starsFor(0) === 1, "stars: 1 for finishing, 2 for 70%, 3 for 90%");
const day = (n) => new Date(2026, 5, n, 12);
localStorage.removeItem("hebrewVerbApp:dailyLog");
for (const n of [1, 2, 3, 10]) dh.recordCompletion({ score: 9, total: 10, hard: n === 3, length: 10 }, day(n));
dh.recordCompletion({ score: 10, total: 10, hard: false, length: 10 }, day(3));
let st = dh.getStats(day(10));
assert(st.days === 4 && st.bestRun === 3 && st.run === 1, `days=4, best run 3, current run 1 (got ${JSON.stringify(st)})`);
assert(st.perfectDays === 1 && st.threeStarDays === 4 && st.hardDays === 1, "perfect, three-star and hard-mode days counted");
assert(dh.getEntry("2026-06-03").rounds === 2 && dh.getEntry("2026-06-03").percent === 100, "two rounds in a day keep the better one and count both");
assert(dh.getStats(day(20)).run === 0, "a gap of more than a day ends the run");
const weeks = dh.monthGrid(2026, 5, day(10));
assert(weeks.every((w) => w.length === 7) && weeks.flat().filter(Boolean).length === 30, "June has 30 days in whole weeks");
assert(weeks.flat().find((c) => c && c.day === 3).entry && weeks.flat().find((c) => c && c.day === 10).isToday, "completed and current days are marked");
assert(dh.getYesterday(day(11)).percent === 90, "yesterday's entry is found");
localStorage.removeItem("hebrewVerbApp:dailyLog");

console.log("\nSettings and saved progress");
dh.saveSettings({ length: 15, areas: ["vowels", "verbs"], hard: true, sound: true });
const loaded = dh.loadSettings();
assert(loaded.length === 15 && loaded.hard && loaded.sound && loaded.areas.join() === "vowels,verbs", "settings are remembered");
dh.saveSettings({ length: 7, areas: ["nope"], hard: "yes", sound: 1 });
const sane = dh.loadSettings();
assert(sane.length === 10 && sane.areas.length === 6 && sane.hard === false, "nonsense saved settings fall back to the defaults");
dh.saveInProgress({ questions: [{ type: "mc" }, { type: "mc" }], index: 1, results: [] }, day(5));
assert(dh.loadInProgress(day(5)) && dh.loadInProgress(day(5)).index === 1, "an unfinished round is found the same day");
dh.saveInProgress({ questions: [{ type: "mc" }, { type: "mc" }], index: 1, results: [] }, day(5));
assert(dh.loadInProgress(day(6)) === null, "...but not the next day");
dh.clearInProgress();
dh.saveSettings(dh.defaultSettings());

console.log("\nPlaying a round in the page");
localStorage.removeItem("hebrewVerbApp:dailyLog");
navigateTo(document, "daily-challenge");
await wait();
assert(!!content.querySelector(".daily-calendar"), "the intro shows the calendar");
assert(content.querySelectorAll(".daily-chip").length === 9, "length and content choices are on the intro");
const vowelChip = [...content.querySelectorAll(".daily-chip")].find((b) => b.textContent.trim() === "Vowels");
for (const label of ["Consonants", "Vocabulary", "Verbs", "Accents"]) {
  click([...content.querySelectorAll(".daily-chip")].find((b) => b.textContent.trim() === label));
  await wait(20);
}
assert([...content.querySelectorAll(".daily-chip.selected")].map((b) => b.textContent.trim()).includes("Vowels"), "Vowels stays selected");
click([...content.querySelectorAll(".daily-chip")].find((b) => b.textContent.trim().startsWith("5")));
await wait(20);
click(findButtonByText(content, "Start Daily Challenge"));
await wait(500); // Bible in Context is ticked by default: its data is requested first
let sawBible = 0;
for (let i = 0; i < 5; i++) {
  const bibleBoxes = [...content.querySelectorAll(".daily-bible .bible-choices")];
  if (bibleBoxes.length) {
    // A Bible in Context question: one tap in each answer box.
    sawBible++;
    for (const box of bibleBoxes) click(box.querySelector(".bible-choice"));
    await wait(20);
    assert(!!content.querySelector(".daily-feedback"), `question ${i + 1}: Bible question gives instant feedback once every box is answered`);
    assert([...content.querySelectorAll(".bible-choice")].every((b) => b.disabled), `question ${i + 1}: Bible choices lock once answered`);
  } else {
    const opts = [...content.querySelectorAll(".daily-option")];
    assert(opts.length >= 3, `question ${i + 1}: tap-to-answer choices shown`);
    click(opts[0]);
    await wait(20);
    assert(!!content.querySelector(".daily-feedback"), `question ${i + 1}: instant feedback after the tap`);
    assert([...content.querySelectorAll(".daily-option")].every((b) => b.disabled), `question ${i + 1}: choices lock once answered`);
  }
  click(content.querySelector(".daily-next"));
  await wait(20);
}
console.log(`  (${sawBible} of the 5 questions were Bible in Context)`);
assert(!!content.querySelector(".daily-hero"), "the summary appears after the last question");
assert(content.querySelectorAll(".daily-review-item").length === 5, "every answer is listed");
assert(content.querySelectorAll(".daily-review-item.bad .daily-review-answers").length === content.querySelectorAll(".daily-review-item.bad").length, "each miss shows the correct answer");
assert(content.querySelectorAll(".daily-star").length === 3, "three star slots");
const log = dh.loadLog();
assert(Object.keys(log).length === 1 && log[Object.keys(log)[0]].total === 5, "today is recorded in the calendar");
assert(dh.loadInProgress() === null, "nothing is left half-finished");
assert(!!content.querySelector(".daily-calendar-cell.done"), "the calendar shows today as done");

console.log("\nDaily Challenge achievements");
const daily = ACHIEVEMENTS.filter((a) => a.section === "Daily Challenge");
assert(daily.length === 8, "eight Daily Challenge badges");
const ctx = buildContext();
assert(daily.find((a) => a.id === "daily-first").progress(ctx) >= 1, "finishing a round earns First Challenge");

summary();
