// Pronominal Suffixes: the rules (from the owner's table), the data, and the page.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { classifySuffix, pgnFromTag, SUFFIX_TABLE, SUFFIX_GROUPS } from "../scripts/lib/suffix-rules.mjs";

console.log("Rules: every ending in the table, on סוּס / סוּסִים");
for (const r of SUFFIX_TABLE) {
  const a = classifySuffix(r.eg1, r.pgn);
  const b = classifySuffix(r.eg2, r.pgn);
  assert(a && a.type === "type1", `${r.pgn} ${r.eg1} is Type 1`);
  assert(b && b.type === "type2", `${r.pgn} ${r.eg2} is Type 2`);
}
assert(SUFFIX_TABLE.length === 10, "ten person/gender/number rows");
assert(classifySuffix("סוּסִי", "3MS") === null, "an ending that does not match the tagged person/gender/number is held back");
assert(classifySuffix("סוּסָם", "3MP")?.type === "type1" && classifySuffix("סוּסָהֶם", "3MP")?.type === "type1", "3MP Type 1 accepts ָם and ָהֶם");
assert(classifySuffix("סוּסֹה", "3MS")?.type === "type1", "3MS Type 1 also accepts ֹה");
assert(pgnFromTag("Sp3ms") === "3MS" && pgnFromTag("Sp1cp") === "1CP" && pgnFromTag("Sd") === null, "OSHB tags map to the owner's PGN notation");
assert(classifySuffix("אָבִי֔", "1CS")?.type === "type1", "accent marks are ignored when matching");
assert(SUFFIX_GROUPS.map((g) => g.label).join() === "Type 1 Suffix,Type 2 Suffix", "two answer choices");

console.log("Built data");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-suffix.json", import.meta.url), "utf8"));
assert(data.examples.length > 500 && data.counts.type1 > 100 && data.counts.type2 > 100, `plenty of examples of both types (${data.counts.type1} / ${data.counts.type2})`);
assert(data.examples.every((e) => data.verses[e.ref][e.wi].x[0] === e.pattern && typeof e.from === "number"), "every example points at a real suffix word, with where the suffix starts");
assert(data.examples.every((e) => !data.verses[e.ref][e.wi].xh), "held-back words are never examples");
assert(data.examples.some((e) => e.stem === "preposition" && e.pattern === "type1") && data.examples.some((e) => e.stem === "preposition" && e.pattern === "type2"), "prepositions with both types are in the data");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages with all their verses");
assert(data.table.length === 10, "the table is in the data for the guide");

console.log("The page");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-suffix");
await wait(200);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Pronominal Suffixes", "page opens");
assert([...content.querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|") === "Type 1 Suffix|Type 2 Suffix", "answer buttons: Type 1 Suffix, Type 2 Suffix");
assert(content.querySelectorAll(".bible-mark").length >= 1 && !content.querySelector(".bible-feedback").textContent, "the suffix is highlighted and nothing is explained before answering");
const nextBtn = content.querySelector(".bible-step > .btn");
assert(nextBtn && nextBtn.hidden, "the Next button is hidden until an answer is chosen");
const firstStep = data.passages[0].verses.flatMap((r) => data.verses[r].filter((w) => w.x).map((w) => w.x[0]))[0];
content.querySelectorAll(".bible-choice")[firstStep === "type1" ? 0 : 1].click();
assert(content.querySelector(".bible-feedback.is-correct") && !nextBtn.hidden, "right answer: explanation shown and Next appears");
[...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
await wait(30);
assert([...document.querySelectorAll(".bible-type-picker .choice-btn")].map((b) => b.textContent).join("|") === "Type 1 Suffix|Type 2 Suffix", "Find the pronominal suffix offers Type 1 or Type 2");
[...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
await wait(30);
const guide = document.getElementById("content").textContent;
assert(guide.includes("singular nouns") && guide.includes("plural nouns") && guide.includes("prepositions and particles"), "the guide explains singular vs plural nouns and prepositions/particles");
assert(document.querySelectorAll(".bible-suffix-table tr").length === 11, "the guide shows the full table");

summary();
