// Qameṣ vs Qameṣ-ḥaṭuf: the analyzer (owner's sheets), the data, and the page.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { analyzeWord, classifyAllQamets, classifyAllShevas } from "../scripts/lib/hebrew-word.mjs";
import { QAMES_PATTERNS, QAMES_GROUPS } from "../scripts/lib/qames-rules.mjs";

const q = (w, o = {}) => classifyAllQamets(analyzeWord(w, o)).map((r) => r.pattern || "held");

console.log("Rules, from real words");
assert(q("כָּל", { beforeMaqqef: true })[0] === "hatuf_closed", "closed unaccented (כָּל־) = qameṣ-ḥaṭuf");
assert(q("אָהֳלֹה", { lastInVerse: false })[0] === "hatuf_hataf", "open syllable before a ḥāṭef-qāmeṣ (אָהֳלֹה) = qameṣ-ḥaṭuf");
assert(q("הָֽלְכוּ")[0] === "qames_vocal_sheva", "followed by a vocal sheva, with a meteg (הָֽלְכוּ) = qameṣ");
assert(q("וַיִּבְרָ֣א")[0] === "qames_open", "open syllable = qameṣ");
assert(q("דָּבָ֔ר")[1] === "qames_closed_accented", "closed accented = qameṣ (דָּבָר)");
assert(q("שָׁמְרוּ", { beforeMaqqef: true })[0] === "held", "an unaccented qameṣ before a sheva with no meteg could be either, so it is held back");
assert(q("חָכְמָה", { beforeMaqqef: true })[0] === "held", "(חָכְמָה: the same shape, held back)");
assert(q("הָאָדָם")[2] === "held", "without an accent mark the stress is unknown, so closed syllables are held back");
assert(QAMES_PATTERNS.length === 7 && QAMES_GROUPS.map((g) => g.label).join() === "Qameṣ,Qameṣ-ḥaṭuf", "seven patterns, two answer choices");

console.log("Built data");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-qames.json", import.meta.url), "utf8"));
assert(data.examples.length > 2000 && data.counts.hatuf_closed > 50 && data.counts.hatuf_hataf >= 3 && data.counts.qames_open > 1000, "plenty of examples of the main patterns");
assert(data.examples.every((e) => data.verses[e.ref][e.wi].q.some((x) => x[0] === e.li && x[1] === e.pattern)), "every example points at a real qameṣ in a kept verse");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages with all their verses");

console.log("The page");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-qames");
await wait(200);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Qameṣ vs Qameṣ-ḥaṭuf", "page opens");
assert([...content.querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|") === "Qameṣ|Qameṣ-ḥaṭuf", "answer buttons: Qameṣ, Qameṣ-ḥaṭuf");
assert(content.querySelectorAll(".bible-mark").length >= 1 && !content.querySelector(".bible-feedback").textContent, "one vowel is highlighted and nothing is explained before answering");
[...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
await wait(30);
assert([...document.querySelectorAll(".bible-type-picker .choice-btn")].map((b) => b.textContent).join("|") === "Qameṣ|Qameṣ-ḥaṭuf", "Find the qameṣ offers Qameṣ or Qameṣ-ḥaṭuf");
assert(document.querySelectorAll(".bible-letter").length > 3, "consonant by consonant");
[...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
await wait(30);
assert(document.getElementById("content").textContent.includes("closed unaccented syllable"), "the guide states the rules");

summary();
