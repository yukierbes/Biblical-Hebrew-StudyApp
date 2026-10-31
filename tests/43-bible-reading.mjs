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
const works = [...content.querySelectorAll(".reading-works .choice-btn")];
assert(works.length === 3, `three things to read: Genesis 1, Ruth, Joshua 24 (${works.length})`);
const workTitles = works.map((w) => w.textContent).join(" | ");
for (const w of ["Genesis 1", "Ruth", "Joshua 24"]) assert(workTitles.includes(w), `${w} is on offer`);
assert(/0 of 31 verses read/.test(works[0].textContent) && /0 of 85 verses read/.test(works[1].textContent) && /0 of 33 verses read/.test(works[2].textContent), "each shows its verse count: 31, 85 and 33");
const passages = [...content.querySelectorAll(".reading-passages .choice-btn")];
assert(passages.length === 7, `Genesis 1 is read in seven sections (${passages.length})`);
assert(content.querySelectorAll(".reading-verse").length === 5, "the first section (Genesis 1:1–5) shows its five verses, not the whole chapter");
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
click([...content.querySelectorAll("button")].find((b) => /Mark this section as read/.test(b.textContent)));
await wait();
assert(getReadingStats().verses === 5, "the whole section can be marked at once");
assert(/every verse of this section/.test(content.textContent), "and says so");
assert(/5 of 31 verses read/.test(content.querySelector(".reading-works .choice-btn").textContent), "the chapter shows its progress: 5 of 31");
assert(content.querySelector(".reading-passages .choice-btn .reading-section-done"), "a finished section is ticked");

console.log("\nMoving through a chapter");
const nextBtn = () => [...content.querySelectorAll(".reading-section-nav button")].find((b) => /^Next:/.test(b.textContent));
assert(!!nextBtn() && !/Previous/.test(content.querySelector(".reading-section-nav").textContent), "the first section offers Next, and no Previous");
click(nextBtn());
await wait();
assert(/Genesis 1:6/.test(content.textContent) && content.querySelectorAll(".reading-verse").length === 3, "Next opens the second section (1:6–8)");
assert(/Previous: 1:1–5/.test(content.querySelector(".reading-section-nav").textContent), "and Previous leads back");
click([...content.querySelectorAll(".reading-passages .choice-btn")][6]);
await wait();
assert(/That is the end of Genesis 1/.test(content.textContent) && !nextBtn(), "the last section says the chapter is finished");

console.log("\nOther works");
click([...content.querySelectorAll(".reading-works .choice-btn")].find((b) => /Joshua 24/.test(b.textContent)));
await wait();
assert(content.querySelectorAll(".reading-passages .choice-btn").length === 6, "Joshua 24 is read in six sections");
click([...content.querySelectorAll(".reading-passages .choice-btn")].find((b) => /Choose whom you will serve/.test(b.textContent)));
await wait();
assert(/Joshua 24:15/.test(content.textContent), "Joshua 24:14–18 opens");
const choose = content.querySelector('.reading-verse[data-ref="Josh.24.15"]');
click(choose.querySelectorAll(".button-row button")[0]);
await wait();
assert(/choose today whom you will serve/.test(content.textContent), "its English appears on request");
click([...content.querySelectorAll(".reading-works .choice-btn")].find((b) => /^Ruth/.test(b.textContent)));
await wait();
assert(content.querySelectorAll(".reading-passages .choice-btn").length === 15, "Ruth is read in fifteen sections");
assert(/Ruth 1:1/.test(content.textContent), "choosing Ruth starts at its first section");

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
