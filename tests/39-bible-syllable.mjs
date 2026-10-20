// Syllables & Stress: the syllable analysis, the data, and the page (three answer boxes, divide-the-word interactive).
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { syllabify, syllableRule } from "../scripts/lib/syllables.mjs";

const show = (w, o = {}) => {
  const r = syllabify(w, o);
  return r.why ? "HELD" : r.syllables.map((s) => r.slots.slice(s.start, s.end + 1).join("") + ":" + (s.closed ? "C" : "O") + "/" + s.tone + "/" + s.vowel).join(" | ");
};

console.log("Syllables, from real words");
const bere = syllabify("בְּרֵאשִׁ֖ית");
assert(bere.syllables.length === 3 && bere.syllables[0].vowel === "sheva" && bere.syllables[0].tone === "propretonic" && bere.syllables[2].closed && bere.syllables[2].tone === "tonic", "בְּרֵאשִׁית: a vocal-sheva syllable, an open pretonic, a closed tonic");
assert(syllableRule(bere.syllables[0]) === "OOPPS" && syllableRule(bere.syllables[1]) === "OPRL" && syllableRule(bere.syllables[2]) === "CAPL", "…showing OOPPS, OPRL and CAPL");
const vayyomer = syllabify("וַיֹּ֥אמֶר");
assert(vayyomer.slots.length === 6 && vayyomer.syllables[0].closed && vayyomer.syllables[0].end === 1, "a dagesh forte is two slots: the first half closes the syllable before it (וַיּ | יֹא | מֶר)");
assert(syllableRule(vayyomer.syllables[2]) === "CURS", "מֶר is closed, unaccented and short = CURS");
assert(syllabify("הָאָדָם").why, "a word with an unknown stress is held back");
assert(syllabify("כָּל", { beforeMaqqef: true }).why, "an unaccented word (before a maqqef) has no tone syllable, so it is not used");

console.log("Built data");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-syllable.json", import.meta.url), "utf8"));
for (const id of ["CAPL", "OPRL", "CURS", "OAPS", "OOPPS"]) assert((data.counts[id] || 0) > 20, `plenty of ${id} examples`);
assert(data.examples.every((e) => { const s = data.verses[e.ref][e.wi].y[1][e.k]; return s[5] === e.pattern && !!s[2] === !!e.closed && s[3] === e.tone && s[4] === e.vowel; }), "every example matches its syllable in the data");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages with all their verses");

console.log("The page");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-syllable");
await wait(250);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Syllables & Stress", "page opens");
const boxes = [...content.querySelectorAll(".bible-part")].map((p) => [...p.querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|"));
assert(boxes.length === 3 && boxes[0] === "Open|Closed" && boxes[1] === "Tonic|Pretonic|Propretonic|Post-tonic|Propost-tonic" && boxes[2] === "Short|Long|Vocal sheva", "three answer boxes per syllable");
assert(content.querySelectorAll(".bible-mark").length >= 1 && !content.querySelector(".bible-feedback").textContent, "one syllable is highlighted and nothing is explained before answering");
const parts = content.querySelectorAll(".bible-part");
parts[0].querySelectorAll(".bible-choice")[0].click();
parts[1].querySelectorAll(".bible-choice")[0].click();
assert(!content.querySelector(".bible-feedback").textContent, "nothing is judged until all three boxes have an answer");
parts[2].querySelectorAll(".bible-choice")[0].click();
assert(content.querySelector(".bible-feedback").textContent.length > 20, "then the answer and the explanation appear");
[...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
await wait(40);
assert(document.querySelectorAll(".bible-gap").length >= 3 && document.querySelectorAll(".bible-slot").length >= 4, "Divide the word shows letters with gaps between them");
const gap = document.querySelector(".bible-gap");
gap.click();
assert(gap.classList.contains("is-cut"), "clicking a gap adds a dividing line");
gap.click();
assert(!gap.classList.contains("is-cut"), "clicking again removes it");
[...document.querySelectorAll("#content .btn")].find((b) => b.textContent === "Check").click();
await wait(20);
assert(document.getElementById("content").textContent.includes("The syllables:"), "checking shows the correct syllables");
[...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
await wait(30);
const guide = document.getElementById("content").textContent;
for (const code of ["CAPL", "OPRL", "CURS", "OAPS", "OOPPS"]) assert(guide.includes(code + ":"), `the guide lists ${code}`);
assert(guide.includes("sof pasuq") && guide.includes("secondary accent marker"), "the guide notes meteg versus silluq");

summary();
