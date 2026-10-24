import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { getReadingStats, getReadLog } from "../public/js/bible-insights.js";
import { getScheduleEntries } from "../public/js/srs.js";

// The Reading page: passages from several books, tap-any-word parsing, your own translation, tap-to-reveal English,
// mark-as-read streak, and Mixed review.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

console.log("Opening");
const btn = document.querySelector('.nav-btn[data-page="bible-reading"]');
assert(!!btn && btn.textContent === "Reading", "Reading is in the Bible in Context sidebar group");
navigateTo(document, "bible-reading");
await wait(300);
assert(content.querySelector("h1").textContent === "Reading", "the page opens");
const passages = [...content.querySelectorAll(".reading-passages .choice-btn")];
assert(passages.length >= 8, `passages to choose from (${passages.length})`);
const titles = passages.map((p) => p.textContent).join(" | ");
for (const book of ["Genesis", "Ruth", "Deuteronomy", "Psalm"]) assert(titles.includes(book), `a passage from ${book}`);
assert(content.querySelectorAll(".reading-verse").length === 5, "the first passage (Genesis 1:1–5) shows its five verses");
assert(/Genesis 1:1/.test(content.textContent), "verses are named, e.g. Genesis 1:1");

console.log("\nTap any word");
assert(!content.querySelector(".reading-parse"), "nothing is parsed until a word is tapped");
const firstVerse = content.querySelector('.reading-verse[data-ref="Gen.1.1"]');
click(firstVerse.querySelector('.bible-word[data-wi="1"]')); // בָּרָא
await wait();
let panel = content.querySelector('.reading-verse[data-ref="Gen.1.1"] .reading-parse');
assert(!!panel, "tapping a word shows its parts");
assert(/Qal/.test(panel.textContent) && /perfect/.test(panel.textContent) && /third person/.test(panel.textContent), "a verb shows binyan, form and person");
assert(/Root/.test(panel.textContent) && /ב – ר – א/.test(panel.textContent), "...and its root");
click(content.querySelector('.reading-verse[data-ref="Gen.1.1"] .bible-word[data-wi="0"]')); // בְּרֵאשִׁית
await wait();
panel = content.querySelector('.reading-verse[data-ref="Gen.1.1"] .reading-parse');
assert(/preposition/.test(panel.textContent) && /noun/.test(panel.textContent) && /absolute/.test(panel.textContent), "a prefixed noun shows its preposition and the noun's state");
assert(content.querySelectorAll(".reading-parse").length === 1, "one word at a time");

console.log("\nYour translation and the English");
assert(!content.querySelector(".reading-english"), "English stays hidden until asked for");
const showBtn = [...firstVerse.querySelectorAll("button")].find((b) => b.textContent === "Show English");
click(content.querySelector('.reading-verse[data-ref="Gen.1.1"]').querySelectorAll(".button-row button")[0]);
await wait();
const en = content.querySelector('.reading-verse[data-ref="Gen.1.1"] .reading-english');
assert(!!en && /In the beginning, God created the heavens and the earth/.test(en.textContent), "Show English reveals the verse's English");
assert(!!content.querySelector('.reading-verse[data-ref="Gen.1.1"] textarea'), "there is a box for your own translation");

console.log("\nMark as read");
assert(getReadingStats().verses === 0 && /No reading streak yet/.test(content.textContent), "no streak at first");
const readBtn = () => [...content.querySelector('.reading-verse[data-ref="Gen.1.1"]').querySelectorAll("button")].find((b) => /as read$/.test(b.textContent));
click(readBtn());
await wait();
assert(!!getReadLog().verses["Gen.1.1"], "the verse is saved as read");
assert(getReadingStats().streak === 1 && /1-day reading streak/.test(content.textContent), "the streak starts at one day");
assert(readBtn().textContent === "Unmark as read", "the button now offers to undo");
click([...content.querySelectorAll("button")].find((b) => /Mark the whole passage as read/.test(b.textContent)));
await wait();
assert(getReadingStats().verses === 5, "the whole passage can be marked at once");
assert(/every verse of this passage/.test(content.textContent), "and says so");

console.log("\nOther books");
click(passages.find((p) => /Shema/.test(p.textContent)));
await wait();
assert(/Deuteronomy 6:4/.test(content.textContent), "Deuteronomy 6:4–9 opens");
const shema = content.querySelector('.reading-verse[data-ref="Deut.6.4"]');
click(shema.querySelectorAll(".button-row button")[0]);
await wait();
assert(/Hear, Israel/.test(content.textContent), "its English appears on request");

console.log("\nAccent marks");
const accents = (s) => /[\u0591-\u05AF]/.test(s);
const hasAccentNow = accents(content.querySelector(".bible-verse").textContent);
const cb = document.querySelector("#sidebar-extra input[type=checkbox], #sidebarExtra input[type=checkbox], .bible-check input");
if (cb) {
  cb.checked = false;
  cb.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
  await wait();
  assert(hasAccentNow && !accents(content.querySelector(".bible-verse").textContent), "the sidebar switch hides the accent marks");
}

console.log("\nMixed review");
click([...content.querySelectorAll(".bible-tabs .choice-btn")].find((b) => b.textContent === "Mixed review"));
await wait();
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

summary();
