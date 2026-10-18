// Definite Article in Context: the article rules (from the owner's rule sheets), the
// build output, and the page.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo, click } from "./helpers.mjs";
import { classifyArticle, parseOsis, findArticles, ARTICLE_PATTERNS, letters } from "../scripts/lib/article-rules.mjs";
import { stripAccents, prettyRef } from "../public/js/bible-text.js";

console.log("Rules: each pattern, from real words");
const c = (art, next) => classifyArticle(art, next);
assert(c("הַ", "שָּׁמַיִם") === "forte", "הַ + dagesh forte (הַשָּׁמַיִם)");
assert(c("הָ", "אָרֶץ") === "compensatory", "הָ before א (הָאָרֶץ) = compensatory lengthening");
assert(c("הָ", "רָקִיעַ") === "compensatory", "הָ before ר");
assert(c("הָ", "עֵץ") === "compensatory", "הָ before ע");
assert(c("הַ", "חֹשֶׁךְ") === "implicit", "הַ before ח = implicit doubling");
assert(c("הַ", "הוּא") === "implicit", "הַ before ה = implicit doubling");
assert(c("הַ", "עַרְקִי") === "implicit", "ע may show implicit doubling too");
assert(c("הֶ", "הָרִים") === "segol" && c("הֶ", "עָרִים") === "segol", "הֶ before ה / ע");
assert(c("הַ", "יְבוּסִי") === "sqnmlvy_sheva", "SQNMLVY: י with vocal sheva");
assert(c("הַ", "מְדַבֵּר") === "sqnmlvy_sheva", "SQNMLVY: מ with vocal sheva");
assert(c("הַ", "צִפֹּר") === "sqnmlvy_extended", "SQNMLVY extended: short vowel before a doubled letter");
assert(c("הַ", "טַבָּחִים") === null, "ט is not in SQNMLVY, so Gen 40:3 is held back");
assert(c("הָ", "הֵם") === null, "הָ before ה is not covered by the sheets, so it is held back");
assert(c("הָ", "שִׁבֳּלִים") === null, "הָ before a letter that can take a dagesh is held back");
assert(ARTICLE_PATTERNS.length === 6 && ARTICLE_PATTERNS.every((p) => p.label && p.explain && p.plain), "six patterns, each with wording");
assert(letters("שָּׁמַיִם")[0].marks.includes("\u05bc"), "letters() keeps the dagesh with its letter");

console.log("Reading the Hebrew Bible file");
const verses = parseOsis(readFileSync(new URL("../data-source/bible/Gen.xml", import.meta.url), "utf8"));
assert(verses.length === 1533, `Genesis has 1,533 verses (${verses.length})`);
assert(verses[0].ref === "Gen.1.1" && verses[0].words.filter((w) => !w.seg).length === 7, "Gen 1:1 has 7 words");
const found = findArticles(verses);
const held = found.filter((a) => !a.pattern);
assert(found.length === 1522, `1,522 tagged articles (${found.length})`);
assert(held.length === 7, `7 held back (${held.length})`);
assert(held.some((h) => h.ref === "Gen.40.3"), "Gen 40:3 is among the held-back cases");
const counts = {};
for (const a of found) counts[a.pattern || "held"] = (counts[a.pattern || "held"] || 0) + 1;
assert(counts.forte === 846 && counts.compensatory === 546 && counts.implicit === 91 && counts.segol === 8 && counts.sqnmlvy_sheva === 19 && counts.sqnmlvy_extended === 5, "counts per pattern match the audit sheet and your SQNMLVY rule");

console.log("Built data file");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-article.json", import.meta.url), "utf8"));
assert(data.source.attribution.startsWith("Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb"), "carries the required OSHB credit line");
assert(data.examples.length > 1000 && data.examples.every((e) => data.patterns.some((p) => p.id === e.pattern)), "every example has a known pattern");
assert(data.examples.every((e) => data.verses[e.ref] && data.verses[e.ref][e.wi] && data.verses[e.ref][e.wi].p === e.pattern), "every example points at a real word in a kept verse");
assert(!data.examples.some((e) => data.verses[e.ref][e.wi].p === "held") && data.held.some((h) => h.ref === "Gen.40.3"), "held-back words are never practice examples (and Gen 40:3 is listed as held)");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages, with all their verses present");

console.log("Text helpers");
assert(!/[\u0591-\u05AF]/.test(stripAccents("בְּרֵאשִׁ֖ית")) && stripAccents("בְּרֵאשִׁ֖ית").includes("\u05b0"), "hiding accents keeps the vowel points");
assert(prettyRef("Gen.1.2") === "Genesis 1:2", "prettyRef");

console.log("The page");
const { document, localStorage } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-article");
await wait(150);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Definite Article in Context", "page opens");
assert(content.querySelectorAll(".bible-verse-row").length === 5, "guided passage shows Genesis 1:1–5");
assert(content.querySelectorAll(".bible-mark").length >= 1, "an article is highlighted");
assert(content.querySelectorAll(".bible-choice").length === 6, "six pattern choices");
const rightIdx = data.patterns.findIndex((p) => p.id === data.verses["Gen.1.1"][4].p);
content.querySelectorAll(".bible-choice")[rightIdx].click();
assert(content.querySelector(".bible-feedback.is-correct"), "choosing the right pattern says correct and explains");
// accents switch
const box = document.querySelector("#sidebar-extra .bible-check input");
assert(box && box.checked, "accent marks are shown by default");
box.checked = false;
box.dispatchEvent(new document.defaultView.Event("change", { bubbles: true }));
await wait(50);
assert(localStorage.getItem("bibleShowAccents") === "0" && !/[\u0591-\u05AF]/.test(document.getElementById("content").querySelector(".bible-verse").textContent), "hiding accent marks removes them from the verse and is remembered");
// quiz
[...document.querySelectorAll(".bible-tabs .choice-btn")][1].click();
await wait(30);
[...document.querySelectorAll("#content .btn")].find((b) => b.textContent === "Start quiz").click();
await wait(30);
for (let i = 0; i < 10; i++) {
  document.querySelectorAll("#content .bible-choice")[0].click();
  [...document.querySelectorAll("#content .btn")].find((b) => /Next question|See score/.test(b.textContent)).click();
  await wait(5);
}
assert(/^Score: \d+ of 10/.test(document.querySelector("#content h2").textContent), "the quiz ends with a score");
assert(JSON.parse(localStorage.getItem("hebrewVerbApp:quizHistory:bible-article"))[0].total === 10, "the attempt is recorded");
navigateTo(document, "credits");
await wait(30);
assert(document.getElementById("content").textContent.includes("Original work of the Open Scriptures Hebrew Bible available at https://github.com/openscriptures/morphhb"), "Sources & Credits shows the OSHB credit");
assert(["Mitchel", "Kelley", "Kutz", "Fuller", "Futato"].every((n) => document.getElementById("content").textContent.includes(n)), "Sources & Credits lists your reference books");

summary();
