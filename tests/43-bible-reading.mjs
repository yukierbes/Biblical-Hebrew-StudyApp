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
const Ev = document.defaultView.Event;
const bookSel = () => content.querySelector(".reading-book-select");
const chapterSel = () => content.querySelector(".reading-chapter-select");
const choose = async (sel, value) => {
  sel.value = value;
  sel.dispatchEvent(new Ev("change", { bubbles: true }));
  await wait(300);
};
const bookNames = [...bookSel().options].map((o) => o.textContent.replace(" ✓", ""));
assert(bookNames.join() === "Genesis,Exodus,Numbers,Deuteronomy,Joshua,Ruth,1 Samuel,Psalms,Proverbs,Isaiah,Jonah", `eleven books to choose from, in Bible order (${bookNames.join()})`);
assert(bookSel().value === "Gen", "the page opens at Genesis");
assert([...chapterSel().options].map((o) => o.textContent).join() === "Chapter 1,Chapter 2,Chapter 3,Chapter 22", "Genesis offers chapters 1, 2, 3 and 22");
assert(!content.querySelector(".reading-works"), "the old row of buttons is gone: the top of the page is two menus");
assert(/0 of 31 verses read/.test(content.querySelector(".reading-book-title").textContent), "the chapter shows its verse count: 31");
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
assert(/5 of 31 verses read/.test(content.querySelector(".reading-book-title").textContent), "the chapter shows its progress: 5 of 31");
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
assert(/Next: Genesis 2: 2:1–3 The seventh day/.test(nextBtn().textContent), "after the last section of Genesis 1, Next leads into Genesis 2");
click(nextBtn());
await wait(300);
assert(chapterSel().value.endsWith("Genesis 2") && /Genesis 2:1/.test(content.textContent), "and opens Genesis 2");
assert(/Previous: Genesis 1: 1:26–31/.test(content.querySelector(".reading-section-nav").textContent), "Previous leads back across the chapter");

console.log("\nOther books");
await choose(bookSel(), "Josh");
assert(!chapterSel(), "a book with one chapter has no chapter menu");
assert(content.querySelectorAll(".reading-passages .choice-btn").length === 6, "Joshua 24 is read in six sections");
click([...content.querySelectorAll(".reading-passages .choice-btn")].find((b) => /Choose whom you will serve/.test(b.textContent)));
await wait();
assert(/Joshua 24:15/.test(content.textContent), "Joshua 24:14–18 opens");
const choose15 = content.querySelector('.reading-verse[data-ref="Josh.24.15"]');
click(choose15.querySelectorAll(".button-row button")[0]);
await wait();
assert(/choose today whom you will serve/.test(content.textContent), "its English appears on request");
await choose(bookSel(), "Ruth");
assert([...chapterSel().options].map((o) => o.textContent).join() === "Chapter 1,Chapter 2,Chapter 3,Chapter 4", "Ruth offers its four chapters");
assert(content.querySelectorAll(".reading-passages .choice-btn").length === 4 && /Ruth 1:1/.test(content.textContent), "choosing Ruth starts at chapter 1, read in four sections");
await choose(chapterSel(), chapterSel().options[3].value);
assert(content.querySelectorAll(".reading-passages .choice-btn").length === 4 && /Ruth 4:1/.test(content.textContent), "Chapter 4 is read in four sections");
await choose(bookSel(), "Ps");
assert([...chapterSel().options].length === 9 && chapterSel().options[0].textContent === "Psalm 1", "Psalms offers the nine psalms, each named as a psalm");
await choose(chapterSel(), [...chapterSel().options].find((o) => o.textContent === "Psalm 51").value);
assert(/Hebrew verse numbers/.test(content.textContent), "Psalm 51 explains that the Hebrew verse numbers are higher than the English");
click([...content.querySelectorAll(".reading-passages .choice-btn")].find((b) => /Have mercy on me/.test(b.textContent)));
await wait();
click(content.querySelector('.reading-verse[data-ref="Ps.51.3"]').querySelectorAll(".button-row button")[0]);
await wait();
assert(/Have mercy on me, God/.test(content.querySelector('.reading-verse[data-ref="Ps.51.3"] .reading-english').textContent), "Hebrew 51:3 shows English 51:1");
click(content.querySelector('.reading-verse[data-ref="Ps.51.1"]').querySelectorAll(".button-row button")[0]);
await wait();
assert(/For the Chief Musician/.test(content.querySelector('.reading-verse[data-ref="Ps.51.1"] .reading-english').textContent), "the psalm's heading is the English of the Hebrew heading verse");
await choose(bookSel(), "Jonah");
await choose(chapterSel(), [...chapterSel().options].find((o) => /2$/.test(o.textContent)).value);
assert(/Jonah 2:1/.test(content.textContent), "Jonah 2 opens at its first (Hebrew) verse");
await choose(bookSel(), "Ruth");

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
