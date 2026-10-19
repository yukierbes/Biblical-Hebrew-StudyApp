// Dagesh: the dagesh rules (from the owner's "Hebrew Dagesh" sheet) and the page.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { analyzeWord, DAGESH_PATTERNS, DAGESH_GROUPS } from "../scripts/lib/dagesh-rules.mjs";
import { parseOsis } from "../scripts/lib/article-rules.mjs";
import { shureqIndex, letterMarkedHtml } from "../public/js/bible-text.js";

const one = (word) => analyzeWord(word).map((r) => `${r.letter}:${r.pattern || r.kind}`).join(",");

console.log("Rules, from real words");
assert(one("בְּרֵאשִׁית") === "ב:lene", "begadkefat at the start of a word = lene (בְּרֵאשִׁית)");
assert(one("מִדְבָּר") === "ב:lene", "begadkefat after a silent sheva = lene (מִדְבָּר)");
assert(one("הַשָּׁמַיִם") === "ש:forte", "a dagesh after a vowel in a non-begadkefat letter = forte (הַשָּׁמַיִם)");
assert(one("אַתָּה") === "ת:forte", "a begadkefat letter after a vowel = forte (אַתָּה)");
assert(one("אַתְּ") === "ת:forte", "a dagesh with a sheva under it is a forte (אַתְּ)");
assert(one("וַיַּבְדֵּל") === "י:forte,ד:lene", "forte in the yod, lene in the dalet after a silent sheva (וַיַּבְדֵּל)");
assert(one("אַרְצָהּ") === "ה:mappiq", "a dot in a final ה = mappiq (אַרְצָהּ)");
assert(one("הוּא") === "ו:shureq", "the dot in a vav with no vowel is the šureq vowel, not a dagesh (הוּא)");
assert(analyzeWord("אָכָלְתָּ")[0].pattern === null && analyzeWord("אָכַלְתָּ")[0].pattern === "lene", "a sheva after a short vowel is silent (lene); after qameṣ it is not clear from the spelling, so that case is held back");
assert(DAGESH_PATTERNS.length === 3 && DAGESH_GROUPS.map((g) => g.label).join() === "Dagesh Lene,Dagesh Forte,Mappiq", "three patterns, three answer choices");

console.log("Built data");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-dagesh.json", import.meta.url), "utf8"));
const verses = parseOsis(readFileSync(new URL("../data-source/bible/Gen.xml", import.meta.url), "utf8"));
let total = { lene: 0, forte: 0, mappiq: 0, shureq: 0, held: 0 };
for (const v of verses) for (const w of v.words) if (!w.seg) for (const r of analyzeWord(w.text.split("/").join(""))) total[r.kind === "shureq" ? "shureq" : r.pattern || "held"]++;
assert(total.lene === 3650 && total.forte === 5193 && total.mappiq === 166 && total.held === 33, `Genesis totals: lene ${total.lene}, forte ${total.forte}, mappiq ${total.mappiq}, held ${total.held}`);
assert(data.totals.lene === total.lene && data.totals.shureq === total.shureq, "the data file carries the same totals");
assert(data.examples.length > 2000 && data.examples.every((e) => data.verses[e.ref][e.wi].d.some((d) => d[0] === e.li && d[1] === e.pattern)), "every example points at a real dot in a kept verse");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages with all their verses");
assert(!data.examples.some((e) => data.verses[e.ref][e.wi].d.some((d) => d[0] === e.li && d[1] === "held")), "held-back dots are never practice examples");
assert(shureqIndex("הוּא") === 1 && shureqIndex("הַשָּׁמַיִם") === -1, "shureqIndex finds the šureq vav only");
assert(letterMarkedHtml("בָּרָא", 0).startsWith('<mark class="bible-mark">בָּ</mark>'), "letterMarkedHtml wraps the letter with its marks");

console.log("The page");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-dagesh");
await wait(200);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Dagesh", "page opens");
assert([...content.querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|") === "Dagesh Lene|Dagesh Forte|Mappiq", "answer buttons: Dagesh Lene, Dagesh Forte, Mappiq (names only)");
assert(content.querySelectorAll(".bible-mark").length >= 1 && !content.querySelector(".bible-feedback").textContent, "one letter is highlighted and nothing is explained before answering");
const step = data.passages[0].verses.flatMap((r) => data.verses[r].flatMap((w) => (w.d || []).filter((d) => d[1] !== "held").map((d) => d[1])))[0];
content.querySelectorAll(".bible-choice")[DAGESH_GROUPS.findIndex((g) => g.id === step)].click();
assert(content.querySelector(".bible-feedback.is-correct"), "the right answer is marked correct");
// quiz with missed-question review
[...document.querySelectorAll(".bible-tabs .choice-btn")][1].click();
await wait(30);
assert(document.querySelector("#content .bible-body p").textContent.includes("All patterns included."), "quiz intro says: All patterns included.");
[...document.querySelectorAll("#content .btn")].find((b) => b.textContent === "Start quiz").click();
await wait(30);
for (let i = 0; i < 10; i++) {
  document.querySelectorAll("#content .bible-choice")[0].click();
  [...document.querySelectorAll("#content .btn")].find((b) => /Next question|See score/.test(b.textContent)).click();
  await wait(5);
}
assert(/^Score: \d+ of 10/.test(document.querySelector("#content h2").textContent), "the quiz ends with a score");
const missed = document.querySelectorAll("#content .bible-review").length;
assert(missed > 0 && /Practise the missed ones/.test(document.getElementById("content").textContent), `a review of the ${missed} missed questions is shown, with a way to practise them`);
// guide
[...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
await wait(30);
const guide = document.getElementById("content").textContent;
assert(guide.includes("šureq vowel, not a dagesh") && guide.includes("Dagesh forte in a vav") && guide.includes("Šureq (a vav"), "the guide notes the šureq vowel and compares a vav with a dagesh forte against šureq vavs");
// find the dagesh: choose a type, then tap consonants
[...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
await wait(30);
assert([...document.querySelectorAll(".bible-type-picker .choice-btn")].map((b) => b.textContent).join("|") === "Dagesh Lene|Dagesh Forte|Mappiq", "Find the dagesh offers lene, forte and mappiq");
assert(document.querySelectorAll(".bible-letter").length > 5, "the verse is shown consonant by consonant");
[...document.querySelectorAll(".bible-type-picker .choice-btn")][2].click();
await wait(30);
assert(document.querySelector("#content .bible-body p").textContent.includes("Mappiq"), "the prompt names the chosen type");
assert(guide.includes("Ask in this order") || guide.includes("Lene or forte"), "the guide shows the order of questions");

// regression: the consonant that was tapped is the one that lights up (not the last letter of the word)
[...document.querySelectorAll(".bible-type-picker .choice-btn")][0].click();
await wait(30);
const letters = [...document.querySelectorAll(".bible-letter")];
letters[1].click();
const lit = [...document.querySelectorAll(".bible-letter")].findIndex((l) => l.classList.contains("is-picked"));
assert(lit === 1, `tapping the second consonant highlights the second consonant (highlighted: ${lit})`);

summary();
