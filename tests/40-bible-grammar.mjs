// The eight grammar pages: Nouns, Independent Personal Pronouns, Demonstratives, Adjectives, Interrogative ה,
// Prefixed Vav, Prefixed מִן and Verbs — the rules, the data, and the pages.
import { readFileSync } from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";
import { verbTypesOf, parseLexicon, BINYANIM, VERB_TYPES, VERB_PGN } from "../scripts/lib/verb-rules.mjs";

const load = (k) => JSON.parse(readFileSync(new URL(`../netlify/functions/data/bible-${k}.json`, import.meta.url), "utf8"));
const D = Object.fromEntries(["noun", "pronoun", "demo", "adj", "interrog", "vav", "min", "verb"].map((k) => [k, load(k)]));

console.log("The data of every page is consistent");
for (const [k, d] of Object.entries(D)) {
  assert(d.examples.length > 20 && d.passages.length === 3 && d.passages.every((p) => p.verses.every((r) => d.verses[r])), `${k}: examples and three passages with their verses`);
  assert(d.examples.every((e) => { const w = d.verses[e.ref][e.wi]; return w.x && w.x[0] === e.pattern; }), `${k}: every example points at a real tagged word`);
  assert(d.examples.every((e) => d.patterns.some((p) => p.id === e.pattern)) && d.groups.every((g) => g.patterns.every((id) => d.patterns.some((p) => p.id === id))), `${k}: patterns and answer groups agree`);
}

console.log("Rules");
assert(D.noun.counts.absolute > 100 && D.noun.counts.construct > 100, "nouns: both absolute and construct");
assert(D.noun.examples.every((e) => ["MS", "FS", "MP", "FP", "Dual"].includes(e.gn)), "nouns: gender and number from the tagging");
assert(Object.keys(D.pronoun.counts).length >= 8, "pronouns: at least eight of the ten PGN forms occur in short verses");
assert(D.demo.counts.near_pronoun > 0 && D.demo.counts.near_adjective > 0 && D.demo.counts.far_adjective > 0, "demonstratives: near pronoun, near adjective and far adjective");
assert(D.demo.examples.every((e) => (e.type === "pronoun") === (e.pattern === "near_pronoun")), "demonstratives: a pronoun has no article, an adjective does");
assert(D.adj.counts.attributive > 0 && D.adj.counts.predicate > 0 && D.adj.counts.substantive > 0, "adjectives: attributive, predicate and substantive");
for (const id of ["lexical", "vocal_sheva", "guttural_no_qamets", "guttural_qamets"]) assert(D.interrog.totals[id] > 0, `interrogative ה: ${id}`);
for (const id of ["lexical", "labial_sheva", "compound", "tone", "consec_dagesh", "divine"]) assert(D.vav.counts[id] > 0, `prefixed vav: ${id}`);
assert(D.vav.examples.some((e) => e.pattern === "lexical" && e.identity === "consec"), "prefixed vav: a vav consecutive on a perfect verb looks like a vav conjunction (lexical form)");
for (const id of ["lexical", "indefinite_standard", "vocal_sheva", "compensatory", "yod"]) assert(D.min.counts[id] > 0, `prefixed מִן: ${id}`);

console.log("Verbs");
assert(BINYANIM.length === 7 && VERB_TYPES.length === 11 && VERB_PGN.length === 15, "seven binyanim, strong + ten weak types, fifteen PGN answers");
assert(JSON.stringify(verbTypesOf("בָּרָא")) === '["ii_guttural","iii_aleph"]', "בָּרָא is II-Guttural and III-Aleph");
assert(JSON.stringify(verbTypesOf("קוּם")) === '["ii_vav_yod"]' && JSON.stringify(verbTypesOf("סָבַב")) === '["ii_geminate"]', "קוּם is hollow and סָבַב is geminate");
assert(JSON.stringify(verbTypesOf("הָיָה")) === '["i_guttural","iii_he"]' && JSON.stringify(verbTypesOf("לָקַח")).includes("i_nun"), "הָיָה is I-Guttural and III-He; לָקַח is I-Nun");
assert(verbTypesOf("שָׁמַר").length === 0, "שָׁמַר is a strong verb");
assert(verbTypesOf("עָוָה") === null || !verbTypesOf("עָוָה").includes("ii_vav_yod"), "a vav with its own vowel in the middle is not a hollow root");
const lex = parseLexicon(readFileSync(new URL("../data-source/bible/HebrewStrong.xml", import.meta.url), "utf8"));
assert(lex.size > 8000 && lex.get("1254").includes("בָּרָא".slice(0, 1)), "the Open Scriptures lexicon is read");
assert(D.verb.examples.every((e) => ["Perfect", "Imperfect", "Jussive", "Cohortative", "Imperative", "Infinitive Construct", "Infinitive Absolute", "Active Participle", "Passive Participle"].includes(e.mode)), "every verb has one of the nine modes");
assert(D.verb.examples.some((e) => e.prefix === "consecutive") && D.verb.examples.some((e) => e.prefix === "conjunction") && D.verb.examples.some((e) => e.suffix !== "None") && D.verb.examples.some((e) => e.pgn === "None"), "verbs: consecutive and conjunction prefixes, pronominal suffixes, and infinitives occur");
for (const t of VERB_TYPES) assert(D.verb.examples.some((e) => (t.id === "strong" ? e.types.length === 0 : e.types.includes(t.id))), `verbs: examples of ${t.label}`);

console.log("The pages");
const { document } = await setupApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGES = [
  ["bible-noun", "Nouns", [2, 5], 2, ["Absolute", "Construct"]],
  ["bible-pronoun", "Independent Personal Pronouns", [10], 0, null],
  ["bible-demo", "Demonstratives", [2, 4, 2], 2, null],
  ["bible-adj", "Adjectives", [3, 4], 3, null],
  ["bible-interrog", "Interrogative ה", [4], 0, null],
  ["bible-vav", "Prefixed Vav", [7], 2, null],
  ["bible-min", "Prefixed מִן", [6], 0, null],
  ["bible-verb", "Verbs", [7, 9, 15, 6, 11], 11, null],
];
for (const [route, title, boxes, types, labels] of PAGES) {
  navigateTo(document, route);
  await wait(200);
  const content = document.getElementById("content");
  assert(content.querySelector(".page-title").textContent === title, `${title}: page opens`);
  const got = [...content.querySelectorAll(".bible-part")].map((p) => p.querySelectorAll(".bible-choice").length);
  const single = boxes.length === 1 ? [content.querySelectorAll(".bible-choice").length] : got;
  assert(JSON.stringify(single) === JSON.stringify(boxes), `${title}: answer boxes ${JSON.stringify(boxes)} (got ${JSON.stringify(single)})`);
  assert(!content.querySelector(".bible-feedback").textContent, `${title}: nothing is explained before answering`);
  if (labels) assert([...content.querySelector(".bible-part").querySelectorAll(".bible-choice")].map((b) => b.textContent).join("|") === labels.join("|"), `${title}: first box is ${labels.join(" / ")}`);
  [...document.querySelectorAll(".bible-tabs .choice-btn")][2].click();
  await wait(30);
  assert(document.querySelectorAll(".bible-type-picker .choice-btn").length === types, `${title}: Find has ${types} type choices`);
  [...document.querySelectorAll(".bible-tabs .choice-btn")][3].click();
  await wait(30);
  const guide = document.getElementById("content").textContent;
  assert(guide.length > 200, `${title}: the pattern guide has content`);
  if (route === "bible-interrog") assert(guide.includes("Compared with the definite article") && !guide.includes("Answer Input"), "interrogative ה: guide has the side-by-side with the article and no answer-input column");
  if (route === "bible-vav") assert(guide.includes("identical to a vav conjunction") && guide.includes("only on perfect or imperfect"), "prefixed vav: guide notes the consecutive on a perfect verb and where it can occur");
  if (route === "bible-noun") assert(guide.includes("The final noun of a construct chain is always absolute") && guide.includes("maqqef"), "nouns: guide explains the construct chain");
  if (route === "bible-adj") assert(["Attributive", "Predicate", "Substantive"].every((t) => guide.includes(t)) && guide.includes("implied “to be”"), "adjectives: guide explains all three types consistently");
  if (route === "bible-demo") assert(guide.includes("Demonstrative pronouns") && guide.includes("Demonstrative adjectives"), "demonstratives: guide expands on both");
}

summary();
