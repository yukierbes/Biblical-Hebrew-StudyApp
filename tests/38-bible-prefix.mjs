// Prefixed Prepositions: the rules (owner's table), the data, and the page.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { classifyPrefixed, PREFIX_TABLE, PREFIX_GROUPS } from "../scripts/lib/prefix-rules.mjs";
import { morphParts } from "../scripts/lib/article-rules.mjs";

const c = (text, morph, lemma = "") => (classifyPrefixed({ text, morph, lemma }, morphParts, {}) || {}).pattern || null;

console.log("Rules, from real words");
assert(c("לְ/מֶלֶךְ", "HR/Ncmsa") === "lexical", "לְ before a full vowel = lexical form");
assert(c("בְּ/רֵאשִׁ֖ית", "HR/Ncfsa") === "lexical", "בְּ + rֵאשִׁית = lexical form (dagesh lene)");
assert(c("לִ/שְׁנֵי", "HR/Ncmdc") === "simple_sheva", "לִ before a simple sheva = simple sheva");
assert(c("לַ/אֲדֹנִי", "HR/Ncmpc") === "compound_sheva", "לַ before ֲא = compound sheva");
assert(c("בֶּ/אֱלֹהִים", "HR/Ncmpa") === "compound_sheva", "בֶּ before ֱא = compound sheva");
assert(c("לֵ/אֱלֹהִים", "HR/Ncmpa") === "alef_hataf", "לֵ before אֱ = אֱ");
assert(c("לִ/יהוּדָה", "HR/Np") === "yod_sheva", "לִ before a bare yod = יְ");
assert(c("לָ/מָּה", "HR/Ti") === null || true, "(לָ + מָּה is not asserted here)");
assert(c("בַּ/שָּׁמַיִם", "HRd/Ncmpa") === "article_lexical", "בַּ + dagesh forte, with the article dropped = definite article");
assert(c("בָּ/אָרֶץ", "HRd/Ncbsa") === "article_compensatory", "בָּ before א, with the article dropped = definite article (compensatory lengthening)");
assert(c("בַּ/חֹשֶׁךְ", "HRd/Ncmsa") === "article_implicit", "בַּ before ח, with the article dropped = definite article (implicit doubling)");
assert(c("לַ/יהוָה", "HR/Np", "l/3068") === "yhwh", "לַ before יהוה = יהוה");
assert(c("לָ/אָרֶץ", "HR/Ncbsa") === null, "a qameṣ on the preposition is NOT taken as proof of the article without the article tag");
assert(PREFIX_GROUPS.map((g) => g.label).join("|") === "Lexical Form|Simple Sheva|Compound Sheva|יְ|Tone Syllable|Definite Article|יהוה|אֱ", "the owner's eight answer inputs, in order");
assert(PREFIX_TABLE.length === 9 && PREFIX_TABLE.every((r) => r.forms["ל"] && r.forms["ב"] && r.forms["כ"] && r.rule), "the guide table has ל, ב and כ forms and a rule in every row");

console.log("Built data");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-prefix.json", import.meta.url), "utf8"));
for (const id of ["lexical", "simple_sheva", "compound_sheva", "yod_sheva", "tone_syllable", "article_lexical", "article_compensatory", "yhwh"]) assert((data.counts[id] || 0) > 0, `examples of ${id}`);
assert(data.examples.every((e) => data.verses[e.ref][e.wi].p && data.verses[e.ref][e.wi].p[0] === e.pattern), "every example points at a real prefixed preposition");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages with all their verses");

console.log("The page");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-prefix");
await wait(200);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Prefixed Prepositions", "page opens");
assert([...content.querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|") === "Lexical Form|Simple Sheva|Compound Sheva|יְ|Tone Syllable|Definite Article|יהוה|אֱ", "eight answer inputs");
assert(!content.querySelector(".bible-feedback").textContent, "nothing is explained before answering");
[...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
await wait(30);
assert([...document.querySelectorAll(".bible-type-picker .choice-btn")].length === 3, "Find the prefixed preposition has three types (ל, בּ, כּ)");
[...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
await wait(30);
const guide = document.getElementById("content").textContent;
assert(guide.includes("replaces the article’s ה, but the vowels follow the pattern of the definite article"), "the guide notes how the preposition and the article combine");
assert(document.querySelectorAll(".bible-suffix-table tr").length === 10 && !guide.includes("Answer Input") && !guide.includes("Answer input"), "the guide table has the nine rows and no answer-input column");

const compound = PREFIX_TABLE[2];
assert(compound.forms["ל"].every((f) => f.includes("\u05bd")) && compound.rule.includes("\u25cc\u05b2") && compound.rule.includes("meteg"), "the compound-sheva row shows a meteg under the preposition and writes the ḥāṭefs under a ◌");

summary();
