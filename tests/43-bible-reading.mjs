import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { getReadingStats, getReadLog, getChapterRead } from "../public/js/bible-insights.js";
import { getScheduleEntries } from "../public/js/srs.js";

// The Reading page: every chapter of eleven books, chosen by book and then chapter and read a short passage at a time,
// tap-any-word parsing with the vocabulary list first, ketiv/qere and Aramaic words, your own translation,
// tap-to-reveal English, marking a passage as read, and Mixed review.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

console.log("Opening");
const btn = document.querySelector('.nav-btn[data-page="bible-reading"]');
assert(!!btn && btn.textContent === "Reading", "Reading is in the Bible in Context sidebar group");
navigateTo(document, "bible-reading");
await wait(400);
assert(content.querySelector("h1").textContent === "Reading", "the page opens");
const Ev = document.defaultView.Event;
const bookSel = () => content.querySelector(".reading-book-select");
const chapterSel = () => content.querySelector(".reading-chapter-select");
const choose = async (sel, value) => {
  sel.value = value;
  sel.dispatchEvent(new Ev("change", { bubbles: true }));
  await wait(400);
};
const sections = () => [...content.querySelectorAll(".reading-passages .choice-btn")];
// opens the section of the current chapter that holds a verse (sections are named "Genesis 31:46–54")
const openSectionWith = async (verse) => {
  const b = sections().find((x) => {
    const m = /:(\d+)(?:–(\d+))?$/.exec(x.querySelector(".reading-passage-title").textContent);
    return m && verse >= Number(m[1]) && verse <= Number(m[2] || m[1]);
  });
  click(b);
  await wait(300);
};
const bookNames = [...bookSel().options].map((o) => o.textContent.replace(" ✓", ""));
assert(bookNames.join() === "Genesis,Exodus,Numbers,Deuteronomy,Joshua,Ruth,1 Samuel,Psalms,Proverbs,Isaiah,Jonah", `eleven books to choose from, in Bible order (${bookNames.join()})`);
assert(bookSel().value === "Gen", "the page opens at Genesis");
const chapters = [...chapterSel().options].map((o) => o.textContent);
assert(chapters.length === 50 && chapters[0] === "Chapter 1" && chapters[49] === "Chapter 50", "Genesis offers all of its 50 chapters");
assert(/0 of 31 verses read/.test(content.querySelector(".reading-book-title").textContent), "the chapter shows its verse count: 31");
assert(sections().length === 4, `Genesis 1 is read in four sections of about eight verses (${sections().length})`);
const titles = sections().map((b) => b.querySelector(".reading-passage-title").textContent);
assert(titles.every((t) => /^Genesis 1:\d+(–\d+)?$/.test(t)), `sections are named by plain references: ${titles.join(", ")}`);
const firstEnd = Number(/–(\d+)$/.exec(titles[0])[1]);
assert(content.querySelectorAll(".reading-verse").length === firstEnd, `the first section shows its ${firstEnd} verses, not the whole chapter`);
assert(titles[1].startsWith(`Genesis 1:${firstEnd + 1}–`) && titles[3].endsWith("–31"), "the sections follow one another and end at verse 31");

console.log("\nTap any word");
assert(!content.querySelector(".reading-parse"), "nothing is parsed until a word is tapped");
const firstVerse = content.querySelector('.reading-verse[data-ref="Gen.1.1"]');
click(firstVerse.querySelector('.bible-word[data-wi="1"]')); // בָּרָא
await wait();
let panel = content.querySelector('.reading-verse[data-ref="Gen.1.1"] .reading-parse');
assert(!!panel, "tapping a word shows its parts");
assert(/Qal/.test(panel.textContent) && /perfect/.test(panel.textContent) && /third person/.test(panel.textContent), "a verb shows binyan, form and person");
assert(/Root/.test(panel.textContent) && /ב – ר – א/.test(panel.textContent), "...and its root");
const vocab = panel.querySelector(".reading-vocab");
assert(!!vocab && /Your vocabulary/.test(vocab.textContent) && /to create/.test(vocab.textContent), "the vocabulary list comes first: the meaning from the app's own list (to create)");
assert(/Lesson 5A/.test(vocab.textContent) && /occurs 48 times/.test(vocab.textContent) && /Verb/.test(vocab.textContent), "...with its lesson, how often it occurs, and its part of speech");
assert(/not started yet/.test(vocab.textContent), "...and whether it has been started");
const order = [...panel.children].map((c) => c.className);
assert(order.indexOf("reading-vocab") < order.indexOf("reading-gloss") && order.indexOf("reading-gloss") < order.findIndex((c) => /reading-parse-table|bible-summary/.test(c)), "the other (dictionary) meaning is beneath it, before the parts");
assert(/Other meaning/.test(panel.querySelector(".reading-gloss").textContent), "...and is labelled as the other meaning");
click(content.querySelector('.reading-verse[data-ref="Gen.1.1"] .bible-word[data-wi="0"]')); // בְּרֵאשִׁית
await wait();
panel = content.querySelector('.reading-verse[data-ref="Gen.1.1"] .reading-parse');
assert(/preposition/.test(panel.textContent) && /noun/.test(panel.textContent) && /absolute/.test(panel.textContent), "a prefixed noun shows its preposition and the noun's state");
assert(content.querySelectorAll(".reading-parse").length === 1, "one word at a time");
click(content.querySelector('.reading-verse[data-ref="Gen.1.1"] .bible-word[data-wi="4"]')); // הַשָּׁמַיִם
await wait();
assert(!!content.querySelector(".reading-vocab .reading-vocab-main"), "another word shows its vocabulary entry too");

console.log("\nYour translation and the English");
assert(!content.querySelector(".reading-english"), "English stays hidden until asked for");
click(content.querySelector('.reading-verse[data-ref="Gen.1.1"]').querySelectorAll(".button-row button")[0]);
await wait();
const en = content.querySelector('.reading-verse[data-ref="Gen.1.1"] .reading-english');
assert(!!en && /In the beginning, God created the heavens and the earth/.test(en.textContent), "Show English reveals the verse's English");
assert(!!content.querySelector('.reading-verse[data-ref="Gen.1.1"] textarea'), "there is a box for your own translation");

console.log("\nMarking a passage as read");
assert(getReadingStats().verses === 0 && /No reading streak yet/.test(content.textContent), "no streak at first");
const markBtn = () => [...content.querySelectorAll("button")].find((b) => /^Mark this passage as read/.test(b.textContent));
assert(![...content.querySelectorAll(".reading-verse button")].some((b) => /as read$/.test(b.textContent)), "there is no button on each verse: a passage is marked at once");
assert(new RegExp(`\\(${firstEnd} verses\\)`).test(markBtn().textContent), "the button says how many verses it marks");
click(markBtn());
await wait();
assert(getReadingStats().verses === firstEnd && !!getReadLog().verses["Gen.1.1"] && !!getReadLog().verses[`Gen.1.${firstEnd}`], `the whole passage is saved as read (${firstEnd} verses)`);
assert(!getReadLog().verses[`Gen.1.${firstEnd + 1}`], "...and no more than that");
assert(getReadingStats().streak === 1 && /1-day reading streak/.test(content.textContent), "the streak starts at one day");
assert(/marked this whole passage as read/.test(content.textContent) && !markBtn(), "the page says so");
assert(new RegExp(`${firstEnd} of 31 verses read`).test(content.querySelector(".reading-book-title").textContent), "the chapter shows its progress");
assert(!!content.querySelector(".reading-passages .choice-btn .reading-section-done"), "a finished section is ticked");
assert(content.querySelectorAll(".reading-verse .pill-good").length === firstEnd, "each verse of it shows Read");
assert(!!localStorage.getItem("hebrewVerbApp:bibleRead:Gen") && !localStorage.getItem("hebrewVerbApp:bibleReadLog"), "it is kept in one small item for the book, not in the old single log");
click([...content.querySelectorAll("button")].find((b) => b.textContent === "Unmark this passage"));
await wait();
assert(getReadingStats().verses === 0 && !!markBtn(), "a passage can be unmarked");
click(markBtn());
await wait();

console.log("\nMoving through a chapter");
const nextBtn = () => [...content.querySelectorAll(".reading-section-nav button")].find((b) => /^Next:/.test(b.textContent));
const prevBtn = () => [...content.querySelectorAll(".reading-section-nav button")].find((b) => /Previous/.test(b.textContent));
assert(!!nextBtn() && !prevBtn(), "the first section offers Next, and no Previous");
click(nextBtn());
await wait(300);
assert(content.querySelector(".reading-verse").dataset.ref === `Gen.1.${firstEnd + 1}`, "Next opens the following section");
assert(/Previous: Genesis 1:1–/.test(prevBtn().textContent), "and Previous leads back, by reference");
click(sections()[3]);
await wait();
assert(/^Next: Genesis 2/.test(nextBtn().textContent), "after the last section of Genesis 1, Next leads into Genesis 2");
click(nextBtn());
await wait(400);
assert(chapterSel().value === "2" && content.querySelector(".reading-verse").dataset.ref === "Gen.2.1", "and opens Genesis 2");
assert(/Previous: Genesis 1:24–31/.test(prevBtn().textContent), "Previous leads back across the chapter to the last section of Genesis 1");
click(prevBtn());
await wait(400);
assert(chapterSel().value === "1" && sections().some((b) => b.classList.contains("selected") && /24–31/.test(b.textContent)), "...and opens that last section");
await choose(chapterSel(), "2");
assert(content.querySelector(".reading-verse").dataset.ref === "Gen.2.1", "choosing a chapter opens its first passage");
await choose(chapterSel(), "1");
assert(sections().find((b) => b.classList.contains("selected")).textContent.includes(`1:${firstEnd + 1}`), "choosing a chapter picks up at the first passage not yet read");

console.log("\nOther books");
await choose(bookSel(), "Josh");
assert([...chapterSel().options].length === 24, "Joshua offers its 24 chapters");
await choose(chapterSel(), "24");
assert(/Joshua 24:1/.test(content.textContent) && sections().length === 4, "Joshua 24 (33 verses) opens in four sections");
await choose(bookSel(), "Ruth");
assert([...chapterSel().options].map((o) => o.textContent).join() === "Chapter 1,Chapter 2,Chapter 3,Chapter 4", "Ruth offers its four chapters");
await choose(bookSel(), "Ps");
assert([...chapterSel().options].length === 150 && chapterSel().options[0].textContent === "Psalm 1", "Psalms offers all 150 psalms, each named as a psalm");
await choose(chapterSel(), "51");
assert(/Hebrew verse numbers/.test(content.textContent), "Psalm 51 explains that the Hebrew verse numbers are higher than the English");
click(content.querySelector('.reading-verse[data-ref="Ps.51.3"]').querySelectorAll(".button-row button")[0]);
await wait();
assert(/Have mercy on me, God/.test(content.querySelector('.reading-verse[data-ref="Ps.51.3"] .reading-english').textContent), "Hebrew 51:3 shows English 51:1");
click(content.querySelector('.reading-verse[data-ref="Ps.51.1"]').querySelectorAll(".button-row button")[0]);
await wait();
assert(/For the Chief Musician/.test(content.querySelector('.reading-verse[data-ref="Ps.51.1"] .reading-english').textContent), "the psalm's heading is the English of the Hebrew heading verse");
await choose(chapterSel(), "1");
assert(!/Hebrew verse numbers/.test(content.textContent), "Psalm 1 has no heading, so no such note");
await choose(bookSel(), "Jonah");
await choose(chapterSel(), "2");
assert(content.querySelector(".reading-verse").dataset.ref === "Jonah.2.1", "Jonah 2 opens at its first (Hebrew) verse");

console.log("\nKetiv/Qere: written consonants, read word");
await choose(bookSel(), "Ruth");
await choose(chapterSel(), "2");
const kq = content.querySelector('.reading-verse[data-ref="Ruth.2.1"] .bible-kq');
assert(!!kq && kq.textContent === "מידע", "Ruth 2:1 shows the ketiv as bare consonants: מידע");
assert(!/[\u05B0-\u05C7\u0591-\u05AF]/.test(kq.textContent), "...with no vowels and no accents");
const verse21 = content.querySelector('.reading-verse[data-ref="Ruth.2.1"]');
assert(!verse21.textContent.includes("מוֹדַ"), "the qere is not shown as a second word beside it");
assert(!kq.querySelector(".bible-gap") && !verse21.querySelector(".reading-kq"), "nothing else is added to the line");
click(kq);
await wait();
let kqPanel = content.querySelector('.reading-verse[data-ref="Ruth.2.1"] .reading-kq');
assert(!!kqPanel && /Ketiv\/Qere/.test(kqPanel.textContent), "tapping it says it is a Ketiv/Qere occurrence");
assert(/What is written \(ketiv\)/.test(kqPanel.textContent) && /What is read \(qere\)/.test(kqPanel.textContent) && /מוֹדַ/.test(kqPanel.textContent), "...showing what is written and the qere with its vowels");
assert(/noun/.test(kqPanel.textContent) && /Your vocabulary|not in the vocabulary list/.test(kqPanel.textContent), "...with the qere's parsing and vocabulary entry");
assert(!/Pual|participle/.test(kqPanel.textContent), "the ketiv's own parsing (a Pual participle) is not shown");
const words21 = content.querySelectorAll('.reading-verse[data-ref="Ruth.2.1"] .bible-word').length;
assert(words21 >= 5, `the verse has its words (${words21}), the pair counted once`);

console.log("\nKetiv/Qere: read but not written, and written but not read");
await choose(chapterSel(), "3");
const gap = content.querySelector('.reading-verse[data-ref="Ruth.3.5"] .bible-kq-gap');
assert(!!gap && !!gap.querySelector(".bible-gap") && gap.textContent === "", "Ruth 3:5 shows a small gap where a word is read but not written");
assert(/read but not written/.test(gap.getAttribute("aria-label")), "...described for a screen reader");
click(gap);
await wait();
kqPanel = content.querySelector('.reading-verse[data-ref="Ruth.3.5"] .reading-kq');
assert(!!kqPanel && /read but not written/.test(kqPanel.textContent) && /אֵלַ/.test(kqPanel.textContent), "tapping the gap shows the word that is read");
await choose(chapterSel(), "3");
await openSectionWith(12);
const ketivOnly = content.querySelector('.reading-verse[data-ref="Ruth.3.12"] .bible-kq');
assert(!!ketivOnly && ketivOnly.textContent === "אם", "Ruth 3:12 shows a ketiv with no qere: אם");
click(ketivOnly);
await wait();
assert(/written but not read/.test(content.querySelector('.reading-verse[data-ref="Ruth.3.12"] .reading-kq').textContent), "...and the panel says it is written but not read");

console.log("\nKetiv/Qere: a qere of two words");
await choose(bookSel(), "Gen");
await choose(chapterSel(), "30");
await openSectionWith(11);
const two = content.querySelector('.reading-verse[data-ref="Gen.30.11"] .bible-kq');
assert(!!two && two.textContent === "בגד", "Genesis 30:11 shows the single written word בגד");
click(two);
await wait();
const twoPanel = content.querySelector('.reading-verse[data-ref="Gen.30.11"] .reading-kq');
assert(/2 words/.test(twoPanel.textContent) && twoPanel.querySelectorAll(".reading-kq-word").length === 2, "...and its panel shows the two words that are read, each parsed");

console.log("\nAramaic");
await choose(chapterSel(), "31");
await openSectionWith(47);
const aram = () => content.querySelector('.reading-verse[data-ref="Gen.31.47"]');
click(aram().querySelector('.bible-word[data-wi="4"]'));
await wait();
assert(/Aramaic/.test(aram().querySelector(".reading-parse").textContent) && /not in the Hebrew vocabulary list/.test(aram().querySelector(".reading-parse").textContent), "an Aramaic word (Genesis 31:47) is labelled as Aramaic and not matched to the Hebrew vocabulary");
click(aram().querySelector('.bible-word[data-wi="0"]'));
await wait();
assert(!/Aramaic/.test(aram().querySelector(".reading-parse").textContent), "...and a Hebrew word beside it is not");
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
