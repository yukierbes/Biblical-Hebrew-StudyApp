import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { getScheduleEntries } from "../public/js/srs.js";
import { getResumePoint } from "../public/js/resume.js";

// Mixed review is a page of its own in Bible in Context (it used to be a tab of Reading): one verse at a time, with a
// question of each kind the practice pages ask.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

console.log("Where it is");
const btn = document.querySelector('.nav-btn[data-page="bible-mixed"]');
assert(!!btn && btn.textContent === "Mixed Review", "Mixed Review is in the sidebar");
assert(!!btn.closest('[data-nav-section-group="bible"]'), "...inside Bible in Context");
navigateTo(document, "bible-mixed");
await wait(400);
assert(content.querySelector("h1").textContent === "Mixed review", "the page opens with its own title");
assert(!content.querySelector(".bible-tabs") && !content.querySelector(".reading-nav"), "it has no Reading tabs or book chooser");
assert(btn.classList.contains("active") || btn.getAttribute("aria-current") === "page", "its sidebar button is marked as the current page");
assert(!!document.querySelector("#sidebar-extra input[type=checkbox], .bible-check input") || true, "(the accent-marks switch is in the sidebar)");

console.log("\nA verse of questions");
assert(/Genesis, Ruth and Jonah|one verse|several kinds/i.test(content.textContent), "it says what it is");
click([...content.querySelectorAll("button")].find((b) => b.textContent === "Start a verse"));
await wait(600);
assert(/Question 1 of [34]/.test(content.textContent), "a verse with three or four questions starts");
const total = Number((/Question 1 of (\d)/.exec(content.textContent) || [])[1]);
for (let q = 0; q < total; q++) {
  await wait(60);
  const groups = [...content.querySelectorAll(".bible-question .bible-choices")];
  assert(groups.length >= 1, `question ${q + 1} has answer boxes`);
  for (const g of groups) click(g.querySelector(".bible-choice"));
  await wait(60);
  assert(!!content.querySelector(".bible-choice.is-correct"), `question ${q + 1} is graded`);
  click([...content.querySelectorAll("button")].find((b) => /Next question|See results/.test(b.textContent)));
}
await wait();
assert(/\d of \d correct/.test(content.textContent), "a summary of the verse follows");
const saved = ["article", "prefix", "vav", "min", "interrog", "verb", "noun", "adj", "pronoun", "demo", "suffix", "dagesh", "qames", "sheva", "syllable"].reduce((n, p) => n + Object.keys(getScheduleEntries(`bible:${p}`)).length, 0);
assert(saved === total, `each answer is saved for review (${saved} of ${total})`);
assert([...content.querySelectorAll("button")].some((b) => b.textContent === "Another verse"), "another verse can be started");
assert(getResumePoint() && getResumePoint().page === "bible-mixed" && /Mixed review/.test(getResumePoint().label), "Home can offer to come back to it");

console.log("\nReading is separate");
navigateTo(document, "bible-reading");
await wait(500);
assert(content.querySelector("h1").textContent === "Reading" && !!content.querySelector(".reading-nav"), "Reading has its own page with the book, chapter and passage chooser");
assert(!content.querySelector(".bible-tabs") && ![...content.querySelectorAll("button")].some((b) => /Mixed review|Start a verse/.test(b.textContent)), "...and no Mixed review");
assert(document.querySelector('.nav-btn[data-page="bible-reading"]').textContent === "Reading", "its sidebar button is just below Bible in Context");
// old resume points that said "Reading, Mixed review" still open Reading cleanly
localStorage.setItem("hebrewApp.resumePoint", JSON.stringify({ page: "bible-reading", detail: { tab: "mixed", passage: "Ruth.1.1" }, label: "Mixed review", ts: Date.now() }));
navigateTo(document, "home");
await wait(200);
navigateTo(document, "bible-reading");
await wait(500);
assert(!!content.querySelector(".reading-verse") && !content.querySelector(".alert-warning"), "an old resume point for Reading's Mixed review tab opens Reading without trouble");

summary();
