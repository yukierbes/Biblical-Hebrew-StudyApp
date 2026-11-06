import fs from "node:fs";
import { setupApp, assert, summary, navigateTo } from "./helpers.mjs";

// The Bible in Context practice pages draw on Genesis, Ruth and Jonah; the Pattern guides no longer show how many
// times a pattern occurs; Mixed review includes verses from all three books.

const { document } = await setupApp();
const content = document.getElementById("content");
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const readJson = (name) => JSON.parse(fs.readFileSync(new URL(`../netlify/functions/data/${name}.json`, import.meta.url), "utf8"));
const PAGES = ["article", "dagesh", "suffix", "qames", "prefix", "syllable", "noun", "pronoun", "demo", "adj", "verb", "interrog", "vav", "min", "sheva"];

console.log("The practice data");
const book = (ref) => ref.split(".")[0];
for (const p of PAGES) {
  const d = readJson(`bible-${p}`);
  const books = new Set(d.examples.map((e) => book(e.ref)));
  assert(books.has("Gen"), `${p}: Genesis examples are still there`);
  // a book can lack an example of a rare pattern (no demonstrative in Jonah, no adjective sort in Ruth)
  assert(books.has("Ruth") || books.has("Jonah"), `${p}: examples from ${[...books].join(", ")}`);
  assert(d.source.book === "Genesis, Ruth and Jonah", `${p}: the data says which books it draws on`);
  assert(d.passages.every((x) => x.verses.every((r) => d.verses[r])), `${p}: every guided passage has all its verses`);
  const ruthJonah = d.passages.filter((x) => /^(Ruth|Jonah) /.test(x.title));
  assert(ruthJonah.length >= 1 && ruthJonah.every((x) => x.verses.every((r) => /^(Ruth|Jonah)\./.test(r))), `${p}: guided passages from Ruth or Jonah are offered`);
  assert(!d.examples.some((e) => d.verses[e.ref] === undefined), `${p}: every example is in a kept verse`);
}

console.log("\nMixed review");
const mixed = readJson("bible-mixed");
const byBook = {};
for (const v of mixed.verses) byBook[book(v.ref)] = (byBook[book(v.ref)] || 0) + 1;
assert(byBook.Gen > 100 && byBook.Ruth >= 15 && byBook.Jonah >= 15, `Mixed review has verses from Genesis (${byBook.Gen}), Ruth (${byBook.Ruth}) and Jonah (${byBook.Jonah})`);
const pageData = {};
for (const p of PAGES) pageData[p] = readJson(`bible-${p}`);
assert(mixed.verses.filter((v) => !/^Gen\./.test(v.ref)).every((v) => v.picks.every((k) => pageData[k.page.replace("bible-", "")].verses[v.ref])), "each Ruth or Jonah question has its verse in its page's data");

console.log("\nThe Pattern guides show no counts");
const guides = { "bible-article": "Definite Article", "bible-dagesh": "Dagesh", "bible-qames": "Qameṣ", "bible-sheva": "Shevas" };
for (const [page, title] of Object.entries(guides)) {
  navigateTo(document, page);
  await wait(300);
  const tabs = [...content.querySelectorAll(".bible-tabs .choice-btn")];
  const guide = tabs.find((b) => /^Pattern guide/i.test(b.textContent));
  guide.click();
  await wait(100);
  const heads = [...content.querySelectorAll(".bible-guide-card h3")];
  assert(heads.length >= 2, `${page}: the guide shows its patterns (${heads.length})`);
  assert(!/\(\d[\d,]* in /i.test(content.textContent) && !/\d[\d,]* in (Genesis|Ruth|Jonah)/i.test(content.textContent), `${page}: no "(n in Genesis)" next to a pattern`);
  assert(heads.every((h) => !h.querySelector(".caption")), `${page}: no count is printed beside a pattern name`);
  assert(/Genesis, Ruth and Jonah/.test(content.textContent), `${page}: the guide says its examples come from Genesis, Ruth and Jonah`);
}

console.log("\nGuided passages from Ruth and Jonah");
navigateTo(document, "bible-verb");
await wait(300);
const select = content.querySelector("select");
const titles = [...content.querySelectorAll("select option, .bible-passages .choice-btn, .choice-btn")].map((o) => o.textContent);
assert(titles.some((t) => /Ruth 1:18/.test(t)) && titles.some((t) => /Jonah 1:15/.test(t)), "the Verbs page offers a Ruth passage and a Jonah passage");

summary();
