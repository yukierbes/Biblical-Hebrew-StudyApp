// Shevas: the rules (owner's "Shevas" sheet), the data, and the page.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { analyzeWord, classifyAllShevas } from "../scripts/lib/hebrew-word.mjs";
import { SHEVA_PATTERNS, SHEVA_GROUPS } from "../scripts/lib/sheva-rules.mjs";

const sh = (w, o = {}) => classifyAllShevas(analyzeWord(w, o)).map((r) => r.pattern || "held");

console.log("Rules, from real words");
assert(sh("בְּרֵאשִׁית")[0] === "v_first", "under the first consonant of a form = vocal (בְּרֵאשִׁית)");
assert(sh("הָֽלְכוּ")[0] === "v_meteg", "after a meteg = vocal (הָֽלְכוּ)");
assert(sh("יִשְׁמְעוּ", { beforeMaqqef: true }).join() === "s_first,v_second", "two shevas in the middle: the first silent, the second vocal (יִשְׁמְעוּ)");
assert(sh("מִדְבָּר", { beforeMaqqef: true })[0] === "s_lene", "immediately before a dagesh lene = silent (מִדְבָּר)");
assert(sh("מַלְכֵי", { beforeMaqqef: true })[0] === "s_short", "after a short unaccented vowel = silent (מַלְכֵי)");
assert(sh("לְךָ")[0] === "v_first" && sh("אָנֹכִי֙")[0] === undefined, "…and a word without a sheva has none");
assert(sh("אַתְּ")[0] === "held", "a final letter with both a dagesh and a sheva is held back");
assert(sh("לָךְ", { beforeMaqqef: true })[0] === "s_kaf", "in a final kaf = silent (לָךְ)");
assert(SHEVA_PATTERNS.length === 11 && SHEVA_GROUPS.map((g) => g.label).join() === "Vocal Sheva,Silent Sheva", "eleven reasons, two answer choices");

console.log("Built data");
const data = JSON.parse(readFileSync(new URL("../netlify/functions/data/bible-sheva.json", import.meta.url), "utf8"));
for (const p of SHEVA_PATTERNS) assert((data.totals[p.id] || 0) > 0, `Genesis has examples of: ${p.explain.slice(0, 60)}…`);
assert(data.examples.length > 2000, "plenty of examples");
assert(data.examples.every((e) => data.verses[e.ref][e.wi].sh.some((x) => x[0] === e.li && x[1] === e.pattern)), "every example points at a real sheva in a kept verse");
assert(data.passages.length === 3 && data.passages.every((p) => p.verses.every((r) => data.verses[r])), "three passages with all their verses");

console.log("The page");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
navigateTo(document, "bible-sheva");
await wait(200);
const content = document.getElementById("content");
assert(content.querySelector(".page-title").textContent === "Shevas", "page opens");
assert([...content.querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|") === "Vocal Sheva|Silent Sheva", "answer buttons: Vocal Sheva, Silent Sheva");
assert(content.querySelectorAll(".bible-mark").length >= 1 && !content.querySelector(".bible-feedback").textContent, "one consonant is highlighted and nothing is explained before answering");
[...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
await wait(30);
assert([...document.querySelectorAll(".bible-type-picker .choice-btn")].map((b) => b.textContent).join("|") === "Vocal Sheva|Silent Sheva", "Find the sheva offers vocal or silent");
[...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
await wait(30);
const guide = document.getElementById("content").textContent;
assert(guide.includes("under the first consonant of a form") && guide.includes("in a final kaf"), "the guide lists the reasons");

summary();
