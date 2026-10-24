import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { recordAttempt } from "../public/js/history.js";
import { getScheduleEntries } from "../public/js/srs.js";
import * as ba from "../public/js/bible-areas.js";
import * as dd from "../public/js/daily-data.js";
import * as dh from "../public/js/daily-history.js";
import { findPages } from "../public/js/page-finder.js";

// Bible in Context as a study area: Home tile, My Progress tab, Daily Challenge questions, Sources & Credits.

const { document, localStorage } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

console.log("The page list");
assert(ba.BIBLE_PAGES.length === 15, "15 Bible pages");
assert(ba.BIBLE_GROUPS.map((g) => g.title).join() === "Marks & Syllables,Words,Prefixes,Verbs", "four groups, in sidebar order");
const sidebarPages = [...document.querySelectorAll('#sidebar .nav-btn[data-page^="bible-"]')].map((b) => b.dataset.page);
assert(JSON.stringify(sidebarPages) === JSON.stringify(ba.BIBLE_PAGES.map((p) => p.page)), "the list matches the sidebar buttons one for one");
assert(ba.bibleSrsMode("bible-dagesh") === "bible:dagesh", "spaced-repetition mode name");

console.log("\nStats");
let all = ba.getAllBibleStats();
assert(all.every((p) => p.attempts === 0 && p.tracked === 0 && !p.passed), "nothing practised at first");
let sum = ba.getBibleSummary(all);
assert(sum.practised === 0 && sum.pct === 0 && sum.next.page === "bible-dagesh", "first suggestion is the first page");
recordAttempt("bible-dagesh", { score: 9, total: 10, percent: 90, datasets: ["Genesis"], retry: false });
recordAttempt("bible-dagesh", { score: 5, total: 10, percent: 50, datasets: ["Genesis"], retry: false });
recordAttempt("bible-noun", { score: 6, total: 10, percent: 60, datasets: ["Genesis"], retry: false });
all = ba.getAllBibleStats();
const dag = all.find((p) => p.page === "bible-dagesh");
assert(dag.attempts === 2 && dag.latest === 50 && dag.best === 90 && dag.average === 70 && dag.passed, "dagesh: attempts, latest, best, average, passed");
sum = ba.getBibleSummary(all);
assert(sum.practised === 2 && sum.passed === 1 && sum.pct === Math.round(100 / 15), "summary counts pages practised and passed");
assert(sum.next.attempts === 0, "next up is a page never tried while there is one");

console.log("\nHome");
navigateTo(document, "home");
await wait();
const tile = content.querySelector(".bible-home-tile");
assert(!!tile, "Home has a Bible in Context tile");
assert(tile.querySelectorAll(".bible-home-page").length === 15, "a button for each of the 15 pages");
assert(tile.querySelectorAll(".bible-home-group").length === 4, "grouped like the sidebar");
const dagBtn = tile.querySelector('[data-goto="bible-dagesh"]');
assert(dagBtn.textContent.includes("50%"), "a page shows its latest quiz score");
assert(tile.querySelectorAll(".bible-home-chip.is-new").length === 13, "pages not tried show New");
click(tile.querySelector('[data-goto="bible-vav"]'));
await wait(150);
assert(location_hash(document) === "#bible-vav", "a page button opens that page");
function location_hash(d) { return d.defaultView.location.hash; }

console.log("\nMy Progress");
navigateTo(document, "progress");
await wait(120);
const tabNames = [...content.querySelectorAll(".pm-tab")].map((t) => t.textContent.trim());
assert(tabNames.includes("Bible in Context"), "a Bible in Context tab");
assert(!!content.querySelector('.pm-area-row[data-area="bible"]'), "the Overview has a Bible row");
click([...content.querySelectorAll(".pm-tab")].find((t) => t.textContent.trim() === "Bible in Context"));
await wait(120);
const panel = content.querySelector("#pm-panel");
assert(panel.querySelectorAll(".pm-quiz").length === 15, "a card for every page, including ones not started");
assert(panel.querySelectorAll(".pm-quiz .pill").length >= 13, "pages not started say so");
assert(!!panel.querySelector('[data-quiz="bible-dagesh"] svg'), "a score chart once there are two attempts");
click([...content.querySelectorAll(".pm-tab")].find((t) => t.textContent.trim() === "Quizzes"));
await wait(80);
assert(!content.querySelector('.pm-quiz[data-quiz^="bible-"]'), "the general Quizzes tab leaves the Bible quizzes to their own tab");

console.log("\nDaily Challenge");
const legacy = ["consonants", "vowels", "vocabulary", "verbs", "accents"];
dh.saveSettings({ length: 10, areas: legacy, hard: false, sound: false });
assert(dh.loadSettings().areas.includes("bible"), "someone who had every area ticked gets Bible in Context too");
dh.saveSettings({ length: 10, areas: ["vowels", "verbs"], hard: false, sound: false });
assert(!dh.loadSettings().areas.includes("bible"), "...but a custom choice is left alone");
assert(dd.availableAreaIds().includes("bible"), "Bible in Context is offered");

const prepared = await dd.prepareChallenge({ length: 10, areas: ["bible"], hard: true });
assert(prepared.areas.includes("bible"), "the data for a few Bible pages loads");
const qs = dd.buildChallenge(prepared);
assert(qs.length === 10 && qs.every((q) => q.type === "bible"), "ten Bible questions, even in Hard mode (tap-to-answer)");
const q = qs[0];
assert(q.bq.parts.length >= 1 && q.bq.words.length > 0 && q.bq.explainHtml.length > 0, "a question carries its verse, answer boxes and explanation");
assert(JSON.stringify(JSON.parse(JSON.stringify(q))) === JSON.stringify(q), "...and is plain data, so an unfinished round can be saved");
const right = {};
q.bq.parts.forEach((p, i) => (right[i] = p.answer));
assert(dd.grade(q, right).correct === true, "all boxes right is correct");
const wrong = { ...right, 0: q.bq.parts[0].choices.find((c) => c.id !== q.bq.parts[0].answer)?.id ?? "zzz" };
assert(dd.grade(q, wrong).correct === false, "a wrong box is wrong");
assert(dd.grade(q, {}).correct === false, "an unanswered question is wrong");
dd.recordResult(q, dd.grade(q, right));
const entry = getScheduleEntries(q.srsMode)[q.key];
assert(entry && entry.timesSeen === 1 && entry.timesCorrect === 1, "the answer is saved for spaced repetition under the page's mode");
const mixed = dd.buildChallenge(await dd.prepareChallenge({ length: 10, areas: [...legacy, "bible"], hard: false }));
assert(mixed.length === 10 && mixed.some((x) => x.type === "bible"), "a mixed round includes Bible questions");
assert(mixed.filter((x) => x.type === "match").every((m) => m.areaId !== "bible"), "match rounds never use Bible");

console.log("\nSources & Credits");
navigateTo(document, "credits");
await wait();
const refs = [...content.querySelectorAll(".apa-ref")].map((li) => li.textContent);
assert(refs.length === 5, "five references");
assert(refs.map((r) => r.split(",")[0]).join() === "Fuller,Futato,Kelley,Kutz,Mitchel", "alphabetical by author");
assert(refs.every((r) => /\(\d{4}\)\./.test(r)), "each has the year in parentheses");
assert(content.querySelectorAll(".apa-ref em").length === 5, "titles are italic");
assert(!/class notes/i.test(content.textContent), "the class-notes line is gone");

console.log("\nThe page finder");
const pages = [...document.querySelectorAll("#sidebar .nav-btn[data-page]")].map((b) => ({ page: b.dataset.page, label: b.textContent.trim(), haystack: b.textContent.toLowerCase() }));
assert(pages.some((p) => p.page === "credits"), "the finder can see the footer links");
assert(findPages([{ page: "bible-pronoun", label: "Personal Pronouns", haystack: "personal pronouns bible words independent personal pronouns" }], "independent")[0]?.page === "bible-pronoun", "the full name still finds the shortened page");

summary();
